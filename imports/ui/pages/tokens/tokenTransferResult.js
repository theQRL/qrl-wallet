import JSONFormatter from 'json-formatter-js'
import './tokenTransferResult.html'
/* global LocalStore */
/* global POLL_TXN_RATE */
/* eslint no-console:0 */

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function setRawDetail() {
  const myJSON = LocalStore.get('txhash').transaction
  const formatter = new JSONFormatter(myJSON)
  $('.json').html(formatter.render())
}

// Checks the result of a stored txhash object, and polls again if not completed or failed.
function checkResult(thisTxId) {
  if (LocalStore.get('txhash').transaction.header != null) {
    // Complete
    const userMessage = `Complete - Transaction ${thisTxId} is in block ${LocalStore.get('txhash').transaction.header.block_number} with 1 confirmation.`

    LocalStore.set('txstatus', userMessage)
    $('.loading').hide()
    $('#loadingHeader').hide()
  } else if (LocalStore.get('txhash').error != null) {
    // Transaction error
    const errorMessage = `Error - ${LocalStore.get('txhash').error}`
    LocalStore.set('txstatus', errorMessage)
    $('.loading').hide()
    $('#loadingHeader').hide()
  } else {
    // Poll again
    setTimeout(() => { pollTransaction(thisTxId) }, POLL_TXN_RATE)
  }
}

// Poll a transaction for its status after relaying into network.
function pollTransaction(thisTxId, firstPoll = false) {
  // Reset txhash on first poll.
  if (firstPoll === true) {
    LocalStore.set('txhash', {})
  }

  LocalStore.set('txstatus', 'Pending')

  const grpcEndpoint = findNodeData(DEFAULT_NODES, selectedNode()).grpc
  const request = {
    query: thisTxId,
    grpc: grpcEndpoint,
  }

  if (thisTxId) {
    Meteor.call('getTxnHash', request, (err, res) => {
      if (err) {
        LocalStore.set('txhash', { error: err, id: thisTxId })
        LocalStore.set('txstatus', 'Error')
        checkResult(thisTxId)
      } else {
        res.error = null
        LocalStore.set('txhash', res)
        setRawDetail()
        checkResult(thisTxId)
      }
    })
  }
}

Template.appTokenTransferResult.onRendered(() => {
  $('.ui.dropdown').dropdown()

  // Start polling this transcation
  pollTransaction(LocalStore.get('transactionHash'), true)
})

Template.appTokenTransferResult.helpers({
  transactionHash() {
    const hash = LocalStore.get('transactionHash')
    return hash
  },
  transactionStatus() {
    const status = LocalStore.get('txstatus')
    return status
  },
  transactionRelayedThrough() {
    const status = LocalStore.get('transactionRelayedThrough')
    return status
  },
  tokenDetails() {
    const details = LocalStore.get('tokenTransferConfirmationDetails')
    return details
  },
  tokenTransferConfirmation() {
    const confirmation = LocalStore.get('tokenTransferConfirmation')
    return confirmation
  },
  tokenTransferTokenHash() {
    const token_txhash = LocalStore.get('tokenTransferTokenHash')
    return token_txhash
  },
  nodeExplorerUrl() {
    if ((LocalStore.get('nodeExplorerUrl') === '') || (LocalStore.get('nodeExplorerUrl') === null)) {
      return DEFAULT_NODES[0].explorerUrl
    }
    return LocalStore.get('nodeExplorerUrl')
  },
})

Template.appTokenTransferResult.events({
  'click .jsonclick': () => {
    if (!($('.json').html())) {
      setRawDetail()
    }
    $('.jsonbox').toggle()
  },
})
