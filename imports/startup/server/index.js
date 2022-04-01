/* eslint no-console:0, max-len: 0 */
/* global _, decimalToBinary, DEFAULT_NETWORKS, SHOR_PER_QUANTA, WALLET_VERSION, */

import { Meteor } from 'meteor/meteor'
import { check } from 'meteor/check'
import { BrowserPolicy } from 'meteor/browser-policy-common'
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

const PROTO_PATH = Assets.absoluteFilePath('qrlbase.proto').split(
  'qrlbase.proto'
)[0]

// Apply BrowserPolicy
BrowserPolicy.content.disallowInlineScripts()
BrowserPolicy.content.allowStyleOrigin('fonts.googleapis.com')
BrowserPolicy.content.allowFontOrigin('cdn.jsdelivr.net')
BrowserPolicy.content.allowStyleOrigin('cdn.jsdelivr.net')
BrowserPolicy.content.allowFontOrigin('fonts.gstatic.com')
BrowserPolicy.content.allowFontOrigin('fonts.cdnfonts.com')
BrowserPolicy.content.allowStyleOrigin('fonts.cdnfonts.com')
BrowserPolicy.content.allowFontDataUrl()
BrowserPolicy.content.allowDataUrlForAll()

// An array of grpc connections and associated proto file paths
const qrlClient = []

