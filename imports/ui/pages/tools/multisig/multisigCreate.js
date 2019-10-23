/* eslint no-console:0, max-len:0 */
/* global getXMSSDetails, anyAddressToRawAddress, hexToBytes, SHOR_PER_QUANTA,
selectedNetwork, wrapMeteorCall, nodeReturnedValidResponse, XMSS_OBJECT, concatenateTypedArrays,
toUint8Vector, toBigendianUint64BytesUnsigned, binaryToBytes, POLL_TXN_RATE, POLL_MAX_CHECKS, DEFAULT_NETWORKS */

import helpers from '@theqrl/explorer-helpers'
import qrlAddressValdidator from '@theqrl/validate-qrl-address'
import { checkWeightsAndThreshold } from '@theqrl/wallet-helpers'
import JSONFormatter from 'json-formatter-js'
import { BigNumber } from 'bignumber.js'

Template.multisigCreate.onCreated(() => {
  // Route to open wallet is already opened
  if (Session.get('walletStatus').unlocked === false) {
    const params = {}
    const path = FlowRouter.path('/open', params)
    FlowRouter.go(path)
  }
})

Template.multisigCreate.helpers({
  isActiveTab(p) {
    if (Session.get('activeMultisigTab') === p) {
      return 'active'
    }
    return ''
  },
  creator() {
    if (LocalStore.get('addressFormat') === 'bech32') {
      return getXMSSDetails().addressB32
    }
    return getXMSSDetails().address
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
  thresholdForSpend() {
    if (Session.get('transactionConfirmationResponse') === undefined) { return false }
    const thresholdForSpend = Session.get('transactionConfirmationResponse').extended_transaction_unsigned.tx.multi_sig_create.threshold
    return thresholdForSpend
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
  const threshold = parseInt(document.getElementById('threshold').value, 10)

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
    $('#checkWeightsModal p').text('One or more of the signatories is invalid: please check the addresses carefully')
    $('#checkWeightsModal').modal('show')
    return
  }

  const checkIfDuplicateExists = (w) => new Set(w).size !== w.length
  if (checkIfDuplicateExists(validAddresses)) {
    console.log('Duplicate signatory found')
    $('#checkWeightsModal .message .header').text('There\'s a problem')
    $('#checkWeightsModal p').text('Duplicate signatory found')
    $('#checkWeightsModal').modal('show')
    return
  }

  for (let i = 0; i < sendTo.length; i += 1) {
    const thisAddress = sendTo[i].value
    thisAddressesTo.push(anyAddressToRawAddress(thisAddress.trim()))
  }

  // Format weights correctly.
  for (let i = 0; i < sendAmounts.length; i += 1) {
    const weightInt = parseInt(sendAmounts[i].value, 10)
    thisAmounts.push(weightInt)
  }

  console.log('sendFrom:', sendFrom)
  console.log('txnFee: ', txnFee)
  console.log('otsKey:', otsKey)
  console.log('pubKey:', pubKey)
  console.log('thisAddressesTo:', thisAddressesTo)
  console.log('thisAmounts: ', thisAmounts)
  console.log('threshold', threshold)

  const cwt = checkWeightsAndThreshold(thisAmounts, threshold)
  console.log('cwt:', cwt)

  if (!cwt.result) {
    $('#checkWeightsModal .message .header').text('There\'s a problem')
    if (cwt.error === 'Array has non-integer values') {
      $('#checkWeightsModal p').text('One or more of the weights entered is invalid.')
    } else {
      $('#checkWeightsModal p').text(cwt.error)
    }
    $('#checkWeightsModal').modal('show')
    return
  }

  // Calculate txn fee
  const convertFeeToBigNumber = new BigNumber(txnFee)
  const thisTxnFee = convertFeeToBigNumber.times(SHOR_PER_QUANTA).toNumber()

  // Construct request
  const request = {
    master_addr: sendFrom,
    signatories: thisAddressesTo,
    weights: thisAmounts,
    threshold,
    fee: thisTxnFee,
    xmssPk: pubKey,
    network: selectedNetwork(),
  }
  wrapMeteorCall('createMultiSig', request, (err, res) => {
    if (err) {
      console.log('Error with createMultisig', err)
      Session.set('transactionGenerationError', err.reason)
      $('#transactionGenFailed').show()
      $('#transferForm').hide()
    } else {
      console.log('Result from createMultisig', res)
      const confirmationOutputs = []

      const resAddrsTo = res.response.extended_transaction_unsigned.tx.multi_sig_create.signatories
      const resAmounts = res.response.extended_transaction_unsigned.tx.multi_sig_create.weights
      const resThreshold = res.response.extended_transaction_unsigned.tx.multi_sig_create.threshold

      for (let i = 0; i < resAddrsTo.length; i += 1) {
        // Create and store the output
        const thisOutput = {
          address: Buffer.from(resAddrsTo[i]),
          address_hex: helpers.rawAddressToHexAddress(resAddrsTo[i]),
          address_b32: helpers.rawAddressToB32Address(resAddrsTo[i]),
          weight: resAmounts[i],
        }
        confirmationOutputs.push(thisOutput)
      }

      const confirmation = {
        from: Buffer.from(res.response.extended_transaction_unsigned.addr_from),
        from_hex: helpers.rawAddressToHexAddress(res.response.extended_transaction_unsigned.addr_from),
        from_b32: helpers.rawAddressToB32Address(res.response.extended_transaction_unsigned.addr_from),
        outputs: confirmationOutputs,
        threshold: resThreshold,
        fee: res.response.extended_transaction_unsigned.tx.fee / SHOR_PER_QUANTA,
        otsKey,
      }

      if (nodeReturnedValidResponse(request, confirmation, 'multiSigCreate')) {
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

// TODO: port this function
function confirmTransaction() {
  const tx = Session.get('transactionConfirmationResponse')

  // Set OTS Key Index for seed wallets
  if (getXMSSDetails().walletType === 'seed') {
    XMSS_OBJECT.setIndex(parseInt(Session.get('transactionConfirmation').otsKey, 10))
  }

  // Concatenate Uint8Arrays
  let concatenatedArrays = concatenateTypedArrays(
    Uint8Array,
    toBigendianUint64BytesUnsigned(tx.extended_transaction_unsigned.tx.fee) // eslint-disable-line
  )

  console.log('starting with concat: ', concatenatedArrays)

  concatenatedArrays = concatenateTypedArrays(Uint8Array, concatenatedArrays, toBigendianUint64BytesUnsigned(tx.extended_transaction_unsigned.tx.multi_sig_create.threshold))

  console.log('after threshold added: ', concatenatedArrays)

  // Now append all recipient (outputs) to concatenatedArrays
  const addrsToRaw = tx.extended_transaction_unsigned.tx.multi_sig_create.signatories
  const amountsRaw = tx.extended_transaction_unsigned.tx.multi_sig_create.weights
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

    // Add weight
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

    wrapMeteorCall('confirmMultiSigCreate', tx, (err, res) => {
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
    // Reset ledger sign modal view state
    $('#awaitingLedgerConfirmation').show()
    $('#signOnLedgerRejected').hide()
    $('#signOnLedgerTimeout').hide()
    $('#signOnLedgerError').hide()
    $('#ledgerHasConfirmed').hide()
    $('#relayLedgerTxnButton').hide()
    $('#noRemainingSignatures').hide()

    // Show ledger sign modal
    $('#ledgerConfirmationModal').modal({
      closable: false,
      onDeny: () => {
        // Clear session state for transaction
        Session.set('ledgerTransaction', '')
        Session.set('ledgerTransactionHash', '')
      },
      onApprove: () => {
        // Hide modal, and show relaying message
        $('#ledgerConfirmationModal').modal('hide')
        $('#relaying').show()

        // Relay the transaction
        wrapMeteorCall('confirmTransaction', Session.get('ledgerTransaction'), (err, res) => {
          if (res.error) {
            $('#transactionConfirmation').hide()
            $('#transactionFailed').show()

            Session.set('transactionFailed', res.error)
          } else {
            Session.set('transactionHash', Session.get('ledgerTransactionHash'))
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
      },
    }).modal('show')

    // Create a transaction
    const sourceAddr = hexToBytes(QRLLIB.getAddress(getXMSSDetails().pk))
    const fee = toBigendianUint64BytesUnsigned(tx.extended_transaction_unsigned.tx.fee, true)

    getLedgerCreateTx(sourceAddr, fee, destAddr, destAmount, function(err, txn) {
      getLedgerRetrieveSignature(txn, function(err, sigResponse) {

        // Hide the awaiting ledger confirmation spinner
        $('#awaitingLedgerConfirmation').hide()

        // Check if ledger rejected transaction
        if (sigResponse.return_code === 27014) {
          $('#signOnLedgerRejected').show()
          // Show no signatures remaining message if there are none remaining.
          if (Session.get('transactionConfirmation').otsKey >= 256) {
            $('#noRemainingSignatures').show()
          }
        // Check if the the request timed out waiting for response on ledger
        } else if (sigResponse.return_code === 14) {
          $('#signOnLedgerTimeout').show()
        // Check for unknown errors
        } else if ((sigResponse.return_code === 1) && (sigResponse.error_message == "Unknown error code")) {
          $('#signOnLedgerError').show()
        } else {
          // Show confirmation message
          $('#ledgerHasConfirmed').show()

          tx.extended_transaction_unsigned.tx.signature = sigResponse.signature

          // Calculate transaction hash
          const txnHashConcat = concatenateTypedArrays(
            Uint8Array,
            binaryToBytes(shaSum),
            tx.extended_transaction_unsigned.tx.signature,
            hexToBytes(getXMSSDetails().pk) // eslint-disable-line
          )

          const txnHashableBytes = toUint8Vector(txnHashConcat)

          const txnHash = QRLLIB.bin2hstr(QRLLIB.sha2_256(txnHashableBytes))

          console.log('Txn Hash: ', txnHash)

          // Prepare gRPC call
          tx.network = selectedNetwork()

          // Set session values for later relaying
          Session.set('ledgerTransaction', tx)
          Session.set('ledgerTransactionHash', txnHash)

          // Show relay button
          $('#relayLedgerTxnButton').show()
        }
      }) // retrieveSignature
    }) // getLedgerCreateTx
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
          prompt: 'You must enter a weight',
        },
        {
          type: 'number',
          prompt: 'Weight must be a number',
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
Template.multisigCreate.events({
  'click #addTransferRecipient': (event) => {
    event.preventDefault()
    event.stopPropagation()

    const nextRecipientId = Math.max(...getRecipientIds()) + 1

    const newTransferRecipient = `
      <div>
        <div class="field">
          <label>Additional Signatory</label>
          <div class="ui action center aligned input"  id="amountFields" style="width: 100%; margin-bottom: 10px;">
            <input type="text" id="to_${nextRecipientId}" name="to[]" placeholder="Address" style="width: 55%;">
            <input type="text" id="amounts_${nextRecipientId}" name="amounts[]" placeholder="Weight" style="width: 30%;">
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

Template.multisigCreate.onRendered(() => {
  Session.set('activeMultisigTab', 'create')
})
