/* eslint no-console:0 */
/* global QRLLIB, XMSS_OBJECT, LocalStore, QrlLedger, isElectrified, selectedNetwork,loadAddressTransactions, getTokenBalances, updateBalanceField, refreshTransferPage */
/* global pkRawToB32Address, hexOrB32, rawToHexOrB32, anyAddressToRawAddress, stringToBytes, binaryToBytes, bytesToString, bytesToHex, hexToBytes, toBigendianUint64BytesUnsigned, numberToString, decimalToBinary */
/* global getMnemonicOfFirstAddress, getXMSSDetails, isWalletFileDeprecated, waitForQRLLIB, addressForAPI, binaryToQrlAddress, toUint8Vector, concatenateTypedArrays, getQrlProtoShasum */
/* global resetWalletStatus, passwordPolicyValid, countDecimals, supportedBrowser, wrapMeteorCall, getBalance, otsIndexUsed, ledgerHasNoTokenSupport, resetLocalStorageState, nodeReturnedValidResponse */
/* global POLL_TXN_RATE, POLL_MAX_CHECKS, DEFAULT_NETWORKS, findNetworkData, SHOR_PER_QUANTA, WALLET_VERSION, QRLPROTO_SHA256, LEDGER_TIMEOUT,  */

import async from 'async'
import './messageConfirm.html'

function getLedgerCreateMessageTx(sourceAddr, fee, message, callback) {
  console.log('-- Getting QRL Ledger Nano App createMessageTx --')
  if (isElectrified()) {
    Meteor.call('ledgerCreateMessageTx', sourceAddr, fee, message, (err, data) => {
      console.log('> Got Ledger Nano createMessageTx from USB')
      console.log(data)
      callback(null, data)
    })
  } else {
    QrlLedger.createMessageTx(sourceAddr, fee, message).then(data => {
      console.log('> Got Ledger Nano createMessageTx from U2F')
      console.log(data)
      callback(null, data)
    })
  }
}
function getLedgerRetrieveSignature(request, callback) {
  console.log('-- Getting QRL Ledger Nano App Signature --')
  if (isElectrified()) {
    Meteor.call('ledgerRetrieveSignature', request, (err, data) => {
      console.log('> Got Ledger Nano retrieveSignature from USB')
      console.log(data)
      callback(null, data)
    })
  } else {
    QrlLedger.retrieveSignature(request).then(data => {
      console.log('> Got Ledger Nano retrieveSignature from U2F')
      console.log(data)
      callback(null, data)
    })
  }
}

// Wrap ledger calls in async.timeout
const getLedgerCreateMessageTxWrapper = async.timeout(getLedgerCreateMessageTx, LEDGER_TIMEOUT)
const getLedgerRetrieveSignatureWrapper = async.timeout(getLedgerRetrieveSignature, LEDGER_TIMEOUT)

function confirmMessageCreation() {
  const tx = Session.get('messageCreationConfirmationResponse')

  // Set OTS Key Index for seed wallets
  if (getXMSSDetails().walletType === 'seed') {
    XMSS_OBJECT.setIndex(parseInt(Session.get('messageCreationConfirmation').otsKey, 10))
  }

  // Concatenate Uint8Arrays
  const tmptxnhash = concatenateTypedArrays(
    Uint8Array,
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

    wrapMeteorCall('confirmMessageCreation', tx, (err, res) => {
      if (res.error) {
        $('#messageCreationConfirmation').hide()
        $('#transactionFailed').show()

        Session.set('transactionFailed', res.error)
      } else {
        Session.set('transactionHash', txnHash)
        Session.set('transactionSignature', res.response.signature)
        Session.set('transactionRelayedThrough', res.relayed)

        // Send to result page.
        const params = { }
        const path = FlowRouter.path('/tools/message/result', params)
        FlowRouter.go(path)
      }
    })
  } else if (getXMSSDetails().walletType === 'ledger') {
    // Reset ledger sign modal view state
    $('#awaitingLedgerConfirmation').show()
    $('#signOnLedgerRejected').hide()
    $('#signOnLedgerTimeout').hide()
    $('#ledgerHasConfirmed').hide()
    $('#relayLedgerTxnButton').hide()
    $('#noRemainingSignatures').hide()

    // Show ledger sign modal
    $('#ledgerConfirmationModal').modal({
      closable: false,
      onDeny: () => {
        // Clear session state for transaction
        Session.set('ledgerTransaction', '')
        Session.set('ledgerTransactionHash', '')
      },
      onApprove: () => {
        // Hide modal, and show relaying message
        $('#ledgerConfirmationModal').modal('hide')
        $('#relaying').show()

        // Relay the transaction
        wrapMeteorCall('confirmMessageCreation', Session.get('ledgerTransaction'), (err, res) => {
          if (res.error) {
            $('#messageCreationConfirmation').hide()
            $('#transactionFailed').show()

            Session.set('transactionFailed', res.error)
          } else {
            Session.set('transactionHash', Session.get('ledgerTransactionHash'))
            Session.set('transactionSignature', res.response.signature)
            Session.set('transactionRelayedThrough', res.relayed)

            // Send to result page.
            const params = { }
            const path = FlowRouter.path('/tools/message/result', params)
            FlowRouter.go(path)
          }
        })
      },
    }).modal('show')

    // Create a transaction
    const sourceAddr = hexToBytes(QRLLIB.getAddress(getXMSSDetails().pk))
    const fee = toBigendianUint64BytesUnsigned(tx.extended_transaction_unsigned.tx.fee, true)

    // eslint-disable-next-line max-len
    getLedgerCreateMessageTxWrapper(sourceAddr, fee, Buffer.from(tx.extended_transaction_unsigned.tx.message.message_hash), function (err, txn) {
      getLedgerRetrieveSignatureWrapper(txn, function (err, sigResponse) {

        // Hide the awaiting ledger confirmation spinner
        $('#awaitingLedgerConfirmation').hide()

        // Check if ledger rejected transaction
        if (sigResponse.return_code === 27014) {
          $('#signOnLedgerRejected').show()
          // Show no signatures remaining message if there are none remaining.
          if (Session.get('transactionConfirmation').otsKey >= 256) {
            $('#noRemainingSignatures').show()
          }
        // Check if the the request timed out waiting for response on ledger
        } else if (sigResponse.return_code === 14) {
          $('#signOnLedgerTimeout').show()
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
  Session.set('messageCreationConfirmation', '')
  Session.set('messageCreationConfirmationResponse', '')

  Session.set('transactionFailed', 'User requested cancellation')

  $('#messageCreationConfirmation').hide()
  $('#transactionFailed').show()
}

Template.appMessageConfirm.onRendered(() => {
  $('.ui.dropdown').dropdown()
})

Template.appMessageConfirm.events({
  'click #confirmMessage': () => {
    setTimeout(() => { confirmMessageCreation() }, 200)
  },
  'click #cancelMessage': () => {
    cancelTransaction()
  },
})

Template.appMessageConfirm.helpers({
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
  isSeedWallet() {
    if (getXMSSDetails().walletType == 'seed') {
      return true
    }
    return false
  },
  isLedgerWallet() {
    if (getXMSSDetails().walletType == 'ledger') {
      return true
    }
    return false
  },
  ledgerVerificationMessage() {
    const message = Session.get('messageCreationConfirmation').message // eslint-disable-line
    const hexMessage = new Buffer(message).toString('hex') // eslint-disable-line
    return hexMessage
  },
})
