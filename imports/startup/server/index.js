/* eslint no-console:0, max-len: 0 */
/* global QRLLIB, XMSS_OBJECT, LocalStore, QrlLedger, isElectrified, selectedNetwork,loadAddressTransactions, getTokenBalances, updateBalanceField, refreshTransferPage */
/* global pkRawToB32Address, hexOrB32, rawToHexOrB32, anyAddressToRawAddress, stringToBytes, binaryToBytes, bytesToString, bytesToHex, hexToBytes, toBigendianUint64BytesUnsigned, numberToString, decimalToBinary */
/* global getMnemonicOfFirstAddress, getXMSSDetails, isWalletFileDeprecated, waitForQRLLIB, addressForAPI, binaryToQrlAddress, toUint8Vector, concatenateTypedArrays, getQrlProtoShasum */
/* global resetWalletStatus, passwordPolicyValid, countDecimals, supportedBrowser, wrapMeteorCall, getBalance, otsIndexUsed, ledgerHasNoTokenSupport, resetLocalStorageState, nodeReturnedValidResponse */
/* global POLL_TXN_RATE, POLL_MAX_CHECKS, DEFAULT_NETWORKS, findNetworkData, SHOR_PER_QUANTA, WALLET_VERSION, QRLPROTO_SHA256,  */

import { Meteor } from 'meteor/meteor'
import { check } from 'meteor/check'
import { BrowserPolicy } from 'meteor/browser-policy-common'
import helpers from '@theqrl/explorer-helpers'
import grpc from 'grpc'
import tmp from 'tmp'
import fs from 'fs'
import async from 'async'
import CryptoJS from 'crypto-js'
import util from 'util'
import * as HID from 'node-hid'
import QrlLedger from '/node_modules/ledger-qrl-js/wallet/qrl-ledger-library-src.js'

// Apply BrowserPolicy
BrowserPolicy.content.disallowInlineScripts()
BrowserPolicy.content.allowStyleOrigin('fonts.googleapis.com')
BrowserPolicy.content.allowFontOrigin('fonts.gstatic.com')
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
  const meteorError = new Meteor.Error(500, `[${getTime}] ${message} (${error})`)
  return meteorError
}

