/* eslint no-console:0 */
/* global QRLLIB, XMSS_OBJECT, LocalStore, QrlLedger, isElectrified, selectedNetwork,loadAddressTransactions, getTokenBalances, updateBalanceField, refreshTransferPage */
/* global pkRawToB32Address, hexOrB32, rawToHexOrB32, anyAddressToRawAddress, stringToBytes, binaryToBytes, bytesToString, bytesToHex, hexToBytes, toBigendianUint64BytesUnsigned, numberToString, decimalToBinary */
/* global getMnemonicOfFirstAddress, getXMSSDetails, isWalletFileDeprecated, waitForQRLLIB, addressForAPI, binaryToQrlAddress, toUint8Vector, concatenateTypedArrays, getQrlProtoShasum */
/* global resetWalletStatus, passwordPolicyValid, countDecimals, supportedBrowser, wrapMeteorCall, getBalance, otsIndexUsed, ledgerHasNoTokenSupport, resetLocalStorageState, nodeReturnedValidResponse */
/* global POLL_TXN_RATE, POLL_MAX_CHECKS, DEFAULT_NETWORKS, findNetworkData, SHOR_PER_QUANTA, WALLET_VERSION, QRLPROTO_SHA256,  */

// import './tokenCreate.html'
import { BigNumber } from 'bignumber.js'
import helpers from '@theqrl/explorer-helpers'
import stableStringify from 'json-stable-stringify'
import crypto from 'crypto-browserify'

let countRecipientsForValidation = 1

function getBaseLog(x, y) {
  return Math.log(y) / Math.log(x)
}

function maxAllowedDecimals(tokenTotalSupply) {
  return Math.max(Math.floor(19 - getBaseLog(10, tokenTotalSupply)), 0)
}

function getNFTBytesForTransfer(idHexString, cryptoHashHexString) {
  // given an idHexString and cryptoHashHexString, return the bytes for the NFT
  // idHexString is a hex string of the NFT id
  // cryptoHashHexString is a hex string of the NFT cryptoHash
  // return a Buffer of the NFT bytes
  const nftIdentifier = Buffer.from('00FF00FF', 'hex')
  const idBytes = Buffer.from(idHexString, 'hex')
  const cryptoHashBytes = Buffer.from(cryptoHashHexString, 'hex')
  const nftBytes = Buffer.concat([nftIdentifier, idBytes, cryptoHashBytes])
  return {
    symbolBytes: Buffer.from(nftBytes.slice(0, 10)),
    nameBytes: Buffer.from(nftBytes.slice(10, 40)),
  }
}

