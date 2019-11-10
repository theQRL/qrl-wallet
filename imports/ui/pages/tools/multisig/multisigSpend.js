/* eslint no-console:0, max-len:0 */
/* global getXMSSDetails, anyAddressToRawAddress, hexToBytes, SHOR_PER_QUANTA,
selectedNetwork, wrapMeteorCall, nodeReturnedValidResponse, XMSS_OBJECT, concatenateTypedArrays,
toUint8Vector, toBigendianUint64BytesUnsigned, binaryToBytes, POLL_TXN_RATE, POLL_MAX_CHECKS, DEFAULT_NETWORKS, hexOrB32 */

import helpers from '@theqrl/explorer-helpers'
import qrlAddressValdidator from '@theqrl/validate-qrl-address'
import JSONFormatter from 'json-formatter-js'
import { BigNumber } from 'bignumber.js'
// import sha256 from 'sha256'

Template.multisigSpend.helpers({
  isActiveTab(p) {
    if (Session.get('activeMultisigTab') === p) {
      return 'active'
    }
    return ''
  },
  transferFrom() {
    const transferFrom = {}
    if (Session.get('multisigTransferFromAddressSet') === true) {
      transferFrom.balance = Session.get('multisigTransferFromBalance')
      transferFrom.address = hexOrB32(Session.get('multisigTransferFromAddress'))
      return transferFrom
    }
    return { address: 'No multisig address selected', balance: 'N/A' }
  },
  hasAddressSet() {
    return Session.get('multisigTransferFromAddressSet')
  },
  otsKeyEstimate() {
    const otsKeyEstimate = Session.get('otsKeyEstimate')
    return otsKeyEstimate
  },
  estimateExpiry() {
    return Session.get('estimateExpiry')
  },
  getInterval() {
    return Session.get('expiryInterval')
  },
  ledgerWalletDisabled() {
    if (getXMSSDetails().walletType === 'ledger') {
      return 'disabled'
    }
    return ''
  },
  isLedgerWallet() {
    if (getXMSSDetails().walletType === 'ledger') {
      return true
    }
    return false
  },
  isSeedWallet() {
    if (getXMSSDetails().walletType === 'seed') {
      return true
    }
    return false
  },
  bech32() {
    if (LocalStore.get('addressFormat') === 'bech32') {
      return true
    }
    return false
  },
  transactionConfirmation() {
    const confirmation = Session.get('transactionConfirmation')
    return confirmation
  },
  transactionConfirmationFee() {
    if (Session.get('transactionConfirmationResponse') === undefined) { return false }
    const transactionConfirmationFee = Session.get('transactionConfirmationResponse').extended_transaction_unsigned.tx.fee / SHOR_PER_QUANTA
    return transactionConfirmationFee
  },
  transactionRelayedThrough() {
    const status = Session.get('transactionRelayedThrough')
    return status
  },
  transactionStatus() {
    const status = Session.get('txstatus')
    return status
  },
  nodeExplorerUrl() {
    if ((Session.get('nodeExplorerUrl') === '') || (Session.get('nodeExplorerUrl') === null)) {
      return DEFAULT_NETWORKS[0].explorerUrl
    }
    return Session.get('nodeExplorerUrl')
  },
  transactionHash() {
    const hash = Session.get('transactionHash')
    return hash
  },
})

const loadMultisigs = (a, p) => {
  const addresstx = Buffer.from(a.substring(1), 'hex')
  const request = {
    address: addresstx,
    network: selectedNetwork(),
    item_per_page: 10,
    page_number: p,
  }
  Session.set('multiSigAddresses', [])
  Session.set('loadingmultiSigAddresses', true)
  wrapMeteorCall('getMultiSigAddressesByAddress', request, (err, res) => {
    // console.log('err:', err)
    // console.log('res:', res)
    if (err) {
      Session.set('multiSigAddresses', { error: err })
      Session.set('errorLoadingMultiSig', true)
    } else {
      Session.set('active', p)
      const add = []
      _.each(res.multi_sig_detail, (item => {
        add.push({ address: `Q${Buffer.from(item.address).toString('hex')}`, balance: item.balance / SHOR_PER_QUANTA })
      }))
      Session.set('multiSigAddresses', add)
      Session.set('loadingmultiSigAddresses', false)
      Session.set('errorLoadingMultiSig', false)
    }
  })
}

