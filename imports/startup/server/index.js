// server-side startup
import { check } from 'meteor/check'
import grpc from 'grpc'
import tmp from 'tmp'
import fs from 'fs'

// An array of grpc connections
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
const qrlProtoFilePath = tmp.fileSync({ mode: 0644, prefix: 'qrl-', postfix: '.proto' }).name


const errorCallback = (error, message, alert) => {
  const d = new Date()
  const getTime = d.toUTCString()
  console.log(`${alert} [Timestamp: ${getTime}] ${error}`)
  const meteorError = new Meteor.Error(500, `[${getTime}] ${message} (${error})`)
  return meteorError
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

      fs.writeFile(qrlProtoFilePath, res.grpcProto, function (err) {
        if (err) throw err

        const grpcObject = grpc.load(qrlProtoFilePath)

        // Create area to store this grpc connection
        qrlClient.push(request.grpc)

        qrlClient[request.grpc] = new grpcObject.qrl.PublicAPI(request.grpc, grpc.credentials.createInsecure())

        console.log('qrlClient loaded for ',request.grpc)

        callback(null, true)
      })
    }
  })
}


// Function to call getKnownPeers API.
const getKnownPeers = (request, callback) => {
  console.log('getting peers')

  qrlClient[request.grpc].getKnownPeers({}, (err, response) => {
    if (err){
      console.log("Error: ", err.message)
      callback(err, null)
    } else {
      console.log(response)
      callback(null, response)
    }
  })
}

const getStats = (request, callback) => {
  console.log('getting stats')

  try {
    qrlClient[request.grpc].getStats({}, (err, response) => {
      if (err) {
        const myError = errorCallback(err, 'Cannot access API/GetStats', '**ERROR/getStats** ')
        callback(myError, null)
      } else {
        console.log(response)
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
  console.log('getting address state')

  console.log(request)

  qrlClient[request.grpc].getAddressState({address : request.address}, (err, response) => {
    if (err){
      console.log("Error: ", err.message)
      callback(err, null)
    } else {
      console.log(response.state.transactions)
      console.log("Address: %s        Balance: %d", response.state.address, response.state.balance)
      callback(null, response)
    }
  })
}


// Function to call getObject API and extract a txn Hash..
const getTxnHash = (request, callback) => {
  console.log('getting txn hash')

  console.log(request)

  console.log('buffered hash')
  const txnHash = Buffer.from(request.query, 'hex')

  console.log(txnHash)

  qrlClient[request.grpc].getObject({query: txnHash}, (err, response) => {
    if (err){
      console.log("Error: ", err.message)
      callback(err, null)
    } else {

      console.log(response)

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

        console.log(response)
        callback(null, response)
      } else {
        callback("Unable to locate transaction", null)
      }

    }
  })
}



// Function to call transferCoins API
const transferCoins = (request, callback) => {
  console.log('getting transferCoins object')

  const tx = { 
    address_from: request.fromAddress,
    address_to: request.toAddress,
    amount: request.amount,
    fee: request.fee,
    xmss_pk: request.xmssPk,
    xmss_ots_index: request.xmssOtsKey
  }

  console.log(tx)

  qrlClient[request.grpc].transferCoins(tx, (err, response) => {
    if (err){
      console.log("Error: ", err.message)

      callback(err, null)
    } else {
      console.log('success')

      let transferResponse = {
        txnHash: Buffer.from(response.transaction_unsigned.transaction_hash).toString('hex'),
        response: response
      }

      console.log(transferResponse)

      callback(null, transferResponse)
    }
  })
}



const confirmTransaction = (request, callback) => {
  console.log('confirming transaction')

  let confirmTxn = { transaction_signed : request.transaction_unsigned }

  // change ArrayBuffer
  confirmTxn.transaction_signed.addr_from = toBuffer(confirmTxn.transaction_signed.addr_from)
  confirmTxn.transaction_signed.public_key = toBuffer(confirmTxn.transaction_signed.public_key)
  confirmTxn.transaction_signed.transaction_hash = toBuffer(confirmTxn.transaction_signed.transaction_hash)
  confirmTxn.transaction_signed.signature = toBuffer(confirmTxn.transaction_signed.signature)
  confirmTxn.transaction_signed.transfer.addr_to = toBuffer(confirmTxn.transaction_signed.transfer.addr_to)

  console.log(confirmTxn)

  qrlClient[request.grpc].pushTransaction(confirmTxn, (err, response) => {
    if (err) {
      console.log("confirmTransaction Error: ", err.message)
      callback(null, {error: err.message, response: err.message})
    } else {
      console.log('confirmTransaction Success')

      let hashResponse = {
        txnHash: Buffer.from(confirmTxn.transaction_signed.transaction_hash).toString('hex'),
        signature: Buffer.from(confirmTxn.transaction_signed.signature).toString('hex'),
      }

      callback(null, {error: null, response: hashResponse}) 
    }
  })
}


// Define Meteor Methods
Meteor.methods({
  loadGrpcClient(request) {
    this.unblock()
    check(request, Object)
    const response = Meteor.wrapAsync(loadGrpcClient)(request)
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
  confirmTransaction(request) {
    this.unblock()
    check(request, Object)
    const response = Meteor.wrapAsync(confirmTransaction)(request)
    return response
  },
})
