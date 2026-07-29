/* eslint no-console:0, max-len: 0 */
/* global _, decimalToBinary, DEFAULT_NETWORKS, SHOR_PER_QUANTA, WALLET_VERSION, */

import { Meteor } from 'meteor/meteor'
import { check } from 'meteor/check'
import { WebApp } from 'meteor/webapp'
import crypto from 'crypto'
import helpers from '@theqrl/explorer-helpers'
import grpc from '@grpc/grpc-js'
import protoloader from '@grpc/proto-loader'
import tmp from 'tmp'
import fs from 'fs'
import async from 'async'
import CryptoJS from 'crypto-js'
import util from 'util'
import TransportNodeHid from '@ledgerhq/hw-transport-node-hid'
import Qrl from '@theqrl/hw-app-qrl/lib/Qrl'
import { QRLPROTO_SHA256 } from '@theqrl/qrl-proto-sha256'

// Local compatibility additions for node versions newer than the published
// qrl-proto-sha256 package.
const QRLPROTO_SHA256_OVERRIDES = [
  {
    version: '4.0.0 python',
    protoSha256: '0d70a3372c4668a1bf4fd42983ae01f2e0fb54b4030b808bbea78e5adadb23f0',
    objectSha256: 'b1de7b4968bb3605a00670d9c946b993017c17d5cd12d8fedb1ac5c47ea2ef76',
    walletProto: 'b1de7b4968bb3605a00670d9c946b993017c17d5cd12d8fedb1ac5c47ea2ef76',
  },
  {
    version: '4.0.1 python',
    protoSha256: '0d70a3372c4668a1bf4fd42983ae01f2e0fb54b4030b808bbea78e5adadb23f0',
    objectSha256: '14369669c53fa09df90204b47d4b62cabdfa618485849b3210c4316fd36be149',
    walletProto: '14369669c53fa09df90204b47d4b62cabdfa618485849b3210c4316fd36be149',
  },
]
const TRUSTED_QRLPROTO_SHA256 = [...QRLPROTO_SHA256, ...QRLPROTO_SHA256_OVERRIDES]

const PROTO_PATH = Assets.absoluteFilePath('qrlbase.proto').split(
  'qrlbase.proto'
)[0]

// Hard override that rejects custom/user-supplied gRPC endpoints outright, even
// if allowCustomNodes is on. Lives under Meteor.settings.public so the client
// can read it too.
//
// NOTE: this is NOT the default-deny gate, and its `false` default does not mean
// custom endpoints are permitted. Default-deny comes from `allowCustomNodes`
// (also false by default) in endpointDenialReason(). Both flags default to
// false and mean opposite things — a permission vs. a restriction — which is
// exactly how a previous refactor turned secure-by-default into open-by-default.
// Read endpointDenialReason() for the actual policy; do not infer it from here.
const lockCustomEndpoints = (Meteor.settings.public && Meteor.settings.public.lockCustomEndpoints) === true

// CSP nonce generation middleware
WebApp.connectHandlers.use((req, res, next) => {
  const nonce = crypto.randomBytes(16).toString('base64')
  res.locals = res.locals || {}
  res.locals.cspNonce = nonce

  // qrllib (Emscripten glue) and protobufjs runtime codegen still rely on
  // dynamic function creation, so 'unsafe-eval' remains required for now.
  const cspHeader = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-eval' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline' fonts.googleapis.com cdn.jsdelivr.net fonts.cdnfonts.com",
    "font-src 'self' data: cdn.jsdelivr.net fonts.gstatic.com fonts.cdnfonts.com",
    "img-src 'self' data:",
    "connect-src 'self' data: https://nft-linter.theqrl.org",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; ')

  res.setHeader('Content-Security-Policy', cspHeader)
  next()
})

// HTML modification middleware to inject nonce into script tags
WebApp.connectHandlers.use((req, res, next) => {
  if (!res.locals || !res.locals.cspNonce) {
    return next()
  }

  const originalWrite = res.write
  const originalEnd = res.end
  const chunks = []
  let buffering = true

  // Only HTML carries <script> tags worth stamping, so don't buffer anything
  // else. Meteor's static handler serves public/ before this middleware, so
  // today almost nothing but the app shell reaches here — but this rewrites
  // whatever it does see through a UTF-8 string, which would silently corrupt
  // any binary body, and buffers it whole in memory first. Guarding by
  // content-type keeps a future handler registered after this one from
  // inheriting both problems.
  //
  // The header isn't known until the handler writes, so stop buffering the
  // first time we see a non-HTML content type and replay what we already hold.
  const isHtmlResponse = () => /^text\/html\b/i.test(res.getHeader('Content-Type') || '')

  const stopBuffering = () => {
    buffering = false
    res.write = originalWrite
    res.end = originalEnd
    chunks.forEach((chunk) => originalWrite.call(res, chunk))
    chunks.length = 0
  }

  res.write = function (chunk, ...args) {
    if (buffering && !isHtmlResponse()) {
      stopBuffering()
      return originalWrite.call(res, chunk, ...args)
    }
    chunks.push(Buffer.from(chunk))
    return true
  }

  res.end = function (chunk, ...args) {
    if (buffering && !isHtmlResponse()) {
      stopBuffering()
      return originalEnd.call(res, chunk, ...args)
    }

    if (chunk) {
      chunks.push(Buffer.from(chunk))
    }

    if (chunks.length === 0) {
      res.write = originalWrite
      res.end = originalEnd
      return originalEnd.call(res)
    }

    const body = Buffer.concat(chunks).toString('utf8')
    const nonce = res.locals.cspNonce

    // Add nonce to all script tags that don't already have one
    const modifiedBody = body.replace(
      /<script(?![^>]*nonce=)/g,
      `<script nonce="${nonce}"`
    )

    res.write = originalWrite
    res.end = originalEnd
    res.end(modifiedBody)
  }

  next()
})

// An array of grpc connections and associated proto file paths
const qrlClient = []

const normalizeEndpoint = (endpoint) => {
  if (typeof endpoint !== 'string') {
    return ''
  }
  return endpoint.trim()
}

const extractBlockHeightFromNodeState = (nodeState) => {
  if (!nodeState || typeof nodeState !== 'object') {
    return 0
  }

  const possibleHeights = [
    nodeState.info && nodeState.info.block_height,
    nodeState.node_info && nodeState.node_info.block_height,
    nodeState.block_height,
    nodeState.node_state && nodeState.node_state.block_height,
  ]

  for (const value of possibleHeights) {
    const parsed = parseInt(value, 10)
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed
    }
  }

  return 0
}

function toBuffer(ab) {
  const buffer = Buffer.from(ab)
  return buffer
}

function toHexString(value) {
  if (value === null || value === undefined) {
    return ''
  }
  if (typeof value === 'string') {
    return value.startsWith('0x') ? value.slice(2) : value
  }
  try {
    return Buffer.from(value).toString('hex')
  } catch (err) {
    return ''
  }
}

function parseGrpcErrorCode(value) {
  if (value === null || value === undefined || value === '') {
    return 0
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : 0
  }
  try {
    const codeBytes = Buffer.from(value)
    if (codeBytes.length === 0) {
      return 0
    }
    return codeBytes.readUIntBE(0, codeBytes.length)
  } catch (err) {
    return 0
  }
}

function getPushTransactionError(response) {
  if (!response || typeof response !== 'object') {
    return 'Empty pushTransaction response'
  }

  const errorCode = parseGrpcErrorCode(
    response.error_code || response.errorCode
  )
  const errorDescription = String(
    response.error_description
    || response.errorDescription
    || ''
  ).trim()
  const hasTxHash = toHexString(response.tx_hash).length > 0

  if (errorCode !== 0) {
    if (errorDescription) {
      return `Node rejected transaction (${errorCode}): ${errorDescription}`
    }
    return `Node rejected transaction (${errorCode})`
  }

  if (
    errorDescription.length > 0
    && errorDescription.toLowerCase() !== 'no error'
  ) {
    return `Node rejected transaction: ${errorDescription}`
  }

  if (!hasTxHash) {
    return 'Missing tx hash in pushTransaction response'
  }

  return null
}

const errorCallback = (error, message, alert) => {
  const d = new Date()
  const getTime = d.toUTCString()
  console.log(`${alert} [Timestamp: ${getTime}] ${error}`)
  const meteorError = new Meteor.Error(
    500,
    `[${getTime}] ${message} (${error})`
  )
  return meteorError
}

// Endpoints belonging to the pre-configured networks come from operator config,
// not from user input, so they are always connectable. Anything else is a custom
// endpoint supplied by a caller and must be explicitly permitted.
const isConfiguredEndpoint = (endpoint) => {
  const normalized = normalizeEndpoint(endpoint)
  if (!normalized) {
    return false
  }
  return DEFAULT_NETWORKS.some((network) => (network.nodes || []).some(
    (node) => normalizeEndpoint(node.grpc) === normalized
  ))
}

// Single source of truth for whether the server may open a gRPC connection.
// Returns a denial reason, or null if the endpoint is permitted.
//
// Enforced inside connectToNode, which is the only place a gRPC client is ever
// created, so no caller can reach the connection primitive without passing it.
// Entry points call this too, for an earlier and friendlier error — but they
// delegate here rather than re-deriving the policy, because two copies of this
// decision is exactly how the connectToNode method ended up guarded while the
// qrlApi path stayed open.
//
// This is the SSRF control for user-supplied endpoints, and it is deliberately
// an exact-match ALLOWLIST rather than URL parsing plus a private-IP blocklist:
//
//   - An allowlist is strictly stronger. A blocklist has to enumerate every
//     internal range (RFC1918, loopback, link-local 169.254.0.0/16, IPv6 ULA,
//     IPv4-mapped IPv6, decimal/octal IP encodings, DNS names resolving to
//     internal addresses, DNS rebinding after the check). Missing one is a
//     bypass; here, anything not in operator config is refused by default.
//   - new URL() would not help. These are gRPC "host:port" authorities, not
//     URLs, so parsing adds a failure mode without adding a decision.
//
// So the absence of new URL()/isPrivate()/RFC1918 filtering here is intentional,
// not an oversight — those are the weaker design this replaced.
const endpointDenialReason = (endpoint) => {
  if (isConfiguredEndpoint(endpoint)) {
    return null
  }
  if (lockCustomEndpoints) {
    return 'Custom gRPC endpoints are disabled (lockCustomEndpoints is enabled)'
  }
  if (Meteor.settings.allowCustomNodes !== true) {
    return 'Custom node connections are disabled'
  }
  return null
}

