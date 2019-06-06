/* eslint no-console:0 */
/* global QRLLIB, XMSS_OBJECT, LocalStore, QrlLedger, isElectrified, selectedNetwork,loadAddressTransactions, getTokenBalances, updateBalanceField, refreshTransferPage */
/* global pkRawToB32Address, hexOrB32, rawToHexOrB32, anyAddressToRawAddress, stringToBytes, binaryToBytes, bytesToString, bytesToHex, hexToBytes, toBigendianUint64BytesUnsigned, numberToString, decimalToBinary */
/* global getMnemonicOfFirstAddress, getXMSSDetails, isWalletFileDeprecated, waitForQRLLIB, addressForAPI, binaryToQrlAddress, toUint8Vector, concatenateTypedArrays, getQrlProtoShasum */
/* global resetWalletStatus, passwordPolicyValid, countDecimals, supportedBrowser, wrapMeteorCall, getBalance, otsIndexUsed, ledgerHasNoTokenSupport, resetLocalStorageState, nodeReturnedValidResponse */
/* global POLL_TXN_RATE, POLL_MAX_CHECKS, DEFAULT_NETWORKS, findNetworkData, SHOR_PER_QUANTA, WALLET_VERSION, QRLPROTO_SHA256,  */

import './createConfirm.html'
import helpers from '@theqrl/explorer-helpers'

function confirmMultisigCreation() {
  const tx = Session.get('multisigCreationConfirmationResponse')

  // Set OTS Key Index in XMSS object
  XMSS_OBJECT.setIndex(parseInt(Session.get('multisigCreationConfirmation').otsKey, 10))

  // Concatenate Uint8Arrays
  let tmptxnhash = concatenateTypedArrays(
    Uint8Array,
    // tx.extended_transaction_unsigned.addr_from,
    toBigendianUint64BytesUnsigned(tx.extended_transaction_unsigned.tx.fee),
    toBigendianUint64BytesUnsigned(tx.extended_transaction_unsigned.tx.multi_sig_create.threshold) // eslint-disable-line
  )

  // Now append signatories and weights to tmptxnhash
  const signatoriesRaw = tx.extended_transaction_unsigned.tx.multi_sig_create.signatories
  const weightsRaw = tx.extended_transaction_unsigned.tx.multi_sig_create.weights
  for (let i = 0; i < signatoriesRaw.length; i += 1) {
    // Add signatory
    tmptxnhash = concatenateTypedArrays(
      Uint8Array,
      tmptxnhash,
      signatoriesRaw[i] // eslint-disable-line
    )

    // Add weight
    tmptxnhash = concatenateTypedArrays(
      Uint8Array,
      tmptxnhash,
      toBigendianUint64BytesUnsigned(weightsRaw[i]) // eslint-disable-line
    )
  }

  // Convert Uint8Array to VectorUChar
  const hashableBytes = toUint8Vector(tmptxnhash)

  // Create sha256 sum of hashableBytes
  const shaSum = QRLLIB.sha2_256(hashableBytes)

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

  wrapMeteorCall('confirmMultisigCreation', tx, (err, res) => {
    if (res.error) {
      $('#multisigCreationConfirmation').hide()
      $('#transactionFailed').show()

      Session.set('transactionFailed', res.error)
    } else {
      Session.set('transactionHash', txnHash)
      Session.set('transactionSignature', res.response.signature)
      Session.set('transactionRelayedThrough', res.relayed)

      // Send to result page.
      const params = { }
      const path = FlowRouter.path('/tools/multisig/result', params)
      FlowRouter.go(path)
    }
  })
}

function cancelTransaction() {
  Session.set('multisigCreationConfirmation', '')
  Session.set('multisigCreationConfirmationResponse', '')

  Session.set('transactionFailed', 'User requested cancellation')

  $('#multisigCreationConfirmation').hide()
  $('#transactionFailed').show()
}

Template.appMultisigCreationConfirm.onRendered(() => {
  $('.ui.dropdown').dropdown()
})

Template.appMultisigCreationConfirm.events({
  'click #confirmMultisig': () => {
    $('#relaying').show()
    setTimeout(() => { confirmMultisigCreation() }, 200)
  },
  'click #cancelMultisig': () => {
    cancelTransaction()
  },
})

Template.appMultisigCreationConfirm.helpers({
  bech32() {
    if (LocalStore.get('addressFormat') === 'bech32') {
      return true
    }
    return false
  },
  multisigCreationConfirmation() {
    const confirmation = Session.get('multisigCreationConfirmation')
    return confirmation
  },
  transactionFailed() {
    const failed = Session.get('transactionFailed')
    return failed
  },
  signatories() {
    const signatories = Session.get('multisigCreationConfirmation').signatories
    const weights = Session.get('multisigCreationConfirmation').weights
    
    const all = []

    for (let i = 0; i < signatories.length; i += 1) {
      const thisHolder = {
        address_hex: helpers.rawAddressToHexAddress(signatories[i]),
        address_b32: helpers.rawAddressToB32Address(signatories[i]),
        weight: weights[i] // eslint-disable-line
      }
      all.push(thisHolder)
    }

    return all
  },
  nodeExplorerUrl() {
    if ((Session.get('nodeExplorerUrl') === '') || (Session.get('nodeExplorerUrl') === null)) {
      return DEFAULT_NETWORKS[0].explorerUrl
    }
    return Session.get('nodeExplorerUrl')
  },
})
