/* eslint no-console:0 */
/* global QRLLIB, XMSS_OBJECT, LocalStore, QrlLedger, isElectrified, selectedNetwork,loadAddressTransactions, getTokenBalances, updateBalanceField, refreshTransferPage */
/* global pkRawToB32Address, hexOrB32, rawToHexOrB32, anyAddressToRawAddress, stringToBytes, binaryToBytes, bytesToString, bytesToHex, hexToBytes, toBigendianUint64BytesUnsigned, numberToString, decimalToBinary */
/* global getMnemonicOfFirstAddress, getXMSSDetails, isWalletFileDeprecated, waitForQRLLIB, addressForAPI, binaryToQrlAddress, toUint8Vector, concatenateTypedArrays, getQrlProtoShasum */
/* global resetWalletStatus, passwordPolicyValid, countDecimals, supportedBrowser, wrapMeteorCall, getBalance, otsIndexUsed, ledgerHasNoTokenSupport, resetLocalStorageState, nodeReturnedValidResponse */
/* global POLL_TXN_RATE, POLL_MAX_CHECKS, DEFAULT_NETWORKS, findNetworkData, SHOR_PER_QUANTA, WALLET_VERSION, QRLPROTO_SHA256,  */

import './tokenCreate.html'
import { BigNumber } from 'bignumber.js'
import helpers from '@theqrl/explorer-helpers'

let countRecipientsForValidation = 1

function getBaseLog(x, y) {
  return Math.log(y) / Math.log(x)
}

function maxAllowedDecimals(tokenTotalSupply) {
  return Math.max(Math.floor(19 - getBaseLog(10, tokenTotalSupply)), 0)
}

function createTokenTxn() {
  // Get to/amount details
  const sendFrom = anyAddressToRawAddress(Session.get('transferFromAddress'))
  const owner = anyAddressToRawAddress(document.getElementById('owner').value)
  const symbol = document.getElementById('symbol').value
  const name = document.getElementById('name').value
  const decimals = document.getElementById('decimals').value
  const txnFee = document.getElementById('fee').value
  const otsKey = document.getElementById('otsKey').value

  const tokenHolders = []

  // Fail if OTS Key reuse is detected
  if (otsIndexUsed(Session.get('otsBitfield'), otsKey)) {
    $('#generating').hide()
    $('#otsKeyReuseDetected').modal('show')
    return
  }

  // Convert strings to bytes
  const pubKey = hexToBytes(XMSS_OBJECT.getPK())
  const symbolBytes = stringToBytes(symbol)
  const nameBytes = stringToBytes(name)

  // Collect Token Holders and create payload
  const initialBalancesAddress = document.getElementsByName('initialBalancesAddress[]')
  const initialBalancesAddressAmount = document.getElementsByName('initialBalancesAddressAmount[]')
  let tokenTotalSupply = 0

  for (let i = 0; i < initialBalancesAddress.length; i += 1) {
    const convertAmountToBigNumber = new BigNumber(initialBalancesAddressAmount[i].value)
    const thisAmount = convertAmountToBigNumber.times(Math.pow(10, decimals)).toNumber() // eslint-disable-line

    const thisHolder = {
      address: anyAddressToRawAddress(initialBalancesAddress[i].value),
      amount: thisAmount,
    }

    tokenHolders.push(thisHolder)

    // Update total supply
    tokenTotalSupply += parseInt(initialBalancesAddressAmount[i].value, 10)
  }

  // Fail token creation if decimals are too high for circulating supply
  if (parseInt(decimals, 10) > maxAllowedDecimals(tokenTotalSupply)) {
    Session.set('maxDecimals', maxAllowedDecimals(tokenTotalSupply))
    Session.set('tokenTotalSupply', tokenTotalSupply)
    $('#generating').hide()
    $('#maxDecimalsReached').modal('show')
    return
  }

  // Calculate txn fee
  const convertFeeToBigNumber = new BigNumber(txnFee)
  const thisTxnFee = convertFeeToBigNumber.times(SHOR_PER_QUANTA).toNumber()

  // Construct request
  const request = {
    addressFrom: sendFrom,
    owner: owner, // eslint-disable-line
    symbol: symbolBytes,
    name: nameBytes,
    decimals: decimals, // eslint-disable-line
    initialBalances: tokenHolders,
    fee: thisTxnFee,
    xmssPk: pubKey,
    network: selectedNetwork(),
  }

  wrapMeteorCall('createTokenTxn', request, (err, res) => {
    if (err) {
      Session.set('tokenCreationError', err.reason)
      $('#tokenCreationFailed').show()
      $('#tokenCreateForm').hide()
    } else {
      let symbolConfirm
      let nameConfirm
      let nft = {}
      const symbolTest = Buffer.from(
        res.response.extended_transaction_unsigned.tx.token.symbol
      ).toString('hex')
      if (symbolTest.slice(0, 8) === '00ff00ff') {
        // this is an NFT
        symbolConfirm = symbolTest
        nameConfirm = Buffer.from(
          res.response.extended_transaction_unsigned.tx.token.name
        ).toString('hex')
        const nftBytes = Buffer.concat([
          Buffer.from(res.response.extended_transaction_unsigned.tx.token.symbol),
          Buffer.from(res.response.extended_transaction_unsigned.tx.token.name),
        ])
        const idBytes = Buffer.from(nftBytes.slice(4, 8))
        const cryptoHashBytes = Buffer.from(nftBytes.slice(8, 40))
        nft = {
          type: 'CREATE NFT',
          id: Buffer.from(idBytes).toString('hex'),
          hash: Buffer.from(cryptoHashBytes).toString('hex'),
        }
      } else {
        // token
        symbolConfirm = bytesToString(res.response.extended_transaction_unsigned.tx.token.symbol)
        nameConfirm = bytesToString(
          res.response.extended_transaction_unsigned.tx.token.name
        )
      }
      const confirmation = {
        hash: res.txnHash,
        from: Buffer.from(res.response.extended_transaction_unsigned.addr_from),
        from_hex: helpers.rawAddressToHexAddress(res.response.extended_transaction_unsigned.addr_from), // eslint-disable-line
        from_b32: helpers.rawAddressToB32Address(res.response.extended_transaction_unsigned.addr_from), // eslint-disable-line
        symbol: symbolConfirm,
        name: nameConfirm,
        owner: Buffer.from(res.response.extended_transaction_unsigned.tx.token.owner),
        owner_hex: helpers.rawAddressToHexAddress(res.response.extended_transaction_unsigned.tx.token.owner), // eslint-disable-line
        owner_b32: helpers.rawAddressToB32Address(res.response.extended_transaction_unsigned.tx.token.owner), // eslint-disable-line
        decimals: res.response.extended_transaction_unsigned.tx.token.decimals,
        fee: res.response.extended_transaction_unsigned.tx.fee / SHOR_PER_QUANTA,
        initialBalances: res.response.extended_transaction_unsigned.tx.token.initial_balances,
        otsKey,
        nft,
      }

      if (nodeReturnedValidResponse(request, confirmation, 'createTokenTxn')) {
        Session.set('tokenCreationConfirmation', confirmation)
        Session.set('tokenCreationConfirmationResponse', res.response)

        // Send to confirm page.
        const params = { }
        const path = FlowRouter.path('/tokens/create/confirm', params)
        FlowRouter.go(path)
      } else {
        // Hide generating component
        $('#generating').hide()
        // Show warning modal
        $('#invalidNodeResponse').modal('show')
      }
    }
  })
}