// Load the qrl.proto gRPC client into qrlClient from a remote node.
const loadGrpcClient = (endpoint, callback) => {
  const normalizedEndpoint = normalizeEndpoint(endpoint)
  if (!normalizedEndpoint) {
    const myError = errorCallback(
      'Invalid gRPC endpoint',
      'Cannot connect to remote node: empty endpoint',
      '**ERROR/connect**'
    )
    callback(myError, null)
    return
  }

  const options = {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    includeDirs: [PROTO_PATH],
  }
  try {
    // Load qrlbase.proto and fetch current qrl.proto from node
    protoloader
      .load(`${PROTO_PATH}qrlbase.proto`)
      .then((packageDefinitionBase) => {
        const baseGrpcObject = grpc.loadPackageDefinition(packageDefinitionBase)
        let client = null
        try {
          client = new baseGrpcObject.qrl.Base(
            normalizedEndpoint,
            grpc.credentials.createInsecure()
          )
        } catch (grpcError) {
          const myError = errorCallback(
            grpcError,
            `Cannot access node: ${normalizedEndpoint}`,
            '**ERROR/connect**'
          )
          callback(myError, null)
          return
        }
        client.getNodeInfo({}, (err, res) => {
          if (err) {
            console.log(`Error fetching qrl.proto from ${normalizedEndpoint}`)
            callback(err, null)
          } else {
            // Write a new temp file for this grpc connection
            const qrlProtoFilePath = tmp.fileSync({
              mode: '0644',
              prefix: 'qrl-',
              postfix: '.proto',
            }).name
            fs.writeFile(qrlProtoFilePath, res.grpcProto, (fsErr) => {
              if (fsErr) {
                console.log(fsErr)
                throw fsErr
              }
              let { allowUnchecksummedNodes } = Meteor.settings
              if (allowUnchecksummedNodes !== true) {
                allowUnchecksummedNodes = false
              }
              // Now read the saved qrl.proto file so we can calculate a hash from it
              fs.readFile(qrlProtoFilePath, (errR, contents) => {
                if (errR) {
                  console.log(errR)
                  throw errR
                }

                // Calculate the hash of the qrl.proto file contents
                const protoFileWordArray = CryptoJS.lib.WordArray.create(
                  contents
                )
                const calculatedProtoHash = CryptoJS.SHA256(
                  protoFileWordArray
                ).toString(CryptoJS.enc.Hex)
                // If the calculated qrl.proto hash matches the verified one for this version,
                // continue to verify the grpc object loaded from the proto also matches the correct
                // shasum.
                console.log(
                  'proto: checking that calc of '
                    + calculatedProtoHash
                    + ' is valid'
                )
                let verified = false
                TRUSTED_QRLPROTO_SHA256.forEach((value) => {
                  if (value.protoSha256) {
                    if (value.protoSha256 === calculatedProtoHash) {
                      verified = true
                    }
                  }
                  if (value.walletProto) {
                    if (value.walletProto === calculatedProtoHash) {
                      verified = true
                    }
                  }
                })
                if (
                  verified === true
                  || allowUnchecksummedNodes === true
                ) {
                  protoloader
                    .load(qrlProtoFilePath, options)
                    .then((packageDefinition) => {
                      const grpcObject = grpc.loadPackageDefinition(
                        packageDefinition
                      )

                      // Inspect the object and convert to string.
                      const grpcObjectString = JSON.stringify(
                        util.inspect(grpcObject, {
                          showHidden: true,
                          depth: 4,
                        })
                      )

                      // Calculate the hash of the grpc object string returned
                      const protoObjectWordArray = CryptoJS.lib.WordArray.create(
                        grpcObjectString
                      )
                      const calculatedObjectHash = CryptoJS.SHA256(
                        protoObjectWordArray
                      ).toString(CryptoJS.enc.Hex)

                      // If the grpc object shasum matches, establish the grpc connection.
                      console.log(
                        'object: checking that calc of '
                          + calculatedObjectHash
                          + ' is valid'
                      )
                      let verifiedObject = false
                      TRUSTED_QRLPROTO_SHA256.forEach((value) => {
                        if (value.objectSha256) {
                          if (value.objectSha256 === calculatedObjectHash) {
                            verifiedObject = true
                          }
                        }
                        if (value.walletProto) {
                          if (value.walletProto === calculatedObjectHash) {
                            verifiedObject = true
                          }
                        }
                      })
                      if (verifiedObject === true || allowUnchecksummedNodes === true) {
                        // Create the gRPC Connection
                        console.log('Making GRPC PublicAPI connection to ' + normalizedEndpoint)
                        qrlClient[normalizedEndpoint] = new grpcObject.qrl.PublicAPI(
                          normalizedEndpoint,
                          grpc.credentials.createInsecure()
                        )

                        console.log(`qrlClient loaded for ${normalizedEndpoint}`)

                        callback(null, true)
                      } else {
                        // grpc object shasum does not match verified known shasum
                        // Could be local side attack changing the proto file in between validation
                        // and grpc connection establishment
                        console.log(
                          `Invalid qrl.proto grpc object shasum - node version: ${res.version}, qrl.proto object sha256: ${calculatedObjectHash}`
                        )
                        const myError = errorCallback(
                          err,
                          `Invalid qrl.proto grpc object shasum - node version: ${res.version}, qrl.proto object sha256: ${calculatedObjectHash}`,
                          '**ERROR/connect**'
                        )
                        callback(myError, null)
                      }
                    })
                } else {
                  // qrl.proto file shasum does not match verified known shasum
                  // Could be node acting in bad faith.
                  console.log(
                    `Invalid qrl.proto shasum - node version: ${res.version}, qrl.proto sha256: ${calculatedProtoHash}`
                  )
                  const myError = errorCallback(
                    err,
                    `Invalid qrl.proto shasum - node version: ${res.version}, qrl.proto sha256: ${calculatedProtoHash}`,
                    '**ERROR/connect**'
                  )
                  callback(myError, null)
                }
              })
            })
          }
        })
      })
  } catch (err) {
    console.log('node connection error exception')
    const myError = errorCallback(
      err,
      `Cannot access node: ${endpoint}`,
      '**ERROR/connect**'
    )
    callback(myError, null)
  }
}

// Establish a connection with a remote node.
// If there is no active server side connection for the requested node,
// this function will call loadGrpcClient to establish one.
const connectToNode = (endpoint, callback) => {
  const normalizedEndpoint = normalizeEndpoint(endpoint)
  if (!normalizedEndpoint) {
    const myError = errorCallback(
      'Invalid gRPC endpoint',
      'Cannot connect to remote node: empty endpoint',
      '**ERROR/connection** '
    )
    callback(myError, null)
    return
  }

  // Authorisation chokepoint: every route to a gRPC client passes through here.
  const denialReason = endpointDenialReason(normalizedEndpoint)
  if (denialReason) {
    const myError = errorCallback(
      denialReason,
      'Cannot connect to remote node',
      '**ERROR/connection/denied** '
    )
    callback(myError, null)
    return
  }

  // First check if there is an existing object to store the gRPC connection
  if (qrlClient.hasOwnProperty(normalizedEndpoint) === true) { // eslint-disable-line
    // eslint-disable-line
    console.log(
      'Existing connection found for ',
      normalizedEndpoint,
      ' - attempting getNodeState'
    )
    // There is already a gRPC object for this server stored.
    // Attempt to connect to it.
    try {
      qrlClient[normalizedEndpoint].getNodeState({}, (err, response) => {
        if (err) {
          console.log('Error fetching node state for ', normalizedEndpoint)
          // If it errors, we're going to remove the object and attempt to connect again.
          delete qrlClient[normalizedEndpoint]

          console.log('Attempting re-connection to ', normalizedEndpoint)

          loadGrpcClient(normalizedEndpoint, (loadErr) => {
            if (loadErr) {
              console.log(`Failed to re-connect to node ${normalizedEndpoint}`)
              const myError = errorCallback(
                loadErr,
                'Cannot connect to remote node',
                '**ERROR/connection** '
              )
              callback(myError, null)
            } else {
              qrlClient[normalizedEndpoint].getNodeState({}, (errState, reconnectResponse) => {
                if (errState) {
                  const myError = errorCallback(
                    errState,
                    'Cannot access API/getNodeState',
                    '**ERROR/getNodeState**'
                  )
                  callback(myError, null)
                  return
                }

                console.log(`Connected to ${normalizedEndpoint}`)
                callback(null, reconnectResponse)
              })
            }
          })
        } else {
          console.log(`Node state for ${normalizedEndpoint} ok`)
          callback(null, response)
        }
      })
    } catch (err) {
      console.log('node state error exception')
      const myError = errorCallback(
        err,
        'Cannot access API/getNodeState',
        '**ERROR/getNodeState**'
      )
      callback(myError, null)
    }
  } else {
    console.log(`Establishing new connection to ${normalizedEndpoint}`)
    // We've not connected to this node before, let's establish a connection to it.
    loadGrpcClient(normalizedEndpoint, (err) => {
      if (err) {
        console.log(`Failed to connect to node ${normalizedEndpoint}`)
        const myError = errorCallback(
          err,
          'Cannot connect to remote node',
          '**ERROR/connection** '
        )
        callback(myError, null)
      } else {
        console.log(`Connected to ${normalizedEndpoint}`)
        qrlClient[normalizedEndpoint].getNodeState({}, (errState, response) => {
          if (errState) {
            console.log(`Failed to query node state ${normalizedEndpoint}`)
            const myError = errorCallback(
              err,
              'Cannot connect to remote node',
              '**ERROR/connection** '
            )
            callback(myError, null)
          } else {
            callback(null, response)
          }
        })
      }
    })
  }
}

const checkNetworkHealth = (userNetwork, callback) => {
  try {
    let networkHealthy = false

    // Determine current active nodes
    DEFAULT_NETWORKS.forEach((network) => {
      // Only look at health of userNetwork
      if (network.id === userNetwork) {
        if (network.healthy === true) {
          networkHealthy = true
        }
      }
    })

    if (networkHealthy === true) {
      callback(null, true)
    } else {
      callback({ error: `Network '${userNetwork}' is not yet healthy — nodes may still be connecting` }, null)
    }
  } catch (err) {
    console.log('Exception in checkNetworkHealth')
    console.log(err)
  }
}

// Connect to all nodes
const connectNodes = () => {
  // Establish gRPC connections with all enabled DEFAULT_NETWORKS
  DEFAULT_NETWORKS.forEach((network, networkIndex) => {
    if (network.disabled === '') {
      console.log(
        `Attempting to create gRPC connections to network: ${network.name} ...`
      )

      // Loop each node in the network and establish a gRPC connection.
      const networkNodes = network.nodes
      networkNodes.forEach((node, nodeIndex) => {
        console.log(
          `Attempting to create gRPC connection to network: ${network.name}, node: ${node.id} (${node.grpc}) ...`
        )
        const endpoint = node.grpc
        connectToNode(endpoint, (err, res) => {
          if (err) {
            console.log(`Failed to connect to node ${endpoint}`)
            DEFAULT_NETWORKS[networkIndex].nodes[nodeIndex].state = false
            DEFAULT_NETWORKS[networkIndex].nodes[nodeIndex].height = 0
          } else {
            console.log(`Connected to ${endpoint}`)
            DEFAULT_NETWORKS[networkIndex].nodes[nodeIndex].state = true
            DEFAULT_NETWORKS[networkIndex].nodes[nodeIndex].height = extractBlockHeightFromNodeState(res)
            // At least one node in the network is online, set network as healthy
            DEFAULT_NETWORKS[networkIndex].healthy = true
          }
        })
      })
    }
  })
}

// Wrapper to provide highly available API results in the event
// the primary or secondary nodes go offline
const qrlApi = (api, request, callback) => {
  // Handle multi node network api requests
  if (
    request.network === 'devnet'
    || request.network === 'testnet'
    || request.network === 'mainnet'
  ) {
    // Store active nodes
    const activeNodes = []

    // Determine current active nodes
    DEFAULT_NETWORKS.forEach((network) => {
      // Only get nodes from user selected network
      if (network.id === request.network) {
        const networkNodes = network.nodes
        networkNodes.forEach((node) => {
          if (node.state === true) {
            activeNodes.push(node)
          }
        })
      }
    })

    // Determine node with highest block height and set as bestNode
    const bestNode = {}
    bestNode.grpc = ''
    bestNode.height = 0
    activeNodes.forEach((node) => {
      if (node.height > bestNode.height) {
        bestNode.grpc = node.grpc
        bestNode.height = node.height
      }
    })

    console.log('bestNode:', bestNode)

    // If all nodes are offline, fail
    if (activeNodes.length === 0) {
      const myError = errorCallback(
        'The wallet server cannot connect to any API node',
        'Cannot connect to API',
        '**ERROR/noActiveNodes/b**'
      )
      callback(myError, null)
    } else {
      // Make the API call
      // Delete network from request object
      delete request.network
      console.log('Making', api, 'request to', bestNode.grpc)
      qrlClient[bestNode.grpc][api](request, (error, response) => {
        if (!error && api === 'pushTransaction' && response) {
          response.relayed = bestNode.grpc
        }
        if (error) {
          const myError = new Meteor.Error(500, error.details)
          callback(myError, null)
        } else {
          callback(null, response)
        }
      })
    }
  } else {
    // Handle custom and localhost connections
    const apiDenialReason = endpointDenialReason(request.network)
    if (apiDenialReason) {
      const myError = errorCallback(
        apiDenialReason,
        'Cannot connect to custom API endpoint',
        '**ERROR/api/locked**'
      )
      callback(myError, null)
      return
    }
    console.log('Handling custom API call')
    const apiEndpoint = normalizeEndpoint(request.network)
    // Delete network from request object
    delete request.network
    if (!apiEndpoint) {
      const myError = errorCallback(
        'Invalid gRPC endpoint',
        'Cannot connect to API: empty endpoint',
        '**ERROR/api/custom**'
      )
      callback(myError, null)
      return
    }

    console.log('Making', api, 'request to', apiEndpoint)

    const executeApiCall = () => {
      if (!qrlClient[apiEndpoint] || typeof qrlClient[apiEndpoint][api] !== 'function') {
        const myError = errorCallback(
          `No API connection available for endpoint: ${apiEndpoint}`,
          `Cannot call API/${api} for endpoint: ${apiEndpoint}`,
          '**ERROR/api/custom**'
        )
        callback(myError, null)
        return
      }

      qrlClient[apiEndpoint][api](request, (error, response) => {
        if (!error && api === 'pushTransaction' && response) {
          response.relayed = apiEndpoint
        }
        if (error) {
          const myError = new Meteor.Error(500, error.details)
          callback(myError, null)
        } else {
          callback(null, response)
        }
      })
    }

    if (!qrlClient[apiEndpoint]) {
      connectToNode(apiEndpoint, (connectErr) => {
        if (connectErr) {
          callback(connectErr, null)
        } else {
          executeApiCall()
        }
      })
      return
    }

    executeApiCall()
  }
}

