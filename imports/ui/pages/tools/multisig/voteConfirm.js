/* eslint no-console:0 */
/* global QRLLIB, XMSS_OBJECT, LocalStore, QrlLedger, isElectrified, selectedNetwork,loadAddressTransactions, getTokenBalances, updateBalanceField, refreshTransferPage */
/* global pkRawToB32Address, hexOrB32, rawToHexOrB32, anyAddressToRawAddress, stringToBytes, binaryToBytes, bytesToString, bytesToHex, hexToBytes, toBigendianUint64BytesUnsigned, numberToString, decimalToBinary */
/* global getMnemonicOfFirstAddress, getXMSSDetails, isWalletFileDeprecated, waitForQRLLIB, addressForAPI, binaryToQrlAddress, toUint8Vector, concatenateTypedArrays, getQrlProtoShasum */
/* global resetWalletStatus, passwordPolicyValid, countDecimals, supportedBrowser, wrapMeteorCall, getBalance, otsIndexUsed, ledgerHasNoTokenSupport, resetLocalStorageState, nodeReturnedValidResponse */
/* global POLL_TXN_RATE, POLL_MAX_CHECKS, DEFAULT_NETWORKS, findNetworkData, SHOR_PER_QUANTA, WALLET_VERSION, QRLPROTO_SHA256,  */

import './voteConfirm.html'
import helpers from '@theqrl/explorer-helpers'

function confirmMultisigVote() {
  const tx = Session.get('multisigVoteConfirmationResponse')

  // Set OTS Key Index in XMSS object
  XMSS_OBJECT.setIndex(parseInt(Session.get('multisigVoteConfirmation').otsKey, 10))

  // Concatenate Uint8Arrays
  let tmptxnhash = concatenateTypedArrays(
    Uint8Array,
    // tx.extended_transaction_unsigned.addr_from,
    toBigendianUint64BytesUnsigned(tx.extended_transaction_unsigned.tx.fee),
    tx.extended_transaction_unsigned.tx.multi_sig_vote.shared_key,
    toBigendianUint64BytesUnsigned(tx.extended_transaction_unsigned.tx.multi_sig_vote.unvote) // eslint-disable-line
  )

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

  wrapMeteorCall('confirmMultisigVote', tx, (err, res) => {
    if (res.error) {
      $('#multisigVoteConfirmation').hide()
      $('#transactionFailed').show()

      Session.set('transactionFailed', res.error)
    } else {
      Session.set('transactionHash', txnHash)
      Session.set('transactionSignature', res.response.signature)
      Session.set('transactionRelayedThrough', res.relayed)

      // Send to result page.
      const params = { }
      const path = FlowRouter.path('/tools/multisig/vote-result', params)
      FlowRouter.go(path)
    }
  })
}

function cancelTransaction() {
  Session.set('multisigVoteConfirmation', '')
  Session.set('multisigVoteConfirmationResponse', '')

  Session.set('transactionFailed', 'User requested cancellation')

  $('#multisigVoteConfirmation').hide()
  $('#transactionFailed').show()
}

Template.appMultisigVoteConfirm.onRendered(() => {
  $('.ui.dropdown').dropdown()
})

Template.appMultisigVoteConfirm.events({
  'click #confirmMultisigVote': () => {
    $('#relaying').show()
    setTimeout(() => { confirmMultisigVote() }, 200)
  },
  'click #cancelMultisigVote': () => {
    cancelTransaction()
  },
})

Template.appMultisigVoteConfirm.helpers({
  bech32() {
    if (LocalStore.get('addressFormat') === 'bech32') {
      return true
    }
    return false
  },
  multisigVoteConfirmation() {
    const confirmation = Session.get('multisigVoteConfirmation')
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
})
