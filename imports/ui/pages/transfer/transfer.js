import async from 'async'
import JSONFormatter from 'json-formatter-js'
import { BigNumber } from 'bignumber.js'
import qrlAddressValdidator from '@theqrl/validate-qrl-address'
import helpers from '@theqrl/explorer-helpers'
import './transfer.html'
/* global QRLLIB */
/* global selectedNetwork */
/* global XMSS_OBJECT */
/* global LocalStore */
/* global DEFAULT_NETWORKS */
/* global SHOR_PER_QUANTA */
/* global POLL_TXN_RATE */
/* global POLL_MAX_CHECKS */
/* global wrapMeteorCall */
/* global countDecimals */
/* global nodeReturnedValidResponse */
/* global otsIndexUsed */
/* global getXMSSDetails */

let tokensHeld = []

function generateTransaction() {
  // Get to/amount details
  const sendFrom = anyAddressToRawAddress(Session.get('transferFromAddress'))
  const txnFee = document.getElementById('fee').value
  const otsKey = document.getElementById('otsKey').value
  const pubKey = hexToBytes(getXMSSDetails().pk)
  var sendTo = document.getElementsByName("to[]")
  var sendAmounts = document.getElementsByName("amounts[]")

  // Capture outputs
  let this_addresses_to = []
  let this_amounts = []

  for (var i = 0; i < sendTo.length; i++) {
    const thisAddress = sendTo[i].value
    
     // Fail early if attempting to send to an Ethereum style 0x address
    if ((thisAddress[0] === '0') && (thisAddress[1] === 'x')) {
      $('#generating').hide()
      $('#invalidAddress0x').modal('show')
      return
    }

    this_addresses_to.push(anyAddressToRawAddress(thisAddress))
  }

  // Fail if OTS Key reuse is detected
  if(otsIndexUsed(Session.get('otsBitfield'), otsKey)) {
    $('#generating').hide()
    $('#otsKeyReuseDetected').modal('show')
    return
  }

  // Format amounts correctly.
  for (var i = 0; i < sendAmounts.length; i++) {
    let convertAmountToBigNumber = new BigNumber(sendAmounts[i].value)
    let thisAmount = convertAmountToBigNumber.times(SHOR_PER_QUANTA).toNumber()
    this_amounts.push(thisAmount)
  }

  // Calculate txn fee
  let convertFeeToBigNumber = new BigNumber(txnFee)
  let thisTxnFee = convertFeeToBigNumber.times(SHOR_PER_QUANTA).toNumber()

  // Construct request
  const request = {
    fromAddress: sendFrom,
    addresses_to: this_addresses_to,
    amounts: this_amounts,
    fee: thisTxnFee,
    xmssPk: pubKey,
    network: selectedNetwork(),
  }

  wrapMeteorCall('transferCoins', request, (err, res) => {
    if (err) {
      Session.set('transactionGenerationError', err.reason)
      $('#transactionGenFailed').show()
      $('#transferForm').hide()
    } else {
      let confirmation_outputs = []

      let resAddrsTo = res.response.extended_transaction_unsigned.tx.transfer.addrs_to
      let resAmounts = res.response.extended_transaction_unsigned.tx.transfer.amounts
      let totalTransferAmount = 0

      for (var i = 0; i < resAddrsTo.length; i++) {
        // Create and store the output
        const thisOutput = {
          address: Buffer.from(resAddrsTo[i]),
          address_hex: helpers.rawAddressToHexAddress(resAddrsTo[i]),
          address_b32: helpers.rawAddressToB32Address(resAddrsTo[i]),
          amount: resAmounts[i] / SHOR_PER_QUANTA,
          name: "Quanta"
        }
        confirmation_outputs.push(thisOutput)

        // Update total transfer amount
        totalTransferAmount += parseInt(resAmounts[i])
      }

      const confirmation = {
        from: Buffer.from(res.response.extended_transaction_unsigned.addr_from),
        from_hex: helpers.rawAddressToHexAddress(res.response.extended_transaction_unsigned.addr_from),
        from_b32: helpers.rawAddressToB32Address(res.response.extended_transaction_unsigned.addr_from),
        outputs: confirmation_outputs,
        fee: res.response.extended_transaction_unsigned.tx.fee / SHOR_PER_QUANTA,
        otsKey: otsKey
      }

      if (nodeReturnedValidResponse(request, confirmation, 'transferCoins')) {
        Session.set('transactionConfirmation', confirmation)
        Session.set('transactionConfirmationAmount', totalTransferAmount / SHOR_PER_QUANTA)
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

function confirmTransaction() {
  const tx = Session.get('transactionConfirmationResponse')

  // Set OTS Key Index for seed wallets
  if (getXMSSDetails().walletType == 'seed') {
    XMSS_OBJECT.setIndex(parseInt(Session.get('transactionConfirmation').otsKey))
  }

  // Concatenate Uint8Arrays
  let concatenatedArrays = concatenateTypedArrays(
    Uint8Array,
      //tx.extended_transaction_unsigned.addr_from,
      toBigendianUint64BytesUnsigned(tx.extended_transaction_unsigned.tx.fee)
  )

  // Now append all recipient (outputs) to concatenatedArrays
  const addrsToRaw = tx.extended_transaction_unsigned.tx.transfer.addrs_to
  const amountsRaw = tx.extended_transaction_unsigned.tx.transfer.amounts
  let dest_addr = []
  let dest_amount = []
  for (var i = 0; i < addrsToRaw.length; i++) {
    // Add address
    concatenatedArrays = concatenateTypedArrays(
      Uint8Array,
        concatenatedArrays,
        addrsToRaw[i]
    )

    // Add amount
    concatenatedArrays = concatenateTypedArrays(
      Uint8Array,
        concatenatedArrays,
        toBigendianUint64BytesUnsigned(amountsRaw[i])
    )

    // Add to array for Ledger Transactions
    dest_addr.push(Buffer.from(addrsToRaw[i]))
    dest_amount.push(toBigendianUint64BytesUnsigned(amountsRaw[i],true))
  }

  // Convert Uint8Array to VectorUChar
  const hashableBytes = toUint8Vector(concatenatedArrays)

  // Create sha256 sum of concatenatedarray
  let shaSum = QRLLIB.sha2_256(hashableBytes)

  // Sign the transaction and relay into network.
  if (getXMSSDetails().walletType == 'seed') {
    tx.extended_transaction_unsigned.tx.signature = binaryToBytes(XMSS_OBJECT.sign(shaSum))

    // Calculate transaction hash
    let txnHashConcat = concatenateTypedArrays(
      Uint8Array,
        binaryToBytes(shaSum),
        tx.extended_transaction_unsigned.tx.signature,
        hexToBytes(XMSS_OBJECT.getPK())
    )

    const txnHashableBytes = toUint8Vector(txnHashConcat)

    let txnHash = QRLLIB.bin2hstr(QRLLIB.sha2_256(txnHashableBytes))

    console.log('Txn Hash: ', txnHash)

    // Prepare gRPC call
    tx.network = selectedNetwork()

    wrapMeteorCall('confirmTransaction', tx, (err, res) => {
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
        $('#transactionResultArea').show()
        
        // Start polling this transcation
        pollTransaction(Session.get('transactionHash'), true)
      }
    })
  } else if (getXMSSDetails().walletType == 'ledger') {

    // Create a transaction
    const source_addr = hexToBytes(QRLLIB.getAddress(getXMSSDetails().pk))
    const fee = toBigendianUint64BytesUnsigned(tx.extended_transaction_unsigned.tx.fee, true)

    QrlLedger.createTx(source_addr, fee, dest_addr, dest_amount).then(txn => {
      console.log(txn)

      QrlLedger.retrieveSignature(txn).then(sig => {
        tx.extended_transaction_unsigned.tx.signature = sig.signature

        // Calculate transaction hash
        let txnHashConcat = concatenateTypedArrays(
          Uint8Array,
            binaryToBytes(shaSum),
            tx.extended_transaction_unsigned.tx.signature,
            hexToBytes(getXMSSDetails().pk)
        )

        const txnHashableBytes = toUint8Vector(txnHashConcat)

        let txnHash = QRLLIB.bin2hstr(QRLLIB.sha2_256(txnHashableBytes))

        console.log('Txn Hash: ', txnHash)

        // Prepare gRPC call
        tx.network = selectedNetwork()

        wrapMeteorCall('confirmTransaction', tx, (err, res) => {
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
            $('#transactionResultArea').show()
            
            // Start polling this transcation
            pollTransaction(Session.get('transactionHash'), true)
          }
        })
      })
    })
  }
}

function cancelTransaction() {
  Session.set('transactionConfirmation', '')
  Session.set('transactionConfirmationAmount', '')
  Session.set('transactionConfirmationFee', '')
  Session.set('transactionConfirmationResponse', '')

  Session.set('transactionFailed', 'User requested cancellation')

  $('#generateTransactionArea').show()
  $('#confirmTransactionArea').hide()
  $('#transactionResultArea').hide()
}

function sendTokensTxnCreate(tokenHash, decimals) {
  // Get to/amount details
  const sendFrom = anyAddressToRawAddress(Session.get('transferFromAddress'))
  const txnFee = document.getElementById('fee').value
  const otsKey = document.getElementById('otsKey').value
  var sendTo = document.getElementsByName("to[]")
  var sendAmounts = document.getElementsByName("amounts[]")
  
  // Convert strings to bytes
  const pubKey = hexToBytes(getXMSSDetails().pk)
  const tokenHashBytes = stringToBytes(tokenHash)

  // Fail if OTS Key reuse is detected
  if(otsIndexUsed(Session.get('otsBitfield'), otsKey)) {
    $('#generating').hide()
    $('#otsKeyReuseDetected').modal('show')
    return
  }

  // Capture outputs
  let this_addresses_to = []
  let this_amounts = []

  for (var i = 0; i < sendTo.length; i++) {
    this_addresses_to.push(anyAddressToRawAddress(sendTo[i].value))
  }
   for (var i = 0; i < sendAmounts.length; i++) {
    let convertAmountToBigNumber = new BigNumber(sendAmounts[i].value)
    let thisAmount = convertAmountToBigNumber.times(Math.pow(10, decimals)).toNumber()
    this_amounts.push(thisAmount)
  }

  // Calculate txn fee
  let convertFeeToBigNumber = new BigNumber(txnFee)
  let thisTxnFee = convertFeeToBigNumber.times(SHOR_PER_QUANTA).toNumber()

  // Construct request
  const request = {
    addressFrom: sendFrom,
    addresses_to: this_addresses_to,
    amounts: this_amounts,
    tokenHash: tokenHashBytes,
    fee: thisTxnFee,
    xmssPk: pubKey,
    network: selectedNetwork(),
  }

  wrapMeteorCall('createTokenTransferTxn', request, (err, res) => {
    if (err) {
      Session.set('tokenTransferError', err.reason)
      $('#transactionGenFailed').show()
      $('#transferForm').hide()
    } else {

      let tokenDetails = {}
      _.each(Session.get('tokensHeld'), (token) => {
        if(token.hash == tokenHash) {
          tokenDetails.symbol = token.symbol
          tokenDetails.name = token.symbol
          tokenDetails.token_txhash = token.hash
          tokenDetails.decimals = token.decimals
        }
      })

      let confirmation_outputs = []

      let resAddrsTo = res.response.extended_transaction_unsigned.tx.transfer_token.addrs_to
      let resAmounts = res.response.extended_transaction_unsigned.tx.transfer_token.amounts
      let totalTransferAmount = 0

      for (var i = 0; i < resAddrsTo.length; i++) {
        // Create and store the output
        const thisOutput = {
          address: Buffer.from(resAddrsTo[i]),
          address_hex: helpers.rawAddressToHexAddress(resAddrsTo[i]),
          address_b32: helpers.rawAddressToB32Address(resAddrsTo[i]),
          amount: resAmounts[i] / Math.pow(10, decimals),
          name: tokenDetails.symbol
        }
        confirmation_outputs.push(thisOutput)

        // Update total transfer amount
        totalTransferAmount += parseInt(resAmounts[i])
      }

      const confirmation = {
        hash: res.txnHash,
        from: Buffer.from(res.response.extended_transaction_unsigned.addr_from),
        from_hex: helpers.rawAddressToHexAddress(res.response.extended_transaction_unsigned.addr_from),
        from_b32: helpers.rawAddressToB32Address(res.response.extended_transaction_unsigned.addr_from),
        outputs: confirmation_outputs,
        fee: res.response.extended_transaction_unsigned.tx.fee / SHOR_PER_QUANTA,
        tokenHash: res.response.extended_transaction_unsigned.tx.transfer_token.token_txhash,
        otsKey: otsKey,
      }

      if (nodeReturnedValidResponse(request, confirmation, 'createTokenTransferTxn', decimals)) {
        Session.set('tokenTransferConfirmation', confirmation)
        Session.set('tokenTransferConfirmationDetails', tokenDetails)
        Session.set('tokenTransferConfirmationResponse', res.response)
        Session.set('tokenTransferConfirmationAmount', totalTransferAmount / Math.pow(10, decimals))

        // Show confirmation
        $('#generateTransactionArea').hide()
        $('#confirmTokenTransactionArea').show()
      } else {
        $('#invalidNodeResponse').modal('show')
      }
    }
  })
}

function confirmTokenTransfer() {
  const tx = Session.get('tokenTransferConfirmationResponse')

  // Set OTS Key Index for seed wallets
  if(getXMSSDetails().walletType == 'seed') {
    XMSS_OBJECT.setIndex(parseInt(Session.get('tokenTransferConfirmation').otsKey))
  }

  // Concatenate Uint8Arrays
  let concatenatedArrays = concatenateTypedArrays(
    Uint8Array,
      // tx.extended_transaction_unsigned.addr_from,
      toBigendianUint64BytesUnsigned(tx.extended_transaction_unsigned.tx.fee),
      tx.extended_transaction_unsigned.tx.transfer_token.token_txhash,

  )

  // Now append all recipient (outputs) to concatenatedArrays
  const addrsToRaw = tx.extended_transaction_unsigned.tx.transfer_token.addrs_to
  const amountsRaw = tx.extended_transaction_unsigned.tx.transfer_token.amounts
  for (var i = 0; i < addrsToRaw.length; i++) {
    // Add address
    concatenatedArrays = concatenateTypedArrays(
      Uint8Array,
        concatenatedArrays,
        addrsToRaw[i]
    )

    // Add amount
    concatenatedArrays = concatenateTypedArrays(
      Uint8Array,
        concatenatedArrays,
        toBigendianUint64BytesUnsigned(amountsRaw[i])
    )
  }

  // Convert Uint8Array to VectorUChar
  const hashableBytes = toUint8Vector(concatenatedArrays)

  // Create sha256 sum of concatenatedarray
  let shaSum = QRLLIB.sha2_256(hashableBytes)

  // Sign the transaction and relay into network.
  if(getXMSSDetails().walletType == 'seed') {
    // Sign the sha sum
    tx.extended_transaction_unsigned.tx.signature = binaryToBytes(XMSS_OBJECT.sign(shaSum))

    // Calculate transaction hash
    let txnHashConcat = concatenateTypedArrays(
      Uint8Array,
        binaryToBytes(shaSum),
        tx.extended_transaction_unsigned.tx.signature,
        hexToBytes(XMSS_OBJECT.getPK())
    )

    const txnHashableBytes = toUint8Vector(txnHashConcat)

    let txnHash = QRLLIB.bin2hstr(QRLLIB.sha2_256(txnHashableBytes))

    console.log('Txn Hash: ', txnHash)

    tx.network = selectedNetwork()

    wrapMeteorCall('confirmTokenTransfer', tx, (err, res) => {
      if (res.error) {
        $('#tokenCreationConfirmation').hide()
        $('#transactionFailed').show()

        Session.set('transactionFailed', res.error)
      } else {
        Session.set('transactionHash', txnHash)
        Session.set('transactionSignature', res.response.signature)
        Session.set('transactionRelayedThrough', res.relayed)

        // Show result
        $('#generateTransactionArea').hide()
        $('#confirmTokenTransactionArea').hide()
        $('#tokenTransactionResultArea').show()

        // Start polling this transcation
        pollTransaction(Session.get('transactionHash'), true)
      }
    })
  } else if(getXMSSDetails().walletType == 'ledger') {
    // Sign the shasum with ledger
    signWithLedger(shaSum, (response) => {
      tx.extended_transaction_unsigned.tx.signature = response
      // Calculate transaction hash
      let txnHashConcat = concatenateTypedArrays(
        Uint8Array,
          binaryToBytes(shaSum),
          tx.extended_transaction_unsigned.tx.signature,
          hexToBytes(getXMSSDetails().pk)
      )
      const txnHashableBytes = toUint8Vector(txnHashConcat)
      let txnHash = QRLLIB.bin2hstr(QRLLIB.sha2_256(txnHashableBytes))
      console.log('Txn Hash: ', txnHash)
      tx.network = selectedNetwork()
      wrapMeteorCall('confirmTokenTransfer', tx, (err, res) => {
        if (res.error) {
          $('#tokenCreationConfirmation').hide()
          $('#transactionFailed').show()
          Session.set('transactionFailed', res.error)
        } else {
          Session.set('transactionHash', txnHash)
          Session.set('transactionSignature', res.response.signature)
          Session.set('transactionRelayedThrough', res.relayed)
          // Show result
          $('#generateTransactionArea').hide()
          $('#confirmTokenTransactionArea').hide()
          $('#tokenTransactionResultArea').show()
          // Start polling this transcation
          pollTransaction(Session.get('transactionHash'), true)
        }
      })
    })
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

// Checks the result of a stored txhash object, and polls again if not completed or failed.
function checkResult(thisTxId, failureCount) {
  try {
    if (Session.get('txhash').transaction.header != null) {
      // Complete
      const userMessage = `Complete - Transaction ${thisTxId} is in block ${Session.get('txhash').transaction.header.block_number} with 1 confirmation.`
      Session.set('txstatus', userMessage)
      Session.set('transactionConfirmed', "true")
      $('.loading').hide()
      $('#loadingHeader').hide()
      refreshTransferPage()
    } else if (Session.get('txhash').error != null) {
      // We attempt to find the transaction 5 times below absolutely failing.
      if(failureCount < 5) {
        failureCount += 1
        setTimeout(() => { pollTransaction(thisTxId, false, failureCount) }, POLL_TXN_RATE)
      } else {
        // Transaction error - Give up
        const errorMessage = `Error - ${Session.get('txhash').error}`
        Session.set('txstatus', errorMessage)
        Session.set('transactionConfirmed', "false")
        $('.loading').hide()
        $('#loadingHeader').hide()
      }
    } else {
      // Poll again
      setTimeout(() => { pollTransaction(thisTxId) }, POLL_TXN_RATE)
    }
  } catch (err) {
    // Most likely is that the mempool is not replying the transaction. We attempt to find it ongoing
    // For a while
    console.log(`Caught Error: ${err}`)

    // Continue to check the txn status until POLL_MAX_CHECKS is reached in failureCount
    if(failureCount < POLL_MAX_CHECKS) {
      failureCount += 1
      setTimeout(() => { pollTransaction(thisTxId, false, failureCount) }, POLL_TXN_RATE)
    } else {
      // Transaction error - Give up
      Session.set('txstatus', 'Error')
      Session.set('transactionConfirmed', "false")
      $('.loading').hide()
      $('#loadingHeader').hide()
    }
  }
}

// Poll a transaction for its status after relaying into network.
function pollTransaction(thisTxId, firstPoll = false, failureCount = 0) {
  // Reset txhash on first poll.
  if (firstPoll === true) {
    Session.set('txhash', {})
  }

  Session.set('txstatus', 'Pending')
  Session.set('transactionConfirmed', "false")

  const request = {
    query: thisTxId,
    network: selectedNetwork(),
  }

  if (thisTxId) {
    wrapMeteorCall('getTxnHash', request, (err, res) => {
      if (err) {
        if(failureCount < POLL_MAX_CHECKS) {
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

// Get list of ids for recipients
function getRecipientIds() {
  const ids = []
  const elements = document.getElementsByName("to[]")
  _.each(elements, (element) => {
    const thisId = element.id
    const parts = thisId.split('_')
    ids.push(parseInt(parts[1]))
  })
  return ids
}

// Function to initialise form validation
function initialiseFormValidation() {
  let validationRules = {}

  // Calculate validation fields based on to/amount fields
  _.each(getRecipientIds(), (id) => {
     validationRules['to' + id] = {
      identifier: 'to_'+id,
      rules: [
        {
          type: 'empty',
          prompt: 'Please enter the QRL address you wish to send to',
        },
      ],
    };

    validationRules['amounts' + id] = {
      identifier: 'amounts_'+id,
      rules: [
        {
          type: 'empty',
          prompt: 'You must enter an amount to send',
        },
        {
          type: 'number',
          prompt: 'Amount must be a number',
        },
        {
          type: 'maxDecimals',
          prompt: 'You can only enter up to 9 decimal places in the amount field'
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
        prompt: 'You can only enter up to 9 decimal places in the fee field'
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
  $.fn.form.settings.rules.maxDecimals = function(value) {
    return (countDecimals(value) <= 9)
  }

  // Initliase the form validation
  $('.ui.form').form({
    fields: validationRules,
  })
}

Template.appTransfer.onCreated(() => {
  // Route to open wallet is already opened
  if (Session.get('walletStatus').unlocked === false) {
    const params = {}
    const path = FlowRouter.path('/open', params)
    FlowRouter.go(path)
  }
})

Template.appTransfer.onRendered(() => {
  // Initialise dropdowns
  $('.ui.dropdown').dropdown()
  
  // Initialise Form Validation
  initialiseFormValidation()

  // Initialise tabs
  $('#sendReceiveTabs .item').tab()

  // Load transactions
  refreshTransferPage(function () {
    // Show warning is otsKeysRemaining is low
    if(Session.get('otsKeysRemaining') < 50) {
      // Shown low OTS Key warning modal
      $('#lowOtsKeyWarning').modal('transition', 'disable').modal('show')
    }
  })

  // Warn if user is has opened the 0 byte address (test mode on Ledger)
  if (getXMSSDetails().address === 'Q000400846365cd097082ce4404329d143959c8e4557d19b866ce8bf5ad7c9eb409d036651f62bd') {
    $('#zeroBytesAddressWarning').modal('transition', 'disable').modal('show')
  }

  Tracker.autorun(function () {
    if(LocalStore.get('addressFormat') == 'bech32') {
      $('.qr-code-container').empty()
      $(".qr-code-container").qrcode({width:142, height:142, text: getXMSSDetails().addressB32})
    }
    else {
      $('.qr-code-container').empty()
      $(".qr-code-container").qrcode({width:142, height:142, text: getXMSSDetails().address})
    }
    $('#recQR').empty()
    $('#recQR').qrcode({width:142, height:142, text: getXMSSDetails().hexseed})
  })
})

Template.appTransfer.events({
  'submit #generateTransactionForm': (event) => {
    event.preventDefault()
    event.stopPropagation()
    $('#generating').show()
    setTimeout(() => { 
      // Determine if Quanta or Token transfer
      const selectedType = document.getElementById('amountType').value
      // Quanta Xfer
      if(selectedType == 'quanta') {
        generateTransaction()
      } else {
        // Token Xfer
        const tokenHash = selectedType.split('-')[1]
        const decimals = selectedType.split('-')[2]
        sendTokensTxnCreate(tokenHash, decimals)
      }
    }, 200)
  },
  'click #confirmTransaction': () => {
    $('#relaying').show()
    setTimeout(() => { confirmTransaction() }, 200)
  },
  'click #confirmTokenTransaction': () => {
    $('#relayingTokenXfer').show()
    setTimeout(() => { confirmTokenTransfer() }, 200)
  },
  'click #cancelTransaction': () => {
    cancelTransaction()
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
  'change #amountType': () => {
    updateBalanceField()
  },
  'click #addTransferRecipient': (event) => {
    event.preventDefault()
    event.stopPropagation()

    // Increment count of recipients
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
    `;

    // Append newTransferRecipient to transferRecipients div
    $('#transferRecipients').append(newTransferRecipient)

    // Initialise form validation
    initialiseFormValidation()
  },
  'click .removeTransferRecipient': (event) => {
    event.preventDefault()
    event.stopPropagation()

    // Remove the recipient
    $(event.currentTarget).parent().parent().parent().remove()

    // Initialise form validation
    initialiseFormValidation()
  },
  'click .pagination': (event) => {
    let b = 0
    Session.set('addressTransactions', {})
    if (parseInt(event.target.text, 10)) {
      b = parseInt(event.target.text, 10)
      Session.set('active', b)
    } else {
      const a = event.target.getAttribute('qrl-data')
      b = Session.get('active')
      const c = Session.get('pages')
      if (a === 'forward') {
        b += 1
      }
      if (a === 'back') {
        b -= 1
      }
      if (b > c) {
        b = c
      }
      if (b < 1) {
        b = 1
      }
    }
    const startIndex = (b - 1) * 10
    Session.set('active', b)
    const txArray = Session.get('address').state.transactions.reverse().slice(startIndex, startIndex + 10)
    $('#loadingTransactions').show()
    // Session.set('fetchedTx', false)
    loadAddressTransactions(txArray)
  },
  'click #showRecoverySeed': () => {
    $('#recoverySeedModal').modal('show')
  }
})

Template.appTransfer.helpers({
  transferFrom() {
    const transferFrom = {}
    transferFrom.balance = Session.get('transferFromBalance')
    transferFrom.address = hexOrB32(Session.get('transferFromAddress'))
    return transferFrom
  },
  bech32() {
    if (LocalStore.get('addressFormat') == 'bech32') {
      return true
    }
    return false
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
    const transactionConfirmationFee = 
      Session.get('transactionConfirmationResponse').extended_transaction_unsigned.tx.fee / SHOR_PER_QUANTA
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
  transactionFailed() {
    const failed = Session.get('transactionFailed')
    return failed
  },
  transactionHash() {
    const hash = Session.get('transactionHash')
    return hash
  },
  transactionSignature() {
    const hash = Session.get('transactionSignature')
    return hash
  },
  transactionStatus() {
    const status = Session.get('txstatus')
    return status
  },
  transactionRelayedThrough() {
    const status = Session.get('transactionRelayedThrough')
    return status
  },
  txDetail() {
    let txDetail = Session.get('txhash').transaction.tx.transfer
    txDetail.amount /= SHOR_PER_QUANTA
    txDetail.fee /= SHOR_PER_QUANTA
    return txDetail
  },
  tokenTransferConfirmation() {
    const confirmation = Session.get('tokenTransferConfirmation')
    confirmation.tokenHash = Buffer.from(confirmation.tokenHash).toString('hex')
    return confirmation
  },
  tokenTransferConfirmationAmount() {
    const amount = Session.get('tokenTransferConfirmationAmount')
    return amount
  },
  tokenDetails() {
    const confirmation = Session.get('tokenTransferConfirmationDetails')
    return confirmation
  },
  otsKey() {
    let otsKey = Session.get('txhash').transaction.tx.signature
    otsKey = parseInt(otsKey.substring(0,8), 16)
    return otsKey
  },
  addressTransactions() {
    const transactions = []
    const thisAddress = getXMSSDetails().address
    _.each(Session.get('addressTransactions'), (transaction) => {
      const y = transaction
      
      // Update timestamp from unix epoch to human readable time/date.
      if (moment.unix(transaction.timestamp).isValid()) {
        y.timestamp = moment.unix(transaction.timestamp).format('HH:mm D MMM YYYY')
      } else {
        y.timestamp = 'Unconfirmed Tx'
      }

      // Set total received amount if sent to this address
      let thisReceivedAmount = 0
      if ((transaction.type === 'transfer') || (transaction.type === 'transfer_token')) {
        _.each(transaction.outputs, (output) => {
          if(output.address_hex == thisAddress) {
            thisReceivedAmount += parseFloat(output.amount)
          }
        })
      }
      y.thisReceivedAmount = numberToString(thisReceivedAmount)

      transactions.push(y)
    })
    return transactions
  },
  addressHasTransactions() {
    if(Session.get('addressTransactions').length > 0) {
      return true
    }
    return false
  },
  isMyAddress(address) {
    a = Buffer.from(anyAddressToRawAddress(address))
    b = Buffer.from(anyAddressToRawAddress(getXMSSDetails().address))
    if(a.equals(b)) {
      return true
    }
    return false
  },
  isTransfer(txType) {
    if(txType == "transfer") {
      return true
    }
    return false
  },
  isTokenCreation(txType) {
    if(txType == "token") {
      return true
    }
    return false
  },
  isTokenTransfer(txType) {
    if(txType == "transfer_token") {
      return true
    }
    return false
  },
  isCoinbaseTxn(txType) {
    if(txType == "coinbase") {
      return true
    }
    return false
  },
  isSlaveTxn(txType) {
    if (txType === 'slave') {
      return true
    }
    return false
  },
  isLatticePKTxn(txType) {
    if (txType === 'latticePK') {
      return true
    }
    return false
  },
  isMessageTxn(txType) {
    if (txType === 'MESSAGE') {
      return true
    }
    return false
  },
  isDocumentNotarisation(txType) {
    if (txType === 'DOCUMENT_NOTARISATION') {
      return true
    }
    return false
  },
  ts() {
    const x = moment.unix(this.timestamp)
    return moment(x).format('HH:mm D MMM YYYY')
  },
  openedAddress() {
    if(LocalStore.get('addressFormat') == 'bech32') {
      return getXMSSDetails().addressB32
    }
    else {
      return getXMSSDetails().address
    }
  },
  tokensHeld() {
    const tokens = []
    _.each(Session.get('tokensHeld'), (token) => {
      token.shortHash = token.hash.slice(-5)
      tokens.push(token)
    })
    return tokens
  },
  balanceAmount() {
    return Session.get('balanceAmount')
  },
  balanceSymbol() {
    return Session.get('balanceSymbol')
  },
  addressValidation() {
    const thisAddress = getXMSSDetails().address
    const validationResult = qrlAddressValdidator.hexString(thisAddress)

    let result = {}
    result.height = validationResult.sig.height
    result.totalSignatures = validationResult.sig.number
    result.signatureScheme = validationResult.sig.type
    result.hashFunction = validationResult.hash.function

    return result
  },
  // Pagination for address transactions
  pages() {
    let ret = []
    const active = Session.get('active')
    if (Session.get('pages').length > 0) {
      ret = Session.get('pages')
      if ((active - 5) <= 0) {
        ret = ret.slice(0, 9)
      } else {
        if ((active + 10) > ret.length) {
          ret = ret.slice(ret.length - 10, ret.length)
        } else {
          ret = ret.slice(active - 5, active + 4)
        }
      }
    }
    return ret
  },
  isActive() {
    let ret = ''
    if (this.number === Session.get('active')) {
      ret = 'active'
    }
    return ret
  },
  pback() {
    let ret = false
    if (Session.get('active') !== 1) {
      ret = true
    }
    return ret
  },
  pforward() {
    let ret = false
    if (Session.get('active') !== Session.get('pages').length) {
      ret = true
    }
    return ret
  },
  pagination() {
    let ret = false
    if (Session.get('pages').length > 1) {
      ret = true
    }
    return ret
  },
})
Template.recoverySeedModal.helpers({
  recoverySeed() {
    return getXMSSDetails()
  },
  ledgerWalletDisabled() {
    if (getXMSSDetails().walletType == 'ledger') {
      return 'disabled'
    }
    return ''
  },
  isLedgerWallet() {
    if (getXMSSDetails().walletType == 'ledger') {
      return true
    }
    return false
  },
})
