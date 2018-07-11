import JSONFormatter from 'json-formatter-js'
import './messageResult.html'
/* global LocalStore */
/* global POLL_TXN_RATE */
/* global POLL_MAX_CHECKS */
/* global DEFAULT_NETWORKS */
/* global selectedNetwork */
/* global wrapMeteorCall */
/* eslint no-console:0 */

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

  const request = {
    query: thisTxId,
    network: selectedNetwork(),
  }

  if (thisTxId) {
    wrapMeteorCall('getTxnHash', request, (err, res) => {
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


Template.appMessageResult.onRendered(() => {
  $('.ui.dropdown').dropdown()

  // Start polling this transcation
  pollTransaction(LocalStore.get('transactionHash'), true)
})

Template.appMessageResult.helpers({
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
  messageDetails() {
    let details = LocalStore.get('txhash').transaction.tx.message
    details.message = bytesToString(details.message_hash)
    return details
  },
  nodeExplorerUrl() {
    if ((LocalStore.get('nodeExplorerUrl') === '') || (LocalStore.get('nodeExplorerUrl') === null)) {
      return DEFAULT_NETWORKS[0].explorerUrl
    }
    return LocalStore.get('nodeExplorerUrl')
  },
})

Template.appMessageResult.events({
  'click .jsonclick': () => {
    if (!($('.json').html())) {
      setRawDetail()
    }
    $('.jsonbox').toggle()
  },
})
