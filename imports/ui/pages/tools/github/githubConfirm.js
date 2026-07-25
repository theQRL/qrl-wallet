import { FlowRouter } from 'meteor/ostrio:flow-router-extra'
/* eslint no-console:0 */
/* global QRLLIB, XMSS_OBJECT, LocalStore, QrlLedger, isElectrified, selectedNetwork,loadAddressTransactions, getTokenBalances, updateBalanceField, refreshTransferPage */
/* global pkRawToB32Address, hexOrB32, rawToHexOrB32, anyAddressToRawAddress, stringToBytes, binaryToBytes, bytesToString, bytesToHex, hexToBytes, toBigendianUint64BytesUnsigned, numberToString, decimalToBinary */
/* global getMnemonicOfFirstAddress, getXMSSDetails, isWalletFileDeprecated, waitForQRLLIB, addressForAPI, binaryToQrlAddress, toUint8Vector, concatenateTypedArrays, getQrlProtoShasum */
/* global resetWalletStatus, passwordPolicyValid, countDecimals, supportedBrowser, wrapMeteorCall, getBalance, otsIndexUsed, ledgerHasNoTokenSupport, resetLocalStorageState, nodeReturnedValidResponse, advanceSeedOtsAfterRelayFailure */
/* global POLL_TXN_RATE, POLL_MAX_CHECKS, DEFAULT_NETWORKS, findNetworkData, SHOR_PER_QUANTA, WALLET_VERSION, QRLPROTO_SHA256,  */

import { isElectrified, createTransport, ledgerReturnedError } from '../../../../startup/client/functions'
import './githubConfirm.html'

let ledgerSignRequestInFlight = false
const LEDGER_APDU_OK = 0x9000

function decodeLedgerReturnCode(returnCode) {
  if (returnCode === null || returnCode === undefined || returnCode === '') {
    return 0
  }

  if (typeof returnCode === 'number') {
    return Number.isFinite(returnCode) ? returnCode : 0
  }

  if (typeof returnCode === 'string') {
    const trimmed = returnCode.trim()
    if (trimmed === '') {
      return 0
    }
    if (/^0x[0-9a-f]+$/i.test(trimmed)) {
      const parsedHex = parseInt(trimmed, 16)
      return Number.isFinite(parsedHex) ? parsedHex : 0
    }
    if (/^[0-9]+$/.test(trimmed)) {
      const parsed = parseInt(trimmed, 10)
      return Number.isFinite(parsed) ? parsed : 0
    }
    if (/^[0-9a-f]+$/i.test(trimmed)) {
      const parsedBareHex = parseInt(trimmed, 16)
      return Number.isFinite(parsedBareHex) ? parsedBareHex : 0
    }
    return 0
  }

  let byteValues = null
  if (returnCode instanceof Uint8Array) {
    byteValues = Array.from(returnCode)
  } else if (Array.isArray(returnCode)) {
    byteValues = returnCode
  } else if (returnCode && Array.isArray(returnCode.data)) {
    byteValues = returnCode.data
  } else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(returnCode)) {
    byteValues = Array.from(returnCode)
  }

  if (byteValues && byteValues.length > 0) {
    let code = 0
    for (let i = 0; i < byteValues.length; i += 1) {
      const byte = parseInt(byteValues[i], 10)
      if (!Number.isFinite(byte) || byte < 0 || byte > 255) {
        return 0
      }
      code = (code * 256) + byte
    }
    return code
  }

  return 0
}

function getLedgerResponseCode(response) {
  return decodeLedgerReturnCode(response && response.return_code)
}

function ledgerResponseSuccessful(response) {
  const responseCode = getLedgerResponseCode(response)
  return responseCode === 0 || responseCode === LEDGER_APDU_OK
}

function ledgerResponseTimedOut(response) {
  if (getLedgerResponseCode(response) === 14) {
    return true
  }
  const errorMessage = String((response && response.error_message) || '').toLowerCase()
  return errorMessage === 'timeout'
}