// Function to call getKnownPeers API.
const getKnownPeers = (request, callback) => {
  qrlApi('getKnownPeers', request, (err, response) => {
    if (err) {
      callback(err, null)
    } else {
      callback(null, response)
    }
  })
}

const getStats = (request, callback) => {
  try {
    qrlApi('getStats', request, (err, response) => {
      if (err) {
        const myError = errorCallback(
          err,
          'Cannot access API/GetStats',
          '**ERROR/getStats** '
        )
        callback(myError, null)
      } else {
        callback(null, response)
      }
    })
  } catch (err) {
    const myError = errorCallback(
      err,
      'Cannot access API/GetStats',
      '**ERROR/GetStats**'
    )
    callback(myError, null)
  }
}

const getObject = (request, callback) => {
  try {
    qrlApi('GetObject', request, (error, response) => {
      if (error) {
        const myError = errorCallback(
          error,
          'Cannot access API/GetObject',
          '**ERROR/GetObject**'
        )
        callback(myError, null)
      } else {
        // console.log(response)
        callback(null, response)
      }
    })
  } catch (error) {
    const myError = errorCallback(
      error,
      'Cannot access API/GetObject',
      '**ERROR/GetObject**'
    )
    callback(myError, null)
  }
}

const helpersaddressTransactions = (response) => {
  const output = []
  // console.log(response)
  _.each(response.transactions_detail, (tx) => {
    const txEdited = tx
    if (tx.tx.transfer) {
      const hexlified = []
      _.each(tx.tx.transfer.addrs_to, (txOutput) => {
        hexlified.push(`Q${Buffer.from(txOutput).toString('hex')}`)
      })
      txEdited.tx.transfer.addrs_to = hexlified
    }
    if (tx.tx.token) {
      console.log(tx.tx.token)
      if (
        Buffer.from(tx.tx.token.symbol).toString('hex').slice(0, 8) !== '00ff00ff'
      ) {
        txEdited.tx.token.name = Buffer.from(tx.tx.token.name).toString()
        txEdited.tx.token.symbol = Buffer.from(tx.tx.token.symbol).toString()
        txEdited.tx.token.owner = `Q${Buffer.from(tx.tx.token.owner).toString(
          'hex'
        )}`
      } else {
        txEdited.tx.token.name = Buffer.from(tx.tx.token.name).toString('hex')
        txEdited.tx.token.symbol = Buffer.from(tx.tx.token.symbol).toString('hex')
        txEdited.tx.token.owner = `Q${Buffer.from(tx.tx.token.owner).toString(
          'hex'
        )}`
      }
    }
    if (tx.tx.transfer_token) {
      const hexlified = []
      txEdited.tx.transfer_token.token_txhash = Buffer.from(
        tx.tx.transfer_token.token_txhash
      ).toString('hex')
      _.each(tx.tx.transfer_token.addrs_to, (txOutput) => {
        hexlified.push(`Q${Buffer.from(txOutput).toString('hex')}`)
      })
      txEdited.tx.transfer_token.addrs_to = hexlified
    }
    if (tx.tx.coinbase) {
      if (tx.tx.coinbase.addr_to) {
        txEdited.tx.coinbase.addr_to = `Q${Buffer.from(
          txEdited.tx.coinbase.addr_to
        ).toString('hex')}`
      }
    }
    if (tx.tx.transaction_hash) {
      txEdited.tx.transaction_hash = Buffer.from(
        txEdited.tx.transaction_hash
      ).toString('hex')
    }
    if (tx.tx.master_addr) {
      txEdited.tx.master_addr = Buffer.from(txEdited.tx.master_addr).toString(
        'hex'
      )
    }
    if (tx.tx.public_key) {
      txEdited.tx.public_key = Buffer.from(txEdited.tx.public_key).toString(
        'hex'
      )
    }
    if (tx.tx.signature) {
      txEdited.tx.signature = Buffer.from(txEdited.tx.signature).toString('hex')
    }
    if (tx.block_header_hash) {
      txEdited.block_header_hash = Buffer.from(
        txEdited.block_header_hash
      ).toString('hex')
    }
    txEdited.addr_from = `Q${Buffer.from(txEdited.addr_from).toString('hex')}`
    output.push(txEdited)
  })
  return response
}

const getTransactionsByAddress = (request, callback) => {
  try {
    qrlApi('GetTransactionsByAddress', request, (error, response) => {
      if (error) {
        const myError = errorCallback(
          error,
          'Cannot access API/GetTransactionsByAddress',
          '**ERROR/GetTransactionsByAddress**'
        )
        callback(myError, null)
      } else {
        // console.log(response)
        callback(null, response)
      }
    })
  } catch (error) {
    const myError = errorCallback(
      error,
      'Cannot access API/GetTransactionsByAddress',
      '**ERROR/GetTransactionsByAddress**'
    )
    callback(myError, null)
  }
}

const getTokensByAddress = (request, callback) => {
  try {
    qrlApi('GetTokensByAddress', request, (error, response) => {
      if (error) {
        const myError = errorCallback(
          error,
          'Cannot access API/GetTokensByAddress',
          '**ERROR/GetTokensByAddress**'
        )
        callback(myError, null)
      } else {
        // console.log(response)
        callback(null, response)
      }
    })
  } catch (error) {
    const myError = errorCallback(
      error,
      'Cannot access API/GetTokensByAddress',
      '**ERROR/GetTokensByAddress**'
    )
    callback(myError, null)
  }
}

const getMultiSigAddressesByAddress = (request, callback) => {
  try {
    qrlApi('GetMultiSigAddressesByAddress', request, (error, response) => {
      if (error) {
        const myError = errorCallback(
          error,
          'Cannot access API/GetMultiSigAddressesByAddress',
          '**ERROR/GetMultiSigAddressesByAddress**'
        )
        callback(myError, null)
      } else {
        callback(null, response)
      }
    })
  } catch (error) {
    const myError = errorCallback(
      error,
      'Cannot access API/GetMultiSigAddressesByAddress',
      '**ERROR/GetMultiSigAddressesByAddress**'
    )
    callback(myError, null)
  }
}

const getMultiSigSpendTxsByAddress = (request, callback) => {
  try {
    qrlApi('GetMultiSigSpendTxsByAddress', request, (error, response) => {
      if (error) {
        const myError = errorCallback(
          error,
          'Cannot access API/GetMultiSigSpendTxsByAddress',
          '**ERROR/GetMultiSigSpendTxsByAddress**'
        )
        callback(myError, null)
      } else {
        callback(null, response)
      }
    })
  } catch (error) {
    const myError = errorCallback(
      error,
      'Cannot access API/GetMultiSigSpendTxsByAddress',
      '**ERROR/GetMultiSigSpendTxsByAddress**'
    )
    callback(myError, null)
  }
}

const getOTS = (request, callback) => {
  try {
    qrlApi('GetOTS', request, (error, response) => {
      if (error) {
        const myError = errorCallback(
          error,
          'Cannot access API/GetOTS',
          '**ERROR/getOTS** '
        )
        callback(myError, null)
      } else {
        callback(null, response)
      }
    })
  } catch (error) {
    const myError = errorCallback(
      error,
      'Cannot access API/GetOTS',
      '**ERROR/GetOTS**'
    )
    callback(myError, null)
  }
}

const getFullAddressState = (request, callback) => {
  try {
    qrlApi('GetAddressState', request, (error, response) => {
      if (error) {
        const myError = errorCallback(
          error,
          'Cannot access API/GetOptimizedAddressState',
          '**ERROR/getAddressState** '
        )
        callback(myError, null)
      } else {
        if (response.state.address) {
          response.state.address = `Q${Buffer.from(
            response.state.address
          ).toString('hex')}`
        }

        callback(null, response)
      }
    })
  } catch (error) {
    const myError = errorCallback(
      error,
      'Cannot access API/GetAddressState',
      '**ERROR/GetAddressState**'
    )
    callback(myError, null)
  }
}

// Function to call getAddressState API
const getAddressState = (request, callback) => {
  try {
    qrlApi('GetOptimizedAddressState', request, (error, response) => {
      if (error) {
        const myError = errorCallback(
          error,
          'Cannot access API/GetOptimizedAddressState',
          '**ERROR/getAddressState** '
        )
        callback(myError, null)
      } else {
        // Parse OTS Bitfield, and grab the lowest unused key
        const newOtsBitfield = {}
        let lowestUnusedOtsKey = -1
        let otsBitfieldLength = 0
        let thisOtsBitfield = []
        if (response.state.ots_bitfield !== undefined) {
          thisOtsBitfield = response.state.ots_bitfield
        }
        thisOtsBitfield.forEach((item, index) => {
          const thisDecimal = new Uint8Array(item)[0]
          const thisBinary = decimalToBinary(thisDecimal).reverse()
          const startIndex = index * 8

          for (let i = 0; i < 8; i += 1) {
            const thisOtsIndex = startIndex + i

            // Add to parsed array
            newOtsBitfield[thisOtsIndex] = thisBinary[i]

            // Check if this is lowest unused key
            if (
              thisBinary[i] === 0
              && (thisOtsIndex < lowestUnusedOtsKey || lowestUnusedOtsKey === -1)
            ) {
              lowestUnusedOtsKey = thisOtsIndex
            }

            // Increment otsBitfieldLength
            otsBitfieldLength += 1
          }
        })

        // If all keys in bitfield are used, lowest key will be what is shown in ots_counter + 1
        if (lowestUnusedOtsKey === -1) {
          if (response.state.ots_counter === '0') {
            lowestUnusedOtsKey = otsBitfieldLength
          } else {
            lowestUnusedOtsKey = parseInt(response.state.ots_counter, 10) + 1
          }
        }

        // Calculate number of keys that are consumed
        let totalKeysConsumed = 0
        // First add all tracked keys from bitfield
        for (let i = 0; i < otsBitfieldLength; i += 1) {
          if (newOtsBitfield[i] === 1) {
            totalKeysConsumed += 1
          }
        }

        // Then add any extra from `otsBitfieldLength` to `ots_counter`
        if (response.state.ots_counter !== '0') {
          totalKeysConsumed
            += parseInt(response.state.ots_counter, 10) - (otsBitfieldLength - 1)
        }

        // Add in OTS fields to response
        response.ots = {}
        response.ots.keys = newOtsBitfield
        response.ots.nextKey = lowestUnusedOtsKey
        response.ots.keysConsumed = totalKeysConsumed

        if (response.state.address) {
          response.state.address = `Q${Buffer.from(
            response.state.address
          ).toString('hex')}`
        }
        console.table(response)
        callback(null, response)
      }
    })
  } catch (error) {
    const myError = errorCallback(
      error,
      'Cannot access API/GetAddressState',
      '**ERROR/GetAddressState**'
    )
    callback(myError, null)
  }
}

const getMultiSigAddressState = (request, callback) => {
  try {
    qrlApi('GetMultiSigAddressState', request, (error, response) => {
      if (error) {
        const myError = errorCallback(
          error,
          'Cannot access API/GetMultiSigAddressState',
          '**ERROR/getMultiSigAddressState** '
        )
        callback(myError, null)
      } else {
        callback(null, response)
      }
    })
  } catch (error) {
    const myError = errorCallback(
      error,
      'Cannot access API/GetMultiSigAddressState',
      '**ERROR/GetMultiSigAddressState**'
    )
    callback(myError, null)
  }
}

