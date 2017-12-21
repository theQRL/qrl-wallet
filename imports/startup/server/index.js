// server-side startup
import { Meteor } from 'meteor/meteor'
import { check } from 'meteor/check'
import grpc from 'grpc'
import tmp from 'tmp'
import fs from 'fs'
import async from 'async'

// Apply BrowserPolicy
BrowserPolicy.content.disallowInlineScripts()
BrowserPolicy.content.allowStyleOrigin("fonts.googleapis.com")
BrowserPolicy.content.allowFontOrigin("fonts.gstatic.com")
BrowserPolicy.content.allowFontDataUrl()

const ab2str = buf => String.fromCharCode.apply(null, new Uint16Array(buf))

// An array of grpc connections and associated proto file paths
let qrlClient = []

function toBuffer(ab) {
    var buffer = new Buffer(ab.byteLength);
    var view = new Uint8Array(ab);
    for (var i = 0; i < buffer.length; ++i) {
        buffer[i] = view[i];
    }
    return buffer;
}

// Create a temp file to store the qrl.proto file in
// We'll also use the base directory of this file for other temp storage
// const qrlProtoFilePath = tmp.fileSync({ mode: 0644, prefix: 'qrl-', postfix: '.proto' }).name


const errorCallback = (error, message, alert) => {
  const d = new Date()
  const getTime = d.toUTCString()
  console.log(`${alert} [Timestamp: ${getTime}] ${error}`)
  const meteorError = new Meteor.Error(500, `[${getTime}] ${message} (${error})`)
  return meteorError
}

// Client side function to establish a connection with a remote node.
// If there is no active server side connection for the requested node,
// this function will call loadGrpcClient to establish one.
const connectToNode = (request, callback) => {

  // First check if there is an existing object to store the gRPC connection
  if(qrlClient.hasOwnProperty(request.grpc) === true) {
    console.log('Existing connection found for ',request.grpc,' - attempting getNodeState')
    // There is already a gRPC object for this server stored.
    // Attempt to connect to it.
    try {
      qrlClient[request.grpc].getNodeState({}, (err, response) => {
        if (err) {
          console.log('Error fetching node state for ',request.grpc)
          // If it errors, we're going to remove the object and attempt to connect again.
          delete qrlClient[request.grpc]

          console.log('Attempting re-connection to ',request.grpc)

          loadGrpcClient(request, function(err, response) {
            if (err) {
              console.log('Failed to re-connect to node ',request.grpc)
              const myError = errorCallback(err, 'Cannot connect to remote node', '**ERROR/connection** ')
              callback(myError, null)
            } else {
              console.log('Connected to ',request.grpc)
              callback(null, response)
            }
          })
        } else {
          console.log('Node state for ',request.grpc, ' ok')
          callback(null, response)
        }
      })
    } catch (err) {
      console.log('node state error exception')
      const myError = errorCallback(err, 'Cannot access API/getNodeState', '**ERROR/getNodeState**')
      callback(myError, null)
    }
  } else {
    console.log('Establishing new connection to ',request.grpc)
    // We've not connected to this node before, let's establish a connection to it.
    loadGrpcClient(request, function(err, response) {
      if (err) {
        console.log('Failed to connect to node ',request.grpc)
        const myError = errorCallback(err, 'Cannot connect to remote node', '**ERROR/connection** ')
        callback(myError, null)
      } else {
        console.log('Connected to ',request.grpc)
        callback(null, response)
      }
    })
  }
}

// Load the qrl.proto gRPC client into qrlClient from a remote node.
const loadGrpcClient = (request, callback) => {
  // Load qrlbase.proto and fetch current qrl.proto from node
  const baseGrpcObject = grpc.load(Assets.absoluteFilePath('qrlbase.proto'))
  const client = new baseGrpcObject.qrl.Base(request.grpc, grpc.credentials.createInsecure())

  client.getNodeInfo({}, function (err, res) {
    if (err) {
      console.log('Error fetching qrl.proto from ' + request.grpc)
      callback(err, null)
    } else {

      // Write a new temp file for this grpc connection
      const qrlProtoFilePath = tmp.fileSync({ mode: 0644, prefix: 'qrl-', postfix: '.proto' }).name

      fs.writeFile(qrlProtoFilePath, res.grpcProto, function (err) {
        if (err) throw err

        const grpcObject = grpc.load(qrlProtoFilePath)
        
        // Create the gRPC Connection
        qrlClient[request.grpc] = new grpcObject.qrl.PublicAPI(request.grpc, grpc.credentials.createInsecure())

        console.log('qrlClient loaded for ',request.grpc)

        callback(null, true)
      })
    }
  })
}