async function getLedgerCreateMessageTx(sourceAddr, fee, message, callback) {
  console.log('-- Getting QRL Ledger Nano App createMessageTx --')
  if (isElectrified()) {
    Meteor.call(
      'ledgerCreateMessageTx',
      sourceAddr,
      fee,
      message,
      (err, data) => {
        if (err) {
          callback(err, data)
          return
        }
        console.log('> Got Ledger Nano createMessageTx from USB')
        console.log(data)
        callback(null, data)
      }
    )
  } else {
    const QrlLedger = await createTransport()
    QrlLedger.createMessageTx(sourceAddr, fee, message).then(data => {
      console.log('> Got Ledger Nano createMessageTx from WebUSB')
      console.log(data)
      callback(null, data)
    }, err => {
      callback(err, null)
    }).catch(err => {
      callback(err, null)
    })
  }
}
async function getLedgerRetrieveSignature(request, callback) {
  console.log('-- Getting QRL Ledger Nano App Signature --')
  if (isElectrified()) {
    Meteor.call('ledgerRetrieveSignature', request, (err, data) => {
      if (err) {
        callback(err, data)
        return
      }
      console.log('> Got Ledger Nano retrieveSignature from USB')
      console.log(data)
      callback(null, data)
    })
  } else {
    const QrlLedger = await createTransport()
    QrlLedger.retrieveSignature(request).then(data => {
      console.log('> Got Ledger Nano retrieveSignature from WebUSB')
      console.log(data)
      callback(null, data)
    }, err => {
      callback(err, null)
    }).catch(err => {
      callback(err, null)
    })
  }
}