function getRecipientIds() {
  const ids = []
  const elements = document.getElementsByName('to[]')
  _.each(elements, (element) => {
    const thisId = element.id
    const parts = thisId.split('_')
    ids.push(parseInt(parts[1], 10))
  })
  return ids
}

function estimateExpiry(refreshHeight) {
  const intervalSetting = Session.get('expiryInterval')
  let interval = 86400
  if (intervalSetting === 'approx 30 days') { interval = 86400 }
  if (intervalSetting === 'approx 6 months') { interval = 525600 }
  if (intervalSetting === 'approx 1 year') { interval = 1051200 }
  if (refreshHeight) {
    Meteor.call('getHeight', { network: selectedNetwork() }, (err, resp) => {
      if (!err) {
        Session.set('lastBlockHeight', parseInt(resp.height, 10))
        Session.set('estimateExpiry', (parseInt(resp.height, 10) + interval))
      }
    })
  } else {
    const height = Session.get('lastBlockHeight')
    Session.set('estimateExpiry', (height + interval))
  }
}

function enableSendButton() {
  $('#confirmTransaction').attr('disabled', false)
  $('#confirmTransaction').html('Click to Send')
}

function checkResult(thisTxId, failureCount) {
  try {
    // to do: processed and awaiting mining if found = true, if header is not null then has been mined and will have a block number
    if (Session.get('txhash').found) {
      // Complete
      const userMessage = `Complete - Transaction ${thisTxId} is in block ${Session.get('txhash').transaction.header.block_number} with 1 confirmation.`
      Session.set('txstatus', userMessage)
      Session.set('transactionConfirmed', 'true')
      $('.loading').hide()
      $('#loadingHeader').hide()
      // once we have a list of multisigs, need to refresh list once new address created
      // refreshTransferPage()
    } else if (Session.get('txhash').error != null) {
      // We attempt to find the transaction 5 times below absolutely failing.
      if (failureCount < 5) {
        // eslint-disable-next-line no-use-before-define
        setTimeout(() => { pollTransaction(thisTxId, false, failureCount + 1) }, POLL_TXN_RATE)
      } else {
        // Transaction error - Give up
        const errorMessage = `Error - ${Session.get('txhash').error}`
        Session.set('txstatus', errorMessage)
        Session.set('transactionConfirmed', 'false')
        $('.loading').hide()
        $('#loadingHeader').hide()
      }
    } else {
      // Poll again
      // eslint-disable-next-line no-use-before-define
      setTimeout(() => { pollTransaction(thisTxId) }, POLL_TXN_RATE)
    }
  } catch (err) {
    // Most likely is that the mempool is not replying the transaction.
    // We attempt to find it ongoing for a while
    console.log(`Caught Error: ${err}`)

    // Continue to check the txn status until POLL_MAX_CHECKS is reached in failureCount
    if (failureCount < POLL_MAX_CHECKS) {
      // eslint-disable-next-line no-use-before-define
      setTimeout(() => { pollTransaction(thisTxId, false, failureCount + 1) }, POLL_TXN_RATE)
    } else {
      // Transaction error - Give up
      Session.set('txstatus', 'Error')
      Session.set('transactionConfirmed', 'false')
      $('.loading').hide()
      $('#loadingHeader').hide()
    }
  }
}

function setRawDetail() {
  try {
    const myJSON = Session.get('txhash').transaction
    const formatter = new JSONFormatter(myJSON)
    $('#quantaJsonbox').html(formatter.render())
    $('#tokenJsonbox').html(formatter.render())
  } catch (err) {
    console.log('Error adding transaction to raw detail.')
  }
}

