/* eslint no-console:0 */
/* global QRLLIB, XMSS_OBJECT, LocalStore, QrlLedger, isElectrified, selectedNetwork,loadAddressTransactions, getTokenBalances, updateBalanceField, refreshTransferPage */
/* global pkRawToB32Address, hexOrB32, rawToHexOrB32, anyAddressToRawAddress, stringToBytes, binaryToBytes, bytesToString, bytesToHex, hexToBytes, toBigendianUint64BytesUnsigned, numberToString, decimalToBinary */
/* global getMnemonicOfFirstAddress, getXMSSDetails, isWalletFileDeprecated, waitForQRLLIB, addressForAPI, binaryToQrlAddress, toUint8Vector, concatenateTypedArrays, getQrlProtoShasum */
/* global resetWalletStatus, passwordPolicyValid, countDecimals, supportedBrowser, wrapMeteorCall, getBalance, otsIndexUsed, ledgerHasNoTokenSupport, resetLocalStorageState, nodeReturnedValidResponse */
/* global POLL_TXN_RATE, POLL_MAX_CHECKS, DEFAULT_NETWORKS, findNetworkData, SHOR_PER_QUANTA, WALLET_VERSION, QRLPROTO_SHA256, LEDGER_TIMEOUT,  */

import './start.html'
import CryptoJS from 'crypto-js'

let additionalTextMaxLengthValue = 45

function createMessageTxn() {
  const finalNotarisation = document.getElementById('message').value
  const txnFee = document.getElementById('fee').value
  const otsKey = document.getElementById('otsKey').value

  // Fail if OTS Key reuse is detected
  if (otsIndexUsed(Session.get('otsBitfield'), otsKey)) {
    $('#generating').hide()
    if (getXMSSDetails().walletType === 'ledger') {
      $('#ledgerOtsKeyReuseDetected').modal('show')
    } else {
      $('#otsKeyReuseDetected').modal('show')
    }
    return
  }

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
      Session.set('documentNotarisationError', err.reason)
      $('#documentNotarisationFailed').show()
      $('#notariseForm').hide()
    } else {
      const confirmation = {
        hash: res.txnHash,
        message: bytesToString(res.response.extended_transaction_unsigned.tx.message.message_hash),
        message_hex: bytesToHex(res.response.extended_transaction_unsigned.tx.message.message_hash),
        fee: res.response.extended_transaction_unsigned.tx.fee / SHOR_PER_QUANTA,
        otsKey: otsKey, // eslint-disable-line
        file_name: Session.get('notaryDocumentName'),
        hash_function: Session.get('notaryHashFunction'),
        fileHash: Session.get('notaryFileHash'),
        additional_text: Session.get('notaryAdditionalText'),
      }

      if (nodeReturnedValidResponse(request, confirmation, 'createMessageTxn')) {
        Session.set('notariseCreationConfirmation', confirmation)
        Session.set('notariseCreationConfirmationResponse', res.response)

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

  const notaryDocuments = $('#notaryDocument').prop('files')
  const notaryDocument = notaryDocuments[0]
  const hashFunction = document.getElementById('hashFunction').value
  const additionalText = document.getElementById('additional_text').value

  const reader = new FileReader()
  reader.onloadend = function () {
    try {
      let notarisation = 'AFAFA'
      let fileHash

      // Convert FileReader ArrayBuffer to WordArray first
      const resultWordArray = CryptoJS.lib.WordArray.create(reader.result)

      if (hashFunction === 'SHA256') {
        fileHash = CryptoJS.SHA256(resultWordArray).toString(CryptoJS.enc.Hex)
        notarisation = notarisation + '2' + fileHash
      }

      // Convert free form text to hex
      const additionalTextBytes = stringToBytes(additionalText)
      const additionalTextHex = bytesToHex(additionalTextBytes)

      // Construct final hex string for notarisation
      const finalNotarisation = notarisation + additionalTextHex

      // Set message field to document notarisation string
      document.getElementById('message').value = finalNotarisation

      // Set the filename in local store for later display in UI
      Session.set('notaryDocumentName', notaryDocument.name)
      Session.set('notaryAdditionalText', additionalText)
      Session.set('notaryHashFunction', hashFunction)
      Session.set('notaryFileHash', fileHash)

      // Create a message txn with this data
      createMessageTxn()
    } catch (err) {
      console.log(err)
      // Invalid file format
      Session.set('documentNotarisationError', 'Unable to open Document - Are you sure you selected a document to notarise?')
      $('#documentNotarisationFailed').show()
      $('#generating').hide()
    }
  }

  // Verify user selected a document to notarise
  if (notaryDocument === undefined) {
    Session.set('documentNotarisationError', 'Unable to open Document - Are you sure you selected a document to notarise?')
    $('#documentNotarisationFailed').show()
    $('#generating').hide()
  } else {
    console.log('reading file ', notaryDocument)
    reader.readAsArrayBuffer(notaryDocument)
  }
}

// Function to initialise form validation
function initialiseFormValidation() {
  const validationRules = {}

  validationRules['additional_text'] = {
    id: 'additional_text',
    rules: [
      {
        type: 'maxLength[' + additionalTextMaxLengthValue + ']',
        prompt: 'The max length of the additional message is ' + additionalTextMaxLengthValue + ' bytes.',
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
  getBalance(getXMSSDetails().address, function () {
    // Show warning is otsKeysRemaining is low
    if (Session.get('otsKeysRemaining') < 50) {
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
  'change #hashFunction': () => {
    const selectedFunction = document.getElementById('hashFunction').value
    if (selectedFunction === 'SHA256') {
      additionalTextMaxLengthValue = 45
      document.getElementById('additional_text_max_length').innerHTML = '(Max Length: 45)'
    }
    initialiseFormValidation()
  },
})

Template.appNotariseStart.helpers({
  transferFrom() {
    const transferFrom = {}
    transferFrom.balance = Session.get('transferFromBalance')
    transferFrom.address = hexOrB32(Session.get('transferFromAddress'))
    return transferFrom
  },
  transactionConfirmation() {
    const confirmation = Session.get('transactionConfirmation')
    return confirmation
  },
  transactionConfirmationAmount() {
    const confirmationAmount = Session.get('transactionConfirmationAmount')
    return confirmationAmount
  },
  transactionConfirmationFee() {
    const transactionConfirmationFee = Session.get('transactionConfirmationFee')
    return transactionConfirmationFee
  },
  transactionGenerationError() {
    const error = Session.get('transactionGenerationError')
    return error
  },
  otsKeyEstimate() {
    const otsKeyEstimate = Session.get('otsKeyEstimate')
    return otsKeyEstimate
  },
  otsKeysRemaining() {
    const otsKeysRemaining = Session.get('otsKeysRemaining')
    return otsKeysRemaining
  },
  documentNotarisationError() {
    const documentNotarisationError = Session.get('documentNotarisationError')
    return documentNotarisationError
  },
  nodeExplorerUrl() {
    if ((Session.get('nodeExplorerUrl') === '') || (Session.get('nodeExplorerUrl') === null)) {
      return DEFAULT_NETWORKS[0].explorerUrl
    }
    return Session.get('nodeExplorerUrl')
  },
  ledgerWalletDisabled() {
    if (getXMSSDetails().walletType === 'ledger') {
      return 'disabled'
    }
    return ''
  },
  isLedgerWallet() {
    if (getXMSSDetails().walletType === 'ledger') {
      return true
    }
    return false
  },
})
