import JSONFormatter from 'json-formatter-js'
import './tokenCreateResult.html'
/* global LocalStore */
/* global POLL_TXN_RATE */
/* global POLL_MAX_CHECKS */
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
function checkResult(thisTxId, failureCount) {
  try {
    if (LocalStore.get('txhash').transaction.header != null) {
      // Complete
      const userMessage = `Complete - Transaction ${thisTxId} is in block ${LocalStore.get('txhash').transaction.header.block_number} with 1 confirmation.`

      LocalStore.set('txstatus', userMessage)
      $('.loading').hide()
      $('#loadingHeader').hide()
    } else if (LocalStore.get('txhash').error != null) {
      // We attempt to find the transaction 5 times below absolutely failing.
      if(failureCount < 5) {
        failureCount += 1
        setTimeout(() => { pollTransaction(thisTxId, false, failureCount) }, POLL_TXN_RATE)
      } else {
        // Transaction error - Give up
        const errorMessage = `Error - ${LocalStore.get('txhash').error}`
        LocalStore.set('txstatus', errorMessage)
        $('.loading').hide()
        $('#loadingHeader').hide()
      }
    } else {
      // Poll again
      setTimeout(() => { pollTransaction(thisTxId) }, POLL_TXN_RATE)
    }
  } catch (err) {
    // Most likely is that the mempool is not replying the transaction. We attempt to find it ongoing
    // For a while
    console.log(`Caught Error: ${err}`)

    // Continue to check the txn status until POLL_MAX_CHECKS is reached in failureCount
    if(failureCount < POLL_MAX_CHECKS) {
      failureCount += 1
      setTimeout(() => { pollTransaction(thisTxId, false, failureCount) }, POLL_TXN_RATE)
    } else {
      // Transaction error - Give up
      LocalStore.set('txstatus', 'Error')
      $('.loading').hide()
      $('#loadingHeader').hide()
    }
  }
}

// Poll a transaction for its status after relaying into network.
function pollTransaction(thisTxId, firstPoll = false, failureCount = 0) {
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
        if(failureCount < 60) {
          LocalStore.set('txhash', { })
          LocalStore.set('txstatus', 'Pending')
        } else {
          LocalStore.set('txhash', { error: err, id: thisTxId })
          LocalStore.set('txstatus', 'Error')
        }
        checkResult(thisTxId, failureCount)
      } else {
        res.error = null
        LocalStore.set('txhash', res)
        setRawDetail()
        checkResult(thisTxId, failureCount)
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
    details.owner = binaryToQrlAddress(details.owner)
    details.symbol = bytesToString(details.symbol)
    details.name = bytesToString(details.name)
    return details
  },
  tokenHolders() {
    const tokenHoldersRaw = LocalStore.get('txhash').transaction.tx.token.initial_balances
    const tokenDecimals = LocalStore.get('txhash').transaction.tx.token.decimals
    let tokenHolders = []
    for (var i = 0; i < tokenHoldersRaw.length; i++) {
      const thisHolder = {
        address: binaryToQrlAddress(tokenHoldersRaw[i].address),
        amount: tokenHoldersRaw[i].amount / Math.pow(10, tokenDecimals)
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