function createTokenTxn() {
  // Get to/amount details

  const providerRef = $('#providerRef').val()
  const jsonR = $('#json').val()
  const hash = crypto.createHash('sha256')
  const hashData = hash.update(stableStringify(jsonR), 'utf-8')
  const generatedHash = hashData.digest('hex')

  const nftBytes = getNFTBytesForTransfer(providerRef, generatedHash)

  const sendFrom = anyAddressToRawAddress(Session.get('transferFromAddress'))
  const owner = anyAddressToRawAddress(Session.get('transferFromAddress'))
  // const symbol = document.getElementById('symbol').value
  // const name = document.getElementById('name').value
  const decimals = '0'
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
  const { symbolBytes, nameBytes } = nftBytes

  // Collect Token Holders and create payload
  const initialBalancesAddress = document.getElementsByName(
    'initialBalancesAddress[]'
  )
  const initialBalancesAddressAmount = document.getElementsByName(
    'initialBalancesAddressAmount[]'
  )
  let tokenTotalSupply = 0

  for (let i = 0; i < initialBalancesAddress.length; i += 1) {
    const convertAmountToBigNumber = new BigNumber(
      initialBalancesAddressAmount[i].value
    )
    const thisAmount = convertAmountToBigNumber
      .times(10 ** decimals)
      .toNumber() // eslint-disable-line

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
      const confirmation = {
        hash: res.txnHash,
        from: Buffer.from(res.response.extended_transaction_unsigned.addr_from),
        from_hex: helpers.rawAddressToHexAddress(
          res.response.extended_transaction_unsigned.addr_from
        ), // eslint-disable-line
        from_b32: helpers.rawAddressToB32Address(
          res.response.extended_transaction_unsigned.addr_from
        ), // eslint-disable-line
        symbol: bytesToString(
          res.response.extended_transaction_unsigned.tx.token.symbol
        ),
        name: bytesToString(
          res.response.extended_transaction_unsigned.tx.token.name
        ),
        owner: Buffer.from(
          res.response.extended_transaction_unsigned.tx.token.owner
        ),
        owner_hex: helpers.rawAddressToHexAddress(
          res.response.extended_transaction_unsigned.tx.token.owner
        ), // eslint-disable-line
        owner_b32: helpers.rawAddressToB32Address(
          res.response.extended_transaction_unsigned.tx.token.owner
        ), // eslint-disable-line
        decimals: res.response.extended_transaction_unsigned.tx.token.decimals,
        fee:
          res.response.extended_transaction_unsigned.tx.fee / SHOR_PER_QUANTA,
        initialBalances:
          res.response.extended_transaction_unsigned.tx.token.initial_balances,
        otsKey: otsKey, // eslint-disable-line
      }

      if (nodeReturnedValidResponse(request, confirmation, 'createTokenTxn')) {
        Session.set('tokenCreationConfirmation', confirmation)
        Session.set('tokenCreationConfirmationResponse', res.response)

        // Send to confirm page.
        const params = {}
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
          prompt:
            'You can only enter up to 9 decimal places in the amount field',
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
        prompt:
          'Please enter the QRL address you wish to make the owner of this token',
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
    return countDecimals(value) <= 9
  }

  // Initliase the form validation
  $('.ui.form').form({
    fields: validationRules,
  })
}

Template.appNFT.onRendered(() => {
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

async function validateJSON(JSONtext) {
  const sendFromCheck = Session.get('transferFromAddress').toLowerCase()
  let valid = { valid: false, message: '' }
  try {
    const data = JSON.parse(JSONtext)

    if (!data.provider) {
      valid = { valid: false, message: 'provider JSON key not present' }
    }
    if (data.provider.toLowerCase() !== sendFromCheck) {
      valid = { valid: false, message: 'provider QRL address is not the same as this wallet address' }
    }
    if (!data.metadata) {
      valid = { valid: false, message: 'metadata JSON key not present' }
    }
    if (data.filehash.length !== 128) {
      valid = { valid: false, message: 'invalid filehash length' }
    }
    if (data.metahash.length !== 128) {
      valid = { valid: false, message: 'invalid metahash length' }
    }
    if (data.standard !== 1) {
      valid = { valid: false, message: 'invalid standard version' }
    }
    if (valid.message.length === 0) {
      $('#validateJSON').addClass('disabled')
      $('#validateJSON').text('checking...')
      const response = await fetch('https://nft-linter.theqrl.org/lint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const text = await response.text()
      console.log(text)
      $('#validateJSON').removeClass('disabled')
      $('#validateJSON').text('Validate')
      const jsonR = JSON.parse(text)
      if (jsonR.valid) {
        console.log('===== VALID JSON =====')
        valid = { valid: true, message: 'validated JSON' }
        $('#validateJSON').addClass('disabled')
        $('#json').val(jsonR.linted)
        const hash = crypto.createHash('sha256')
        const hashData = hash.update(stableStringify(jsonR.linted), 'utf-8')
        const generatedHash = hashData.digest('hex')
        console.log(generatedHash)
      } else {
        valid = { valid: false, message: jsonR.message }
        console.log('===== INVALID JSON =====')
      }
    }
  } catch (e) {
    console.log(e)
    valid = { valid: false, message: 'JSON is incorrectly structured: see the docs' }
    console.log('===== INVALID JSON (errored parsing) =====')
  }
  if (valid.valid) {
    $('#validateResult').text(`PASS: ${valid.message}`)
    $('#createToken').removeClass('disabled')
  } else {
    $('#validateResult').text(`INVALID JSON: ${valid.message}`)
  }
}

Template.appNFT.events({
  'click #validateJSON': function (event) {
    event.preventDefault()
    // Get JSON
    const json = $('#json').val()
    // Validate JSON
    validateJSON(json)
  },
  'keyup #json': function () {
    $('#createToken').addClass('disabled')
    $('#validateResult').text('NFT data not yet checked')
    $('#validateJSON').removeClass('disabled')
  },
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
    $(event.currentTarget).parent().parent().parent().remove()

    // Initialise Form Validation
    initialiseFormValidation()
  },
  'click #createToken': (event) => {
    event.preventDefault()
    event.stopPropagation()
    $('#generating').show()

    setTimeout(() => {
      createTokenTxn()
    }, 200)
  },
})

Template.appNFT.helpers({
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
    if (
      Session.get('nodeExplorerUrl') === ''
      || Session.get('nodeExplorerUrl') === null
    ) {
      return DEFAULT_NETWORKS[0].explorerUrl
    }
    return Session.get('nodeExplorerUrl')
  },
})