// Function to call getObject API and extract a txn Hash..
const getTxnHash = (request, callback) => {
  const txnHash = Buffer.from(request.query, 'hex')

  try {
    qrlApi(
      'getObject',
      { query: txnHash, network: request.network },
      (err, response) => {
        if (err) {
          console.log(`Error: ${err.message}`)
          callback(err, null)
        } else {
          callback(null, response)
        }
      }
    )
  } catch (err) {
    callback(`Caught Error: ${err}`, null)
  }
}

// Function to call transferCoins API
const transferCoins = (request, callback) => {
  const tx = {
    // master_addr: request.fromAddress,
    addresses_to: request.addresses_to,
    amounts: request.amounts,
    fee: request.fee,
    xmss_pk: request.xmssPk,
    network: request.network,
    message_data: request.message_data,
  }

  qrlApi('transferCoins', tx, (err, response) => {
    if (err) {
      console.log(`Error:  ${err.message}`)
      callback(err, null)
    } else {
      const transferResponse = {
        response,
      }
      callback(null, transferResponse)
    }
  })
}

const createMultiSig = (request, callback) => {
  const tx = {
    master_addr: request.fromAddress,
    signatories: request.signatories,
    weights: request.weights,
    threshold: request.threshold,
    fee: request.fee,
    xmss_pk: request.xmssPk,
    network: request.network,
  }

  qrlApi('GetMultiSigCreateTxn', tx, (err, response) => {
    if (err) {
      console.log(`Error:  ${err.message}`)
      callback(err, null)
    } else {
      const transferResponse = {
        response,
      }
      callback(null, transferResponse)
    }
  })
}

const spendMultiSig = (request, callback) => {
  const tx = {
    // master_addr: request.master_addr,
    multi_sig_address: request.multi_sig_address,
    addrs_to: request.addrs_to,
    amounts: request.amounts,
    expiry_block_number: request.expiry_block_number,
    fee: request.fee,
    xmss_pk: request.xmssPk,
    network: request.network,
  }
  console.log('About to call GRPC GetMultiSigSpendTxn with tx = ')
  console.log(tx)
  qrlApi('GetMultiSigSpendTxn', tx, (err, response) => {
    if (err) {
      console.log(`Error:  ${err.message}`)
      callback(err, null)
    } else {
      const transferResponse = {
        response,
      }
      callback(null, transferResponse)
    }
  })
}

const voteMultiSig = (request, callback) => {
  const tx = {
    // master_addr: request.master_addr,
    shared_key: request.shared_key,
    unvote: request.unvote,
    fee: request.fee,
    xmss_pk: request.xmssPk,
    network: request.network,
  }
  console.log('About to call GRPC GetMultiSigVoteTxn with tx = ')
  console.log(tx)
  qrlApi('GetMultiSigVoteTxn', tx, (err, response) => {
    if (err) {
      console.log(`Error:  ${err.message}`)
      callback(err, null)
    } else {
      const transferResponse = {
        response,
      }
      callback(null, transferResponse)
    }
  })
}

const getHeight = (request, callback) => {
  const tx = {
    network: request.network,
  }

  qrlApi('GetHeight', tx, (err, response) => {
    console.log('response:', response)
    if (err) {
      console.log(`Error:  ${err.message}`)
      callback(err, null)
    } else {
      callback(null, response)
    }
  })
}

const confirmTransaction = (request, callback) => {
  const confirmTxn = {
    transaction_signed: request.extended_transaction_unsigned.tx,
  }
  const relayedThrough = []

  // change Uint8Arrays to Buffers
  confirmTxn.transaction_signed.public_key = toBuffer(
    confirmTxn.transaction_signed.public_key
  )
  confirmTxn.transaction_signed.signature = toBuffer(
    confirmTxn.transaction_signed.signature
  )

  const addrsTo = confirmTxn.transaction_signed.transfer.addrs_to

  const addrsToFormatted = []
  addrsTo.forEach((item) => {
    const bufItem = toBuffer(item)
    addrsToFormatted.push(bufItem)
  })

  // Overwrite addrs_to with our updated one
  confirmTxn.transaction_signed.transfer.addrs_to = addrsToFormatted
  confirmTxn.network = request.network

  // Relay transaction through user node, then all default nodes.
  let txnResponse

  async.waterfall(
    [
      // Relay through user node.
      function (wfcb) {
        try {
          qrlApi('pushTransaction', confirmTxn, (err, res) => {
            if (err) {
              console.log(`Error:  ${err.message}`)
              txnResponse = { error: err.message, response: err.message }
              wfcb()
            } else {
              const pushTxnError = getPushTransactionError(res)
              if (pushTxnError) {
                console.log(`Error: ${pushTxnError}`)
                txnResponse = { error: pushTxnError, response: pushTxnError }
                wfcb()
                return
              }

              const pushedTxnHash = toHexString(res.tx_hash)
              console.log('Relayed Txn: ', pushedTxnHash)
              const hashResponse = {
                txnHash: pushedTxnHash,
                signature: Buffer.from(
                  confirmTxn.transaction_signed.signature
                ).toString('hex'),
              }
              txnResponse = { error: null, response: hashResponse }
              relayedThrough.push(res.relayed)
              console.log(`Transaction sent via ${res.relayed}`)
              wfcb()
            }
          })
        } catch (err) {
          console.log(`Error: Failed to send transaction - ${err}`)
          txnResponse = { error: err, response: err }
          wfcb()
        }
      },
      /*
    // Now relay through all default nodes that we have a connection too
    function(wfcb) {
      async.eachSeries(DEFAULT_NODES, (node, cb) => {
        if ((qrlClient.hasOwnProperty(node.grpc) === true) && (node.grpc !== request.grpc)) {
          try {
            // Push the transaction - we don't care for its response
            qrlClient[node.grpc].pushTransaction(confirmTxn, (err) => {
              if (err) {
                console.log(`Error: Failed to send transaction through ${node.grpc} - ${err}`)
                cb()
              } else {
                console.log(`Transfer Transaction sent via ${node.grpc}`)
                relayedThrough.push(node.grpc)
                cb()
              }
            })
          } catch(err) {
            console.log(`Error: Failed to send transaction through ${node.grpc} - ${err}`)
            cb()
          }
        } else {
          cb()
        }
      }, (err) => {
        if (err) console.error(err.message)
        console.log('All transfer txns sent')
        wfcb()
      })
    },
    */
    ],
    () => {
      // All done, send txn response
      txnResponse.relayed = relayedThrough
      callback(null, txnResponse)
    }
  )
}

const confirmMultiSigCreate = (request, callback) => {
  const confirmTxn = {
    transaction_signed: request.extended_transaction_unsigned.tx,
  }
  const relayedThrough = []

  // change Uint8Arrays to Buffers
  confirmTxn.transaction_signed.public_key = toBuffer(
    confirmTxn.transaction_signed.public_key
  )
  confirmTxn.transaction_signed.signature = toBuffer(
    confirmTxn.transaction_signed.signature
  )

  const { signatories } = confirmTxn.transaction_signed.multi_sig_create
  const signatoriesFormatted = []
  signatories.forEach(function (item) {
    const i = toBuffer(item)
    signatoriesFormatted.push(i)
  })

  // Overwrite signatories with our updated one
  confirmTxn.transaction_signed.multi_sig_create.signatories = signatoriesFormatted
  // // tx.multi_sig_create.threshold
  confirmTxn.network = request.network

  console.log('confirmed + signed tx for push', confirmTxn)
  console.log(confirmTxn.transaction_signed.multi_sig_create.signatories)

  // Relay transaction through user node, then all default nodes.
  let txnResponse

  async.waterfall(
    [
      // Relay through user node.
      function (wfcb) {
        try {
          qrlApi('pushTransaction', confirmTxn, (err, res) => {
            console.log(
              'Relayed Txn: ',
              Buffer.from(res.tx_hash).toString('hex')
            )

            if (err) {
              console.log(`Error:  ${err.message}`)
              txnResponse = { error: err.message, response: err.message }
              wfcb()
            } else {
              const hashResponse = {
                txnHash: Buffer.from(
                  confirmTxn.transaction_signed.transaction_hash
                ).toString('hex'),
                signature: Buffer.from(
                  confirmTxn.transaction_signed.signature
                ).toString('hex'),
              }
              txnResponse = { error: null, response: hashResponse }
              relayedThrough.push(res.relayed)
              console.log(`Transaction sent via ${res.relayed}`)
              wfcb()
            }
          })
        } catch (err) {
          console.log(`Error: Failed to send transaction: ${err}`)
          txnResponse = { error: err, response: err }
          wfcb()
        }
      },
      /*
    // Now relay through all default nodes that we have a connection too
    function(wfcb) {
      async.eachSeries(DEFAULT_NODES, (node, cb) => {
        if ((qrlClient.hasOwnProperty(node.grpc) === true) && (node.grpc !== request.grpc)) {
          try {
            // Push the transaction - we don't care for its response
            qrlClient[node.grpc].pushTransaction(confirmTxn, (err) => {
              if (err) {
                console.log(`Error: Failed to send transaction through ${node.grpc} - ${err}`)
                cb()
              } else {
                console.log(`Transfer Transaction sent via ${node.grpc}`)
                relayedThrough.push(node.grpc)
                cb()
              }
            })
          } catch(err) {
            console.log(`Error: Failed to send transaction through ${node.grpc} - ${err}`)
            cb()
          }
        } else {
          cb()
        }
      }, (err) => {
        if (err) console.error(err.message)
        console.log('All transfer txns sent')
        wfcb()
      })
    },
    */
    ],
    () => {
      // All done, send txn response
      txnResponse.relayed = relayedThrough
      callback(null, txnResponse)
    }
  )
}

const confirmMultiSigSpend = (request, callback) => {
  const confirmTxn = {
    transaction_signed: request.extended_transaction_unsigned.tx,
  }
  const relayedThrough = []

  // change Uint8Arrays to Buffers
  confirmTxn.transaction_signed.public_key = toBuffer(
    confirmTxn.transaction_signed.public_key
  )
  confirmTxn.transaction_signed.signature = toBuffer(
    confirmTxn.transaction_signed.signature
  )

  const addrsTo = confirmTxn.transaction_signed.multi_sig_spend.addrs_to
  const signatoriesFormatted = []
  addrsTo.forEach((item) => {
    const i = toBuffer(item)
    signatoriesFormatted.push(i)
  })

  // Overwrite signatories with our updated one
  confirmTxn.transaction_signed.multi_sig_spend.addrs_to = signatoriesFormatted

  // multi_sig_address & master_addr as Buffer
  // confirmTxn.transaction_signed.master_addr = toBuffer(confirmTxn.transaction_signed.master_addr)
  confirmTxn.transaction_signed.multi_sig_spend.multi_sig_address = toBuffer(
    confirmTxn.transaction_signed.multi_sig_spend.multi_sig_address
  )

  // // tx.multi_sig_create.threshold
  confirmTxn.network = request.network

  console.log('confirmed + signed tx for push', confirmTxn)

  // Relay transaction through user node, then all default nodes.
  let txnResponse

  async.waterfall(
    [
      // Relay through user node.
      function (wfcb) {
        try {
          qrlApi('pushTransaction', confirmTxn, (err, res) => {
            console.log(
              'Relayed Txn: ',
              Buffer.from(res.tx_hash).toString('hex')
            )

            if (err) {
              console.log(`Error:  ${err.message}`)
              txnResponse = { error: err.message, response: err.message }
              wfcb()
            } else {
              const hashResponse = {
                txnHash: Buffer.from(
                  confirmTxn.transaction_signed.transaction_hash
                ).toString('hex'),
                signature: Buffer.from(
                  confirmTxn.transaction_signed.signature
                ).toString('hex'),
              }
              txnResponse = { error: null, response: hashResponse }
              relayedThrough.push(res.relayed)
              console.log(`Transaction sent via ${res.relayed}`)
              wfcb()
            }
          })
        } catch (err) {
          console.log(`Error: Failed to send transaction: ${err}`)
          txnResponse = { error: err, response: err }
          wfcb()
        }
      },
      /*
    // Now relay through all default nodes that we have a connection too
    function(wfcb) {
      async.eachSeries(DEFAULT_NODES, (node, cb) => {
        if ((qrlClient.hasOwnProperty(node.grpc) === true) && (node.grpc !== request.grpc)) {
          try {
            // Push the transaction - we don't care for its response
            qrlClient[node.grpc].pushTransaction(confirmTxn, (err) => {
              if (err) {
                console.log(`Error: Failed to send transaction through ${node.grpc} - ${err}`)
                cb()
              } else {
                console.log(`Transfer Transaction sent via ${node.grpc}`)
                relayedThrough.push(node.grpc)
                cb()
              }
            })
          } catch(err) {
            console.log(`Error: Failed to send transaction through ${node.grpc} - ${err}`)
            cb()
          }
        } else {
          cb()
        }
      }, (err) => {
        if (err) console.error(err.message)
        console.log('All transfer txns sent')
        wfcb()
      })
    },
    */
    ],
    () => {
      // All done, send txn response
      txnResponse.relayed = relayedThrough
      callback(null, txnResponse)
    }
  )
}

