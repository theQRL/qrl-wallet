/* eslint no-console:0 */
/* global QRLLIB, XMSS_OBJECT, LocalStore, QrlLedger, isElectrified, selectedNetwork,loadAddressTransactions, getTokenBalances, updateBalanceField, refreshTransferPage */
/* global pkRawToB32Address, hexOrB32, rawToHexOrB32, anyAddressToRawAddress, stringToBytes, binaryToBytes, bytesToString, bytesToHex, hexToBytes, toBigendianUint64BytesUnsigned, numberToString, decimalToBinary */
/* global getMnemonicOfFirstAddress, getXMSSDetails, isWalletFileDeprecated, waitForQRLLIB, addressForAPI, binaryToQrlAddress, toUint8Vector, concatenateTypedArrays, getQrlProtoShasum */
/* global resetWalletStatus, passwordPolicyValid, countDecimals, supportedBrowser, wrapMeteorCall, getBalance, otsIndexUsed, ledgerHasNoTokenSupport, resetLocalStorageState, nodeReturnedValidResponse */
/* global POLL_TXN_RATE, POLL_MAX_CHECKS, DEFAULT_NETWORKS, findNetworkData, SHOR_PER_QUANTA, WALLET_VERSION, QRLPROTO_SHA256,  */

import './spend.html'
import { BigNumber } from 'bignumber.js'
import helpers from '@theqrl/explorer-helpers'

let countRecipientsForValidation = 1

function getBaseLog(x, y) {
  return Math.log(y) / Math.log(x)
}

