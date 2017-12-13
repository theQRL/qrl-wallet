import './transferConfirm.html'
/* global LocalStore */
/* global QRLLIB */
/* global selectedNode */
/* global XMSS_OBJECT */

function confirmTransaction() {
  let tx = LocalStore.get('transactionConfirmationResponse')

  let hashToSign = tx.transaction_unsigned.transaction_hash
  hashToSign = new QRLLIB.str2bin(hashToSign)

  const signedHash = XMSS_OBJECT.sign(hashToSign)

  var signedHashJS = new Uint8Array(signedHash.size());
  for(var i=0; i<signedHash.size(); i++) {
    signedHashJS[i] = signedHash.get(i)
  }

  tx.transaction_unsigned.signature = signedHashJS

  const grpcEndpoint = findNodeData(DEFAULT_NODES, selectedNode()).grpc
  tx.grpc = grpcEndpoint

  Meteor.call('confirmTransaction', tx, (err, res) => {
    if (res.error) {
      $('#transactionConfirmation').hide()
      $('#transactionFailed').show()

      LocalStore.set('transactionFailed', res.error)
    } else {
      LocalStore.set('transactionHash', res.response.txnHash)
      LocalStore.set('transactionSignature', res.response.signature)

      // Send to result page.
      const params = { }
      const path = FlowRouter.path('/transfer/result', params)
      FlowRouter.go(path)
    }
  })
}

function cancelTransaction() {
  LocalStore.set('transactionConfirmation', '')
  LocalStore.set('transactionConfirmationAmount', '')
  LocalStore.set('transactionConfirmationFee', '')
  LocalStore.set('transactionConfirmationResponse', '')

  LocalStore.set('transactionFailed', "User requested cancellation")

  $('#transactionConfirmation').hide()
  $('#transactionFailed').show()
}


Template.appTransferConfirm.onRendered(() => {
  $('.ui.dropdown').dropdown()
})

Template.appTransferConfirm.events({
  'click #confirmTransaction': function (event) {
    $('#relaying').show()
    $('#relayingmsg').show()
    setTimeout(function () { confirmTransaction() }, 200)
  },
  'click #cancelTransaction': function (event) {
    cancelTransaction()
  },
})

Template.appTransferConfirm.helpers({
  transactionConfirmation() {
    const confirmation = LocalStore.get('transactionConfirmation')
    return confirmation
  },
  transactionConfirmationAmount() {
    const confirmationAmount = LocalStore.get('transactionConfirmationAmount')
    return confirmationAmount
  },
  transactionConfirmationFee() {
    const transactionConfirmationFee = LocalStore.get('transactionConfirmationFee')
    return transactionConfirmationFee
  },
  transactionGenerationError() {
    const error = LocalStore.get('transactionGenerationError')
    return error
  },
  transactionFailed() {
    const failed = LocalStore.get('transactionFailed')
    return failed
  },
  transactionHash() {
    const hash = LocalStore.get('transactionHash')
    return hash
  },
  transactionSignature() {
    const hash = LocalStore.get('transactionSignature')
    return hash
  },
})