// Function to call getKnownPeers API.
const getKnownPeers = (request, callback) => {
  qrlClient[request.grpc].getKnownPeers({}, (err, response) => {
    if (err){
      callback(err, null)
    } else {
      callback(null, response)
    }
  })
}

const getStats = (request, callback) => {
  try {
    qrlClient[request.grpc].getStats({}, (err, response) => {
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

// Function to call getAddressState API
const getAddressState = (request, callback) => {
  qrlClient[request.grpc].getAddressState({address : request.address}, (err, response) => {
    if (err){
      console.log("Error: ", err.message)
      callback(err, null)
    } else {

      response.state.txcount = response.state.transaction_hashes.length
      response.state.transactions = []
      response.state.transaction_hashes.forEach((value) => {
        response.state.transactions.push({ txhash: Buffer.from(value).toString('hex') })
      })

      callback(null, response)
    }
  })
}


// Function to call getObject API and extract a txn Hash..
const getTxnHash = (request, callback) => {
  const txnHash = Buffer.from(request.query, 'hex')

  qrlClient[request.grpc].getObject({query: txnHash}, (err, response) => {
    if (err){
      console.log("Error: ", err.message)
      callback(err, null)
    } else {      
      if(response.found == true && response.result == "transaction") {
        response.transaction.tx.addr_from = Buffer.from(response.transaction.tx.addr_from).toString()
        response.transaction.tx.transaction_hash =
          Buffer.from(response.transaction.tx.transaction_hash).toString('hex')
        response.transaction.tx.addr_to = ''
        response.transaction.tx.amount = ''
        if (response.transaction.coinbase) {
          response.transaction.tx.addr_to =
            Buffer.from(response.transaction.tx.coinbase.addr_to).toString()
          response.transaction.tx.coinbase.addr_to =
            Buffer.from(response.transaction.tx.coinbase.addr_to).toString()
          // FIXME: We need a unified way to format Quanta
          response.transaction.tx.amount = response.transaction.tx.coinbase.amount * 1e-8
        }
        if (response.transaction.tx.transfer) {
          response.transaction.tx.addr_to =
            Buffer.from(response.transaction.tx.transfer.addr_to).toString()
          response.transaction.tx.transfer.addr_to =
            Buffer.from(response.transaction.tx.transfer.addr_to).toString()
          // FIXME: We need a unified way to format Quanta
          response.transaction.tx.amount = response.transaction.tx.transfer.amount * 1e-8
        }
        response.transaction.tx.public_key = Buffer.from(response.transaction.tx.public_key).toString('hex')
        response.transaction.tx.signature = Buffer.from(response.transaction.tx.signature).toString('hex')

        callback(null, response)
      } else {
        callback("Unable to locate transaction", null)
      }

    }
  })
}

// Function to call transferCoins API
const transferCoins = (request, callback) => {
  const tx = { 
    address_from: request.fromAddress,
    address_to: request.toAddress,
    amount: request.amount,
    fee: request.fee,
    xmss_pk: request.xmssPk,
    xmss_ots_index: request.xmssOtsKey
  }

  qrlClient[request.grpc].transferCoins(tx, (err, response) => {
    if (err){
      console.log("Error: ", err.message)
      callback(err, null)
    } else {
      let transferResponse = {
        txnHash: Buffer.from(response.transaction_unsigned.transaction_hash).toString('hex'),
        response: response
      }

      callback(null, transferResponse)
    }
  })
}


const confirmTransaction = (request, callback) => {
  let confirmTxn = { transaction_signed : request.transaction_unsigned }

  // change ArrayBuffer
  confirmTxn.transaction_signed.addr_from = toBuffer(confirmTxn.transaction_signed.addr_from)
  confirmTxn.transaction_signed.public_key = toBuffer(confirmTxn.transaction_signed.public_key)
  confirmTxn.transaction_signed.transaction_hash = toBuffer(confirmTxn.transaction_signed.transaction_hash)
  confirmTxn.transaction_signed.signature = toBuffer(confirmTxn.transaction_signed.signature)
  confirmTxn.transaction_signed.transfer.addr_to = toBuffer(confirmTxn.transaction_signed.transfer.addr_to)


  // Relay transaction through user node, then all default nodes.
  let txnResponse

  async.waterfall([
    // Relay through user node.
    function(wfcb) {
      qrlClient[request.grpc].pushTransaction(confirmTxn, (err, response) => {
        if (err) {
          console.log("Error: ", err.message)
          txnResponse = {error: err.message, response: err.message}
          wfcb()
        } else {
          let hashResponse = {
            txnHash: Buffer.from(confirmTxn.transaction_signed.transaction_hash).toString('hex'),
            signature: Buffer.from(confirmTxn.transaction_signed.signature).toString('hex'),
          }
          txnResponse = {error: null, response: hashResponse}
          console.log('Transaction sent via user node',request.grpc)
          wfcb()
        }
      })
    },
    // Now relay through all default nodes that we have a connection too
    function(wfcb) {

      async.eachSeries(DEFAULT_NODES, function (node, cb) {
        if((qrlClient.hasOwnProperty(node.grpc) === true) && (node.grpc != request.grpc)){
          // Push the transaction - we don't care for its response
          qrlClient[node.grpc].pushTransaction(confirmTxn, (err, response) => {
            if(err) {
              console.log('Error: Failed to send transaction through',node.grpc)
              cb()
            } else {
              console.log('Transaction sent via',node.grpc)
              cb()
            }
          })
        } else {
          cb()
        }
      }, function (err) {
        if (err) console.error(err.message);
        console.log('all txns sent')
        wfcb()
      })
    },
  ], function (err, result) {
    // All done, send txn response
    callback(null, txnResponse)
  });
}



// Define Meteor Methods
Meteor.methods({
  connectToNode(request) {
    this.unblock()
    check(request, Object)
    const response = Meteor.wrapAsync(connectToNode)(request)
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
  getAddress(request) {
    this.unblock()
    check(request, Object)
    const response = Meteor.wrapAsync(getAddressState)(request)
    return response
  },
  getTxnHash(request) {
    this.unblock()
    check(request, Object)
    const response = Meteor.wrapAsync(getTxnHash)(request)
    return response
  },
  transferCoins(request) {
    this.unblock()
    check(request, Object)
    const response = Meteor.wrapAsync(transferCoins)(request)
    return response
  },
  addressTransactions(request) {
    check(request, Object)
    const targets = request.tx
    const result = []
    targets.forEach((arr) => {

      const thisRequest = {
        query: arr.txhash,
        grpc: request.grpc
      }

      const thisTxnHashResponse = Meteor.wrapAsync(getTxnHash)(thisRequest)

      const thisTxn = {
        txhash: arr.txhash,
        amount: thisTxnHashResponse.transaction.tx.amount,
        from: thisTxnHashResponse.transaction.tx.addr_from,
        to: thisTxnHashResponse.transaction.tx.addr_to,
        ots_key: thisTxnHashResponse.transaction.tx.ots_key,
        fee: thisTxnHashResponse.transaction.header.reward_fee,
        block: thisTxnHashResponse.transaction.header.block_number,
        timestamp: thisTxnHashResponse.transaction.header.timestamp.seconds,
      }

      result.push(thisTxn)
    })

    return result
  },
  confirmTransaction(request) {
    this.unblock()
    check(request, Object)
    const response = Meteor.wrapAsync(confirmTransaction)(request)
    return response
  },
})


// Server Startup commands 
if (Meteor.isServer) {
  Meteor.startup(() => {
    console.log('QRL Wallet Starting')

    // Establish gRPC connections with all enabled, non-localhost DEFAULT_NODES
    DEFAULT_NODES.forEach(function (node) {
      if((node.disabled == '') && (node.id != 'localhost')) {
        console.log('Attempting to create gRPC connection to node: ', node.name, ' (', node.grpc,') ...')

        loadGrpcClient(node, function(err, response) {
          if (err) {
            console.log('Error connecting to: ', node.name, ' (', node.grpc,') ...')
          } else {
            console.log('Connection created successfully for: ', node.name, ' (', node.grpc,') ...')
          }
        })
      }
    })
  });
}