import JSONFormatter from 'json-formatter-js'
import './tokenCreateResult.html'
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


Template.appTokenCreationResult.onRendered(() => {
  $('.ui.dropdown').dropdown()

  // Start polling this transcation
  pollTransaction(LocalStore.get('transactionHash'), true)
})

Template.appTokenCreationResult.helpers({
  transactionHash() {
    const hash = LocalStore.get('transactionHash')
    return hash
  },
  transactionSignature() {
    const signature = LocalStore.get('transactionSignature')
    return signature
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
    let details = LocalStore.get('txhash').transaction.tx.token
    details.owner = new TextDecoder('utf-8').decode(details.owner)
    details.symbol = new TextDecoder('utf-8').decode(details.symbol)
    details.name = new TextDecoder('utf-8').decode(details.name)
    return details
  },
  tokenHolders() {
    const tokenHoldersRaw = LocalStore.get('txhash').transaction.tx.token.initial_balances
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

Template.appTokenCreationResult.events({
  'click .jsonclick': () => {
    if (!($('.json').html())) {
      setRawDetail()
    }
    $('.jsonbox').toggle()
  },
})