function createMultisigSpendTxn() {
  // Get to/amount details
  const multiSigAddress = anyAddressToRawAddress(document.getElementById('multiSigAddress').value)
  const expiryBlock = document.getElementById('expiryBlock').value
  const txnFee = document.getElementById('fee').value
  const otsKey = document.getElementById('otsKey').value

  const recipients = []
  const amounts = []

  // Fail if OTS Key reuse is detected
  if (otsIndexUsed(Session.get('otsBitfield'), otsKey)) {
    $('#generating').hide()
    $('#otsKeyReuseDetected').modal('show')
    return
  }

  // Convert strings to bytes
  const pubKey = hexToBytes(XMSS_OBJECT.getPK())

  // Collect Recipients and create payload
  const addresses = document.getElementsByName('addresses[]')
  const addressAmount = document.getElementsByName('addressAmount[]')

  // Verify and add addresses
  for (let i = 0; i < addresses.length; i += 1) {
    const thisAddress = addresses[i].value

    // Fail early if attempting to send to an Ethereum style 0x address
    if ((thisAddress[0] === '0') && (thisAddress[1] === 'x')) {
      $('#generating').hide()
      $('#invalidAddress0x').modal('show')
      return
    }

    recipients.push(anyAddressToRawAddress(thisAddress.trim()))
  }
  
  // Format amounts correctly.
  for (let i = 0; i < addressAmount.length; i += 1) {
    const convertAmountToBigNumber = new BigNumber(addressAmount[i].value)
    const thisAmount = convertAmountToBigNumber.times(SHOR_PER_QUANTA).toNumber()
    amounts.push(thisAmount)
  }

  // Calculate txn fee
  const convertFeeToBigNumber = new BigNumber(txnFee)
  const thisTxnFee = convertFeeToBigNumber.times(SHOR_PER_QUANTA).toNumber()
  const thisExpiry = new BigNumber(expiryBlock).toNumber()

  // Construct request
  const request = {
    multi_sig_address: multiSigAddress,
    addrs_to: recipients,
    amounts: amounts, // eslint-disable-line
    expiry_block_number: thisExpiry,
    fee: thisTxnFee,
    xmssPk: pubKey,
    network: selectedNetwork(),
  }

  wrapMeteorCall('createMultisigSpendTxn', request, (err, res) => {
    if (err) {
      Session.set('multisigSpendError', err.reason)
      $('#multisigSpendFailed').show()
      $('#multisigSpendForm').hide()
    } else {
      const confirmation = {
        hash: res.txnHash,
        fee: res.response.extended_transaction_unsigned.tx.fee / SHOR_PER_QUANTA,
        multi_sig_address: res.response.extended_transaction_unsigned.tx.multi_sig_spend.multi_sig_address,
        addrs_to: res.response.extended_transaction_unsigned.tx.multi_sig_spend.addrs_to,
        amounts: res.response.extended_transaction_unsigned.tx.multi_sig_spend.amounts,
        expiry_block_number: res.response.extended_transaction_unsigned.tx.multi_sig_spend.expiry_block_number,
        otsKey: otsKey, // eslint-disable-line
      }

      //if (nodeReturnedValidResponse(request, confirmation, 'createTokenTxn')) {
        Session.set('multisigSpendConfirmation', confirmation)
        Session.set('multisigSpendConfirmationResponse', res.response)

        // Send to confirm page.
        const params = { }
        const path = FlowRouter.path('/tools/multisig/spend-confirm', params)
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

  // Calculate validation fields based on countRecipientsForValidation for to/amount fields
  for (let i = 1; i <= countRecipientsForValidation; i += 1) {
    validationRules['address' + i] = {
      identifier: 'address_' + i,
      rules: [
        {
          type: 'empty',
          prompt: 'Please enter the QRL address you wish to add as a recipient',
        },
      ],
    }

    validationRules['addressAmount' + i] = {
      identifier: 'addressAmount_' + i,
      rules: [
        {
          type: 'empty',
          prompt: 'You must enter an amount',
        },
        {
          type: 'number',
          prompt: 'Amount must be a number',
        },
      ],
    }
  }

  // Validate token details
  validationRules['expiryBlock'] = {
    id: 'expiryBlock',
    rules: [
      {
        type: 'empty',
        prompt: 'You must enter an expiry block for this multisig spend transaction',
      },
      {
        type: 'number',
        prompt: 'Expiry Block must be a number',
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

Template.appMultisigSpend.onRendered(() => {
  // Ledger Nano not supported here
  ledgerHasNoTokenSupport()

  // Initialise dropdowns
  $('.ui.dropdown').dropdown()

  // Set default transfer recipients to 1
  countRecipientsForValidation = 1

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

Template.appMultisigSpend.events({
  'click #addRecipient': (event) => {
    event.preventDefault()
    event.stopPropagation()

    // Increment count of recipients
    countRecipientsForValidation += 1

    const newRecipientHtml = `
      <div class="field">
        <label>Recipient and Amount</label>
        <div class="three fields">
          <div class="ten wide field">
            <input type="text" id="address_${countRecipientsForValidation}" name="addresses[]" placeholder="QRL Address">
          </div>
          <div class="five wide field">
            <input type="text" id="addressAmount_${countRecipientsForValidation}" name="addressAmount[]" placeholder="Amount">
          </div>
          <div class="one wide field">
            <button class="ui red button removeRecipient"><i class="remove user icon"></i></button>
          </div>
        </div>
      </div>
    `

    // Append newRecipientHtml to recipients div
    $('#recipients').append(newRecipientHtml)

    // Initialise Form Validation
    initialiseFormValidation()
  },
  'click .removeRecipient': (event) => {
    event.preventDefault()
    event.stopPropagation()

    // Subtract one recipient for validation
    countRecipientsForValidation -= 1

    // Remove the recipient
    $(event.currentTarget).parent().parent().parent()
      .remove()

    // Initialise Form Validation
    initialiseFormValidation()
  },
  'submit #generateMultisigSpendForm': (event) => {
    event.preventDefault()
    event.stopPropagation()
    $('#generating').show()

    setTimeout(() => { createMultisigSpendTxn() }, 200)
  },
})

Template.appMultisigSpend.helpers({
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
  multisigSpendError() {
    const otsKeyEstimate = Session.get('multisigCreationError')
    return otsKeyEstimate
  },
})
