import './tokenCreateConfirm.html'
/* global LocalStore */
/* global QRLLIB */
/* global selectedNode */
/* global XMSS_OBJECT */
/* global findNodeData */
/* global selectedNode */
/* global DEFAULT_NODES */
/* global SHOR_PER_QUANTA */

function confirmTokenCreation() {
  const tx = LocalStore.get('tokenCreationConfirmationResponse')

  let hashToSign = tx.transaction_unsigned.transaction_hash
  hashToSign = new QRLLIB.str2bin(hashToSign)

  // Set OTS Key Index in XMSS object
  XMSS_OBJECT.setIndex(parseInt(LocalStore.get('tokenCreationConfirmation').otsKey))

  // Sign hash and convert to bytes
  tx.transaction_unsigned.signature = binaryToBytes(XMSS_OBJECT.sign(hashToSign))

  const grpcEndpoint = findNodeData(DEFAULT_NODES, selectedNode()).grpc
  tx.grpc = grpcEndpoint

  Meteor.call('confirmTokenCreation', tx, (err, res) => {
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
      const path = FlowRouter.path('/tokens/create/result', params)
      FlowRouter.go(path)
    }
  })
}

function cancelTransaction() {
  LocalStore.set('tokenCreationConfirmation', '')
  LocalStore.set('tokenCreationConfirmationResponse', '')

  LocalStore.set('transactionFailed', 'User requested cancellation')

  $('#tokenCreationConfirmation').hide()
  $('#transactionFailed').show()
}


Template.appTokenCreationConfirm.onRendered(() => {
  $('.ui.dropdown').dropdown()
})

Template.appTokenCreationConfirm.events({
  'click #confirmToken': () => {
    $('#relaying').show()
    setTimeout(() => { confirmTokenCreation() }, 200)
  },
  'click #cancelToken': () => {
    cancelTransaction()
  },
})

Template.appTokenCreationConfirm.helpers({
  tokenCreationConfirmation() {
    const confirmation = LocalStore.get('tokenCreationConfirmation')
    return confirmation
  },
  transactionFailed() {
    const failed = LocalStore.get('transactionFailed')
    return failed
  },
  tokenHolders() {
    const tokenHoldersRaw = LocalStore.get('tokenCreationConfirmation').initialBalances
    let tokenHolders = []

    for (var i = 0; i < tokenHoldersRaw.length; i++) {
      const thisHolder = {
        address: new TextDecoder('utf-8').decode(tokenHoldersRaw[i].address),
        amount: tokenHoldersRaw[i].amount / SHOR_PER_QUANTA
      }
      tokenHolders.push(thisHolder)
    }

    return tokenHolders
  },
  nodeExplorerUrl() {
    if ((LocalStore.get('nodeExplorerUrl') === '') || (LocalStore.get('nodeExplorerUrl') === null)) {
      return DEFAULT_NODES[0].explorerUrl
    }
    return LocalStore.get('nodeExplorerUrl')
  },
})