// Poll a transaction for its status after relaying into network.
function pollTransaction(thisTxId, firstPoll = false, failureCount = 0) {
  // Reset txhash on first poll.
  if (firstPoll === true) {
    Session.set('txhash', {})
  }

  Session.set('txstatus', 'Pending')
  Session.set('transactionConfirmed', 'false')

  const request = {
    query: thisTxId,
    network: selectedNetwork(),
  }

  if (thisTxId) {
    wrapMeteorCall('getTxnHash', request, (err, res) => {
      if (err) {
        if (failureCount < POLL_MAX_CHECKS) {
          Session.set('txhash', { })
          Session.set('txstatus', 'Pending')
        } else {
          Session.set('txhash', { error: err, id: thisTxId })
          Session.set('txstatus', 'Error')
        }
        checkResult(thisTxId, failureCount)
      } else {
        res.error = null
        Session.set('txhash', res)
        setRawDetail()
        checkResult(thisTxId, failureCount)
      }
    })
  }
}


function generateTransaction() {
  // Get to/amount details
  const sendFrom = anyAddressToRawAddress(Session.get('transferFromAddress'))
  const txnFee = document.getElementById('fee').value
  const otsKey = document.getElementById('otsKey').value
  const pubKey = hexToBytes(getXMSSDetails().pk)
  const sendTo = document.getElementsByName('to[]')
  const sendAmounts = document.getElementsByName('amounts[]')
  const expiryBlock = parseInt(document.getElementById('expiry').value, 10)
  const msFrom = anyAddressToRawAddress(Session.get('multisigTransferFromAddress'))

  // Capture outputs
  const thisAddressesTo = []
  const thisAmounts = []

  const validAddresses = []
  _.each(sendTo, (item) => {
    const isValid = qrlAddressValdidator.hexString(item.value)
    if (isValid.result) {
      console.log(item.value + 'is a valid QRL address')
      validAddresses.push(item.value.toLowerCase())
    }
  })
  if (validAddresses.length === sendTo.length) {
    console.log('all addresses valid')
  } else {
    $('#checkWeightsModal .message .header').text('There\'s a problem')
    $('#checkWeightsModal p').text('One or more of the recipients is invalid: please check the addresses carefully')
    $('#checkWeightsModal').modal('show')
    return
  }

  for (let i = 0; i < sendTo.length; i += 1) {
    const thisAddress = sendTo[i].value
    thisAddressesTo.push(anyAddressToRawAddress(thisAddress.trim()))
  }

  // Format amounts correctly.
  let sumOfOutputs = new BigNumber(0)
  for (let i = 0; i < sendAmounts.length; i += 1) {
    const convertAmountToBigNumber = new BigNumber(sendAmounts[i].value)
    const thisAmount = convertAmountToBigNumber.times(SHOR_PER_QUANTA).toNumber()
    thisAmounts.push(thisAmount)
    sumOfOutputs = sumOfOutputs.plus(convertAmountToBigNumber.times(SHOR_PER_QUANTA))
  }

  // check enough balance for fee
  const totalFee = new BigNumber(txnFee * SHOR_PER_QUANTA).plus(sumOfOutputs).toNumber()
  const totalBalance = new BigNumber(Session.get('multisigTransferFromBalance')).times(SHOR_PER_QUANTA).toNumber()
  console.log('checking if ' + sumOfOutputs + ' plus fee is going to be bigger than ' + totalBalance)
  if (totalFee > totalBalance) {
    console.log('Insufficient balance in wallet for transaction fee')
    $('#checkWeightsModal .message .header').text('There\'s a problem')
    $('#checkWeightsModal p').text('Insufficient balance in wallet for the transaction and the transaction fee')
    $('#checkWeightsModal').modal('show')
    return
  }

  console.log('sendFrom:', sendFrom)
  console.log('txnFee: ', txnFee)
  console.log('otsKey:', otsKey)
  console.log('pubKey:', pubKey)
  console.log('thisAddressesTo:', thisAddressesTo)
  console.log('thisAmounts: ', thisAmounts)
  console.log('expiryblock', expiryBlock)

  // todo: should check expiry block for sanity

  // Calculate txn fee
  const convertFeeToBigNumber = new BigNumber(txnFee)
  const thisTxnFee = convertFeeToBigNumber.times(SHOR_PER_QUANTA).toNumber()

  // Construct request
  const request = {
    master_addr: sendFrom,
    multi_sig_address: msFrom,
    addrs_to: thisAddressesTo,
    amounts: thisAmounts,
    expiry_block_number: expiryBlock,
    fee: thisTxnFee,
    xmssPk: pubKey,
    network: selectedNetwork(),
  }
  wrapMeteorCall('spendMultiSig', request, (err, res) => {
    if (err) {
      console.log('Error with spendMultisig', err)
      Session.set('transactionGenerationError', err.reason)
      $('#transactionGenFailed').show()
      $('#transferForm').hide()
    } else {
      console.log('Result from spendMultisig', res)
      const confirmationOutputs = []

      const resAddrsTo = res.response.extended_transaction_unsigned.tx.multi_sig_spend.addrs_to
      const resAmounts = res.response.extended_transaction_unsigned.tx.multi_sig_spend.amounts
      const resExpiry = res.response.extended_transaction_unsigned.tx.multi_sig_spend.expiry_block_number

      for (let i = 0; i < resAddrsTo.length; i += 1) {
        // Create and store the output
        const thisOutput = {
          address: Buffer.from(resAddrsTo[i]),
          address_hex: helpers.rawAddressToHexAddress(resAddrsTo[i]),
          address_b32: helpers.rawAddressToB32Address(resAddrsTo[i]),
          amount: resAmounts[i],
        }
        confirmationOutputs.push(thisOutput)
      }

      const confirmation = {
        from: Buffer.from(res.response.extended_transaction_unsigned.addr_from),
        from_hex: helpers.rawAddressToHexAddress(res.response.extended_transaction_unsigned.addr_from),
        from_b32: helpers.rawAddressToB32Address(res.response.extended_transaction_unsigned.addr_from),
        outputs: confirmationOutputs,
        expiry_block_number: resExpiry,
        fee: res.response.extended_transaction_unsigned.tx.fee / SHOR_PER_QUANTA,
        otsKey,
      }

      if (nodeReturnedValidResponse(request, confirmation, 'multiSigSpend')) {
        Session.set('transactionConfirmation', confirmation)
        Session.set('transactionConfirmationFee', confirmation.fee)
        Session.set('transactionConfirmationResponse', res.response)

        // Show confirmation
        $('#generateTransactionArea').hide()
        $('#confirmTransactionArea').show()
      } else {
        // Hide generating component
        $('#generating').hide()
        // Show warning modal
        $('#invalidNodeResponse').modal('show')
      }
    }
  })
}