const confirmMultiSigVote = (request, callback) => {
  const confirmTxn = {
    transaction_signed: request.extended_transaction_unsigned.tx,
  }
  const relayedThrough = []

  // change Uint8Arrays to Buffers
  confirmTxn.transaction_signed.public_key = toBuffer(
    confirmTxn.transaction_signed.public_key
  )
  confirmTxn.transaction_signed.signature = toBuffer(
    confirmTxn.transaction_signed.signature
  )

  // multi_sig_address & master_addr as Buffer
  // confirmTxn.transaction_signed.master_addr = toBuffer(confirmTxn.transaction_signed.master_addr)
  confirmTxn.transaction_signed.multi_sig_vote.shared_key = toBuffer(
    confirmTxn.transaction_signed.multi_sig_vote.shared_key
  )

  // // tx.multi_sig_create.threshold
  confirmTxn.network = request.network

  console.log('confirmed + signed tx for push', confirmTxn)

  // Relay transaction through user node, then all default nodes.
  let txnResponse

  async.waterfall(
    [
      // Relay through user node.
      function (wfcb) {
        try {
          qrlApi('pushTransaction', confirmTxn, (err, res) => {
            console.log(
              'Relayed Txn: ',
              Buffer.from(res.tx_hash).toString('hex')
            )

            if (err) {
              console.log(`Error:  ${err.message}`)
              txnResponse = { error: err.message, response: err.message }
              wfcb()
            } else {
              const hashResponse = {
                txnHash: Buffer.from(
                  confirmTxn.transaction_signed.transaction_hash
                ).toString('hex'),
                signature: Buffer.from(
                  confirmTxn.transaction_signed.signature
                ).toString('hex'),
              }
              txnResponse = { error: null, response: hashResponse }
              relayedThrough.push(res.relayed)
              console.log(`Transaction sent via ${res.relayed}`)
              wfcb()
            }
          })
        } catch (err) {
          console.log(`Error: Failed to send transaction: ${err}`)
          txnResponse = { error: err, response: err }
          wfcb()
        }
      },
      /*
    // Now relay through all default nodes that we have a connection too
    function(wfcb) {
      async.eachSeries(DEFAULT_NODES, (node, cb) => {
        if ((qrlClient.hasOwnProperty(node.grpc) === true) && (node.grpc !== request.grpc)) {
          try {
            // Push the transaction - we don't care for its response
            qrlClient[node.grpc].pushTransaction(confirmTxn, (err) => {
              if (err) {
                console.log(`Error: Failed to send transaction through ${node.grpc} - ${err}`)
                cb()
              } else {
                console.log(`Transfer Transaction sent via ${node.grpc}`)
                relayedThrough.push(node.grpc)
                cb()
              }
            })
          } catch(err) {
            console.log(`Error: Failed to send transaction through ${node.grpc} - ${err}`)
            cb()
          }
        } else {
          cb()
        }
      }, (err) => {
        if (err) console.error(err.message)
        console.log('All transfer txns sent')
        wfcb()
      })
    },
    */
    ],
    () => {
      // All done, send txn response
      txnResponse.relayed = relayedThrough
      callback(null, txnResponse)
    }
  )
}

// Function to call GetTokenTxn API
const createTokenTxn = (request, callback) => {
  const tx = {
    // master_addr: request.addressFrom,
    symbol: request.symbol,
    name: request.name,
    owner: request.owner,
    decimals: request.decimals,
    initial_balances: request.initialBalances,
    fee: request.fee,
    xmss_pk: request.xmssPk,
    xmss_ots_index: request.xmssOtsKey,
    network: request.network,
  }

  qrlApi('getTokenTxn', tx, (err, response) => {
    if (err) {
      console.log(`Error:  ${err.message}`)
      callback(err, null)
    } else {
      const transferResponse = {
        txnHash: Buffer.from(
          response.extended_transaction_unsigned.tx.transaction_hash
        ).toString('hex'),
        response,
      }

      callback(null, transferResponse)
    }
  })
}

// Function to call GetMessageTxn API
const createMessageTxn = (request, callback) => {
  const tx = {
    // master_addr: request.addressFrom,
    message: request.message,
    fee: request.fee,
    xmss_pk: request.xmssPk,
    xmss_ots_index: request.xmssOtsKey,
    network: request.network,
  }

  qrlApi('getMessageTxn', tx, (err, response) => {
    if (err) {
      console.log(`Error:  ${err.message}`)
      callback(err, null)
    } else {
      const transferResponse = {
        txnHash: Buffer.from(
          response.extended_transaction_unsigned.tx.transaction_hash
        ).toString('hex'),
        response,
      }

      callback(null, transferResponse)
    }
  })
}

// Create Keybase Txn
const createKeybaseTxn = (request, callback) => {
  const tx = {
    // master_addr: request.addressFrom,
    message: request.message,
    fee: request.fee,
    xmss_pk: request.xmssPk,
    xmss_ots_index: request.xmssOtsKey,
    network: request.network,
  }
  // uses message transaction internally
  qrlApi('getMessageTxn', tx, (err, response) => {
    if (err) {
      console.log(`Error:  ${err.message}`)
      callback(err, null)
    } else {
      const transferResponse = {
        txnHash: Buffer.from(
          response.extended_transaction_unsigned.tx.transaction_hash
        ).toString('hex'),
        response,
      }

      callback(null, transferResponse)
    }
  })
}

// Create Github Txn
const createGithubTxn = (request, callback) => {
  const tx = {
    // master_addr: request.addressFrom,
    message: request.message,
    fee: request.fee,
    xmss_pk: request.xmssPk,
    xmss_ots_index: request.xmssOtsKey,
    network: request.network,
  }
  // uses message transaction internally
  qrlApi('getMessageTxn', tx, (err, response) => {
    if (err) {
      console.log(`Error:  ${err.message}`)
      callback(err, null)
    } else {
      const transferResponse = {
        txnHash: Buffer.from(
          response.extended_transaction_unsigned.tx.transaction_hash
        ).toString('hex'),
        response,
      }

      callback(null, transferResponse)
    }
  })
}

const confirmTokenCreation = (request, callback) => {
  const confirmTxn = {
    transaction_signed: request.extended_transaction_unsigned.tx,
  }
  const relayedThrough = []

  // change ArrayBuffer
  confirmTxn.transaction_signed.public_key = toBuffer(
    confirmTxn.transaction_signed.public_key
  )
  confirmTxn.transaction_signed.transaction_hash = toBuffer(
    confirmTxn.transaction_signed.transaction_hash
  )
  confirmTxn.transaction_signed.signature = toBuffer(
    confirmTxn.transaction_signed.signature
  )

  confirmTxn.transaction_signed.token.symbol = toBuffer(
    confirmTxn.transaction_signed.token.symbol
  )
  confirmTxn.transaction_signed.token.name = toBuffer(
    confirmTxn.transaction_signed.token.name
  )
  confirmTxn.transaction_signed.token.owner = toBuffer(
    confirmTxn.transaction_signed.token.owner
  )

  const initialBalances = confirmTxn.transaction_signed.token.initial_balances
  const initialBalancesFormatted = []
  initialBalances.forEach((item) => {
    const itemFormatted = item
    itemFormatted.address = toBuffer(item.address)
    initialBalancesFormatted.push(itemFormatted)
  })

  // Overwrite initial_balances with our updated one
  confirmTxn.transaction_signed.token.initial_balances = initialBalancesFormatted
  confirmTxn.network = request.network

  // Relay transaction through user node, then all default nodes.
  let txnResponse

  async.waterfall(
    [
      // Relay through user node.
      function (wfcb) {
        try {
          qrlApi('pushTransaction', confirmTxn, (err, res) => {
            if (err) {
              console.log(
                `Error: Failed to send transaction through ${res.relayed} - ${err}`
              )
              txnResponse = { error: err.message, response: err.message }
              wfcb()
            } else {
              const hashResponse = {
                txnHash: Buffer.from(
                  confirmTxn.transaction_signed.transaction_hash
                ).toString('hex'),
                signature: Buffer.from(
                  confirmTxn.transaction_signed.signature
                ).toString('hex'),
              }
              txnResponse = { error: null, response: hashResponse }
              relayedThrough.push(res.relayed)
              console.log(`Transaction sent via ${res.relayed}`)
              wfcb()
            }
          })
        } catch (err) {
          console.log(`Caught Error:  ${err}`)
          txnResponse = { error: err, response: err }
          wfcb()
        }
      },
      /*
    // Now relay through all default nodes that we have a connection too
    function(wfcb) {
      async.eachSeries(DEFAULT_NODES, (node, cb) => {
        if ((qrlClient.hasOwnProperty(node.grpc) === true) && (node.grpc !== request.grpc)) {
          try{
            // Push the transaction - we don't care for its response
            qrlClient[node.grpc].pushTransaction(confirmTxn, (err) => {
              if (err) {
                console.log(`Error: Failed to send transaction through ${node.grpc} - ${err}`)
                cb()
              } else {
                console.log(`Token Creation Transaction sent via ${node.grpc}`)
                relayedThrough.push(node.grpc)
                cb()
              }
            })
          } catch (err) {
            console.log(`Error: Failed to send transaction through ${node.grpc} - ${err}`)
            cb()
          }
        } else {
          cb()
        }
      }, (err) => {
        if (err) console.error(err.message)
        console.log('All token creation txns sent')
        wfcb()
      })
    },
    */
    ],
    () => {
      // All done, send txn response
      txnResponse.relayed = relayedThrough
      callback(null, txnResponse)
    }
  )
}

const confirmMessageCreation = (request, callback) => {
  const confirmTxn = {
    transaction_signed: request.extended_transaction_unsigned.tx,
  }
  const relayedThrough = []

  // change ArrayBuffer
  confirmTxn.transaction_signed.public_key = toBuffer(
    confirmTxn.transaction_signed.public_key
  )
  confirmTxn.transaction_signed.transaction_hash = toBuffer(
    confirmTxn.transaction_signed.transaction_hash
  )
  confirmTxn.transaction_signed.signature = toBuffer(
    confirmTxn.transaction_signed.signature
  )

  confirmTxn.transaction_signed.message.message_hash = toBuffer(
    confirmTxn.transaction_signed.message.message_hash
  )

  confirmTxn.network = request.network

  // Relay transaction through user node, then all default nodes.
  let txnResponse

  async.waterfall(
    [
      // Relay through user node.
      function (wfcb) {
        try {
          qrlApi('pushTransaction', confirmTxn, (err, res) => {
            if (err) {
              console.log(
                `Error: Failed to send transaction through ${res.relayed} - ${err}`
              )
              txnResponse = { error: err.message, response: err.message }
              wfcb()
            } else {
              const hashResponse = {
                txnHash: Buffer.from(
                  confirmTxn.transaction_signed.transaction_hash
                ).toString('hex'),
                signature: Buffer.from(
                  confirmTxn.transaction_signed.signature
                ).toString('hex'),
              }
              txnResponse = { error: null, response: hashResponse }
              relayedThrough.push(res.relayed)
              console.log(`Transaction sent via ${res.relayed}`)
              wfcb()
            }
          })
        } catch (err) {
          console.log(`Caught Error:  ${err}`)
          txnResponse = { error: err, response: err }
          wfcb()
        }
      },
      /*
    // Now relay through all default nodes that we have a connection too
    function(wfcb) {
      async.eachSeries(DEFAULT_NODES, (node, cb) => {
        if ((qrlClient.hasOwnProperty(node.grpc) === true) && (node.grpc !== request.grpc)) {
          try{
            // Push the transaction - we don't care for its response
            qrlClient[node.grpc].pushTransaction(confirmTxn, (err) => {
              if (err) {
                console.log(`Error: Failed to send transaction through ${node.grpc} - ${err}`)
                cb()
              } else {
                console.log(`Token Creation Transaction sent via ${node.grpc}`)
                relayedThrough.push(node.grpc)
                cb()
              }
            })
          } catch (err) {
            console.log(`Error: Failed to send transaction through ${node.grpc} - ${err}`)
            cb()
          }
        } else {
          cb()
        }
      }, (err) => {
        if (err) console.error(err.message)
        console.log('All token creation txns sent')
        wfcb()
      })
    },
    */
    ],
    () => {
      // All done, send txn response
      txnResponse.relayed = relayedThrough
      callback(null, txnResponse)
    }
  )
}

