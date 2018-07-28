import './messageCreate.html'
/* global LocalStore */
/* global selectedNetwork */
/* global XMSS_OBJECT */
/* global DEFAULT_NETWORKS */
/* global SHOR_PER_QUANTA */
/* global wrapMeteorCall */
/* global nodeReturnedValidResponse */

function createMessageTxn() {
  // Get to/amount details
  const userMessage = document.getElementById('message').value
  const txnFee = document.getElementById('fee').value
  const otsKey = document.getElementById('otsKey').value

  // Convert strings to bytes
  const pubKey = hexToBytes(getXMSSDetails().pk)
  const messageBytes = stringToBytes(userMessage)

  // Construct request
  const request = {
    message: messageBytes,
    fee: txnFee * SHOR_PER_QUANTA,
    xmssPk: pubKey,
    network: selectedNetwork(),
  }

  wrapMeteorCall('createMessageTxn', request, (err, res) => {
    if (err) {
      LocalStore.set('messageCreationError', err)
      $('#messageCreationFailed').show()
      $('#messageCreateForm').hide()
    } else {
      const confirmation = {
        hash: res.txnHash,
        message: bytesToString(res.response.extended_transaction_unsigned.tx.message.message_hash),
        fee: res.response.extended_transaction_unsigned.tx.fee / SHOR_PER_QUANTA,
        otsKey: otsKey,
      }

      if (nodeReturnedValidResponse(request, confirmation, 'createMessageTxn')) {
        LocalStore.set('messageCreationConfirmation', confirmation)
        LocalStore.set('messageCreationConfirmationResponse', res.response)

        // Send to confirm page.
        const params = { }
        const path = FlowRouter.path('/tools/message/confirm', params)
        FlowRouter.go(path)
      } else {
        $('#invalidNodeResponse').modal('show')
      }
    }
  })
}

// Function to initialise form validation
function initialiseFormValidation() {
  let validationRules = {}

  validationRules['message'] = {
    id: 'message',
    rules: [
      {
        type: 'empty',
        prompt: 'You must enter a message',
      },
      {
        type: 'maxLength[80]',
        prompt: 'The max length of a message is 80 bytes.',
      },
    ],
  }

  // Now set fee and otskey validation rules
  validationRules['fee'] = {
    id: 'fee',
    rules: [
      {
        type: 'empty',
        prompt: 'You must enter a fee',
      },
      {
        type: 'number',
        prompt: 'Fee must be a number',
      },
    ],
  }
  validationRules['otsKey'] = {
    id: 'otsKey',
    rules: [
      {
        type: 'empty',
        prompt: 'You must enter an OTS Key Index',
      },
      {
        type: 'number',
        prompt: 'OTS Key Index must be a number',
      },
    ],
  }

  // Initliase the form validation
  $('.ui.form').form({
    fields: validationRules,
  })
}

Template.appMessageCreate.onRendered(() => {
  // Initialise dropdowns
  $('.ui.dropdown').dropdown()

  // Initialise Form Validation
  initialiseFormValidation()

  // Get wallet balance
  getBalance(getXMSSDetails().address, function() {
    // Show warning is otsKeysRemaining is low
    if(LocalStore.get('otsKeysRemaining') < 50) {
      // Shown low OTS Key warning modal
      $('#lowOtsKeyWarning').modal('transition', 'disable').modal('show')
    }
  })
})

Template.appMessageCreate.events({
  'submit #generateMessageForm': (event) => {
    event.preventDefault()
    event.stopPropagation()
    $('#generating').show()

    setTimeout(() => { createMessageTxn() }, 200)
  },
})

Template.appMessageCreate.helpers({
  transferFrom() {
    const transferFrom = {}
    transferFrom.balance = LocalStore.get('transferFromBalance')
    transferFrom.address = LocalStore.get('transferFromAddress')
    return transferFrom
  },
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
  otsKeyEstimate() {
    const otsKeyEstimate = LocalStore.get('otsKeyEstimate')
    return otsKeyEstimate
  },
  otsKeysRemaining() {
    const otsKeysRemaining = LocalStore.get('otsKeysRemaining')
    return otsKeysRemaining
  },
  messageCreationError() {
    const messageCreationError = LocalStore.get('messageCreationError')
    return messageCreationError
  },
  nodeExplorerUrl() {
    if ((LocalStore.get('nodeExplorerUrl') === '') || (LocalStore.get('nodeExplorerUrl') === null)) {
      return DEFAULT_NETWORKS[0].explorerUrl
    }
    return LocalStore.get('nodeExplorerUrl')
  },
  ledgerWalletDisabled() {
    if (getXMSSDetails().walletType == 'ledger') {
      return 'disabled'
    }
    return ''
  },
  isLedgerWallet() {
    if (getXMSSDetails().walletType == 'ledger') {
      return true
    }
    return false
  },
})