// Function to initialise form validation
function initialiseFormValidation() {
  const validationRules = {}

  // Calculate validation fields based on countRecipientsForValidation for to/amount fields
  for (let i = 1; i <= countRecipientsForValidation; i += 1) {
    validationRules['initialBalancesAddress' + i] = {
      identifier: 'initialBalancesAddress_' + i,
      rules: [
        {
          type: 'empty',
          prompt: 'Please enter the QRL address you wish to allocate funds to',
        },
      ],
    }

    validationRules['initialBalancesAddressAmount' + i] = {
      identifier: 'initialBalancesAddressAmount_' + i,
      rules: [
        {
          type: 'empty',
          prompt: 'You must enter an amount to allocate',
        },
        {
          type: 'number',
          prompt: 'Amount must be a number',
        },
        {
          type: 'maxDecimals',
          prompt: 'You can only enter up to 9 decimal places in the amount field',
        },
      ],
    }
  }

  // Validate token details
  validationRules['owner'] = {
    id: 'owner',
    rules: [
      {
        type: 'empty',
        prompt: 'Please enter the QRL address you wish to make the owner of this token',
      },
    ],
  }
  validationRules['symbol'] = {
    id: 'symbol',
    rules: [
      {
        type: 'empty',
        prompt: 'You must enter a token symbol',
      },
    ],
  }
  validationRules['name'] = {
    id: 'name',
    rules: [
      {
        type: 'empty',
        prompt: 'You must enter a token name',
      },
    ],
  }
  validationRules['decimals'] = {
    id: 'decimals',
    rules: [
      {
        type: 'empty',
        prompt: 'You must enter how many decimals this token should have',
      },
      {
        type: 'number',
        prompt: 'Decimals must be a number',
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

Template.appTokenCreate.onRendered(() => {
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

Template.appTokenCreate.events({
  'click #addTokenHolder': (event) => {
    event.preventDefault()
    event.stopPropagation()

    // Increment count of recipients
    countRecipientsForValidation += 1

    const newTokenHolderHtml = `
      <div class="field">
        <label>Holder Balance</label>
        <div class="three fields">
          <div class="ten wide field">
            <input type="text" id="initialBalancesAddress_${countRecipientsForValidation}" name="initialBalancesAddress[]" placeholder="Token Holder QRL Address">
          </div>
          <div class="five wide field">
            <input type="text" id="initialBalancesAddressAmount_${countRecipientsForValidation}" name="initialBalancesAddressAmount[]" placeholder="Token Balance">
          </div>
          <div class="one wide field">
            <button class="ui red button removeTokenHolder"><i class="remove user icon"></i></button>
          </div>
        </div>
      </div>
    `

    // Append newTokenHolderHtml to tokenHolders div
    $('#tokenHolders').append(newTokenHolderHtml)

    // Initialise Form Validation
    initialiseFormValidation()
  },
  'click .removeTokenHolder': (event) => {
    event.preventDefault()
    event.stopPropagation()

    // Subtract one recipient for validation
    countRecipientsForValidation -= 1

    // Remove the token holder
    $(event.currentTarget).parent().parent().parent()
      .remove()

    // Initialise Form Validation
    initialiseFormValidation()
  },
  'submit #generateTokenForm': (event) => {
    event.preventDefault()
    event.stopPropagation()
    $('#generating').show()

    setTimeout(() => { createTokenTxn() }, 200)
  },
})

Template.appTokenCreate.helpers({
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
  maxDecimals() {
    const maxDecimals = Session.get('maxDecimals')
    return maxDecimals
  },
  tokenTotalSupply() {
    const tokenTotalSupply = Session.get('tokenTotalSupply')
    return tokenTotalSupply
  },
  nodeExplorerUrl() {
    if ((Session.get('nodeExplorerUrl') === '') || (Session.get('nodeExplorerUrl') === null)) {
      return DEFAULT_NETWORKS[0].explorerUrl
    }
    return Session.get('nodeExplorerUrl')
  },
})
