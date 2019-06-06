/* eslint no-console:0 */
/* global QRLLIB, XMSS_OBJECT, LocalStore, QrlLedger, isElectrified, selectedNetwork,loadAddressTransactions, getTokenBalances, updateBalanceField, refreshTransferPage */
/* global pkRawToB32Address, hexOrB32, rawToHexOrB32, anyAddressToRawAddress, stringToBytes, binaryToBytes, bytesToString, bytesToHex, hexToBytes, toBigendianUint64BytesUnsigned, numberToString, decimalToBinary */
/* global getMnemonicOfFirstAddress, getXMSSDetails, isWalletFileDeprecated, waitForQRLLIB, addressForAPI, binaryToQrlAddress, toUint8Vector, concatenateTypedArrays, getQrlProtoShasum */
/* global resetWalletStatus, passwordPolicyValid, countDecimals, supportedBrowser, wrapMeteorCall, getBalance, otsIndexUsed, ledgerHasNoTokenSupport, resetLocalStorageState, nodeReturnedValidResponse */
/* global POLL_TXN_RATE, POLL_MAX_CHECKS, DEFAULT_NETWORKS, findNetworkData, SHOR_PER_QUANTA, WALLET_VERSION, QRLPROTO_SHA256,  */

import './vote.html'
import { BigNumber } from 'bignumber.js'
import helpers from '@theqrl/explorer-helpers'

function getBaseLog(x, y) {
  return Math.log(y) / Math.log(x)
}

function createMultisigVoteTxn() {
  // Get to/amount details
  const sharedKey = hexToBytes(document.getElementById('sharedKey').value)
  const userVote = document.getElementById('userVote').value
  const txnFee = document.getElementById('fee').value
  const otsKey = document.getElementById('otsKey').value

  // Fail if OTS Key reuse is detected
  if (otsIndexUsed(Session.get('otsBitfield'), otsKey)) {
    $('#generating').hide()
    $('#otsKeyReuseDetected').modal('show')
    return
  }

  let unvote
  if (userVote == 'approve') {
    unvote = false
  } else if (userVote == 'deny') {
    unvote = true
  }

  // Convert strings to bytes
  const pubKey = hexToBytes(XMSS_OBJECT.getPK())

  // Calculate txn fee
  const convertFeeToBigNumber = new BigNumber(txnFee)
  const thisTxnFee = convertFeeToBigNumber.times(SHOR_PER_QUANTA).toNumber()

  // Construct request
  const request = {
    shared_key: sharedKey,
    unvote: unvote, // eslint-disable-line
    fee: thisTxnFee,
    xmssPk: pubKey,
    network: selectedNetwork(),
  }

  wrapMeteorCall('createMultisigVoteTxn', request, (err, res) => {
    if (err) {
      Session.set('multisigVoteError', err.reason)
      $('#multisigVoteFailed').show()
      $('#multisigVoteForm').hide()
    } else {

      console.log(res)
      
      const confirmation = {
        hash: res.txnHash,
        fee: res.response.extended_transaction_unsigned.tx.fee / SHOR_PER_QUANTA,
        shared_key: res.response.extended_transaction_unsigned.tx.multi_sig_vote.shared_key,
        unvote: res.response.extended_transaction_unsigned.tx.multi_sig_vote.unvote,
        otsKey: otsKey, // eslint-disable-line
      }

      //if (nodeReturnedValidResponse(request, confirmation, 'createTokenTxn')) {
        Session.set('multisigVoteConfirmation', confirmation)
        Session.set('multisigVoteConfirmationResponse', res.response)

        // Send to confirm page.
        const params = { }
        const path = FlowRouter.path('/tools/multisig/vote-confirm', params)
        FlowRouter.go(path)
      //} else {
      //  // Hide generating component
      //  $('#generating').hide()
      //  // Show warning modal
      //  $('#invalidNodeResponse').modal('show')
      //}

    }
  })
}

// Function to initialise form validation
function initialiseFormValidation() {
  const validationRules = {}

  validationRules['sharedKey'] = {
    id: 'sharedKey',
    rules: [
      {
        type: 'empty',
        prompt: 'You must enter a multisig shared key',
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
      {
        type: 'maxDecimals',
        prompt: 'You can only enter up to 9 decimal places in the fee field',
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

  // Max of 9 decimals
  $.fn.form.settings.rules.maxDecimals = function (value) {
    return (countDecimals(value) <= 9)
  }

  // Initliase the form validation
  $('.ui.form').form({
    fields: validationRules,
  })
}

Template.appMultisigVote.onRendered(() => {
  // Ledger Nano not supported here
  ledgerHasNoTokenSupport()

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

Template.appMultisigVote.events({
  'submit #generateMultisigVoteForm': (event) => {
    event.preventDefault()
    event.stopPropagation()
    $('#generating').show()

    setTimeout(() => { createMultisigVoteTxn() }, 200)
  },
})

Template.appMultisigVote.helpers({
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
  nodeExplorerUrl() {
    if ((Session.get('nodeExplorerUrl') === '') || (Session.get('nodeExplorerUrl') === null)) {
      return DEFAULT_NETWORKS[0].explorerUrl
    }
    return Session.get('nodeExplorerUrl')
  },
  multisigVoteError() {
    const error = Session.get('multisigVoteError')
    return error
  },
})