function toBuffer(ab) {
  const buffer = Buffer.from(ab)
  return buffer
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

// Load the qrl.proto gRPC client into qrlClient from a remote node.
const loadGrpcClient = (endpoint, callback) => {
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
        const client = new baseGrpcObject.qrl.Base(
          endpoint,
          grpc.credentials.createInsecure()
        )
        client.getNodeInfo({}, (err, res) => {
          if (err) {
            console.log(`Error fetching qrl.proto from ${endpoint}`)
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
                if (fsErr) {
                  console.log(fsErr)
                  throw fsErr
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
                QRLPROTO_SHA256.forEach((value) => {
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
                      QRLPROTO_SHA256.forEach((value) => {
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
                        console.log('Making GRPC PublicAPI connection to ' + endpoint)
                        qrlClient[endpoint] = new grpcObject.qrl.PublicAPI(
                          endpoint,
                          grpc.credentials.createInsecure()
                        )

                        console.log(`qrlClient loaded for ${endpoint}`)

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
  // First check if there is an existing object to store the gRPC connection
  if (qrlClient.hasOwnProperty(endpoint) === true) { // eslint-disable-line
    // eslint-disable-line
    console.log(
      'Existing connection found for ',
      endpoint,
      ' - attempting getNodeState'
    )
    // There is already a gRPC object for this server stored.
    // Attempt to connect to it.
    try {
      qrlClient[endpoint].getNodeState({}, (err, response) => {
        if (err) {
          console.log('Error fetching node state for ', endpoint)
          // If it errors, we're going to remove the object and attempt to connect again.
          delete qrlClient[endpoint]

          console.log('Attempting re-connection to ', endpoint)

          loadGrpcClient(endpoint, (loadErr, loadResponse) => {
            if (loadErr) {
              console.log(`Failed to re-connect to node ${endpoint}`)
              const myError = errorCallback(
                err,
                'Cannot connect to remote node',
                '**ERROR/connection** '
              )
              callback(myError, null)
            } else {
              console.log(`Connected to ${endpoint}`)
              callback(null, loadResponse)
            }
          })
        } else {
          console.log(`Node state for ${endpoint} ok`)
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
    console.log(`Establishing new connection to ${endpoint}`)
    // We've not connected to this node before, let's establish a connection to it.
    loadGrpcClient(endpoint, (err) => {
      if (err) {
        console.log(`Failed to connect to node ${endpoint}`)
        const myError = errorCallback(
          err,
          'Cannot connect to remote node',
          '**ERROR/connection** '
        )
        callback(myError, null)
      } else {
        console.log(`Connected to ${endpoint}`)
        qrlClient[endpoint].getNodeState({}, (errState, response) => {
          if (errState) {
            console.log(`Failed to query node state ${endpoint}`)
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
      callback(true, { error: 'Network unhealthy' })
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
            DEFAULT_NETWORKS[networkIndex].nodes[nodeIndex].height = parseInt(
              res.info.block_height,
              10
            )
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
        if (api === 'pushTransaction') {
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
    console.log('Handling custom API call')
    const apiEndpoint = request.network
    // Delete network from request object
    delete request.network
    console.log('Making', api, 'request to', apiEndpoint)

    qrlClient[apiEndpoint][api](request, (error, response) => {
      if (api === 'pushTransaction') {
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

// Ledger Nano S Integration for Electron Desktop Apps

let transport = null

async function createTransport() {
  transport = await TransportNodeHid.create(10)
  const qrl = await new Qrl(transport)
  return qrl
}

const ledgerGetState = async (request, cb) => {
  const QrlLedger = await createTransport()
  await QrlLedger.get_state().then(async (data) => {
    console.log(data)
    await transport.close().then(() => {
      cb(null, data)
    })
  })
}
const ledgerPublicKey = async (request, cb) => {
  const QrlLedger = await createTransport()
  await QrlLedger.publickey().then(async (data) => {
    console.log(data)
    await transport.close().then(() => {
      cb(null, data)
    })
  })
}
const ledgerAppVersion = async (request, cb) => {
  const QrlLedger = await createTransport()
  await QrlLedger.get_version().then(async (data) => {
    await transport.close().then(() => {
      cb(null, data)
    })
  })
}
const ledgerLibraryVersion = async (request, cb) => {
  const QrlLedger = await createTransport()
  await QrlLedger.library_version().then(async (data) => {
    await transport.close().then(() => {
      cb(null, data)
    })
  })
}
const ledgerVerifyAddress = async (request, cb) => {
  const QrlLedger = await createTransport()
  await QrlLedger.viewAddress().then(async (data) => {
    await transport.close().then(() => {
      cb(null, data)
    })
  })
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

  const QrlLedger = await createTransport()
  await QrlLedger.createTx(
    sourceAddrBuffer,
    feeBuffer,
    destAddrFinal,
    destAmountFinal
  ).then(async (data) => {
    await transport.close().then(() => {
      cb(null, data)
    })
  })
}
const ledgerRetrieveSignature = async (txn, cb) => {
  const QrlLedger = await createTransport()
  await QrlLedger.retrieveSignature(txn).then(async (data) => {
    await transport.close().then(() => {
      cb(null, data)
    })
  })
}
const ledgerSetIdx = async (otsKey, cb) => {
  const QrlLedger = await createTransport()
  await QrlLedger.setIdx(otsKey).then(async (idxResponse) => {
    await transport.close().then(() => {
      cb(null, idxResponse)
    })
  })
}
const ledgerCreateMessageTx = async (sourceAddr, fee, message, cb) => {
  const sourceAddrBuffer = Buffer.from(sourceAddr)
  const feeBuffer = Buffer.from(fee)
  const messageBuffer = Buffer.from(message)

  const QrlLedger = await createTransport()
  await QrlLedger.createMessageTx(
    sourceAddrBuffer,
    feeBuffer,
    messageBuffer
  ).then(async (data) => {
    await transport.close().then(() => {
      cb(null, data)
    })
  })
}

// Define Meteor Methods
Meteor.methods({
  connectToNode(request) {
    this.unblock()
    check(request, String)
    const response = Meteor.wrapAsync(connectToNode)(request)
    return response
  },
  checkNetworkHealth(request) {
    this.unblock()
    check(request, String)
    const response = Meteor.wrapAsync(checkNetworkHealth)(request)
    return response
  },
  status(request) {
    this.unblock()
    check(request, Object)
    const response = Meteor.wrapAsync(getStats)(request)
    return response
  },
  getPeers(request) {
    this.unblock()
    check(request, Object)
    const response = Meteor.wrapAsync(getKnownPeers)(request)
    return response
  },
  getHeight(request) {
    this.unblock()
    check(request, Object)
    const response = Meteor.wrapAsync(getHeight)(request)
    return response
  },
  getObject(request) {
    check(request, Object)
    this.unblock()
    const response = Meteor.wrapAsync(getObject)(request)
    return response
  },
  getAddressState(request) {
    this.unblock()
    check(request, Object)
    const response = Meteor.wrapAsync(getAddressState)(request)
    return response
  },
  getFullAddressState(request) {
    check(request, Object)
    this.unblock()
    const response = Meteor.wrapAsync(getFullAddressState)(request)
    return response
  },
  getMultiSigAddressState(request) {
    this.unblock()
    check(request, Object)
    const response = Meteor.wrapAsync(getMultiSigAddressState)(request)
    return response
  },
  getTransactionsByAddress(request) {
    check(request, Object)
    this.unblock()
    const response = Meteor.wrapAsync(getTransactionsByAddress)(request)
    return helpersaddressTransactions(response)
  },
  getTokensByAddress(request) {
    check(request, Object)
    this.unblock()
    const response = Meteor.wrapAsync(getTokensByAddress)(request)
    return response
  },
  getMultiSigAddressesByAddress(request) {
    check(request, Object)
    this.unblock()
    const response = Meteor.wrapAsync(getMultiSigAddressesByAddress)(request)
    console.table(response)
    return response
  },
  getMultiSigSpendTxsByAddress(request) {
    check(request, Object)
    this.unblock()
    const response = Meteor.wrapAsync(getMultiSigSpendTxsByAddress)(request)
    console.table(response)
    return response
  },
  getTxnHash(request) {
    this.unblock()
    check(request, Object)
    const response = Meteor.wrapAsync(getTxnHash)(request)
    return response
  },

  txhash(request) {
    this.unblock()
    check(request, Object)
    let output
    // asynchronous call to API
    const response = Meteor.wrapAsync(getTxnHash)(request)
    if (response.transaction.tx.transactionType === 'transfer_token') {
      // Request Token Decimals / Symbol
      const symbolRequest = {
        query: Buffer.from(
          response.transaction.tx.transfer_token.token_txhash
        ).toString('hex'),
        network: request.network,
      }

      const thisSymbolResponse = Meteor.wrapAsync(getTxnHash)(symbolRequest)
      output = helpers.parseTokenAndTransferTokenTx(
        thisSymbolResponse,
        response
      )
    } else {
      output = helpers.txhash(response)
    }
    return output
  },

  transferCoins(request) {
    this.unblock()
    check(request, Object)
    const response = Meteor.wrapAsync(transferCoins)(request)
    return response
  },
  createMultiSig(request) {
    this.unblock()
    check(request, Object)
    const response = Meteor.wrapAsync(createMultiSig)(request)
    return response
  },
  spendMultiSig(request) {
    this.unblock()
    check(request, Object)
    const response = Meteor.wrapAsync(spendMultiSig)(request)
    return response
  },
  voteMultiSig(request) {
    this.unblock()
    check(request, Object)
    const response = Meteor.wrapAsync(voteMultiSig)(request)
    return response
  },
  getOTS(request) {
    check(request, Object)
    this.unblock()
    const response = Meteor.wrapAsync(getOTS)(request)
    return response
  },
  addressTransactions(request) {
    check(request, Object)
    const targets = request.tx
    const result = []

    targets.forEach((arr) => {
      const thisRequest = {
        query: arr.txhash,
        network: request.network,
      }

      try {
        const thisTxnHashResponse = Meteor.wrapAsync(getTxnHash)(thisRequest)

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
          const thisSymbolResponse = Meteor.wrapAsync(getTxnHash)(symbolRequest)
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
            fee: output.transaction.tx.fe,
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
    })

    return result
  },
  confirmTransaction(request) {
    this.unblock()
    check(request, Object)
    const response = Meteor.wrapAsync(confirmTransaction)(request)
    return response
  },
  confirmMultiSigCreate(request) {
    this.unblock()
    check(request, Object)
    const response = Meteor.wrapAsync(confirmMultiSigCreate)(request)
    return response
  },
  confirmMultiSigSpend(request) {
    this.unblock()
    check(request, Object)
    const response = Meteor.wrapAsync(confirmMultiSigSpend)(request)
    return response
  },
  confirmMultiSigVote(request) {
    this.unblock()
    check(request, Object)
    const response = Meteor.wrapAsync(confirmMultiSigVote)(request)
    return response
  },
  createMessageTxn(request) {
    this.unblock()
    check(request, Object)
    const response = Meteor.wrapAsync(createMessageTxn)(request)
    return response
  },
  createKeybaseTxn(request) {
    this.unblock()
    check(request, Object)
    const response = Meteor.wrapAsync(createKeybaseTxn)(request)
    return response
  },
  createGithubTxn(request) {
    this.unblock()
    check(request, Object)
    const response = Meteor.wrapAsync(createGithubTxn)(request)
    return response
  },
  confirmMessageCreation(request) {
    this.unblock()
    check(request, Object)
    const response = Meteor.wrapAsync(confirmMessageCreation)(request)
    return response
  },
  confirmKeybaseCreation(request) {
    this.unblock()
    check(request, Object)
    const response = Meteor.wrapAsync(confirmKeybaseCreation)(request)
    return response
  },
  confirmGithubCreation(request) {
    this.unblock()
    check(request, Object)
    const response = Meteor.wrapAsync(confirmGithubCreation)(request)
    return response
  },
  createTokenTxn(request) {
    this.unblock()
    check(request, Object)
    const response = Meteor.wrapAsync(createTokenTxn)(request)
    return response
  },
  confirmTokenCreation(request) {
    this.unblock()
    check(request, Object)
    const response = Meteor.wrapAsync(confirmTokenCreation)(request)
    return response
  },
  createTokenTransferTxn(request) {
    this.unblock()
    check(request, Object)
    const response = Meteor.wrapAsync(createTokenTransferTxn)(request)
    return response
  },
  confirmTokenTransfer(request) {
    this.unblock()
    check(request, Object)
    const response = Meteor.wrapAsync(confirmTokenTransfer)(request)
    return response
  },
  QRLvalue() {
    this.unblock()
    const apiUrl = 'https://bittrex.com/api/v1.1/public/getmarketsummary?market=btc-qrl'
    const apiUrlUSD = 'https://bittrex.com/api/v1.1/public/getmarketsummary?market=usdt-btc'
    // asynchronous call to API
    const response = Meteor.wrapAsync(apiCall)(apiUrl)
    const responseUSD = Meteor.wrapAsync(apiCall)(apiUrlUSD)
    const usd = response.result[0].Last * responseUSD.result[0].Last
    return usd
  },
  ledgerGetState(request) {
    this.unblock()
    check(request, Array)
    const response = Meteor.wrapAsync(ledgerGetState)(request)
    console.log('res')
    console.log(response)
    return response
  },
  ledgerPublicKey(request) {
    this.unblock()
    check(request, Array)
    const response = Meteor.wrapAsync(ledgerPublicKey)(request)
    return response
  },
  ledgerAppVersion(request) {
    this.unblock()
    check(request, Array)
    const response = Meteor.wrapAsync(ledgerAppVersion)(request)
    return response
  },
  ledgerLibraryVersion(request) {
    this.unblock()
    check(request, Array)
    const response = Meteor.wrapAsync(ledgerLibraryVersion)(request)
    return response
  },
  ledgerVerifyAddress(request) {
    this.unblock()
    check(request, Array)
    const response = Meteor.wrapAsync(ledgerVerifyAddress)(request)
    return response
  },
  ledgerCreateTx(sourceAddr, fee, destAddr, destAmount) {
    this.unblock()
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

    const response = Meteor.wrapAsync(ledgerCreateTx)(
      sourceAddr,
      fee,
      destAddr,
      destAmount
    )
    return response
  },
  ledgerCreateMessageTx(sourceAddr, fee, message) {
    this.unblock()
    check(sourceAddr, Match.Any)
    check(fee, Match.Any)
    check(message, Match.Any)
    const response = Meteor.wrapAsync(ledgerCreateMessageTx)(
      sourceAddr,
      fee,
      message
    )
    return response
  },
  ledgerRetrieveSignature(request) {
    this.unblock()
    check(request, Match.Any)
    const response = Meteor.wrapAsync(ledgerRetrieveSignature)(request)
    return response
  },
  ledgerSetIdx(request) {
    this.unblock()
    check(request, Match.Any)
    const response = Meteor.wrapAsync(ledgerSetIdx)(request)
    return response
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
