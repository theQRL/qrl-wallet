import { FlowRouter } from 'meteor/ostrio:flow-router-extra'
/* eslint no-console:0 */

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