// Load the qrl.proto gRPC client into qrlClient from a remote node.
const loadGrpcClient = (endpoint, callback) => {
  try {
    // Load qrlbase.proto and fetch current qrl.proto from node
    const baseGrpcObject = grpc.load(Assets.absoluteFilePath('qrlbase.proto'))
    const client = new baseGrpcObject.qrl.Base(endpoint, grpc.credentials.createInsecure())

    client.getNodeInfo({}, (err, res) => {
      if (err) {
        console.log(`Error fetching qrl.proto from ${endpoint}`)
        callback(err, null)
      } else {
        // Write a new temp file for this grpc connection
        const qrlProtoFilePath = tmp.fileSync({ mode: '0644', prefix: 'qrl-', postfix: '.proto' }).name
        fs.writeFile(qrlProtoFilePath, res.grpcProto, (fsErr) => {
          if (fsErr) {
            console.log(fsErr)
            throw fsErr
          }
          let allowUnchecksummedNodes = Meteor.settings.allowUnchecksummedNodes
          if (allowUnchecksummedNodes !== true) { allowUnchecksummedNodes = false }
          // Validate proto file matches node version
          getQrlProtoShasum(res.version, (verifiedProtoSha256HashEntry) => {
            // If we get null back, we were unable to identify a verified sha256 hash against this qrl node verison.
            if ((verifiedProtoSha256HashEntry === null) && (allowUnchecksummedNodes === false)) {
              console.log(`Cannot verify QRL node version on: ${endpoint} - Version: ${res.version}`)
              const myError = errorCallback(err, `Cannot verify QRL node version on: ${endpoint} - Version: ${res.version}`, '**ERROR/connect**')
              callback(myError, null)
            } else {
              let verifiedProtoSha256Hash = {}
              if (verifiedProtoSha256HashEntry === null) { verifiedProtoSha256Hash.objectSha256 = '' } else { verifiedProtoSha256Hash = verifiedProtoSha256HashEntry }
              // Now read the saved qrl.proto file so we can calculate a hash from it
              fs.readFile(qrlProtoFilePath, (errR, contents) => {
                if (fsErr) {
                  console.log(fsErr)
                  throw fsErr
                }

                // Calculate the hash of the qrl.proto file contents
                const protoFileWordArray = CryptoJS.lib.WordArray.create(contents)
                const calculatedProtoHash = CryptoJS.SHA256(protoFileWordArray).toString(CryptoJS.enc.Hex)
                // If the calculated qrl.proto hash matches the verified one for this version,
                // continue to verify the grpc object loaded from the proto also matches the correct
                // shasum.
                console.log('proto: checking that calc of ' + calculatedProtoHash + ' = expected ' + verifiedProtoSha256Hash.protoSha256)
                if ((calculatedProtoHash === verifiedProtoSha256Hash.protoSha256) || (allowUnchecksummedNodes === true)) {
                  // Load gRPC object
                  const grpcObject = grpc.load(qrlProtoFilePath)

                  // Inspect the object and convert to string.
                  const grpcObjectString = JSON.stringify(util.inspect(grpcObject, { showHidden: true, depth: 4 }))

                  // Calculate the hash of the grpc object string returned
                  const protoObjectWordArray = CryptoJS.lib.WordArray.create(grpcObjectString)
                  const calculatedObjectHash = CryptoJS.SHA256(protoObjectWordArray).toString(CryptoJS.enc.Hex)

                  // If the grpc object shasum matches, establish the grpc connection.
                  console.log('object: checking that calc of ' + calculatedObjectHash + ' = expected ' + verifiedProtoSha256Hash.objectSha256)
                  if ((calculatedObjectHash === verifiedProtoSha256Hash.objectSha256) || (allowUnchecksummedNodes === true)) {
                    // Create the gRPC Connection
                    qrlClient[endpoint] = new grpcObject.qrl.PublicAPI(endpoint, grpc.credentials.createInsecure())

                    console.log(`qrlClient loaded for ${endpoint}`)

                    callback(null, true)
                  } else {
                    // grpc object shasum does not match verified known shasum
                    // Could be local side attack changing the proto file in between validation
                    // and grpc connection establishment
                    console.log(`Invalid qrl.proto grpc object shasum - node version: ${res.version}, qrl.proto object sha256: ${calculatedObjectHash}, expected: ${verifiedProtoSha256Hash.objectSha256}`)
                    const myError = errorCallback(err, `Invalid qrl.proto shasum - node version: ${res.version}, qrl.proto sha256: ${calculatedObjectHash}, expected: ${verifiedProtoSha256Hash.objectSha256}`, '**ERROR/connect**')
                    callback(myError, null)
                  }
                } else {
                  // qrl.proto file shasum does not match verified known shasum
                  // Could be node acting in bad faith.
                  console.log(`Invalid qrl.proto shasum - node version: ${res.version}, qrl.proto sha256: ${calculatedProtoHash}, expected: ${verifiedProtoSha256Hash.protoSha256}`)
                  const myError = errorCallback(err, `Invalid qrl.proto shasum - node version: ${res.version}, qrl.proto sha256: ${calculatedProtoHash}, expected: ${verifiedProtoSha256Hash.protoSha256}`, '**ERROR/connect**')
                  callback(myError, null)
                }
              })
            }
          })
        })
      }
    })
  } catch(err) {
    console.log('node connection error exception')
    const myError = errorCallback(err, `Cannot access node: ${endpoint}`, '**ERROR/connect**')
    callback(myError, null)
  }
}