function confirmGithubCreation() {
  const tx = Session.get('messageCreationConfirmationResponse')

  if ((getXMSSDetails().walletType === 'seed') && (XMSS_OBJECT === null)) {
    // session ended before confirmation was completed: show as failure
    $('#messageCreationConfirmation').hide()
    $('#transactionFailed').show()
    Session.set('transactionFailed', 'Session ended before transaction was confirmed')
  }

  // Set OTS Key Index in XMSS object
  if (getXMSSDetails().walletType === 'seed') {
    XMSS_OBJECT.setIndex(parseInt(Session.get('messageCreationConfirmation').otsKey, 10))
  }

  // Concatenate Uint8Arrays
  const tmptxnhash = concatenateTypedArrays(
    Uint8Array,
    // tx.extended_transaction_unsigned.addr_from,
    toBigendianUint64BytesUnsigned(tx.extended_transaction_unsigned.tx.fee),
    tx.extended_transaction_unsigned.tx.message.message_hash // eslint-disable-line
  )

  // Convert Uint8Array to VectorUChar
  const hashableBytes = toUint8Vector(tmptxnhash)

  // Create sha256 sum of hashableBytes
  const shaSum = QRLLIB.sha2_256(hashableBytes)

  if (getXMSSDetails().walletType === 'seed') {
    // Show relaying message
    $('#relaying').show()

    // Sign the sha sum
    tx.extended_transaction_unsigned.tx.signature = binaryToBytes(XMSS_OBJECT.sign(shaSum))

    // Calculate transaction hash
    const txnHashConcat = concatenateTypedArrays(
      Uint8Array,
      binaryToBytes(shaSum),
      tx.extended_transaction_unsigned.tx.signature,
      hexToBytes(XMSS_OBJECT.getPK()) // eslint-disable-line
    )

    const txnHashableBytes = toUint8Vector(txnHashConcat)

    const txnHash = QRLLIB.bin2hstr(QRLLIB.sha2_256(txnHashableBytes))

    console.log('Txn Hash: ', txnHash)

    tx.network = selectedNetwork()

    wrapMeteorCall('confirmGithubCreation', tx, (err, res) => {
      if (err || !res || res.error) {
        $('#messageCreationConfirmation').hide()
        $('#transactionFailed').show()

        const errorMessage = (res && res.error)
          || (err && (err.reason || err.message))
          || 'Failed to relay transaction'
        Session.set('transactionFailed', errorMessage)
        advanceSeedOtsAfterRelayFailure('messageCreationConfirmation')
      } else {
        Session.set('transactionHash', txnHash)
        Session.set('transactionSignature', res.response.signature)
        Session.set('transactionRelayedThrough', res.relayed)

        // Send to result page.
        const params = { }
        const path = FlowRouter.path('/tools/github/result', params)
        FlowRouter.go(path)
      }
    })
  } else if (getXMSSDetails().walletType === 'ledger') {
    if (ledgerSignRequestInFlight) {
      return
    }
    ledgerSignRequestInFlight = true

    // Reset ledger sign modal view state
    $('#awaitingLedgerConfirmation').show()
    $('#signOnLedgerRejected').hide()
    $('#signOnLedgerTimeout').hide()
    $('#signOnLedgerError').hide()
    $('#ledgerHasConfirmed').hide()
    $('#relayLedgerTxnButton').hide()
    $('#noRemainingSignatures').hide()

    // Show ledger sign modal
    window.walletUi.showModal('#ledgerConfirmationModal', {
      closable: false,
      onDeny: () => {
        // Clear session state for transaction
        Session.set('ledgerTransaction', '')
        Session.set('ledgerTransactionHash', '')
        ledgerSignRequestInFlight = false
      },
      onApprove: () => {
        // Hide modal, and show relaying message
        window.walletUi.hideModal('#ledgerConfirmationModal')
        $('#relaying').show()

        // Relay the transaction
        wrapMeteorCall('confirmMessageCreation', Session.get('ledgerTransaction'), (err, res) => {
          if (err || !res || res.error) {
            $('#messageCreationConfirmation').hide()
            $('#transactionFailed').show()

            const errorMessage = (res && res.error)
              || (err && (err.reason || err.message))
              || 'Failed to relay transaction'
            Session.set('transactionFailed', errorMessage)
            ledgerSignRequestInFlight = false
          } else {
            Session.set('transactionHash', Session.get('ledgerTransactionHash'))
            Session.set('transactionSignature', res.response.signature)
            Session.set('transactionRelayedThrough', res.relayed)
            ledgerSignRequestInFlight = false

            // Send to result page.
            const params = { }
            const path = FlowRouter.path('/tools/github/result', params)
            FlowRouter.go(path)
          }
        })
      },
    })

    // Create a transaction
    const sourceAddr = hexToBytes(QRLLIB.getAddress(getXMSSDetails().pk))
    const fee = toBigendianUint64BytesUnsigned(tx.extended_transaction_unsigned.tx.fee, true)

    // eslint-disable-next-line max-len
    getLedgerCreateMessageTx(sourceAddr, fee, Buffer.from(tx.extended_transaction_unsigned.tx.message.message_hash), function (err, txn) {
      if (err || !txn) {
        $('#awaitingLedgerConfirmation').hide()
        $('#signOnLedgerError').show()
        ledgerSignRequestInFlight = false
        return
      }

      if (ledgerResponseTimedOut(txn)) {
        $('#awaitingLedgerConfirmation').hide()
        $('#signOnLedgerTimeout').show()
        ledgerSignRequestInFlight = false
        return
      }

      if (getLedgerResponseCode(txn) === 27014) {
        $('#awaitingLedgerConfirmation').hide()
        $('#signOnLedgerRejected').show()
        ledgerSignRequestInFlight = false
        return
      }

      if (!ledgerResponseSuccessful(txn)) {
        $('#awaitingLedgerConfirmation').hide()
        $('#signOnLedgerError').show()
        ledgerSignRequestInFlight = false
        return
      }

      getLedgerRetrieveSignature(txn, function (err, sigResponse) {
        // Hide the awaiting ledger confirmation spinner
        $('#awaitingLedgerConfirmation').hide()

        if (err || !sigResponse) {
          $('#signOnLedgerError').show()
          ledgerSignRequestInFlight = false
          return
        }

        // Check if ledger rejected transaction
        const sigResponseCode = getLedgerResponseCode(sigResponse)
        if (sigResponseCode === 27014) {
          $('#signOnLedgerRejected').show()
          // Show no signatures remaining message if there are none remaining.
          if (Session.get('transactionConfirmation').otsKey >= 256) {
            $('#noRemainingSignatures').show()
          }
          ledgerSignRequestInFlight = false
        // Check if the the request timed out waiting for response on ledger
        } else if (ledgerResponseTimedOut(sigResponse)) {
          $('#signOnLedgerTimeout').show()
          ledgerSignRequestInFlight = false
        // Check for unknown errors
        } else if ((sigResponseCode === 1) && (sigResponse.error_message == 'Unknown error code')) {
          $('#signOnLedgerError').show()
          ledgerSignRequestInFlight = false
        } else if (!ledgerResponseSuccessful(sigResponse)) {
          $('#signOnLedgerError').show()
          ledgerSignRequestInFlight = false
        } else {
          // Show confirmation message
          $('#ledgerHasConfirmed').show()

          tx.extended_transaction_unsigned.tx.signature = sigResponse.signature

          // Calculate transaction hash
          const txnHashConcat = concatenateTypedArrays(
            Uint8Array,
            binaryToBytes(shaSum),
            tx.extended_transaction_unsigned.tx.signature,
            hexToBytes(getXMSSDetails().pk) // eslint-disable-line
          )

          const txnHashableBytes = toUint8Vector(txnHashConcat)

          const txnHash = QRLLIB.bin2hstr(QRLLIB.sha2_256(txnHashableBytes))

          console.log('Txn Hash: ', txnHash)

          // Prepare gRPC call
          tx.network = selectedNetwork()

          // Set session values for later relaying
          Session.set('ledgerTransaction', tx)
          Session.set('ledgerTransactionHash', txnHash)

          // Show relay button
          $('#relayLedgerTxnButton').show()
        }
      })
    })
  }
}

