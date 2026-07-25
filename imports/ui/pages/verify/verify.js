import { FlowRouter } from 'meteor/ostrio:flow-router-extra'
/* eslint no-console:0 */
/* global QRLLIB, XMSS_OBJECT, LocalStore, QrlLedger, isElectrified, selectedNetwork,loadAddressTransactions, getTokenBalances, updateBalanceField, refreshTransferPage */
/* global pkRawToB32Address, hexOrB32, rawToHexOrB32, anyAddressToRawAddress, stringToBytes, binaryToBytes, bytesToString, bytesToHex, hexToBytes, toBigendianUint64BytesUnsigned, numberToString, decimalToBinary */
/* global getMnemonicOfFirstAddress, getXMSSDetails, isWalletFileDeprecated, waitForQRLLIB, addressForAPI, binaryToQrlAddress, toUint8Vector, concatenateTypedArrays, getQrlProtoShasum */
/* global resetWalletStatus, passwordPolicyValid, countDecimals, supportedBrowser, wrapMeteorCall, getBalance, otsIndexUsed, ledgerHasNoTokenSupport, resetLocalStorageState, nodeReturnedValidResponse */
/* global POLL_TXN_RATE, POLL_MAX_CHECKS, DEFAULT_NETWORKS, findNetworkData, SHOR_PER_QUANTA, WALLET_VERSION, QRLPROTO_SHA256,  */

import './verify.html'

const VERIFY_TRANSACTION_ROUTE = 'App.verifytxid'
const VERIFY_TX_INPUT_ERROR_KEY = 'verifyTxInputError'
const TX_ID_HEX_REGEX = /^[a-f0-9]{64}$/i

function goToVerifyTransaction(rawTxId) {
  const txId = (rawTxId || '').trim()
  if (!txId) {
    return
  }

  FlowRouter.go(VERIFY_TRANSACTION_ROUTE, { txId })
}

Template.appVerify.onCreated(() => {
  Session.set(VERIFY_TX_INPUT_ERROR_KEY, null)
})

Template.appVerify.helpers({
  verifyInputError() {
    return Session.get(VERIFY_TX_INPUT_ERROR_KEY)
  },
})

Template.appVerify.events({
  'submit #verifyTransactionForm': (event, templateInstance) => {
    event.preventDefault()
    const txIdInput = templateInstance.find('#transactionId')
    const txId = (txIdInput && txIdInput.value ? txIdInput.value : '').trim()

    if (!txId) {
      Session.set(VERIFY_TX_INPUT_ERROR_KEY, 'Enter a transaction ID to verify.')
      return
    }

    if (!TX_ID_HEX_REGEX.test(txId)) {
      Session.set(VERIFY_TX_INPUT_ERROR_KEY, 'Transaction ID must be a 64-character hexadecimal hash.')
      return
    }

    Session.set(VERIFY_TX_INPUT_ERROR_KEY, null)
    goToVerifyTransaction(txId)
  },
  'input #transactionId': () => {
    if (Session.get(VERIFY_TX_INPUT_ERROR_KEY)) {
      Session.set(VERIFY_TX_INPUT_ERROR_KEY, null)
    }
  },
})