// Establish a connection with a remote node.
// If there is no active server side connection for the requested node,
// this function will call loadGrpcClient to establish one.
const connectToNode = (endpoint, callback) => {
  // First check if there is an existing object to store the gRPC connection
  if (qrlClient.hasOwnProperty(endpoint) === true) {
    console.log('Existing connection found for ', endpoint, ' - attempting getNodeState')
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
              const myError = errorCallback(err, 'Cannot connect to remote node', '**ERROR/connection** ')
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
      const myError = errorCallback(err, 'Cannot access API/getNodeState', '**ERROR/getNodeState**')
      callback(myError, null)
    }
  } else {
    console.log(`Establishing new connection to ${endpoint}`)
    // We've not connected to this node before, let's establish a connection to it.
    loadGrpcClient(endpoint, (err) => {
      if (err) {
        console.log(`Failed to connect to node ${endpoint}`)
        const myError = errorCallback(err, 'Cannot connect to remote node', '**ERROR/connection** ')
        callback(myError, null)
      } else {
        console.log(`Connected to ${endpoint}`)
        qrlClient[endpoint].getNodeState({}, (errState, response) => {
          if (errState) {
            console.log(`Failed to query node state ${endpoint}`)
            const myError = errorCallback(err, 'Cannot connect to remote node', '**ERROR/connection** ')
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
}

// Connect to all nodes
const connectNodes = () => {
  // Establish gRPC connections with all enabled DEFAULT_NETWORKS
  DEFAULT_NETWORKS.forEach((network, networkIndex) => {
    if ((network.disabled === '')) {
      console.log(`Attempting to create gRPC connections to network: ${network.name} ...`)

      // Loop each node in the network and establish a gRPC connection.
      const networkNodes = network.nodes
      networkNodes.forEach((node, nodeIndex) => {
        console.log(`Attempting to create gRPC connection to network: ${network.name}, node: ${node.id} (${node.grpc}) ...`)
        const endpoint = node.grpc
        connectToNode(endpoint, (err, res) => {
          if (err) {
            console.log(`Failed to connect to node ${endpoint}`)
            DEFAULT_NETWORKS[networkIndex].nodes[nodeIndex].state = false
            DEFAULT_NETWORKS[networkIndex].nodes[nodeIndex].height = 0
          } else {
            console.log(`Connected to ${endpoint}`)
            DEFAULT_NETWORKS[networkIndex].nodes[nodeIndex].state = true
            DEFAULT_NETWORKS[networkIndex].nodes[nodeIndex].height = parseInt(res.info.block_height, 10)
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
  if((request.network == "devnet") || (request.network == "testnet") || (request.network == "mainnet")) {
    // Store active nodes
    const activeNodes = []

    // Determine current active nodes
    DEFAULT_NETWORKS.forEach((network) => {
      // Only get nodes from user selected network
      if (network.id == request.network) {
        const networkNodes = network.nodes
        networkNodes.forEach((node, nodeIndex) => {
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
      const myError = errorCallback('The wallet server cannot connect to any API node', 'Cannot connect to API', '**ERROR/noActiveNodes/b**')
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
        const myError = errorCallback(err, 'Cannot access API/GetStats', '**ERROR/getStats** ')
        callback(myError, null)
      } else {
        callback(null, response)
      }
    })
  } catch (err) {
    const myError = errorCallback(err, 'Cannot access API/GetStats', '**ERROR/GetStats**')
    callback(myError, null)
  }
}

const helpersaddressTransactions = (response) => {
  const output = []
  console.log(response)
  _.each(response.transactions_detail, (tx) => {
    const txEdited = tx
    if (tx.tx.transfer) {
      const hexlified = []
      _.each(tx.tx.transfer.addrs_to, (txOutput) => {
        console.log('formatting: ', txOutput)
        hexlified.push(`Q${Buffer.from(txOutput).toString('hex')}`)
      })
      txEdited.tx.transfer.addrs_to = hexlified
    }
    if (tx.tx.coinbase) {
      if (tx.tx.coinbase.addr_to) {
        txEdited.tx.coinbase.addr_to = `Q${Buffer.from(txEdited.tx.coinbase.addr_to).toString('hex')}`
      }
    }
    if (tx.tx.transaction_hash) {
      txEdited.tx.transaction_hash = Buffer.from(txEdited.tx.transaction_hash).toString('hex')
    }
    if (tx.tx.master_addr) {
      txEdited.tx.master_addr = Buffer.from(txEdited.tx.master_addr).toString('hex')
    }
    if (tx.tx.public_key) {
      txEdited.tx.public_key = Buffer.from(txEdited.tx.public_key).toString('hex')
    }
    if (tx.tx.signature) {
      txEdited.tx.signature = Buffer.from(txEdited.tx.signature).toString('hex')
    }
    if (tx.block_header_hash) {
      txEdited.block_header_hash = Buffer.from(txEdited.block_header_hash).toString('hex')
    }
    txEdited.addr_from = `Q${Buffer.from(txEdited.addr_from).toString('hex')}`
    output.push(txEdited)
  })
  return response
}

export const getTransactionsByAddress = (request, callback) => {
  try {
    qrlApi('GetTransactionsByAddress', request, (error, response) => {
      if (error) {
        const myError = errorCallback(error, 'Cannot access API/GetTransactionsByAddress', '**ERROR/GetTransactionsByAddress**')
        callback(myError, null)
      } else {
        // console.log(response)
        callback(null, response)
      }
    })
  } catch (error) {
    const myError = errorCallback(error, 'Cannot access API/GetTransactionsByAddress', '**ERROR/GetTransactionsByAddress**')
    callback(myError, null)
  }
}

const getMultiSigAddressesByAddress = (request, callback) => {
  try {
    qrlApi('GetMultiSigAddressesByAddress', request, (error, response) => {
      if (error) {
        const myError = errorCallback(error, 'Cannot access API/GetMultiSigAddressesByAddress', '**ERROR/GetMultiSigAddressesByAddress**')
        callback(myError, null)
      } else {
        callback(null, response)
      }
    })
  } catch (error) {
    const myError = errorCallback(error, 'Cannot access API/GetMultiSigAddressesByAddress', '**ERROR/GetMultiSigAddressesByAddress**')
    callback(myError, null)
  }
}

const getOTS = (request, callback) => {
  try {
    qrlApi('GetOTS', request, (error, response) => {
      if (error) {
        const myError = errorCallback(error, 'Cannot access API/GetOTS', '**ERROR/getOTS** ')
        callback(myError, null)
      } else {
        callback(null, response)
      }
    })
  } catch (error) {
    const myError = errorCallback(error, 'Cannot access API/GetOTS', '**ERROR/GetOTS**')
    callback(myError, null)
  }
}

// Function to call getAddressState API
const getAddressState = (request, callback) => {
  try {
    qrlApi('GetAddressState', request, (error, response) => {
      if (error) {
        const myError = errorCallback(error, 'Cannot access API/GetAddressState', '**ERROR/getAddressState** ')
        callback(myError, null)
      } else {
        // Parse OTS Bitfield, and grab the lowest unused key
        const newOtsBitfield = {}
        let lowestUnusedOtsKey = -1
        let otsBitfieldLength = 0
        let thisOtsBitfield = []
        if (response.state.ots_bitfield !== undefined) { thisOtsBitfield = response.state.ots_bitfield }
        thisOtsBitfield.forEach((item, index) => {
          const thisDecimal = new Uint8Array(item)[0]
          const thisBinary = decimalToBinary(thisDecimal).reverse()
          const startIndex = index * 8

          for (let i = 0; i < 8; i += 1) {
            const thisOtsIndex = startIndex + i

            // Add to parsed array
            newOtsBitfield[thisOtsIndex] = thisBinary[i]

            // Check if this is lowest unused key
            if ((thisBinary[i] === 0) && ((thisOtsIndex < lowestUnusedOtsKey) || (lowestUnusedOtsKey === -1))) {
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
          totalKeysConsumed += parseInt(response.state.ots_counter, 10) - (otsBitfieldLength - 1)
        }

        // Add in OTS fields to response
        response.ots = {}
        response.ots.keys = newOtsBitfield
        response.ots.nextKey = lowestUnusedOtsKey
        response.ots.keysConsumed = totalKeysConsumed

        if (response.state.address) {
          response.state.address = `Q${Buffer.from(response.state.address).toString('hex')}`
        }

        callback(null, response)
      }
    })
  } catch (error) {
    const myError = errorCallback(error, 'Cannot access API/GetAddressState', '**ERROR/GetAddressState**')
    callback(myError, null)
  }
}

// Function to call getObject API and extract a txn Hash..
const getTxnHash = (request, callback) => {
  const txnHash = Buffer.from(request.query, 'hex')

  try {
    qrlApi('getObject', { query: txnHash, network: request.network }, (err, response) => {
      if (err) {
        console.log(`Error: ${err.message}`)
        callback(err, null)
      } else {
        callback(null, response)
      }
    })
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
    master_addr: request.master_addr,
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
  const confirmTxn = { transaction_signed: request.extended_transaction_unsigned.tx }
  const relayedThrough = []

  // change Uint8Arrays to Buffers
  confirmTxn.transaction_signed.public_key = toBuffer(confirmTxn.transaction_signed.public_key)
  confirmTxn.transaction_signed.signature = toBuffer(confirmTxn.transaction_signed.signature)

  const addrs_to = confirmTxn.transaction_signed.transfer.addrs_to
  addrs_to_Formatted = []
  addrs_to.forEach (function (item) {
    item = toBuffer(item)
    addrs_to_Formatted.push(item)
  })
  
  // Overwrite addrs_to with our updated one
  confirmTxn.transaction_signed.transfer.addrs_to = addrs_to_Formatted
  confirmTxn.network = request.network

  // Relay transaction through user node, then all default nodes.
  let txnResponse

  async.waterfall([
    // Relay through user node.
    function (wfcb) {
      try {
        qrlApi('pushTransaction', confirmTxn, (err, res) => {
          console.log('Relayed Txn: ', Buffer.from(res.tx_hash).toString('hex'))

          if (err) {
            console.log(`Error:  ${err.message}`)
            txnResponse = { error: err.message, response: err.message }
            wfcb()
          } else {
            const hashResponse = {
              txnHash: Buffer.from(confirmTxn.transaction_signed.transaction_hash).toString('hex'),
              signature: Buffer.from(confirmTxn.transaction_signed.signature).toString('hex'),
            }
            txnResponse = { error: null, response: hashResponse }
            relayedThrough.push(res.relayed)
            console.log(`Transaction sent via ${res.relayed}`)
            wfcb()
          }
        })
      } catch(err) {
        console.log(`Error: Failed to send transaction through ${res.relayed} - ${err}`)
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
  ], () => {
    // All done, send txn response
    txnResponse.relayed = relayedThrough
    callback(null, txnResponse)
  })
}

const confirmMultiSigCreate = (request, callback) => {
  const confirmTxn = { transaction_signed: request.extended_transaction_unsigned.tx }
  const relayedThrough = []

  // change Uint8Arrays to Buffers
  confirmTxn.transaction_signed.public_key = toBuffer(confirmTxn.transaction_signed.public_key)
  confirmTxn.transaction_signed.signature = toBuffer(confirmTxn.transaction_signed.signature)

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

  async.waterfall([
    // Relay through user node.
    function (wfcb) {
      try {
        qrlApi('pushTransaction', confirmTxn, (err, res) => {
          console.log('Relayed Txn: ', Buffer.from(res.tx_hash).toString('hex'))

          if (err) {
            console.log(`Error:  ${err.message}`)
            txnResponse = { error: err.message, response: err.message }
            wfcb()
          } else {
            const hashResponse = {
              txnHash: Buffer.from(confirmTxn.transaction_signed.transaction_hash).toString('hex'),
              signature: Buffer.from(confirmTxn.transaction_signed.signature).toString('hex'),
            }
            txnResponse = { error: null, response: hashResponse }
            relayedThrough.push(res.relayed)
            console.log(`Transaction sent via ${res.relayed}`)
            wfcb()
          }
        })
      } catch(err) {
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
  ], () => {
    // All done, send txn response
    txnResponse.relayed = relayedThrough
    callback(null, txnResponse)
  })
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
        txnHash: Buffer.from(response.extended_transaction_unsigned.tx.transaction_hash).toString('hex'),
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
        txnHash: Buffer.from(response.extended_transaction_unsigned.tx.transaction_hash).toString('hex'),
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
        txnHash: Buffer.from(response.extended_transaction_unsigned.tx.transaction_hash).toString('hex'),
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
        txnHash: Buffer.from(response.extended_transaction_unsigned.tx.transaction_hash).toString('hex'),
        response,
      }

      callback(null, transferResponse)
    }
  })
}

const confirmTokenCreation = (request, callback) => {
  const confirmTxn = { transaction_signed: request.extended_transaction_unsigned.tx }
  const relayedThrough = []

  // change ArrayBuffer
  confirmTxn.transaction_signed.public_key = toBuffer(confirmTxn.transaction_signed.public_key)
  confirmTxn.transaction_signed.transaction_hash =
    toBuffer(confirmTxn.transaction_signed.transaction_hash)
  confirmTxn.transaction_signed.signature = toBuffer(confirmTxn.transaction_signed.signature)

  confirmTxn.transaction_signed.token.symbol =
    toBuffer(confirmTxn.transaction_signed.token.symbol)
  confirmTxn.transaction_signed.token.name =
    toBuffer(confirmTxn.transaction_signed.token.name)
  confirmTxn.transaction_signed.token.owner =
    toBuffer(confirmTxn.transaction_signed.token.owner)

  const initialBalances = confirmTxn.transaction_signed.token.initial_balances
  initialBalancesFormatted = []
  initialBalances.forEach (function (item) {
    item.address = toBuffer(item.address)
    initialBalancesFormatted.push(item)
  })

  // Overwrite inital_balances with our updated one
  confirmTxn.transaction_signed.token.initial_balances = initialBalancesFormatted
  confirmTxn.network = request.network

  // Relay transaction through user node, then all default nodes.
  let txnResponse

  async.waterfall([
    // Relay through user node.
    function (wfcb) {
      try{
        qrlApi('pushTransaction', confirmTxn, (err, res) => {
          if (err) {
            console.log(`Error: Failed to send transaction through ${rres.relayed} - ${err}`)
            txnResponse = { error: err.message, response: err.message }
            wfcb()
          } else {
            const hashResponse = {
              txnHash: Buffer.from(confirmTxn.transaction_signed.transaction_hash).toString('hex'),
              signature: Buffer.from(confirmTxn.transaction_signed.signature).toString('hex'),
            }
            txnResponse = { error: null, response: hashResponse }
            relayedThrough.push(res.relayed)
            console.log(`Transaction sent via ${res.relayed}`)
            wfcb()
          }
        })
      } catch(err) {
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
  ], () => {
    // All done, send txn response
    txnResponse.relayed = relayedThrough
    callback(null, txnResponse)
  })
}


const confirmMessageCreation = (request, callback) => {
  const confirmTxn = { transaction_signed: request.extended_transaction_unsigned.tx }
  const relayedThrough = []

  // change ArrayBuffer
  confirmTxn.transaction_signed.public_key = toBuffer(confirmTxn.transaction_signed.public_key)
  confirmTxn.transaction_signed.transaction_hash =
    toBuffer(confirmTxn.transaction_signed.transaction_hash)
  confirmTxn.transaction_signed.signature = toBuffer(confirmTxn.transaction_signed.signature)

  confirmTxn.transaction_signed.message.message_hash =
    toBuffer(confirmTxn.transaction_signed.message.message_hash)

  confirmTxn.network = request.network

  // Relay transaction through user node, then all default nodes.
  let txnResponse

  async.waterfall([
    // Relay through user node.
    function (wfcb) {
      try{
        qrlApi('pushTransaction', confirmTxn, (err, res) => {
          if (err) {
            console.log(`Error: Failed to send transaction through ${rres.relayed} - ${err}`)
            txnResponse = { error: err.message, response: err.message }
            wfcb()
          } else {
            const hashResponse = {
              txnHash: Buffer.from(confirmTxn.transaction_signed.transaction_hash).toString('hex'),
              signature: Buffer.from(confirmTxn.transaction_signed.signature).toString('hex'),
            }
            txnResponse = { error: null, response: hashResponse }
            relayedThrough.push(res.relayed)
            console.log(`Transaction sent via ${res.relayed}`)
            wfcb()
          }
        })
      } catch(err) {
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
  ], () => {
    // All done, send txn response
    txnResponse.relayed = relayedThrough
    callback(null, txnResponse)
  })
}

const confirmKeybaseCreation = (request, callback) => {
  const confirmTxn = { transaction_signed: request.extended_transaction_unsigned.tx }
  const relayedThrough = []

  // change ArrayBuffer
  confirmTxn.transaction_signed.public_key = toBuffer(confirmTxn.transaction_signed.public_key)
  confirmTxn.transaction_signed.transaction_hash =
    toBuffer(confirmTxn.transaction_signed.transaction_hash)
  confirmTxn.transaction_signed.signature = toBuffer(confirmTxn.transaction_signed.signature)

  confirmTxn.transaction_signed.message.message_hash =
    toBuffer(confirmTxn.transaction_signed.message.message_hash)

  confirmTxn.network = request.network

  // Relay transaction through user node, then all default nodes.
  let txnResponse

  async.waterfall([
    // Relay through user node.
    function (wfcb) {
      try{
        qrlApi('pushTransaction', confirmTxn, (err, res) => {
          if (err) {
            console.log(`Error: Failed to send transaction through ${rres.relayed} - ${err}`)
            txnResponse = { error: err.message, response: err.message }
            wfcb()
          } else {
            const hashResponse = {
              txnHash: Buffer.from(confirmTxn.transaction_signed.transaction_hash).toString('hex'),
              signature: Buffer.from(confirmTxn.transaction_signed.signature).toString('hex'),
            }
            txnResponse = { error: null, response: hashResponse }
            relayedThrough.push(res.relayed)
            console.log(`Transaction sent via ${res.relayed}`)
            wfcb()
          }
        })
      } catch(err) {
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
  ], () => {
    // All done, send txn response
    txnResponse.relayed = relayedThrough
    callback(null, txnResponse)
  })
}

const confirmGithubCreation = (request, callback) => {
  const confirmTxn = { transaction_signed: request.extended_transaction_unsigned.tx }
  const relayedThrough = []

  // change ArrayBuffer
  confirmTxn.transaction_signed.public_key = toBuffer(confirmTxn.transaction_signed.public_key)
  confirmTxn.transaction_signed.transaction_hash =
    toBuffer(confirmTxn.transaction_signed.transaction_hash)
  confirmTxn.transaction_signed.signature = toBuffer(confirmTxn.transaction_signed.signature)

  confirmTxn.transaction_signed.message.message_hash =
    toBuffer(confirmTxn.transaction_signed.message.message_hash)

  confirmTxn.network = request.network

  // Relay transaction through user node, then all default nodes.
  let txnResponse

  async.waterfall([
    // Relay through user node.
    function (wfcb) {
      try{
        qrlApi('pushTransaction', confirmTxn, (err, res) => {
          if (err) {
            console.log(`Error: Failed to send transaction through ${rres.relayed} - ${err}`)
            txnResponse = { error: err.message, response: err.message }
            wfcb()
          } else {
            const hashResponse = {
              txnHash: Buffer.from(confirmTxn.transaction_signed.transaction_hash).toString('hex'),
              signature: Buffer.from(confirmTxn.transaction_signed.signature).toString('hex'),
            }
            txnResponse = { error: null, response: hashResponse }
            relayedThrough.push(res.relayed)
            console.log(`Transaction sent via ${res.relayed}`)
            wfcb()
          }
        })
      } catch(err) {
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
  ], () => {
    // All done, send txn response
    txnResponse.relayed = relayedThrough
    callback(null, txnResponse)
  })
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
    network: request.network
  }

  qrlApi('getTransferTokenTxn', tx, (err, response) => {
    if (err) {
      console.log(`Error:  ${err.message}`)
      callback(err, null)
    } else {
      const transferResponse = {
        response
      }

      callback(null, transferResponse)
    }
  })
}

const confirmTokenTransfer = (request, callback) => {
  const confirmTxn = { transaction_signed: request.extended_transaction_unsigned.tx }
  const relayedThrough = []

  // change ArrayBuffer
  confirmTxn.transaction_signed.public_key = toBuffer(confirmTxn.transaction_signed.public_key)
  confirmTxn.transaction_signed.transaction_hash =
    toBuffer(confirmTxn.transaction_signed.transaction_hash)
  confirmTxn.transaction_signed.signature = toBuffer(confirmTxn.transaction_signed.signature)
  confirmTxn.transaction_signed.transfer_token.token_txhash = 
    toBuffer(confirmTxn.transaction_signed.transfer_token.token_txhash)

  const addrs_to = confirmTxn.transaction_signed.transfer_token.addrs_to
  addrs_to_Formatted = []
  addrs_to.forEach (function (item) {
    item = toBuffer(item)
    addrs_to_Formatted.push(item)
  })
  
  // Overwrite addrs_to with our updated one
  confirmTxn.transaction_signed.transfer_token.addrs_to = addrs_to_Formatted
  confirmTxn.network = request.network

  // Relay transaction through user node, then all default nodes.
  let txnResponse

  async.waterfall([
    // Relay through user node.
    function (wfcb) {
      try {
        qrlApi('pushTransaction', confirmTxn, (err, res) => {
          if (err) {
            console.log(`Error: Failed to send transaction through ${res.relayed} - ${err}`)
            txnResponse = { error: err.message, response: err.message }
            wfcb()
          } else {
            const hashResponse = {
              txnHash: Buffer.from(confirmTxn.transaction_signed.transaction_hash).toString('hex'),
              signature: Buffer.from(confirmTxn.transaction_signed.signature).toString('hex'),
            }
            txnResponse = { error: null, response: hashResponse }
            relayedThrough.push(res.relayed)
            console.log(`Transaction sent via ${res.relayed}`)
            wfcb()
          }
        })
      } catch(err) {
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
                console.log(`Token Xfer Transaction sent via ${node.grpc}`)
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
  ], () => {
    // All done, send txn response
    txnResponse.relayed = relayedThrough
    callback(null, txnResponse)
  })
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
const ledgerGetState = (request, cb) => {
  QrlLedger.get_state().then(data => {
    cb(null, data)
  })
}
const ledgerPublicKey = (request, cb) => {
  QrlLedger.publickey().then(data => {
    cb(null, data)
  })
}
const ledgerAppVersion = (request, cb) => {
  QrlLedger.app_version().then(data => {
    cb(null, data)
  })
}
const ledgerLibraryVersion = (request, cb) => {
  QrlLedger.library_version().then(data => {
    cb(null, data)
  })
}
const ledgerVerifyAddress = (request, cb) => {
  QrlLedger.viewAddress().then(data => {
    cb(null, data)
  })
}
const ledgerCreateTx = (sourceAddr, fee, destAddr, destAmount, cb) => {
  sourceAddr = Buffer.from(sourceAddr)
  fee = Buffer.from(fee)

  const destAddrFinal = []
  const destAmountFinal = []
  for (let i = 0; i < destAddr.length; i += 1) {
    destAddrFinal.push(Buffer.from(destAddr[i]))
    destAmountFinal.push(Buffer.from(destAmount[i]))
  }

  QrlLedger.createTx(sourceAddr, fee, destAddrFinal, destAmountFinal).then(data => {
    cb(null, data)
  })
}
const ledgerRetrieveSignature = (txn, cb) => {
  QrlLedger.retrieveSignature(txn).then(data => {
    cb(null, data)
  })
}
const ledgerSetIdx = (otsKey, cb) => {
  QrlLedger.setIdx(otsKey).then(idxResponse => {
    cb(null, idxResponse)
  })
}
const ledgerCreateMessageTx = (sourceAddr, fee, message, cb) => {
  sourceAddr = Buffer.from(sourceAddr)
  fee = Buffer.from(fee)
  message = Buffer.from(message)

  QrlLedger.createMessageTx(sourceAddr, fee, message).then(data => {
    cb(null, data)
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
  getAddressState(request) {
    this.unblock()
    check(request, Object)
    const response = Meteor.wrapAsync(getAddressState)(request)
    return response
  },
  getTransactionsByAddress(request) {
    check(request, Object)
    this.unblock()
    const response = Meteor.wrapAsync(getTransactionsByAddress)(request)
    return helpersaddressTransactions(response)
  },
  getMultiSigAddressesByAddress(request) {
    check(request, Object)
    this.unblock()
    const response = Meteor.wrapAsync(getMultiSigAddressesByAddress)(request)
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
        query: Buffer.from(response.transaction.tx.transfer_token.token_txhash).toString('hex'),
        network: request.network,
      }

      const thisSymbolResponse = Meteor.wrapAsync(getTxnHash)(symbolRequest)
      output = helpers.parseTokenAndTransferTokenTx(thisSymbolResponse, response)
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
            ots_key: parseInt(output.transaction.tx.signature.substring(0, 8), 16),
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
            ots_key: parseInt(output.transaction.tx.signature.substring(0, 8), 16),
            fee: output.transaction.tx.fee,
            block: output.transaction.header.block_number,
            timestamp: output.transaction.header.timestamp_seconds,
          }

          result.push(thisTxn)
        } else if (thisTxnHashResponse.transaction.tx.transactionType === 'transfer_token') {
          // Request Token Symbol
          const symbolRequest = {
            query: Buffer.from(Buffer.from(thisTxnHashResponse.transaction.tx.transfer_token.token_txhash).toString('hex'), 'hex'),
            network: request.network,
          }
          const thisSymbolResponse = Meteor.wrapAsync(getTxnHash)(symbolRequest)
          const helpersResponse = helpers.parseTokenAndTransferTokenTx(thisSymbolResponse, thisTxnHashResponse)
          thisTxn = {
            type: helpersResponse.transaction.tx.transactionType,
            txhash: arr.txhash,
            symbol: helpersResponse.transaction.explorer.symbol,
            // eslint-disable-next-line
            totalTransferred: helpersResponse.transaction.explorer.totalTransferred,
            outputs: helpersResponse.transaction.explorer.outputs,
            from_hex: helpersResponse.transaction.explorer.from_hex,
            from_b32: helpersResponse.transaction.explorer.from_b32,
            ots_key: parseInt(helpersResponse.transaction.tx.signature.substring(0, 8), 16),
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
            ots_key: parseInt(output.transaction.tx.signature.substring(0, 8), 16),
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
            ots_key: parseInt(output.transaction.tx.signature.substring(0, 8), 16),
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
            ots_key: parseInt(output.transaction.tx.signature.substring(0, 8), 16),
            fee: output.transaction.tx.fee,
            block: output.transaction.header.block_number,
            timestamp: output.transaction.header.timestamp_seconds,
          }
          result.push(thisTxn)
        } else if (output.transaction.explorer.type === 'DOCUMENT_NOTARISATION') {
          thisTxn = {
            type: output.transaction.explorer.type,
            txhash: arr.txhash,
            amount: 0,
            from_hex: output.transaction.explorer.from_hex,
            from_b32: output.transaction.explorer.from_b32,
            to: '',
            ots_key: parseInt(output.transaction.tx.signature.substring(0, 8), 16),
            fee: output.transaction.tx.fee,
            block: output.transaction.header.block_number,
            timestamp: output.transaction.header.timestamp_seconds,
          }
          result.push(thisTxn)
        }
      } catch (err) {
        console.log(`Error fetching transaction hash in addressTransactions '${arr.txhash}' - ${err}`)
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

    console.log('2: sourceAddr: ',sourceAddr,' - fee: ', fee,' - destAddr: ',destAddr, ' - destAmount: ', destAmount)

    const response = Meteor.wrapAsync(ledgerCreateTx)(sourceAddr, fee, destAddr, destAmount)
    return response
  },
  ledgerCreateMessageTx(sourceAddr, fee, message) {
    this.unblock()
    check(sourceAddr, Match.Any)
    check(fee, Match.Any)
    check(message, Match.Any)
    const response = Meteor.wrapAsync(ledgerCreateMessageTx)(sourceAddr, fee, message)
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
