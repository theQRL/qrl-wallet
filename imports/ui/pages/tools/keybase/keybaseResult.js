import JSONFormatter from 'json-formatter-js'
import './keybaseResult.html'
/* global POLL_TXN_RATE */
/* global POLL_MAX_CHECKS */
/* global DEFAULT_NETWORKS */
/* global selectedNetwork */
/* global wrapMeteorCall */
/* eslint no-console:0 */

function setRawDetail() {
  const myJSON = Session.get('txhash').transaction
  const formatter = new JSONFormatter(myJSON)
  $('.json').html(formatter.render())
}

// Checks the result of a stored txhash object, and polls again if not completed or failed.
function checkResult(thisTxId, failureCount) {
  try {
    if (Session.get('txhash').transaction.header != null) {
      // Complete
      const userMessage = `Complete - Transaction ${thisTxId} is in block ${Session.get('txhash').transaction.header.block_number} with 1 confirmation.`

      Session.set('txstatus', userMessage)
      $('.loading').hide()
      $('#loadingHeader').hide()
    } else if (Session.get('txhash').error != null) {
      // We attempt to find the transaction 5 times below absolutely failing.
      if(failureCount < 5) {
        failureCount += 1
        setTimeout(() => { pollTransaction(thisTxId, false, failureCount) }, POLL_TXN_RATE)
      } else {
        // Transaction error - Give up
        const errorMessage = `Error - ${Session.get('txhash').error}`
        Session.set('txstatus', errorMessage)
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
      Session.set('txstatus', 'Error')
      $('.loading').hide()
      $('#loadingHeader').hide()
    }
  }
}

// Poll a transaction for its status after relaying into network.
function pollTransaction(thisTxId, firstPoll = false, failureCount = 0) {
  // Reset txhash on first poll.
  if (firstPoll === true) {
    Session.set('txhash', {})
  }

  Session.set('txstatus', 'Pending')

  const request = {
    query: thisTxId,
    network: selectedNetwork(),
  }

  if (thisTxId) {
    wrapMeteorCall('getTxnHash', request, (err, res) => {
      if (err) {
        if(failureCount < 60) {
          Session.set('txhash', { })
          Session.set('txstatus', 'Pending')
        } else {
          Session.set('txhash', { error: err, id: thisTxId })
          Session.set('txstatus', 'Error')
        }
        checkResult(thisTxId, failureCount)
      } else {
        res.error = null
        Session.set('txhash', res)
        setRawDetail()
        checkResult(thisTxId, failureCount)
      }
    })
  }
}


Template.appKeybaseResult.onRendered(() => {
  $('.ui.dropdown').dropdown()

  // Start polling this transcation
  pollTransaction(Session.get('transactionHash'), true)
})

Template.appKeybaseResult.helpers({
  transactionHash() {
    const hash = Session.get('transactionHash')
    return hash
  },
  transactionSignature() {
    const signature = Session.get('transactionSignature')
    return signature
  },
  transactionStatus() {
    const status = Session.get('txstatus')
    return status
  },
  transactionRelayedThrough() {
    const status = Session.get('transactionRelayedThrough')
    return status
  },
  messageDetails() {
    let details = Session.get('txhash').transaction.tx.message
    details.message = bytesToString(details.message_hash)
    return details
  },
  nodeExplorerUrl() {
    if ((Session.get('nodeExplorerUrl') === '') || (Session.get('nodeExplorerUrl') === null)) {
      return DEFAULT_NETWORKS[0].explorerUrl
    }
    return Session.get('nodeExplorerUrl')
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
