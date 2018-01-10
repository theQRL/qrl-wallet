import './tokenTransferConfirm.html'
/* global LocalStore */
/* global QRLLIB */
/* global selectedNode */
/* global XMSS_OBJECT */
/* global findNodeData */
/* global selectedNode */
/* global DEFAULT_NODES */
/* global SHOR_PER_QUANTA */

function confirmTokenTransfer() {
  const tx = LocalStore.get('tokenTransferConfirmationResponse')

  let hashToSign = tx.transaction_unsigned.transaction_hash
  hashToSign = new QRLLIB.str2bin(hashToSign)

  // Set OTS Key Index in XMSS object
  XMSS_OBJECT.setIndex(tx.transaction_unsigned.ots_key)

  // Sign hash
  const signedHash = XMSS_OBJECT.sign(hashToSign)

  const signedHashJS = new Uint8Array(signedHash.size())
  for (let i = 0; i < signedHash.size(); i += 1) {
    signedHashJS[i] = signedHash.get(i)
  }

  tx.transaction_unsigned.signature = signedHashJS

  const grpcEndpoint = findNodeData(DEFAULT_NODES, selectedNode()).grpc
  tx.grpc = grpcEndpoint

  Meteor.call('confirmTokenTransfer', tx, (err, res) => {
    if (res.error) {
      $('#tokenCreationConfirmation').hide()
      $('#transactionFailed').show()

      LocalStore.set('transactionFailed', res.error)
    } else {
      LocalStore.set('transactionHash', res.response.txnHash)
      LocalStore.set('transactionSignature', res.response.signature)
      LocalStore.set('transactionRelayedThrough', res.relayed)

      // Send to result page.
      const params = { }
      const path = FlowRouter.path('/tokens/transfer/result', params)
      FlowRouter.go(path)
    }
  })
}

function cancelTransaction() {
  LocalStore.set('tokenTransferConfirmation', '')
  LocalStore.set('tokenTransferConfirmationResponse', '')
  LocalStore.set('tokenTransferConfirmationDetails', '')

  LocalStore.set('transactionFailed', 'User requested cancellation')

  $('#tokenTransferConfirmation').hide()
  $('#transactionFailed').show()
}


Template.appTokenTransferConfirm.onRendered(() => {
  $('.ui.dropdown').dropdown()
})

Template.appTokenTransferConfirm.events({
  'click #confirmToken': () => {
    $('#relaying').show()
    $('#relayingmsg').show()
    setTimeout(() => { confirmTokenTransfer() }, 200)
  },
  'click #cancelToken': () => {
    cancelTransaction()
  },
})

Template.appTokenTransferConfirm.helpers({
  tokenTransferConfirmation() {
    const confirmation = LocalStore.get('tokenTransferConfirmation')
    confirmation.amount /= SHOR_PER_QUANTA
    confirmation.fee /= SHOR_PER_QUANTA
    return confirmation
  },
  tokenDetails() {
    const confirmation = LocalStore.get('tokenTransferConfirmationDetails')
    return confirmation
  },
  transactionFailed() {
    const failed = LocalStore.get('transactionFailed')
    return failed
  },

})