// TODO: port this function
function confirmTransaction() {
  const tx = Session.get('transactionConfirmationResponse')

  // Set OTS Key Index for seed wallets
  if (getXMSSDetails().walletType === 'seed') {
    XMSS_OBJECT.setIndex(parseInt(Session.get('transactionConfirmation').otsKey, 10))
  }
/*
  // Concatenate Uint8Arrays
  let concatenatedArrays = concatenateTypedArrays(
    Uint8Array,
    tx.extended_transaction_unsigned.tx.master_addr,
  )
*/

  let concatenatedArrays = concatenateTypedArrays(
    Uint8Array,
    // concatenatedArrays,
    toBigendianUint64BytesUnsigned(tx.extended_transaction_unsigned.tx.fee) // eslint-disable-line
  )

  console.log('starting with concat: ', concatenatedArrays)

  concatenatedArrays = concatenateTypedArrays(Uint8Array, concatenatedArrays, tx.extended_transaction_unsigned.tx.multi_sig_spend.multi_sig_address)

  console.log('after multi_sig_address added: ', concatenatedArrays)

  // add expiry_block_number
  concatenatedArrays = concatenateTypedArrays(Uint8Array, concatenatedArrays, toBigendianUint64BytesUnsigned(tx.extended_transaction_unsigned.tx.multi_sig_spend.expiry_block_number))
  console.log('after expiry added', concatenatedArrays)

  // Now append all recipient (outputs) to concatenatedArrays
  const addrsToRaw = tx.extended_transaction_unsigned.tx.multi_sig_spend.addrs_to
  const amountsRaw = tx.extended_transaction_unsigned.tx.multi_sig_spend.amounts
  const destAddr = []
  const destAmount = []
  for (let i = 0; i < addrsToRaw.length; i += 1) {
    // Add address
    console.log('about to concatenate...', concatenatedArrays, addrsToRaw[i])

    concatenatedArrays = concatenateTypedArrays(
      Uint8Array,
      concatenatedArrays,
      addrsToRaw[i] // eslint-disable-line
    )

    console.log('about to concatenate...', concatenatedArrays, toBigendianUint64BytesUnsigned(amountsRaw[i]))
    concatenatedArrays = concatenateTypedArrays(
      Uint8Array,
      concatenatedArrays,
      toBigendianUint64BytesUnsigned(amountsRaw[i]) // eslint-disable-line
    )

    // Add to array for Ledger Transactions
    destAddr.push(Buffer.from(addrsToRaw[i]))
    destAmount.push(toBigendianUint64BytesUnsigned(amountsRaw[i], true))
  }

  console.log('Final concatonated arrays:')
  console.log(concatenatedArrays)

  // Convert Uint8Array to VectorUChar
  const hashableBytes = toUint8Vector(concatenatedArrays)
  console.log('hashableBytes:', hashableBytes)
  // Create sha256 sum of concatenatedarray
  const shaSum = QRLLIB.sha2_256(hashableBytes)
  console.log('shaSum:', QRLLIB.bin2hstr(shaSum))
  // Sign the transaction and relay into network.
  if (getXMSSDetails().walletType === 'seed') {
    // Show relaying message
    $('#relaying').show()

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

    // Prepare gRPC call
    tx.network = selectedNetwork()

    wrapMeteorCall('confirmMultiSigSpend', tx, (err, res) => {
      if (res.error) {
        $('#transactionConfirmation').hide()
        $('#transactionFailed').show()

        Session.set('transactionFailed', res.error)
      } else {
        Session.set('transactionHash', txnHash)
        Session.set('transactionSignature', res.response.signature)
        Session.set('transactionRelayedThrough', res.relayed)

        // Show result
        $('#generateTransactionArea').hide()
        $('#confirmTransactionArea').hide()
        enableSendButton()
        $('#transactionResultArea').show()

        // Start polling this transcation
        // eslint-disable-next-line no-use-before-define
        pollTransaction(Session.get('transactionHash'), true)
      }
    })
  } else if (getXMSSDetails().walletType === 'ledger') {
    // TODO: multisig not supported on Ledger yet
  }
}

