import './start.html'
import CryptoJS from 'crypto-js';

/* global LocalStore */
/* global selectedNetwork */
/* global XMSS_OBJECT */
/* global DEFAULT_NETWORKS */
/* global SHOR_PER_QUANTA */
/* global wrapMeteorCall */
/* global nodeReturnedValidResponse */

let additional_text_max_length_value = 57

function createMessageTxn() {
  const finalNotarisation = document.getElementById('message').value
  const txnFee = document.getElementById('fee').value
  const otsKey = document.getElementById('otsKey').value

  // Convert strings to bytes
  const pubKey = hexToBytes(getXMSSDetails().pk)
  const messageBytes = hexToBytes(finalNotarisation)

  // Construct request
  const request = {
    message: messageBytes,
    fee: txnFee * SHOR_PER_QUANTA,
    xmssPk: pubKey,
    network: selectedNetwork(),
  }

  wrapMeteorCall('createMessageTxn', request, (err, res) => {
    if (err) {
      LocalStore.set('documentNotarisationError', err)
      $('#documentNotarisationFailed').show()
      $('#notariseForm').hide()
    } else {
      const confirmation = {
        hash: res.txnHash,
        message: bytesToString(res.response.extended_transaction_unsigned.tx.message.message_hash),
        message_hex: bytesToHex(res.response.extended_transaction_unsigned.tx.message.message_hash),
        fee: res.response.extended_transaction_unsigned.tx.fee / SHOR_PER_QUANTA,
        otsKey: otsKey,
        file_name: LocalStore.get('notaryDocumentName'),
        hash_function: LocalStore.get('notaryHashFunction'),
        hash: LocalStore.get('notaryFileHash'),
        additional_text: LocalStore.get('notaryAdditionalText'),
      }

      if (nodeReturnedValidResponse(request, confirmation, 'createMessageTxn')) {
        LocalStore.set('notariseCreationConfirmation', confirmation)
        LocalStore.set('notariseCreationConfirmationResponse', res.response)

        // Send to confirm page.
        const params = { }
        const path = FlowRouter.path('/tools/notarise/confirm', params)
        FlowRouter.go(path)
      } else {
        $('#invalidNodeResponse').modal('show')
      }
    }
  })
}

function notariseDocument() {
  $('#documentNotarisationFailed').hide()

  let notaryDocuments = $('#notaryDocument').prop('files')
  const notaryDocument = notaryDocuments[0]
  const hashFunction = document.getElementById('hashFunction').value
  const additional_text = document.getElementById('additional_text').value

  const reader = new FileReader()
  reader.onloadend = function() {
    try {
      let notarisation = 'AFAFA'
      let fileHash

      // Convert FileReader ArrayBuffer to WordArray first
      var resultWordArray = CryptoJS.lib.WordArray.create(reader.result);

      if(hashFunction == "SHA1") {
        fileHash = CryptoJS.SHA1(resultWordArray).toString(CryptoJS.enc.Hex);
        notarisation = notarisation + '1' + fileHash
      } else if(hashFunction == "SHA256") {
        fileHash = CryptoJS.SHA256(resultWordArray).toString(CryptoJS.enc.Hex);
        notarisation = notarisation + '2' + fileHash
      } else if(hashFunction == "MD5") {
        fileHash = CryptoJS.MD5(resultWordArray).toString(CryptoJS.enc.Hex);
        notarisation = notarisation + '3' + fileHash
      }

      // Convert free form text to hex
      var additionalTextBytes = stringToBytes(additional_text)
      var additionalTextHex = bytesToHex(additionalTextBytes)

      // Construct final hex string for notarisation
      var finalNotarisation = notarisation + additionalTextHex

      // Set message field to document notarisation string
      document.getElementById('message').value = finalNotarisation

      // Set the filename in local store for later display in UI
      LocalStore.set('notaryDocumentName', notaryDocument.name)
      LocalStore.set('notaryAdditionalText', additional_text)
      LocalStore.set('notaryHashFunction', hashFunction)
      LocalStore.set('notaryFileHash', fileHash)

      // Create a message txn with this data
      createMessageTxn()
    } catch (err) {
      console.log(err)
      // Invalid file format
      LocalStore.set('documentNotarisationError', 'Unable to open Document - Are you sure you selected a document to notarise?')
      $('#documentNotarisationFailed').show()
      $('#generating').hide()
    }
  }

  // Verify user selected a document to notarise
  if (notaryDocument === undefined) {
    LocalStore.set('documentNotarisationError', 'Unable to open Document - Are you sure you selected a document to notarise?')
    $('#documentNotarisationFailed').show()
    $('#generating').hide()
  } else {
    console.log('reading file ', notaryDocument)
    reader.readAsArrayBuffer(notaryDocument)
  }
}

// Function to initialise form validation
function initialiseFormValidation() {
  let validationRules = {}

  validationRules['additional_text'] = {
    id: 'additional_text',
    rules: [
      {
        type: 'maxLength[' + additional_text_max_length_value + ']',
        prompt: 'The max length of the additional message is ' + additional_text_max_length_value + ' bytes.',
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

Template.appNotariseStart.onRendered(() => {
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

Template.appNotariseStart.events({
  'submit #notariseForm': (event) => {
    event.preventDefault()
    event.stopPropagation()
    $('#generating').show()

    setTimeout(() => { notariseDocument() }, 200)
  },
  'change #hashFunction': (event) => {
    const selectedFunction = document.getElementById('hashFunction').value
    if(selectedFunction == "SHA1") {
      additional_text_max_length_value = 57
      document.getElementById('additional_text_max_length').innerHTML = '(Max Length: 57)'
    } else if(selectedFunction == "SHA256") {
      additional_text_max_length_value = 45
      document.getElementById('additional_text_max_length').innerHTML = '(Max Length: 45)'
    } else if(selectedFunction == "MD5") {
      additional_text_max_length_value = 61
      document.getElementById('additional_text_max_length').innerHTML = '(Max Length: 61)'
    }
    initialiseFormValidation()
  }
})

Template.appNotariseStart.helpers({
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
  documentNotarisationError() {
    const documentNotarisationError = LocalStore.get('documentNotarisationError')
    return documentNotarisationError
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
