/* eslint no-console:0 */
/* global QRLLIB, XMSS_OBJECT, LocalStore, QrlLedger, isElectrified, selectedNetwork,loadAddressTransactions, getTokenBalances, updateBalanceField, refreshTransferPage */
/* global pkRawToB32Address, hexOrB32, rawToHexOrB32, anyAddressToRawAddress, stringToBytes, binaryToBytes, bytesToString, bytesToHex, hexToBytes, toBigendianUint64BytesUnsigned, numberToString, decimalToBinary */
/* global getMnemonicOfFirstAddress, getXMSSDetails, isWalletFileDeprecated, waitForQRLLIB, addressForAPI, binaryToQrlAddress, toUint8Vector, concatenateTypedArrays, getQrlProtoShasum */
/* global resetWalletStatus, passwordPolicyValid, countDecimals, supportedBrowser, wrapMeteorCall, getBalance, otsIndexUsed, ledgerHasNoTokenSupport, resetLocalStorageState, nodeReturnedValidResponse */
/* global POLL_TXN_RATE, POLL_MAX_CHECKS, DEFAULT_NETWORKS, findNetworkData, SHOR_PER_QUANTA, WALLET_VERSION, QRLPROTO_SHA256,  */

import './spendConfirm.html'
import helpers from '@theqrl/explorer-helpers'

function confirmMultisigSpend() {
  const tx = Session.get('multisigSpendConfirmationResponse')

  // Set OTS Key Index in XMSS object
  XMSS_OBJECT.setIndex(parseInt(Session.get('multisigSpendConfirmation').otsKey, 10))

  // Concatenate Uint8Arrays
  let tmptxnhash = concatenateTypedArrays(
    Uint8Array,
    // tx.extended_transaction_unsigned.addr_from,
    toBigendianUint64BytesUnsigned(tx.extended_transaction_unsigned.tx.fee),
    tx.extended_transaction_unsigned.tx.multi_sig_spend.multi_sig_address // eslint-disable-line
  )

  // Now append signatories and weights to tmptxnhash
  const recipientsRaw = tx.extended_transaction_unsigned.tx.multi_sig_spend.addrs_to
  const amountsRaw = tx.extended_transaction_unsigned.tx.multi_sig_spend.amounts
  for (let i = 0; i < recipientsRaw.length; i += 1) {
    // Add recipient
    tmptxnhash = concatenateTypedArrays(
      Uint8Array,
      tmptxnhash,
      recipientsRaw[i] // eslint-disable-line
    )

    // Add amount
    tmptxnhash = concatenateTypedArrays(
      Uint8Array,
      tmptxnhash,
      toBigendianUint64BytesUnsigned(amountsRaw[i]) // eslint-disable-line
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

  wrapMeteorCall('confirmMultisigSpend', tx, (err, res) => {
    if (res.error) {
      $('#multisigSpendConfirmation').hide()
      $('#transactionFailed').show()

      Session.set('transactionFailed', res.error)
    } else {
      Session.set('transactionHash', txnHash)
      Session.set('transactionSignature', res.response.signature)
      Session.set('transactionRelayedThrough', res.relayed)

      // Send to result page.
      const params = { }
      const path = FlowRouter.path('/tools/multisig/spend-result', params)
      FlowRouter.go(path)
    }
  })
}

function cancelTransaction() {
  Session.set('multisigSpendConfirmation', '')
  Session.set('multisigSpendConfirmationResponse', '')

  Session.set('transactionFailed', 'User requested cancellation')

  $('#multisigSpendConfirmation').hide()
  $('#transactionFailed').show()
}

Template.appMultisigSpendConfirm.onRendered(() => {
  $('.ui.dropdown').dropdown()
})

Template.appMultisigSpendConfirm.events({
  'click #confirmMultisigSpend': () => {
    $('#relaying').show()
    setTimeout(() => { confirmMultisigSpend() }, 200)
  },
  'click #cancelMultisig': () => {
    cancelTransaction()
  },
})

Template.appMultisigSpendConfirm.helpers({
  bech32() {
    if (LocalStore.get('addressFormat') === 'bech32') {
      return true
    }
    return false
  },
  multisigSpendConfirmation() {
    const confirmation = Session.get('multisigSpendConfirmation')
    return confirmation
  },
  multisigSpendAddress() {
    const confirmation = Session.get('multisigSpendConfirmation')
    return confirmation
  },
  transactionFailed() {
    const failed = Session.get('transactionFailed')
    return failed
  },
  multiSigAddress() {
    const address = binaryToQrlAddress(Session.get('multisigSpendConfirmation').multi_sig_address)
    return address
  },
  recipients() {
    const recipients = Session.get('multisigSpendConfirmation').addrs_to
    const amounts = Session.get('multisigSpendConfirmation').amounts
    
    const all = []

    for (let i = 0; i < recipients.length; i += 1) {
      const thisRecipient = {
        address_hex: helpers.rawAddressToHexAddress(recipients[i]),
        address_b32: helpers.rawAddressToB32Address(recipients[i]),
        amount: amounts[i] // eslint-disable-line
      }
      all.push(thisRecipient)
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