const confirmKeybaseCreation = (request, callback) => {
  const confirmTxn = {
    transaction_signed: request.extended_transaction_unsigned.tx,
  }
  const relayedThrough = []

  // change ArrayBuffer
  confirmTxn.transaction_signed.public_key = toBuffer(
    confirmTxn.transaction_signed.public_key
  )
  confirmTxn.transaction_signed.transaction_hash = toBuffer(
    confirmTxn.transaction_signed.transaction_hash
  )
  confirmTxn.transaction_signed.signature = toBuffer(
    confirmTxn.transaction_signed.signature
  )

  confirmTxn.transaction_signed.message.message_hash = toBuffer(
    confirmTxn.transaction_signed.message.message_hash
  )

  confirmTxn.network = request.network

  // Relay transaction through user node, then all default nodes.
  let txnResponse

  async.waterfall(
    [
      // Relay through user node.
      function (wfcb) {
        try {
          qrlApi('pushTransaction', confirmTxn, (err, res) => {
            if (err) {
              console.log(
                `Error: Failed to send transaction through ${res.relayed} - ${err}`
              )
              txnResponse = { error: err.message, response: err.message }
              wfcb()
            } else {
              const hashResponse = {
                txnHash: Buffer.from(
                  confirmTxn.transaction_signed.transaction_hash
                ).toString('hex'),
                signature: Buffer.from(
                  confirmTxn.transaction_signed.signature
                ).toString('hex'),
              }
              txnResponse = { error: null, response: hashResponse }
              relayedThrough.push(res.relayed)
              console.log(`Transaction sent via ${res.relayed}`)
              wfcb()
            }
          })
        } catch (err) {
          console.log(`Caught Error:  ${err}`)
          txnResponse = { error: err, response: err }
          wfcb()
        }
      },
      /*
    // Now relay through all default nodes that we have a connection too
    function(wfcb) {
      async.eachSeries(DEFAULT_NODES, (node, cb) => {
        if ((qrlClient.hasOwnProperty(node.grpc) === true) && (node.grpc !== request.grpc)) {
          try{
            // Push the transaction - we don't care for its response
            qrlClient[node.grpc].pushTransaction(confirmTxn, (err) => {
              if (err) {
                console.log(`Error: Failed to send transaction through ${node.grpc} - ${err}`)
                cb()
              } else {
                console.log(`Token Creation Transaction sent via ${node.grpc}`)
                relayedThrough.push(node.grpc)
                cb()
              }
            })
          } catch (err) {
            console.log(`Error: Failed to send transaction through ${node.grpc} - ${err}`)
            cb()
          }
        } else {
          cb()
        }
      }, (err) => {
        if (err) console.error(err.message)
        console.log('All token creation txns sent')
        wfcb()
      })
    },
    */
    ],
    () => {
      // All done, send txn response
      txnResponse.relayed = relayedThrough
      callback(null, txnResponse)
    }
  )
}

const confirmGithubCreation = (request, callback) => {
  const confirmTxn = {
    transaction_signed: request.extended_transaction_unsigned.tx,
  }
  const relayedThrough = []

  // change ArrayBuffer
  confirmTxn.transaction_signed.public_key = toBuffer(
    confirmTxn.transaction_signed.public_key
  )
  confirmTxn.transaction_signed.transaction_hash = toBuffer(
    confirmTxn.transaction_signed.transaction_hash
  )
  confirmTxn.transaction_signed.signature = toBuffer(
    confirmTxn.transaction_signed.signature
  )

  confirmTxn.transaction_signed.message.message_hash = toBuffer(
    confirmTxn.transaction_signed.message.message_hash
  )

  confirmTxn.network = request.network

  // Relay transaction through user node, then all default nodes.
  let txnResponse

  async.waterfall(
    [
      // Relay through user node.
      function (wfcb) {
        try {
          qrlApi('pushTransaction', confirmTxn, (err, res) => {
            if (err) {
              console.log(
                `Error: Failed to send transaction through ${res.relayed} - ${err}`
              )
              txnResponse = { error: err.message, response: err.message }
              wfcb()
            } else {
              const hashResponse = {
                txnHash: Buffer.from(
                  confirmTxn.transaction_signed.transaction_hash
                ).toString('hex'),
                signature: Buffer.from(
                  confirmTxn.transaction_signed.signature
                ).toString('hex'),
              }
              txnResponse = { error: null, response: hashResponse }
              relayedThrough.push(res.relayed)
              console.log(`Transaction sent via ${res.relayed}`)
              wfcb()
            }
          })
        } catch (err) {
          console.log(`Caught Error:  ${err}`)
          txnResponse = { error: err, response: err }
          wfcb()
        }
      },
      /*
    // Now relay through all default nodes that we have a connection too
    function(wfcb) {
      async.eachSeries(DEFAULT_NODES, (node, cb) => {
        if ((qrlClient.hasOwnProperty(node.grpc) === true) && (node.grpc !== request.grpc)) {
          try{
            // Push the transaction - we don't care for its response
            qrlClient[node.grpc].pushTransaction(confirmTxn, (err) => {
              if (err) {
                console.log(`Error: Failed to send transaction through ${node.grpc} - ${err}`)
                cb()
              } else {
                console.log(`Token Creation Transaction sent via ${node.grpc}`)
                relayedThrough.push(node.grpc)
                cb()
              }
            })
          } catch (err) {
            console.log(`Error: Failed to send transaction through ${node.grpc} - ${err}`)
            cb()
          }
        } else {
          cb()
        }
      }, (err) => {
        if (err) console.error(err.message)
        console.log('All token creation txns sent')
        wfcb()
      })
    },
    */
    ],
    () => {
      // All done, send txn response
      txnResponse.relayed = relayedThrough
      callback(null, txnResponse)
    }
  )
}

// Function to call GetTransferTokenTxn API
const createTokenTransferTxn = (request, callback) => {
  const tx = {
    // master_addr: request.addressFrom,
    addresses_to: request.addresses_to,
    amounts: request.amounts,
    token_txhash: request.tokenHash,
    fee: request.fee,
    xmss_pk: request.xmssPk,
    network: request.network,
  }

  qrlApi('getTransferTokenTxn', tx, (err, response) => {
    if (err) {
      console.log(`Error:  ${err.message}`)
      callback(err, null)
    } else {
      const transferResponse = {
        response,
      }

      callback(null, transferResponse)
    }
  })
}

const confirmTokenTransfer = (request, callback) => {
  const confirmTxn = {
    transaction_signed: request.extended_transaction_unsigned.tx,
  }
  const relayedThrough = []

  // change ArrayBuffer
  confirmTxn.transaction_signed.public_key = toBuffer(
    confirmTxn.transaction_signed.public_key
  )
  confirmTxn.transaction_signed.transaction_hash = toBuffer(
    confirmTxn.transaction_signed.transaction_hash
  )
  confirmTxn.transaction_signed.signature = toBuffer(
    confirmTxn.transaction_signed.signature
  )
  confirmTxn.transaction_signed.transfer_token.token_txhash = toBuffer(
    confirmTxn.transaction_signed.transfer_token.token_txhash
  )

  const addrsTo = confirmTxn.transaction_signed.transfer_token.addrs_to
  const addrsToFormatted = []
  addrsTo.forEach((item) => {
    const Fitem = toBuffer(item)
    addrsToFormatted.push(Fitem)
  })

  // Overwrite addrs_to with our updated one
  confirmTxn.transaction_signed.transfer_token.addrs_to = addrsToFormatted
  confirmTxn.network = request.network

  // Relay transaction through user node, then all default nodes.
  let txnResponse

  async.waterfall(
    [
      // Relay through user node.
      function (wfcb) {
        try {
          qrlApi('pushTransaction', confirmTxn, (err, res) => {
            if (err) {
              console.log(
                `Error: Failed to send transaction through ${res.relayed} - ${err}`
              )
              txnResponse = { error: err.message, response: err.message }
              wfcb()
            } else {
              const hashResponse = {
                txnHash: Buffer.from(
                  confirmTxn.transaction_signed.transaction_hash
                ).toString('hex'),
                signature: Buffer.from(
                  confirmTxn.transaction_signed.signature
                ).toString('hex'),
              }
              txnResponse = { error: null, response: hashResponse }
              relayedThrough.push(res.relayed)
              console.log(`Transaction sent via ${res.relayed}`)
              wfcb()
            }
          })
        } catch (err) {
          console.log(`Caught Error:  ${err}`)
          txnResponse = { error: err, response: err }
          wfcb()
        }
      },
      /*
    // Now relay through all default nodes that we have a connection too
    function(wfcb) {
      async.eachSeries(DEFAULT_NODES, (node, cb) => {
        if ((qrlClient.hasOwnProperty(node.grpc) === true) && (node.grpc !== request.grpc)) {
          try{
            // Push the transaction - we don't care for its response
            qrlClient[node.grpc].pushTransaction(confirmTxn, (err) => {
              if (err) {
                console.log(`Error: Failed to send transaction through ${node.grpc} - ${err}`)
                cb()
              } else {
                console.log(`Token transfer Transaction sent via ${node.grpc}`)
                relayedThrough.push(node.grpc)
                cb()
              }
            })
          } catch (err) {
            console.log(`Error: Failed to send transaction through ${node.grpc} - ${err}`)
            cb()
          }
        } else {
          cb()
        }
      }, (err) => {
        if (err) console.error(err.message)
        console.log('All token transfer txns sent')
        wfcb()
      })
    },
    */
    ],
    () => {
      // All done, send txn response
      txnResponse.relayed = relayedThrough
      callback(null, txnResponse)
    }
  )
}

const apiCall = (apiUrl, callback) => {
  try {
    const response = HTTP.get(apiUrl).data
    // Successful call
    callback(null, response)
  } catch (error) {
    const myError = new Meteor.Error(500, 'Cannot access the API')
    callback(myError, null)
  }
}

// ============================================================================
// Promise-based async wrappers for Meteor 3 compatibility
// These replace Meteor.wrapAsync which was removed in Meteor 3
// ============================================================================

