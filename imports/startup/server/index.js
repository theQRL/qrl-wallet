// server-side startup
import { check } from 'meteor/check'
import grpc from 'grpc'
import grpcPromise from 'grpc-promise'
import tmp from 'tmp'
import fs from 'fs'

let qrlClient

// Create a temp file to store the qrl.proto file in
// We'll also use the base directory of this file for other temp storage
const qrlProtoFilePath = tmp.fileSync({ mode: 0644, prefix: 'qrl-', postfix: '.proto' }).name

// Load the qrl.proto gRPC client into qrlClient from a remote node.
const loadGrpcClient = (request, callback) => {

  // FIXIME - Not the cleanest way to inject timstamp.proto
  const timestampProto = Assets.getText('timestamp.proto')
  const tmpDirectory = qrlProtoFilePath.substring(0, qrlProtoFilePath.lastIndexOf('/'))
  if (!fs.existsSync(tmpDirectory + '/google')) {
    fs.mkdirSync(tmpDirectory + '/google')
  }
  if (!fs.existsSync(tmpDirectory + '/google/protobuf')) {
    fs.mkdirSync(tmpDirectory + '/google/protobuf')
  }
  fs.writeFile(tmpDirectory + '/google/protobuf/timestamp.proto', timestampProto)

  // Load qrlbase.proto and fetch current qrl.proto from node
  const baseGrpcObject = grpc.load(Assets.absoluteFilePath('qrlbase.proto'))
  const client = new baseGrpcObject.qrl.Base(request.grpc, grpc.credentials.createInsecure())

  grpcPromise.promisifyAll(client)

  client.getNodeInfo()
    .sendMessage({})
    .then(res => {

      fs.writeFile(qrlProtoFilePath, res.grpcProto, function (err) {
        if (err) throw err

        const grpcObject = grpc.load(qrlProtoFilePath)
        qrlClient = new grpcObject.qrl.PublicAPI(request.grpc, grpc.credentials.createInsecure())

        console.log('qrlClient loaded')

        callback(null, true)
      })

    })
    .catch(err => {
      console.log('Error fetching qrl.proto from ' + request.grpc)
      callback(err, null)
    })
}


// Function to call getKnownPeers API.
const getKnownPeers = (request, callback) => {
  console.log('getting peers')

  grpcPromise.promisifyAll(qrlClient)

  qrlClient.getKnownPeers()
    .sendMessage({})
    .then(res => { console.log(res); callback(null, res) })
    .catch(err => { callback(err, null) })
}

// Function to call getAddressState API
const getAddressState = (address, callback) => {
  console.log('getting address state')

  grpcPromise.promisifyAll(qrlClient)

  qrlClient.getAddressState()
    .sendMessage({ address : address })
    .then(res => { console.log(res); callback(null, res) })
    .catch(err => { callback(err, null) })
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
  getAddress(address) {
    this.unblock()
    check(address, String)
    const response = Meteor.wrapAsync(getAddressState)(address)
    return response
  },
})