function cancelTransaction() {
  ledgerSignRequestInFlight = false
  Session.set('messageCreationConfirmation', '')
  Session.set('messageCreationConfirmationResponse', '')

  Session.set('transactionFailed', 'User requested cancellation')

  $('#messageCreationConfirmation').hide()
  $('#transactionFailed').show()
}

Template.appGithubConfirm.onRendered(() => {
  ledgerSignRequestInFlight = false
  window.walletUi.initDropdowns('select')
})

Template.appGithubConfirm.events({
  'click #confirmMessage': () => {
    if (ledgerSignRequestInFlight) {
      return
    }
    $('#signOnLedgerRejected').hide()
    $('#signOnLedgerTimeout').hide()
    setTimeout(() => { confirmGithubCreation() }, 200)
  },
  'click #cancelMessage': () => {
    cancelTransaction()
  },
})

Template.appGithubConfirm.helpers({
  transferFrom() {
    const transferFrom = {}
    transferFrom.balance = Session.get('transferFromBalance')
    transferFrom.address = hexOrB32(Session.get('transferFromAddress'))
    return transferFrom
  },
  messageCreationConfirmation() {
    const confirmation = Session.get('messageCreationConfirmation')
    return confirmation
  },
  transactionFailed() {
    const failed = Session.get('transactionFailed')
    return failed
  },
  nodeExplorerUrl() {
    if ((Session.get('nodeExplorerUrl') === '') || (Session.get('nodeExplorerUrl') === null)) {
      return DEFAULT_NETWORKS[0].explorerUrl
    }
    return Session.get('nodeExplorerUrl')
  },
  githubOperation() {
    const githubOperation = Session.get('githubOperation')
    if (githubOperation.addorremove === 'AA') { githubOperation.addorremove = 'ADD' }
    if (githubOperation.addorremove === 'AF') { githubOperation.addorremove = 'REMOVE' }
    return githubOperation
  },
  isSeedWallet() {
    if (getXMSSDetails().walletType === 'seed') {
      return true
    }
    return false
  },
  isLedgerWallet() {
    if (getXMSSDetails().walletType === 'ledger') {
      return true
    }
    return false
  },
  ledgerVerificationMessage() {
    const message = Session.get('messageCreationConfirmation').message_hex
    return message
  },
})