// TODO: port this function
function cancelTransaction() {
  Session.set('transactionConfirmation', '')
  Session.set('transactionConfirmationAmount', '')
  Session.set('transactionConfirmationFee', '')
  Session.set('transactionConfirmationResponse', '')

  Session.set('transactionFailed', 'User requested cancellation')

  $('#generateTransactionArea').show()
  $('#confirmTransactionArea').hide()
  enableSendButton()
  $('#transactionResultArea').hide()
}

// Function to initialise form validation
function initialiseFormValidation() {
  const validationRules = {}

  // Calculate validation fields based on to/amount fields
  _.each(getRecipientIds(), (id) => {
    validationRules['to' + id] = {
      identifier: 'to_' + id,
      rules: [
        {
          type: 'empty',
          prompt: 'Please enter the QRL address you wish to send to',
        },
        {
          type: 'qrlAddressValid',
          prompt: 'Please enter a valid QRL address',
        },
      ],
    }

    validationRules['amounts' + id] = {
      identifier: 'amounts_' + id,
      rules: [
        {
          type: 'empty',
          prompt: 'You must enter an amount',
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
  })

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

  // Address Validation
  $.fn.form.settings.rules.qrlAddressValid = function (value) {
    try {
      const rawAddress = anyAddressToRawAddress(value)
      const thisAddress = helpers.rawAddressToHexAddress(rawAddress)
      const isValid = qrlAddressValdidator.hexString(thisAddress)
      return isValid.result
    } catch (e) {
      return false
    }
  }

  // Initialise the form validation
  $('.ui.form').form({
    fields: validationRules,
  })
}

Template.multisigSpend.events({
  'click #changeAddress': () => {
    Session.set('multisigTransferFromAddressSet', false)
    // call api to get addresses
    loadMultisigs(getXMSSDetails().address, 1)
    $('#chooseSpendAddress').modal('show')
  },
  'click #addTransferRecipient': (event) => {
    event.preventDefault()
    event.stopPropagation()

    const nextRecipientId = Math.max(...getRecipientIds()) + 1

    const newTransferRecipient = `
      <div>
        <div class="field">
          <label>Additional Recipient</label>
          <div class="ui action center aligned input"  id="amountFields" style="width: 100%; margin-bottom: 10px;">
            <input type="text" id="to_${nextRecipientId}" name="to[]" placeholder="Address" style="width: 55%;">
            <input type="text" id="amounts_${nextRecipientId}" name="amounts[]" placeholder="Amount" style="width: 30%;">
            <button class="ui red small button removeTransferRecipient" style="width: 10%"><i class="remove user icon"></i></button>
          </div>
        </div>
      </div>
    `

    // Append newTransferRecipient to transferRecipients div
    $('#transferRecipients').append(newTransferRecipient)

    // Initialise form validation
    // initialiseFormValidation()
  },
  'click .removeTransferRecipient': (event) => {
    event.preventDefault()
    event.stopPropagation()

    // Remove the recipient
    $(event.currentTarget).parent().parent().parent()
      .remove()

    // Initialise form validation
    initialiseFormValidation()
  },
  'click #intervalButton': () => {
    const interval = Session.get('expiryInterval')
    if (interval === 'approx 30 days') { Session.set('expiryInterval', 'approx 6 months') }
    if (interval === 'approx 6 months') { Session.set('expiryInterval', 'approx 1 year') }
    if (interval === 'approx 1 year') { Session.set('expiryInterval', 'approx 30 days') }
    estimateExpiry(false) // update estimated expiry using existing blockheight
  },
  'click #generateTransaction': (event) => {
    event.preventDefault()
    event.stopPropagation()
    generateTransaction()
  },
  'click #confirmTransaction': () => {
    $('#confirmTransaction').attr('disabled', true)
    $('#confirmTransaction').html('<div class="ui active inline loader"></div>')
    setTimeout(() => { confirmTransaction() }, 200)
  },
  'click #quantaJsonClick': () => {
    if (!($('#quantaJsonbox').html())) {
      setRawDetail()
    }
    $('#quantaJsonbox').toggle()
  },
  'click #tokenJsonClick': () => {
    if (!($('#tokenJsonbox').html())) {
      setRawDetail()
    }
    $('#tokenJsonbox').toggle()
  },
})

Template.multisigSpend.onRendered(() => {
  Session.set('expiryInterval', 'approx 30 days')
  Session.set('activeMultisigTab', 'spend')
  Session.set('multisigTransferFromAddressSet', false)
})

// helpers and events for multisig selection modal

Template.msTable.helpers({
  msAddresses() {
    return Session.get('multiSigAddresses')
  },
  msLoading() {
    return Session.get('loadingmultiSigAddresses')
  },
  hasMultisig() {
    if (Session.get('multiSigAddresses')) {
      if (Session.get('multiSigAddresses').length > 0) {
        return true
      }
    }
    return false
  },
})

Template.msTable.events({
  'click #chooseSpendAddressTable tr': (event) => {
    const a = event.currentTarget.cells[0].textContent.trim()
    const b = event.currentTarget.cells[1].textContent.trim()
    Session.set('multisigTransferFromAddress', a)
    Session.set('multisigTransferFromBalance', b)
    Session.set('multisigTransferFromAddressSet', true)
    estimateExpiry(true) // estimate expiry getting a fresh block height
    $('#chooseSpendAddress').modal('hide')
  },
})