const connectToNodeAsync = (endpoint) => {
  return new Promise((resolve, reject) => {
    connectToNode(endpoint, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const checkNetworkHealthAsync = (userNetwork) => {
  return new Promise((resolve, reject) => {
    checkNetworkHealth(userNetwork, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const getStatsAsync = (request) => {
  return new Promise((resolve, reject) => {
    getStats(request, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const getKnownPeersAsync = (request) => {
  return new Promise((resolve, reject) => {
    getKnownPeers(request, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const getHeightAsync = (request) => {
  return new Promise((resolve, reject) => {
    getHeight(request, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const getObjectAsync = (request) => {
  return new Promise((resolve, reject) => {
    getObject(request, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const getAddressStateAsync = (request) => {
  return new Promise((resolve, reject) => {
    getAddressState(request, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const getFullAddressStateAsync = (request) => {
  return new Promise((resolve, reject) => {
    getFullAddressState(request, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const getMultiSigAddressStateAsync = (request) => {
  return new Promise((resolve, reject) => {
    getMultiSigAddressState(request, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const getTransactionsByAddressAsync = (request) => {
  return new Promise((resolve, reject) => {
    getTransactionsByAddress(request, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const getTokensByAddressAsync = (request) => {
  return new Promise((resolve, reject) => {
    getTokensByAddress(request, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const getMultiSigAddressesByAddressAsync = (request) => {
  return new Promise((resolve, reject) => {
    getMultiSigAddressesByAddress(request, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const getMultiSigSpendTxsByAddressAsync = (request) => {
  return new Promise((resolve, reject) => {
    getMultiSigSpendTxsByAddress(request, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const getOTSAsync = (request) => {
  return new Promise((resolve, reject) => {
    getOTS(request, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const getTxnHashAsync = (request) => {
  return new Promise((resolve, reject) => {
    getTxnHash(request, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const transferCoinsAsync = (request) => {
  return new Promise((resolve, reject) => {
    transferCoins(request, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const createMultiSigAsync = (request) => {
  return new Promise((resolve, reject) => {
    createMultiSig(request, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const spendMultiSigAsync = (request) => {
  return new Promise((resolve, reject) => {
    spendMultiSig(request, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const voteMultiSigAsync = (request) => {
  return new Promise((resolve, reject) => {
    voteMultiSig(request, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const confirmTransactionAsync = (request) => {
  return new Promise((resolve, reject) => {
    confirmTransaction(request, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const confirmMultiSigCreateAsync = (request) => {
  return new Promise((resolve, reject) => {
    confirmMultiSigCreate(request, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const confirmMultiSigSpendAsync = (request) => {
  return new Promise((resolve, reject) => {
    confirmMultiSigSpend(request, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const confirmMultiSigVoteAsync = (request) => {
  return new Promise((resolve, reject) => {
    confirmMultiSigVote(request, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const createTokenTxnAsync = (request) => {
  return new Promise((resolve, reject) => {
    createTokenTxn(request, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const confirmTokenCreationAsync = (request) => {
  return new Promise((resolve, reject) => {
    confirmTokenCreation(request, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const createMessageTxnAsync = (request) => {
  return new Promise((resolve, reject) => {
    createMessageTxn(request, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const confirmMessageCreationAsync = (request) => {
  return new Promise((resolve, reject) => {
    confirmMessageCreation(request, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const createKeybaseTxnAsync = (request) => {
  return new Promise((resolve, reject) => {
    createKeybaseTxn(request, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const confirmKeybaseCreationAsync = (request) => {
  return new Promise((resolve, reject) => {
    confirmKeybaseCreation(request, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const createGithubTxnAsync = (request) => {
  return new Promise((resolve, reject) => {
    createGithubTxn(request, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const confirmGithubCreationAsync = (request) => {
  return new Promise((resolve, reject) => {
    confirmGithubCreation(request, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const createTokenTransferTxnAsync = (request) => {
  return new Promise((resolve, reject) => {
    createTokenTransferTxn(request, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const confirmTokenTransferAsync = (request) => {
  return new Promise((resolve, reject) => {
    confirmTokenTransfer(request, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const apiCallAsync = (apiUrl) => {
  return new Promise((resolve, reject) => {
    apiCall(apiUrl, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const ledgerGetStateAsync = (request) => {
  return new Promise((resolve, reject) => {
    ledgerGetState(request, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const ledgerPublicKeyAsync = (request) => {
  return new Promise((resolve, reject) => {
    ledgerPublicKey(request, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const ledgerAppVersionAsync = (request) => {
  return new Promise((resolve, reject) => {
    ledgerAppVersion(request, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const ledgerLibraryVersionAsync = (request) => {
  return new Promise((resolve, reject) => {
    ledgerLibraryVersion(request, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const ledgerVerifyAddressAsync = (request) => {
  return new Promise((resolve, reject) => {
    ledgerVerifyAddress(request, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const ledgerCreateTxAsync = (sourceAddr, fee, destAddr, destAmount) => {
  return new Promise((resolve, reject) => {
    ledgerCreateTx(sourceAddr, fee, destAddr, destAmount, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const ledgerRetrieveSignatureAsync = (txn) => {
  return new Promise((resolve, reject) => {
    ledgerRetrieveSignature(txn, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const ledgerSetIdxAsync = (otsKey) => {
  return new Promise((resolve, reject) => {
    ledgerSetIdx(otsKey, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const ledgerCreateMessageTxAsync = (sourceAddr, fee, message) => {
  return new Promise((resolve, reject) => {
    ledgerCreateMessageTx(sourceAddr, fee, message, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

// Ledger Nano S Integration for Electron Desktop Apps

const LEDGER_USB_OPEN_PATH_ERROR = 'cannot open device with path'

const normalizeLedgerErrorMessage = (error) => {
  if (!error) {
    return 'Unknown Ledger error'
  }
  if (typeof error === 'string') {
    return error
  }
  if (typeof error.details === 'string' && error.details.trim() !== '') {
    return error.details
  }
  if (typeof error.message === 'string' && error.message.trim() !== '') {
    return error.message
  }
  try {
    return JSON.stringify(error)
  } catch (stringifyError) {
    return String(error)
  }
}

const isLedgerUsbOpenPathError = (error) => {
  const errorMessage = normalizeLedgerErrorMessage(error).toLowerCase()
  return errorMessage.includes(LEDGER_USB_OPEN_PATH_ERROR)
}

const createLedgerMethodError = (methodName, error) => {
  const rawMessage = normalizeLedgerErrorMessage(error)
  const needsUsbReset = isLedgerUsbOpenPathError(error)
  const recoveryHint = needsUsbReset
    ? ' Ledger USB transport appears stale. Unplug and reinsert the device, unlock it, open the QRL app, and retry.'
    : ''
  return new Meteor.Error(
    'ledger-device-error',
    `${methodName} failed: ${rawMessage}${recoveryHint}`,
    JSON.stringify({
      method: methodName,
      rawMessage,
      needsUsbReset,
      statusCode: error && error.statusCode ? error.statusCode : null,
    })
  )
}

const withLedgerTransport = async (operationName, action, cb) => {
  let localTransport = null
  try {
    localTransport = await TransportNodeHid.create(10)
    const qrlLedger = new Qrl(localTransport)
    const response = await action(qrlLedger)
    cb(null, response)
  } catch (error) {
    console.log(`-- ${operationName} failed --`)
    console.log(error)
    cb(error, null)
  } finally {
    if (localTransport) {
      try {
        await localTransport.close()
      } catch (closeError) {
        console.log(`-- ${operationName} transport close failed --`)
        console.log(closeError)
      }
    }
  }
}

const ledgerGetState = async (request, cb) => {
  await withLedgerTransport('ledgerGetState', async (qrlLedger) => {
    const data = await qrlLedger.get_state()
    console.log(data)
    return data
  }, cb)
}

const ledgerPublicKey = async (request, cb) => {
  await withLedgerTransport('ledgerPublicKey', async (qrlLedger) => {
    const data = await qrlLedger.publickey()
    console.log(data)
    return data
  }, cb)
}

const ledgerAppVersion = async (request, cb) => {
  await withLedgerTransport('ledgerAppVersion', async (qrlLedger) => {
    const data = await qrlLedger.get_version()
    return data
  }, cb)
}

const ledgerLibraryVersion = async (request, cb) => {
  await withLedgerTransport('ledgerLibraryVersion', async (qrlLedger) => {
    const data = await qrlLedger.library_version()
    return data
  }, cb)
}

const ledgerVerifyAddress = async (request, cb) => {
  await withLedgerTransport('ledgerVerifyAddress', async (qrlLedger) => {
    const data = await qrlLedger.viewAddress()
    return data
  }, cb)
}

const ledgerCreateTx = async (sourceAddr, fee, destAddr, destAmount, cb) => {
  const sourceAddrBuffer = Buffer.from(sourceAddr)
  const feeBuffer = Buffer.from(fee)

  const destAddrFinal = []
  const destAmountFinal = []
  for (let i = 0; i < destAddr.length; i += 1) {
    destAddrFinal.push(Buffer.from(destAddr[i]))
    destAmountFinal.push(Buffer.from(destAmount[i]))
  }

  await withLedgerTransport('ledgerCreateTx', async (qrlLedger) => {
    const data = await qrlLedger.createTx(
      sourceAddrBuffer,
      feeBuffer,
      destAddrFinal,
      destAmountFinal
    )
    return data
  }, cb)
}

const ledgerRetrieveSignature = async (txn, cb) => {
  await withLedgerTransport('ledgerRetrieveSignature', async (qrlLedger) => {
    const data = await qrlLedger.retrieveSignature(txn)
    return data
  }, cb)
}

const ledgerSetIdx = async (otsKey, cb) => {
  await withLedgerTransport('ledgerSetIdx', async (qrlLedger) => {
    const idxResponse = await qrlLedger.setIdx(otsKey)
    return idxResponse
  }, cb)
}

const ledgerCreateMessageTx = async (sourceAddr, fee, message, cb) => {
  const sourceAddrBuffer = Buffer.from(sourceAddr)
  const feeBuffer = Buffer.from(fee)
  const messageBuffer = Buffer.from(message)

  await withLedgerTransport('ledgerCreateMessageTx', async (qrlLedger) => {
    const data = await qrlLedger.createMessageTx(
      sourceAddrBuffer,
      feeBuffer,
      messageBuffer
    )
    return data
  }, cb)
}

// Define Meteor Methods
Meteor.methods({
  async connectToNode(request) {
    check(request, String)
    const denialReason = endpointDenialReason(request)
    if (denialReason) {
      throw new Meteor.Error(403, denialReason)
    }
    const response = await connectToNodeAsync(request)
    return response
  },
  async checkNetworkHealth(request) {
    check(request, String)
    try {
      const response = await checkNetworkHealthAsync(request)
      return response
    } catch (err) {
      const msg = (err && err.error) || 'Network unhealthy'
      throw new Meteor.Error('network-unhealthy', msg)
    }
  },
  async status(request) {
    check(request, Object)
    const response = await getStatsAsync(request)
    return response
  },
  async getPeers(request) {
    check(request, Object)
    const response = await getKnownPeersAsync(request)
    return response
  },
  async getHeight(request) {
    check(request, Object)
    const response = await getHeightAsync(request)
    return response
  },
  async getObject(request) {
    check(request, Object)
    const response = await getObjectAsync(request)
    return response
  },
  async getAddressState(request) {
    check(request, Object)
    const response = await getAddressStateAsync(request)
    return response
  },
  async getFullAddressState(request) {
    check(request, Object)
    const response = await getFullAddressStateAsync(request)
    return response
  },
  async getMultiSigAddressState(request) {
    check(request, Object)
    const response = await getMultiSigAddressStateAsync(request)
    return response
  },
  async getTransactionsByAddress(request) {
    check(request, Object)
    const response = await getTransactionsByAddressAsync(request)
    return helpersaddressTransactions(response)
  },
  async getTokensByAddress(request) {
    check(request, Object)
    const response = await getTokensByAddressAsync(request)
    return response
  },
  async getMultiSigAddressesByAddress(request) {
    check(request, Object)
    const response = await getMultiSigAddressesByAddressAsync(request)
    console.table(response)
    return response
  },
  async getMultiSigSpendTxsByAddress(request) {
    check(request, Object)
    const response = await getMultiSigSpendTxsByAddressAsync(request)
    console.table(response)
    return response
  },
  async getTxnHash(request) {
    check(request, Object)
    const response = await getTxnHashAsync(request)
    return response
  },

  async txhash(request) {
    check(request, Object)
    let output
    // asynchronous call to API
    const response = await getTxnHashAsync(request)
    if (response.transaction.tx.transactionType === 'transfer_token') {
      // Request Token Decimals / Symbol
      const symbolRequest = {
        query: Buffer.from(
          response.transaction.tx.transfer_token.token_txhash
        ).toString('hex'),
        network: request.network,
      }

      const thisSymbolResponse = await getTxnHashAsync(symbolRequest)
      output = helpers.parseTokenAndTransferTokenTx(
        thisSymbolResponse,
        response
      )
    } else {
      output = helpers.txhash(response)
    }
    return output
  },

  async transferCoins(request) {
    check(request, Object)
    const response = await transferCoinsAsync(request)
    return response
  },
  async createMultiSig(request) {
    check(request, Object)
    const response = await createMultiSigAsync(request)
    return response
  },
  async spendMultiSig(request) {
    check(request, Object)
    const response = await spendMultiSigAsync(request)
    return response
  },
  async voteMultiSig(request) {
    check(request, Object)
    const response = await voteMultiSigAsync(request)
    return response
  },
  async getOTS(request) {
    check(request, Object)
    const response = await getOTSAsync(request)
    return response
  },
  async addressTransactions(request) {
    check(request, Object)
    const targets = request.tx
    const result = []

    for (const arr of targets) {
      const thisRequest = {
        query: arr.txhash,
        network: request.network,
      }

      try {
        const thisTxnHashResponse = await getTxnHashAsync(thisRequest)

        const output = helpers.txhash(thisTxnHashResponse)

        let thisTxn = {}

        if (output.transaction.tx.transactionType === 'transfer') {
          thisTxn = {
            type: output.transaction.tx.transactionType,
            txhash: arr.txhash,
            totalTransferred: output.transaction.explorer.totalTransferred,
            outputs: output.transaction.explorer.outputs,
            from_hex: output.transaction.explorer.from_hex,
            from_b32: output.transaction.explorer.from_b32,
            ots_key: parseInt(
              output.transaction.tx.signature.substring(0, 8),
              16
            ),
            fee: output.transaction.tx.fee,
            block: output.transaction.header.block_number,
            timestamp: output.transaction.header.timestamp_seconds,
          }
          result.push(thisTxn)
        } else if (output.transaction.tx.transactionType === 'token') {
          thisTxn = {
            type: output.transaction.tx.transactionType,
            txhash: arr.txhash,
            from_hex: output.transaction.explorer.from_hex,
            from_b32: output.transaction.explorer.from_b32,
            symbol: output.transaction.tx.token.symbol,
            name: output.transaction.tx.token.name,
            decimals: output.transaction.tx.token.decimals,
            ots_key: parseInt(
              output.transaction.tx.signature.substring(0, 8),
              16
            ),
            fee: output.transaction.tx.fee,
            block: output.transaction.header.block_number,
            timestamp: output.transaction.header.timestamp_seconds,
          }

          result.push(thisTxn)
        } else if (
          thisTxnHashResponse.transaction.tx.transactionType
          === 'transfer_token'
        ) {
          // Request Token Symbol
          const symbolRequest = {
            query: Buffer.from(
              Buffer.from(
                thisTxnHashResponse.transaction.tx.transfer_token.token_txhash
              ).toString('hex'),
              'hex'
            ),
            network: request.network,
          }
          const thisSymbolResponse = await getTxnHashAsync(symbolRequest)
          const helpersResponse = helpers.parseTokenAndTransferTokenTx(
            thisSymbolResponse,
            thisTxnHashResponse
          )
          thisTxn = {
            type: helpersResponse.transaction.tx.transactionType,
            txhash: arr.txhash,
            symbol: helpersResponse.transaction.explorer.symbol,
            // eslint-disable-next-line
            totalTransferred:
              helpersResponse.transaction.explorer.totalTransferred,
            outputs: helpersResponse.transaction.explorer.outputs,
            from_hex: helpersResponse.transaction.explorer.from_hex,
            from_b32: helpersResponse.transaction.explorer.from_b32,
            ots_key: parseInt(
              helpersResponse.transaction.tx.signature.substring(0, 8),
              16
            ),
            fee: helpersResponse.transaction.tx.fee / SHOR_PER_QUANTA,
            block: helpersResponse.transaction.header.block_number,
            timestamp: helpersResponse.transaction.header.timestamp_seconds,
          }

          result.push(thisTxn)
        } else if (output.transaction.tx.transactionType === 'coinbase') {
          thisTxn = {
            type: output.transaction.tx.transactionType,
            txhash: arr.txhash,
            amount: output.transaction.tx.coinbase.amount / SHOR_PER_QUANTA,
            from_hex: output.transaction.explorer.from_hex,
            from_b32: output.transaction.explorer.from_b32,
            to: output.transaction.tx.coinbase.addr_to,
            ots_key: '',
            fee: output.transaction.tx.fee / SHOR_PER_QUANTA,
            block: output.transaction.header.block_number,
            timestamp: output.transaction.header.timestamp_seconds,
          }
          result.push(thisTxn)
        } else if (output.transaction.tx.transactionType === 'slave') {
          thisTxn = {
            type: output.transaction.tx.transactionType,
            txhash: arr.txhash,
            amount: 0,
            from_hex: output.transaction.explorer.from_hex,
            from_b32: output.transaction.explorer.from_b32,
            to: '',
            ots_key: parseInt(
              output.transaction.tx.signature.substring(0, 8),
              16
            ),
            fee: output.transaction.tx.fee / SHOR_PER_QUANTA,
            block: output.transaction.header.block_number,
            timestamp: output.transaction.header.timestamp_seconds,
          }
          result.push(thisTxn)
        } else if (output.transaction.tx.transactionType === 'latticePK') {
          thisTxn = {
            type: output.transaction.tx.transactionType,
            txhash: arr.txhash,
            amount: 0,
            from_hex: output.transaction.explorer.from_hex,
            from_b32: output.transaction.explorer.from_b32,
            to: '',
            ots_key: parseInt(
              output.transaction.tx.signature.substring(0, 8),
              16
            ),
            fee: output.transaction.tx.fee,
            block: output.transaction.header.block_number,
            timestamp: output.transaction.header.timestamp_seconds,
          }
          result.push(thisTxn)
        } else if (output.transaction.explorer.type === 'MESSAGE') {
          thisTxn = {
            type: output.transaction.explorer.type,
            txhash: arr.txhash,
            amount: 0,
            from_hex: output.transaction.explorer.from_hex,
            from_b32: output.transaction.explorer.from_b32,
            to: '',
            ots_key: parseInt(
              output.transaction.tx.signature.substring(0, 8),
              16
            ),
            fee: output.transaction.tx.fee,
            block: output.transaction.header.block_number,
            timestamp: output.transaction.header.timestamp_seconds,
          }
          result.push(thisTxn)
        } else if (
          output.transaction.explorer.type === 'DOCUMENT_NOTARISATION'
        ) {
          thisTxn = {
            type: output.transaction.explorer.type,
            txhash: arr.txhash,
            amount: 0,
            from_hex: output.transaction.explorer.from_hex,
            from_b32: output.transaction.explorer.from_b32,
            to: '',
            ots_key: parseInt(
              output.transaction.tx.signature.substring(0, 8),
              16
            ),
            fee: output.transaction.tx.fee,
            block: output.transaction.header.block_number,
            timestamp: output.transaction.header.timestamp_seconds,
          }
          result.push(thisTxn)
        }
      } catch (err) {
        console.log(
          `Error fetching transaction hash in addressTransactions '${arr.txhash}' - ${err}`
        )
      }
    }

    return result
  },
  async confirmTransaction(request) {
    check(request, Object)
    const response = await confirmTransactionAsync(request)
    return response
  },
  async confirmMultiSigCreate(request) {
    check(request, Object)
    const response = await confirmMultiSigCreateAsync(request)
    return response
  },
  async confirmMultiSigSpend(request) {
    check(request, Object)
    const response = await confirmMultiSigSpendAsync(request)
    return response
  },
  async confirmMultiSigVote(request) {
    check(request, Object)
    const response = await confirmMultiSigVoteAsync(request)
    return response
  },
  async createMessageTxn(request) {
    check(request, Object)
    const response = await createMessageTxnAsync(request)
    return response
  },
  async createKeybaseTxn(request) {
    check(request, Object)
    const response = await createKeybaseTxnAsync(request)
    return response
  },
  async createGithubTxn(request) {
    check(request, Object)
    const response = await createGithubTxnAsync(request)
    return response
  },
  async confirmMessageCreation(request) {
    check(request, Object)
    const response = await confirmMessageCreationAsync(request)
    return response
  },
  async confirmKeybaseCreation(request) {
    check(request, Object)
    const response = await confirmKeybaseCreationAsync(request)
    return response
  },
  async confirmGithubCreation(request) {
    check(request, Object)
    const response = await confirmGithubCreationAsync(request)
    return response
  },
  async createTokenTxn(request) {
    check(request, Object)
    const response = await createTokenTxnAsync(request)
    return response
  },
  async confirmTokenCreation(request) {
    check(request, Object)
    const response = await confirmTokenCreationAsync(request)
    return response
  },
  async createTokenTransferTxn(request) {
    check(request, Object)
    const response = await createTokenTransferTxnAsync(request)
    return response
  },
  async confirmTokenTransfer(request) {
    check(request, Object)
    const response = await confirmTokenTransferAsync(request)
    return response
  },
  async QRLvalue() {
    const apiUrl = 'https://market-data.automated.theqrl.org/'
    try {
      const response = await apiCallAsync(apiUrl)
      const price = Number(response && response.price)
      if (!Number.isFinite(price) || price <= 0) {
        return null
      }
      return price
    } catch (error) {
      return null
    }
  },
  async ledgerGetState(request) {
    check(request, Array)
    try {
      const response = await ledgerGetStateAsync(request)
      console.log('res')
      console.log(response)
      return response
    } catch (error) {
      throw createLedgerMethodError('ledgerGetState', error)
    }
  },
  async ledgerPublicKey(request) {
    check(request, Array)
    try {
      const response = await ledgerPublicKeyAsync(request)
      return response
    } catch (error) {
      throw createLedgerMethodError('ledgerPublicKey', error)
    }
  },
  async ledgerAppVersion(request) {
    check(request, Array)
    try {
      const response = await ledgerAppVersionAsync(request)
      return response
    } catch (error) {
      throw createLedgerMethodError('ledgerAppVersion', error)
    }
  },
  async ledgerLibraryVersion(request) {
    check(request, Array)
    try {
      const response = await ledgerLibraryVersionAsync(request)
      return response
    } catch (error) {
      throw createLedgerMethodError('ledgerLibraryVersion', error)
    }
  },
  async ledgerVerifyAddress(request) {
    check(request, Array)
    try {
      const response = await ledgerVerifyAddressAsync(request)
      return response
    } catch (error) {
      throw createLedgerMethodError('ledgerVerifyAddress', error)
    }
  },
  async ledgerCreateTx(sourceAddr, fee, destAddr, destAmount) {
    check(sourceAddr, Match.Any)
    check(fee, Match.Any)
    check(destAddr, Match.Any)
    check(destAmount, Match.Any)

    console.log(
      '2: sourceAddr: ',
      sourceAddr,
      ' - fee: ',
      fee,
      ' - destAddr: ',
      destAddr,
      ' - destAmount: ',
      destAmount
    )

    try {
      const response = await ledgerCreateTxAsync(
        sourceAddr,
        fee,
        destAddr,
        destAmount
      )
      return response
    } catch (error) {
      throw createLedgerMethodError('ledgerCreateTx', error)
    }
  },
  async ledgerCreateMessageTx(sourceAddr, fee, message) {
    check(sourceAddr, Match.Any)
    check(fee, Match.Any)
    check(message, Match.Any)
    try {
      const response = await ledgerCreateMessageTxAsync(
        sourceAddr,
        fee,
        message
      )
      return response
    } catch (error) {
      throw createLedgerMethodError('ledgerCreateMessageTx', error)
    }
  },
  async ledgerRetrieveSignature(request) {
    check(request, Match.Any)
    try {
      const response = await ledgerRetrieveSignatureAsync(request)
      return response
    } catch (error) {
      throw createLedgerMethodError('ledgerRetrieveSignature', error)
    }
  },
  async ledgerSetIdx(request) {
    check(request, Match.Any)
    try {
      const response = await ledgerSetIdxAsync(request)
      return response
    } catch (error) {
      throw createLedgerMethodError('ledgerSetIdx', error)
    }
  },
})

// Server Startup commands
if (Meteor.isServer) {
  Meteor.startup(() => {
    console.log(`QRL Wallet Starting - Version: ${WALLET_VERSION}`)

    // Attempt to create connections with all nodes
    connectNodes()
  })
}

// Maintain node connection status
Meteor.setInterval(() => {
  console.log('Refreshing node connection status')

  // Maintain state of connections to all nodes
  connectNodes()
}, 60000)
