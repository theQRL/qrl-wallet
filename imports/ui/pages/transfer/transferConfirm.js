import './transferConfirm.html'
/* global LocalStore */
/* global QRLLIB */
/* global selectedNode */
/* global XMSS_OBJECT */
/* global findNodeData */
/* global selectedNode */
/* global DEFAULT_NODES */
/* global SHOR_PER_QUANTA */

function confirmTransaction() {
  const tx = LocalStore.get('transactionConfirmationResponse')

  let hashToSign = tx.transaction_unsigned.transaction_hash
  hashToSign = new QRLLIB.str2bin(hashToSign)

  // Set OTS Key Index
  XMSS_OBJECT.setIndex(parseInt(LocalStore.get('transactionConfirmation').otsKey))

  // Sign hash
  const signedHash = XMSS_OBJECT.sign(hashToSign)
  const signedHashJS = new Uint8Array(signedHash.size())
  for (let i = 0; i < signedHash.size(); i += 1) {
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
      LocalStore.set('transactionRelayedThrough', res.relayed)

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

  LocalStore.set('transactionFailed', 'User requested cancellation')

  $('#transactionConfirmation').hide()
  $('#transactionFailed').show()
}


Template.appTransferConfirm.onRendered(() => {
  $('.ui.dropdown').dropdown()
})

Template.appTransferConfirm.events({
  'click #confirmTransaction': () => {
    $('#relaying').show()
    setTimeout(() => { confirmTransaction() }, 200)
  },
  'click #cancelTransaction': () => {
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
    const transactionConfirmationFee = 
      LocalStore.get('transactionConfirmationResponse').transaction_unsigned.fee / SHOR_PER_QUANTA
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
  nodeExplorerUrl() {
    if ((LocalStore.get('nodeExplorerUrl') === '') || (LocalStore.get('nodeExplorerUrl') === null)) {
      return DEFAULT_NODES[0].explorerUrl
    }
    return LocalStore.get('nodeExplorerUrl')
  },
})
