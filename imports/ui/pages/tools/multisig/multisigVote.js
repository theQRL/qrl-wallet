/* eslint no-console:0, max-len:0 */
/* global getXMSSDetails, anyAddressToRawAddress, hexToBytes, SHOR_PER_QUANTA,
selectedNetwork, wrapMeteorCall, nodeReturnedValidResponse, XMSS_OBJECT, concatenateTypedArrays,
toUint8Vector, toBigendianUint64BytesUnsigned, binaryToBytes, POLL_TXN_RATE, POLL_MAX_CHECKS, DEFAULT_NETWORKS, hexOrB32 */

import helpers from '@theqrl/explorer-helpers'
import qrlAddressValdidator from '@theqrl/validate-qrl-address'
import JSONFormatter from 'json-formatter-js'
import { BigNumber } from 'bignumber.js'
// import sha256 from 'sha256'

Template.multisigVote.helpers({
  isActiveTab(p) {
    if (Session.get('activeMultisigTab') === p) {
      return 'active'
    }
    return ''
  },
  transferFrom() {
    const transferFrom = {}
    if (Session.get('multisigTransferFromAddressSet') === true) {
      transferFrom.balance = Session.get('transferFromBalance')
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
  transactionConfirmationFromMultiSig() {
    return Session.get('transactionConfirmationFromMultiSig')
  },
  transactionConfirmationUnvote() {
    return Session.get('transactionConfirmationUnvote')
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
  shorToQuanta(n) {
    const shor = new BigNumber(n)
    return shor.dividedBy(SHOR_PER_QUANTA).toNumber()
  },
  transactionGenerationError() {
    return Session.get('transactionGenerationError')
  },
  MSStxhash() {
    return Session.get('multisigTransferFromTxhash')
  },
  isChecked(v) {
    if (Session.get('unvote') === true) {
      if (v === 0) {
        return ''
      }
      return 'checked'
    }
    if (v === 0) {
      return 'checked'
    }
    return ''
  },
})

const loadMultisigs = (a, p) => {
  const addresstx = Buffer.from(a.substring(1), 'hex')
  const request = {
    address: addresstx,
    network: selectedNetwork(),
    item_per_page: 10,
    page_number: p,
    filter_type: 6,
  }
  console.log('request', request)
  Session.set('multiSigAddresses', [])
  Session.set('loadingmultiSigAddresses', true)
  wrapMeteorCall('getMultiSigSpendTxsByAddress', request, (err, res) => {
    console.log('err:', err)
    console.log('res:', res)
    if (err) {
      Session.set('multiSigAddresses', { error: err })
      Session.set('errorLoadingMultiSig', true)
    } else {
      Session.set('active', p)
      const add = []
      _.each(res.transactions_detail, (item => {
        add.push({ address: `Q${Buffer.from(item.tx.multi_sig_spend.multi_sig_address).toString('hex')}`, txhash: `${Buffer.from(item.tx.transaction_hash).toString('hex')}` })
      }))
      Session.set('multiSigAddresses', add)
      Session.set('loadingmultiSigAddresses', false)
      Session.set('errorLoadingMultiSig', false)
    }
  })
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
  const msTxhash = Session.get('multisigTransferFromTxhash')
  const formUnvote = Session.get('unvote')

  console.log('checkbox:', $('.checkbox').checkbox('is checked'))

  // check enough balance for fee
  const totalFee = new BigNumber(txnFee * SHOR_PER_QUANTA).toNumber()
  const totalBalance = new BigNumber(Session.get('multisigTransferFromTxhash')).times(SHOR_PER_QUANTA).toNumber()

  if (totalFee > totalBalance) {
    console.log('Insufficient balance in wallet for transaction fee')
    $('#checkWeightsModal .message .header').text('There\'s a problem')
    $('#checkWeightsModal p').text('Insufficient balance in your wallet for the transaction fee')
    $('#checkWeightsModal').modal('show')
    return
  }

  console.log('sendFrom:', sendFrom)
  console.log('txnFee: ', txnFee)
  console.log('otsKey:', otsKey)
  console.log('pubKey:', pubKey)
  console.log('msTxhash:', msTxhash)

  // Calculate txn fee
  const convertFeeToBigNumber = new BigNumber(txnFee)
  const thisTxnFee = convertFeeToBigNumber.times(SHOR_PER_QUANTA).toNumber()

  // Construct request
  const request = {
    master_addr: sendFrom,
    shared_key: Buffer.from(msTxhash, 'hex'),
    unvote: formUnvote,
    fee: thisTxnFee,
    xmssPk: pubKey,
    network: selectedNetwork(),
  }
  wrapMeteorCall('voteMultiSig', request, (err, res) => {
    if (err) {
      console.log('Error with voteMultisig', err)
      Session.set('transactionGenerationError', err.reason)
      $('#transactionGenFailed').show()
      $('#transferForm').hide()
    } else {
      console.log('Result from voteMultisig', res)
      /*
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
        totalTransferAmount += resAmounts[i]
      }
      */
      const confirmation = {
        from: Buffer.from(res.response.extended_transaction_unsigned.addr_from),
        from_hex: helpers.rawAddressToHexAddress(res.response.extended_transaction_unsigned.addr_from),
        from_b32: helpers.rawAddressToB32Address(res.response.extended_transaction_unsigned.addr_from),
        fee: res.response.extended_transaction_unsigned.tx.fee / SHOR_PER_QUANTA,
        otsKey,
      }

      if (nodeReturnedValidResponse(request, confirmation, 'multiSigVote')) {
        Session.set('transactionConfirmation', confirmation)
        // Session.set('transactionConfirmationAmount', totalTransferAmount / SHOR_PER_QUANTA)
        Session.set('transactionConfirmationFee', confirmation.fee)
        Session.set('transactionConfirmationResponse', res.response)
        Session.set('transactionConfirmationFromMultiSig', Buffer.from(res.response.extended_transaction_unsigned.tx.multi_sig_vote.shared_key).toString('hex'))
        Session.set('transactionConfirmationUnvote', res.response.extended_transaction_unsigned.tx.multi_sig_vote.unvote)
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

  let concatenatedArrays = concatenateTypedArrays(
    Uint8Array,
    // concatenatedArrays,
    toBigendianUint64BytesUnsigned(tx.extended_transaction_unsigned.tx.fee) // eslint-disable-line
  )

  console.log('starting with concat: ', concatenatedArrays)

  concatenatedArrays = concatenateTypedArrays(Uint8Array, concatenatedArrays, tx.extended_transaction_unsigned.tx.multi_sig_vote.shared_key)

  console.log('after shared_key added: ', concatenatedArrays)

  // add unvote flag
  const unvote = new Uint8Array(1)

  if (tx.extended_transaction_unsigned.tx.multi_sig_vote.unvote === true) {
    unvote[0] = 1
  } else {
    unvote[0] = 0
  }
  concatenatedArrays = concatenateTypedArrays(Uint8Array, concatenatedArrays, unvote)
  console.log('after unvote added', concatenatedArrays)

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

    wrapMeteorCall('confirmMultiSigVote', tx, (err, res) => {
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
  // Set fee and otskey validation rules
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

Template.multisigVote.events({
  'click #changeAddress': () => {
    Session.set('multisigTransferFromAddressSet', false)
    // call api to get addresses
    loadMultisigs(getXMSSDetails().address, 1)
    $('#chooseVoteAddress').modal('show')
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
  'click .checkbox': () => {
    if ($('#vote_reject')[0].checked === true) {
      Session.set('unvote', true)
    } else {
      Session.set('unvote', false)
    }
  },
})

Template.multisigVote.onRendered(() => {
  Session.set('expiryInterval', 'approx 30 days')
  Session.set('activeMultisigTab', 'vote')
  Session.set('multisigTransferFromAddressSet', false)
  Session.set('unvote', false)
  initialiseFormValidation()
})

// helpers and events for multisig selection modal

Template.msvTable.helpers({
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

Template.msvTable.events({
  'click #chooseVoteAddressTable tr': (event) => {
    console.log(event)
    const a = event.currentTarget.cells[0].textContent.trim()
    const b = event.currentTarget.children[1].attributes[0].nodeValue.trim()
    Session.set('multisigTransferFromAddress', b)
    Session.set('multisigTransferFromTxhash', a)
    Session.set('multisigTransferFromAddressSet', true)
    $('#chooseVoteAddress').modal('hide')
  },
})
