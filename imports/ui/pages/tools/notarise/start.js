import { FlowRouter } from 'meteor/ostrio:flow-router-extra'
/* eslint no-console:0 */

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
      window.walletUi.showModal('#ledgerOtsKeyReuseDetected')
    } else {
      window.walletUi.showModal('#otsKeyReuseDetected')
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
        window.walletUi.showModal('#invalidNodeResponse')
      }
    }
  })
}

// Bytes of the document read and hashed per step. The whole file is never
// held in memory, so documents of any size can be notarised.
const HASH_CHUNK_SIZE = 4 * 1024 * 1024

// SHA256 a File/Blob incrementally, calling back with (error, hexDigest).
// onProgress, if given, is called with the whole-number percentage hashed so far.
function sha256File(file, callback, onProgress) {
  const hasher = CryptoJS.algo.SHA256.create()
  const reader = new FileReader()
  let offset = 0

  const readNextChunk = () => {
    reader.readAsArrayBuffer(file.slice(offset, offset + HASH_CHUNK_SIZE))
  }

  reader.onerror = () => {
    callback(reader.error || new Error('the file could not be read'))
  }
  reader.onload = () => {
    try {
      hasher.update(CryptoJS.lib.WordArray.create(reader.result))
      offset += reader.result.byteLength
      if (offset < file.size && reader.result.byteLength === 0) {
        // File shrank or became unreadable mid-way; avoid looping forever
        callback(new Error('the file changed while it was being read'))
      } else if (offset < file.size) {
        if (onProgress) {
          onProgress(Math.floor((offset / file.size) * 100))
        }
        readNextChunk()
      } else {
        callback(null, hasher.finalize().toString(CryptoJS.enc.Hex))
      }
    } catch (err) {
      callback(err)
    }
  }

  readNextChunk()
}

function notariseDocument() {
  $('#documentNotarisationFailed').hide()

  const notaryDocuments = $('#notaryDocument').prop('files')
  const notaryDocument = notaryDocuments[0]
  const hashFunction = document.getElementById('hashFunction').value
  const additionalTextInput = document.getElementById('additional_text')
  const additionalText = additionalTextInput ? additionalTextInput.value : ''

  const showError = (message) => {
    Session.set('documentNotarisationError', message)
    $('#documentNotarisationFailed').show()
    $('#generating').hide()
  }

  const onHashed = (sha256Hex) => {
    try {
      let notarisation = 'AFAFA'
      let fileHash

      if (hashFunction === 'SHA256') {
        fileHash = sha256Hex
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
      showError('Unable to notarise Document - ' + ((err && err.message) || 'unknown error'))
    }
  }

  // Verify user selected a document to notarise
  if (notaryDocument === undefined) {
    showError('Unable to open Document - Are you sure you selected a document to notarise?')
  } else {
    console.log('reading file ', notaryDocument)
    const progress = document.getElementById('notariseProgress')
    const setProgress = (text) => {
      if (progress) {
        progress.textContent = text
      }
    }
    setProgress('')
    sha256File(notaryDocument, (err, sha256Hex) => {
      setProgress('')
      if (err) {
        console.log(err)
        showError('Unable to read Document - ' + ((err && err.message) || 'the file could not be read'))
        return
      }
      onHashed(sha256Hex)
    }, (percent) => {
      setProgress(percent + '% hashed')
    })
  }
}

// Function to initialise form validation
function initialiseFormValidation() {
  const validationRules = {}

  if (getXMSSDetails().walletType !== 'ledger') {
    validationRules['additional_text'] = {
      id: 'additional_text',
      rules: [
        {
          type: 'maxLength[' + additionalTextMaxLengthValue + ']',
          prompt: 'The max length of the additional message is ' + additionalTextMaxLengthValue + ' bytes.',
        },
      ],
    }
  }

  // Now set fee and otskey validation rules
  validationRules['fee'] = {
    id: 'fee',
    rules: feeValidationRules(),
  }
  validationRules['otsKey'] = {
    id: 'otsKey',
    rules: otsKeyValidationRules(),
  }

  // Initliase the form validation
  window.walletUi.bindFormValidation('form', {
    fields: validationRules,
  })
}

Template.appNotariseStart.onRendered(() => {
  // Initialise dropdowns
  window.walletUi.initDropdowns('select')

  // Initialise Form Validation
  initialiseFormValidation()

  // Get wallet balance
  getBalance(getXMSSDetails().address, function () {
    // Show warning is otsKeysRemaining is low
    if (Session.get('otsKeysRemaining') < 50) {
      // Shown low OTS Key warning modal
      window.walletUi.showModal('#lowOtsKeyWarning')
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
      const additionalTextMaxLength = document.getElementById('additional_text_max_length')
      if (additionalTextMaxLength) {
        additionalTextMaxLength.innerHTML = '(Max Length: 45)'
      }
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
