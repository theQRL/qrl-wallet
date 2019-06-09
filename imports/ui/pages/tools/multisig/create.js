/* eslint no-console:0 */
/* global QRLLIB, XMSS_OBJECT, LocalStore, QrlLedger, isElectrified, selectedNetwork,loadAddressTransactions, getTokenBalances, updateBalanceField, refreshTransferPage */
/* global pkRawToB32Address, hexOrB32, rawToHexOrB32, anyAddressToRawAddress, stringToBytes, binaryToBytes, bytesToString, bytesToHex, hexToBytes, toBigendianUint64BytesUnsigned, numberToString, decimalToBinary */
/* global getMnemonicOfFirstAddress, getXMSSDetails, isWalletFileDeprecated, waitForQRLLIB, addressForAPI, binaryToQrlAddress, toUint8Vector, concatenateTypedArrays, getQrlProtoShasum */
/* global resetWalletStatus, passwordPolicyValid, countDecimals, supportedBrowser, wrapMeteorCall, getBalance, otsIndexUsed, ledgerHasNoTokenSupport, resetLocalStorageState, nodeReturnedValidResponse */
/* global POLL_TXN_RATE, POLL_MAX_CHECKS, DEFAULT_NETWORKS, findNetworkData, SHOR_PER_QUANTA, WALLET_VERSION, QRLPROTO_SHA256,  */

import './create.html'
import { BigNumber } from 'bignumber.js'
import helpers from '@theqrl/explorer-helpers'

let countSignatoriesForValidation = 1

function getBaseLog(x, y) {
  return Math.log(y) / Math.log(x)
}

function createMultisigCreateTxn() {
  // Get to/amount details
  const threshold = document.getElementById('threshold').value
  const txnFee = document.getElementById('fee').value
  const otsKey = document.getElementById('otsKey').value

  const signatories = []
  const weights = []

  // Fail if OTS Key reuse is detected
  if (otsIndexUsed(Session.get('otsBitfield'), otsKey)) {
    $('#generating').hide()
    $('#otsKeyReuseDetected').modal('show')
    return
  }

  // Convert strings to bytes
  const pubKey = hexToBytes(XMSS_OBJECT.getPK())

  // Collect Signatories and create payload
  const signatoryAddresses = document.getElementsByName('signatoryAddresses[]')
  const signatoryAddressWeight = document.getElementsByName('signatoryAddressWeight[]')

  for (let i = 0; i < signatoryAddresses.length; i += 1) {
    signatories.push(anyAddressToRawAddress(signatoryAddresses[i].value))
    const thisWeight = new BigNumber(signatoryAddressWeight[i].value).toNumber()
    weights.push(thisWeight)
  }

  // Calculate txn fee
  const convertFeeToBigNumber = new BigNumber(txnFee)
  const thisTxnFee = convertFeeToBigNumber.times(SHOR_PER_QUANTA).toNumber()

  const thisThreshold = new BigNumber(threshold).toNumber()

  // Construct request
  const request = {
    signatories: signatories,
    weights: weights,
    threshold: thisThreshold, // eslint-disable-line
    fee: thisTxnFee,
    xmssPk: pubKey,
    network: selectedNetwork(),
  }

  wrapMeteorCall('createMultisigCreateTxn', request, (err, res) => {
    if (err) {
      Session.set('multisigCreationError', err.reason)
      $('#multisigCreationFailed').show()
      $('#multisigCreationForm').hide()
    } else {
      const confirmation = {
        hash: res.txnHash,
        fee: res.response.extended_transaction_unsigned.tx.fee / SHOR_PER_QUANTA,
        signatories: res.response.extended_transaction_unsigned.tx.multi_sig_create.signatories,
        weights: res.response.extended_transaction_unsigned.tx.multi_sig_create.weights,
        threshold: res.response.extended_transaction_unsigned.tx.multi_sig_create.threshold,
        otsKey: otsKey, // eslint-disable-line
      }

      //if (nodeReturnedValidResponse(request, confirmation, 'createTokenTxn')) {
        Session.set('multisigCreationConfirmation', confirmation)
        Session.set('multisigCreationConfirmationResponse', res.response)

        // Send to confirm page.
        const params = { }
        const path = FlowRouter.path('/tools/multisig/confirm', params)
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

  // Calculate validation fields based on countSignatoriesForValidation for to/amount fields
  for (let i = 1; i <= countSignatoriesForValidation; i += 1) {
    validationRules['signatoryAddress' + i] = {
      identifier: 'signatoryAddress_' + i,
      rules: [
        {
          type: 'empty',
          prompt: 'Please enter the QRL address you wish to add as a Signatory',
        },
      ],
    }

    validationRules['signatoryAddressWeight' + i] = {
      identifier: 'signatoryAddressWeight_' + i,
      rules: [
        {
          type: 'empty',
          prompt: 'You must enter a weight to allocate',
        },
        {
          type: 'number',
          prompt: 'Weight must be a number',
        },
      ],
    }
  }

  // Validate token details
  validationRules['threshold'] = {
    id: 'threshold',
    rules: [
      {
        type: 'empty',
        prompt: 'You must enter a threshold for this multisig address',
      },
      {
        type: 'number',
        prompt: 'Threshold must be a number',
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

Template.appMultisigCreate.onRendered(() => {
  // Ledger Nano not supported here
  ledgerHasNoTokenSupport()

  // Initialise dropdowns
  $('.ui.dropdown').dropdown()

  // Set default transfer recipients to 1
  countSignatoriesForValidation = 1

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

Template.appMultisigCreate.events({
  'click #addSignatory': (event) => {
    event.preventDefault()
    event.stopPropagation()

    // Increment count of recipients
    countSignatoriesForValidation += 1

    const newSignatoryHtml = `
      <div class="field">
        <label>Signatory and Weight</label>
        <div class="three fields">
          <div class="ten wide field">
            <input type="text" id="signatoryAddress_${countSignatoriesForValidation}" name="signatoryAddresses[]" placeholder="Signatory QRL Address">
          </div>
          <div class="five wide field">
            <input type="text" id="signatoryAddressWeight_${countSignatoriesForValidation}" name="signatoryAddressWeight[]" placeholder="Signatory Weight">
          </div>
          <div class="one wide field">
            <button class="ui red button removeSignatory"><i class="remove user icon"></i></button>
          </div>
        </div>
      </div>
    `

    // Append newTokenHolderHtml to tokenHolders div
    $('#signatories').append(newSignatoryHtml)

    // Initialise Form Validation
    initialiseFormValidation()
  },
  'click .removeSignatory': (event) => {
    event.preventDefault()
    event.stopPropagation()

    // Subtract one signatory for validation
    countSignatoriesForValidation -= 1

    // Remove the signatory
    $(event.currentTarget).parent().parent().parent()
      .remove()

    // Initialise Form Validation
    initialiseFormValidation()
  },
  'submit #generateMultisigForm': (event) => {
    event.preventDefault()
    event.stopPropagation()
    $('#generating').show()

    setTimeout(() => { createMultisigCreateTxn() }, 200)
  },
})

Template.appMultisigCreate.helpers({
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
  multisigCreationError() {
    const otsKeyEstimate = Session.get('multisigCreationError')
    return otsKeyEstimate
  },
})
