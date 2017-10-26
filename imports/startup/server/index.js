// server-side startup
import { check } from 'meteor/check'
import grpc from 'grpc'
import tmp from 'tmp'
import fs from 'fs'

let qrlClient


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
        qrlClient = new grpcObject.qrl.PublicAPI(request.grpc, grpc.credentials.createInsecure())

        console.log('qrlClient loaded')

        callback(null, true)
      })
    }
  })
}


// Function to call getKnownPeers API.
const getKnownPeers = (request, callback) => {
  console.log('getting peers')

  qrlClient.getKnownPeers({}, (err, response) => {
    if (err){
      console.log("Error: ", err.message)
      callback(err, null)
    } else {
      console.log(response)
      callback(null, response)
    }
  })
}

// Function to call getAddressState API
const getAddressState = (request, callback) => {
  console.log('getting address state')

  console.log(request)

  qrlClient.getAddressState({address : request.address}, (err, response) => {
    if (err){
      console.log("Error: ", err.message)
      callback(err, null)
    } else {
      console.log("Address: %s        Balance: %d", response.state.address, response.state.balance)
      callback(null, response)
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

  qrlClient.transferCoins(tx, (err, response) => {
    if (err){
      console.log("Error: ", err.message)

      callback(err, null)
    } else {
      console.log('success')
      console.log(response)

      callback(null, response)
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

  qrlClient.pushTransaction(confirmTxn, (err, response) => {
    if (err) {
      console.log("confirmTransaction Error: ", err.message)
      callback(null, {error: err.message, response: err.message})
    } else {
      console.log('confirmTransaction Success')

      let hashResponse = {
        txnHash: Buffer.from(confirmTxn.transaction_signed.transaction_hash).toString('hex')
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
