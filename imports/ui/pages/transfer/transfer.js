import JSONFormatter from 'json-formatter-js'
import './transfer.html'
/* global LocalStore */
/* global QRLLIB */
/* global selectedNode */
/* global XMSS_OBJECT */
/* global findNodeData */
/* global DEFAULT_NODES */
/* global SHOR_PER_QUANTA */
/* global POLL_TXN_RATE */

let tokensHeld = []

function generateTransaction() {
  // Get to/amount details
  const sendFrom = addressForAPI(LocalStore.get('transferFromAddress'))
  const txnFee = document.getElementById('fee').value
  const otsKey = document.getElementById('otsKey').value
  const pubKey = binaryToBytes(XMSS_OBJECT.getPK())
  var sendTo = document.getElementsByName("to[]")
  var sendAmounts = document.getElementsByName("amounts[]")

  // Capture outputs
  let this_addresses_to = []
  let this_amounts = []

  for (var i = 0; i < sendTo.length; i++) {
    this_addresses_to.push(addressForAPI(sendTo[i].value))
  }
   for (var i = 0; i < sendAmounts.length; i++) {
    this_amounts.push(sendAmounts[i].value * SHOR_PER_QUANTA)
  }

  // Construct request
  const grpcEndpoint = findNodeData(DEFAULT_NODES, selectedNode()).grpc
  const request = {
    fromAddress: sendFrom,
    addresses_to: this_addresses_to,
    amounts: this_amounts,
    fee: txnFee * SHOR_PER_QUANTA,
    xmssPk: pubKey,
    grpc: grpcEndpoint,
  }

  Meteor.call('transferCoins', request, (err, res) => {
    if (err) {
      LocalStore.set('transactionGenerationError', err)
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
          address: binaryToQrlAddress(resAddrsTo[i]),
          amount: resAmounts[i] / SHOR_PER_QUANTA,
          name: "Quanta"
        }
        confirmation_outputs.push(thisOutput)

        // Update total transfer amount
        totalTransferAmount += parseInt(resAmounts[i])
      }

      const confirmation = {
        from: binaryToQrlAddress(res.response.extended_transaction_unsigned.addr_from),
        outputs: confirmation_outputs,
        fee: res.response.extended_transaction_unsigned.tx.fee / SHOR_PER_QUANTA,
        otsKey: otsKey
      }

      LocalStore.set('transactionConfirmation', confirmation)
      LocalStore.set('transactionConfirmationAmount', totalTransferAmount / SHOR_PER_QUANTA)
      LocalStore.set('transactionConfirmationFee', confirmation.fee)
      LocalStore.set('transactionConfirmationResponse', res.response)

      // Show confirmation
      $('#generateTransactionArea').hide()
      $('#confirmTransactionArea').show()
    }
  })
}

function confirmTransaction() {
  const tx = LocalStore.get('transactionConfirmationResponse')

  // Set OTS Key Index
  XMSS_OBJECT.setIndex(parseInt(LocalStore.get('transactionConfirmation').otsKey))

  // Concatenate Uint8Arrays
  let concatenatedArrays = concatenateTypedArrays(
    Uint8Array,
      tx.extended_transaction_unsigned.addr_from,
      toBigendianUint64BytesUnsigned(tx.extended_transaction_unsigned.tx.fee)
  )

  // Now append all recipient (outputs) to concatenatedArrays
  const addrsToRaw = tx.extended_transaction_unsigned.tx.transfer.addrs_to
  const amountsRaw = tx.extended_transaction_unsigned.tx.transfer.amounts
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
  const hashableBytes = new QRLLIB.VectorUChar()
  for (i = 0; i < concatenatedArrays.length; i += 1) {
    hashableBytes.push_back(concatenatedArrays[i])
  }

  // Create sha256 sum of concatenatedarray
  let shaSum = QRLLIB.sha2_256(hashableBytes)

  // Sign the sha sum
  tx.extended_transaction_unsigned.tx.signature = binaryToBytes(XMSS_OBJECT.sign(shaSum))

  // Calculate transaction hash
  let txnHashConcat = concatenateTypedArrays(
    Uint8Array,
      binaryToBytes(shaSum),
      tx.extended_transaction_unsigned.tx.signature,
      binaryToBytes(XMSS_OBJECT.getPK())
  )

  const txnHashableBytes = new QRLLIB.VectorUChar()
  for (i = 0; i < txnHashConcat.length; i += 1) {
    txnHashableBytes.push_back(txnHashConcat[i])
  }

  let txnHash = QRLLIB.bin2hstr(QRLLIB.sha2_256(txnHashableBytes))

  console.log('Txn Hash: ', txnHash)

  // Prepare gRPC call
  const grpcEndpoint = findNodeData(DEFAULT_NODES, selectedNode()).grpc
  tx.grpc = grpcEndpoint

  Meteor.call('confirmTransaction', tx, (err, res) => {
    if (res.error) {
      $('#transactionConfirmation').hide()
      $('#transactionFailed').show()

      LocalStore.set('transactionFailed', res.error)
    } else {
      LocalStore.set('transactionHash', txnHash)
      LocalStore.set('transactionSignature', res.response.signature)
      LocalStore.set('transactionRelayedThrough', res.relayed)

      // Show result
      $('#generateTransactionArea').hide()
      $('#confirmTransactionArea').hide()
      $('#transactionResultArea').show()
      
      // Start polling this transcation
      pollTransaction(LocalStore.get('transactionHash'), true)
    }
  })
}

function cancelTransaction() {
  LocalStore.set('transactionConfirmation', '')
  LocalStore.set('transactionConfirmationAmount', '')
  LocalStore.set('transactionConfirmationFee', '')
  LocalStore.set('transactionConfirmationResponse', '')

  LocalStore.set('transactionFailed', 'User requested cancellation')

  $('#generateTransactionArea').show()
  $('#confirmTransactionArea').hide()
  $('#transactionResultArea').hide()
}

function sendTokensTxnCreate(tokenHash, decimals) {
  // Get to/amount details
  const sendFrom = LocalStore.get('transferFromAddress')
  const txnFee = document.getElementById('fee').value
  const otsKey = document.getElementById('otsKey').value
  var sendTo = document.getElementsByName("to[]")
  var sendAmounts = document.getElementsByName("amounts[]")
  
  // Convert strings to bytes
  const pubKey = binaryToBytes(XMSS_OBJECT.getPK())
  const tokenHashBytes = stringToBytes(tokenHash)
  const sendFromAddress = addressForAPI(sendFrom)

  // Capture outputs
  let this_addresses_to = []
  let this_amounts = []

  for (var i = 0; i < sendTo.length; i++) {
    this_addresses_to.push(addressForAPI(sendTo[i].value))
  }
   for (var i = 0; i < sendAmounts.length; i++) {
    this_amounts.push(sendAmounts[i].value * Math.pow(10, decimals))
  }

  // Construct request
  const grpcEndpoint = findNodeData(DEFAULT_NODES, selectedNode()).grpc
  const request = {
    addressFrom: sendFromAddress,
    addresses_to: this_addresses_to,
    amounts: this_amounts,
    tokenHash: tokenHashBytes,
    fee: txnFee * SHOR_PER_QUANTA,
    xmssPk: pubKey,
    grpc: grpcEndpoint,
  }

  Meteor.call('createTokenTransferTxn', request, (err, res) => {
    if (err) {
      LocalStore.set('tokenTransferError', err)
      $('#transactionGenFailed').show()
      $('#transferForm').hide()
    } else {

      let tokenDetails = {}
      _.each(LocalStore.get('tokensHeld'), (token) => {
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
          address: binaryToQrlAddress(resAddrsTo[i]),
          amount: resAmounts[i] / Math.pow(10, decimals),
          name: tokenDetails.symbol
        }
        confirmation_outputs.push(thisOutput)

        // Update total transfer amount
        totalTransferAmount += parseInt(resAmounts[i])
      }

      const confirmation = {
        hash: res.txnHash,
        from: binaryToQrlAddress(res.response.extended_transaction_unsigned.addr_from),
        outputs: confirmation_outputs,
        fee: res.response.extended_transaction_unsigned.tx.fee / SHOR_PER_QUANTA,
        otsKey: otsKey,
      }

      LocalStore.set('tokenTransferConfirmation', confirmation)
      LocalStore.set('tokenTransferConfirmationDetails', tokenDetails)
      LocalStore.set('tokenTransferConfirmationResponse', res.response)
      LocalStore.set('tokenTransferConfirmationAmount', totalTransferAmount / Math.pow(10, decimals))

      // Show confirmation
      $('#generateTransactionArea').hide()
      $('#confirmTokenTransactionArea').show()
    }
  })
}

function confirmTokenTransfer() {
  const tx = LocalStore.get('tokenTransferConfirmationResponse')

  // Set OTS Key Index in XMSS object
  XMSS_OBJECT.setIndex(parseInt(LocalStore.get('tokenTransferConfirmation').otsKey))

  // Concatenate Uint8Arrays
  let concatenatedArrays = concatenateTypedArrays(
    Uint8Array,
      tx.extended_transaction_unsigned.addr_from,
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
  const hashableBytes = new QRLLIB.VectorUChar()
  for (i = 0; i < concatenatedArrays.length; i += 1) {
    hashableBytes.push_back(concatenatedArrays[i])
  }

  // Create sha256 sum of concatenatedarray
  let shaSum = QRLLIB.sha2_256(hashableBytes)

  // Sign the sha sum
  tx.extended_transaction_unsigned.tx.signature = binaryToBytes(XMSS_OBJECT.sign(shaSum))

  // Calculate transaction hash
  let txnHashConcat = concatenateTypedArrays(
    Uint8Array,
      binaryToBytes(shaSum),
      tx.extended_transaction_unsigned.tx.signature,
      binaryToBytes(XMSS_OBJECT.getPK())
  )

  const txnHashableBytes = new QRLLIB.VectorUChar()
  for (i = 0; i < txnHashConcat.length; i += 1) {
    txnHashableBytes.push_back(txnHashConcat[i])
  }

  let txnHash = QRLLIB.bin2hstr(QRLLIB.sha2_256(txnHashableBytes))

  console.log('Txn Hash: ', txnHash)

  const grpcEndpoint = findNodeData(DEFAULT_NODES, selectedNode()).grpc
  tx.grpc = grpcEndpoint

  Meteor.call('confirmTokenTransfer', tx, (err, res) => {
    if (res.error) {
      $('#tokenCreationConfirmation').hide()
      $('#transactionFailed').show()

      LocalStore.set('transactionFailed', res.error)
    } else {
      LocalStore.set('transactionHash', txnHash)
      LocalStore.set('transactionSignature', res.response.signature)
      LocalStore.set('transactionRelayedThrough', res.relayed)

      // Show result
      $('#generateTransactionArea').hide()
      $('#confirmTokenTransactionArea').hide()
      $('#tokenTransactionResultArea').show()

      // Start polling this transcation
      pollTransaction(LocalStore.get('transactionHash'), true)
    }
  })
}

function setRawDetail() {
  try {
    const myJSON = LocalStore.get('txhash').transaction
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
    if (LocalStore.get('txhash').transaction.header != null) {
      // Complete
      const userMessage = `Complete - Transaction ${thisTxId} is in block ${LocalStore.get('txhash').transaction.header.block_number} with 1 confirmation.`
      LocalStore.set('txstatus', userMessage)
      LocalStore.set('transactionConfirmed', "true")
      $('.loading').hide()
      $('#loadingHeader').hide()
      refreshTransferPage()
    } else if (LocalStore.get('txhash').error != null) {
      // We attempt to find the transaction 5 times below absolutely failing.
      if(failureCount < 5) {
        failureCount += 1
        setTimeout(() => { pollTransaction(thisTxId, false, failureCount) }, POLL_TXN_RATE)
      } else {
        // Transaction error - Give up
        const errorMessage = `Error - ${LocalStore.get('txhash').error}`
        LocalStore.set('txstatus', errorMessage)
        LocalStore.set('transactionConfirmed', "false")
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

    // We attempt to find the transaction 5 times below absolutely failing.
    if(failureCount < 60) {
      failureCount += 1
      setTimeout(() => { pollTransaction(thisTxId, false, failureCount) }, POLL_TXN_RATE)
    } else {
      // Transaction error - Give up
      LocalStore.set('txstatus', 'Pending')
      LocalStore.set('transactionConfirmed', "false")
      $('.loading').hide()
      $('#loadingHeader').hide()
    }
  }
}

// Poll a transaction for its status after relaying into network.
function pollTransaction(thisTxId, firstPoll = false, failureCount = 0) {
  // Reset txhash on first poll.
  if (firstPoll === true) {
    LocalStore.set('txhash', {})
  }

  LocalStore.set('txstatus', 'Pending')
  LocalStore.set('transactionConfirmed', "false")

  const grpcEndpoint = findNodeData(DEFAULT_NODES, selectedNode()).grpc
  const request = {
    query: thisTxId,
    grpc: grpcEndpoint,
  }

  if (thisTxId) {
    Meteor.call('getTxnHash', request, (err, res) => {
      if (err) {
        if(failureCount < 60) {
          LocalStore.set('txhash', { })
          LocalStore.set('txstatus', 'Pending')
        } else {
          LocalStore.set('txhash', { error: err, id: thisTxId })
          LocalStore.set('txstatus', 'Error')
        }
        checkResult(thisTxId, failureCount)
      } else {
        res.error = null
        LocalStore.set('txhash', res)
        setRawDetail()
        checkResult(thisTxId, failureCount)
      }
    })
  }
}



Template.appTransfer.onCreated(() => {
  // Route to open wallet is already opened
  if (LocalStore.get('walletStatus').unlocked === false) {
    const params = {}
    const path = FlowRouter.path('/open', params)
    FlowRouter.go(path)
  }
})

Template.appTransfer.onRendered(() => {
  $('.ui.dropdown').dropdown()
  
  // Transfer validation
  /* TODO - Fix this up for multiple outputs
  $('.ui.form').form({
    fields: {
      to: {
        identifier: 'to',
        rules: [
          {
            type: 'empty',
            prompt: 'Please enter the QRL address you wish to send to',
          },
          {
            type: 'exactLength[79]',
            prompt: 'QRL address must be exactly 79 characters',
          },
        ],
      },
      amount: {
        identifier: 'amount',
        rules: [
          {
            type: 'empty',
            prompt: 'You must enter an amount of Quanta to send',
          },
          {
            type: 'number',
            prompt: 'Quanta Amount must be a number',
          },
        ],
      },
    },
  })
  */

  $('#sendReceiveTabs .item').tab()

  refreshTransferPage()
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

    const newTransferRecipient = `
      <div>
        <div class="field">
          <label>Additional Recipient</label>
          <div class="ui action center aligned input"  id="amountFields" style="width: 100%; margin-bottom: 10px;">
            <input type="text" id="to" name="to[]" placeholder="Address" style="width: 55%;">
            <input type="text" id="amounts" name="amounts[]" placeholder="Amount" style="width: 30%;">
            <button class="ui red small button removeTransferRecipient" style="width: 10%"><i class="remove user icon"></i></button>
          </div>
        </div>
      </div>
    `;

    // Append newTransferRecipient to transferRecipients div
    $('#transferRecipients').append(newTransferRecipient)

  },
  'click .removeTransferRecipient': (event) => {
    event.preventDefault()
    event.stopPropagation()

    // Remove the recipient
    $(event.currentTarget).parent().parent().parent().remove();
  },
})

Template.appTransfer.helpers({
  transferFrom() {
    const transferFrom = {}
    transferFrom.balance = LocalStore.get('transferFromBalance')
    transferFrom.address = LocalStore.get('transferFromAddress')
    return transferFrom
  },
  transactionConfirmation() {
    const confirmation = LocalStore.get('transactionConfirmation')
    return confirmation
  },
  transactionConfirmationAmount() {
    const confirmationAmount = LocalStore.get('transactionConfirmationAmount')
    return confirmationAmount
  },
  transactionConfirmationFee() {
    const transactionConfirmationFee = 
      LocalStore.get('transactionConfirmationResponse').extended_transaction_unsigned.tx.fee / SHOR_PER_QUANTA
    return transactionConfirmationFee
  },
  transactionGenerationError() {
    const error = LocalStore.get('transactionGenerationError')
    return error
  },
  otsKeyEstimate() {
    const otsKeyEstimate = LocalStore.get('otsKeyEstimate')
    return otsKeyEstimate
  },
  nodeExplorerUrl() {
    if ((LocalStore.get('nodeExplorerUrl') === '') || (LocalStore.get('nodeExplorerUrl') === null)) {
      return DEFAULT_NODES[0].explorerUrl
    }
    return LocalStore.get('nodeExplorerUrl')
  },
  transactionFailed() {
    const failed = LocalStore.get('transactionFailed')
    return failed
  },
  transactionHash() {
    const hash = LocalStore.get('transactionHash')
    return hash
  },
  transactionSignature() {
    const hash = LocalStore.get('transactionSignature')
    return hash
  },
  transactionStatus() {
    const status = LocalStore.get('txstatus')
    return status
  },
  transactionRelayedThrough() {
    const status = LocalStore.get('transactionRelayedThrough')
    return status
  },
  txDetail() {
    let txDetail = LocalStore.get('txhash').transaction.tx.transfer
    txDetail.amount /= SHOR_PER_QUANTA
    txDetail.fee /= SHOR_PER_QUANTA
    return txDetail
  },
  tokenTransferConfirmation() {
    const confirmation = LocalStore.get('tokenTransferConfirmation')
    return confirmation
  },
  tokenTransferConfirmationAmount() {
    const amount = LocalStore.get('tokenTransferConfirmationAmount')
    return amount
  },
  tokenDetails() {
    const confirmation = LocalStore.get('tokenTransferConfirmationDetails')
    return confirmation
  },
  otsKey() {
    let otsKey = LocalStore.get('txhash').transaction.tx.signature
    otsKey = parseInt(otsKey.substring(0,8), 16)
    return otsKey
  },
  addressTransactions() {
    const transactions = []
    const thisAddress = getXMSSDetails().address
    _.each(LocalStore.get('addressTransactions'), (transaction) => {
      // Update timestamp from unix epoch to human readable time/date.
      const x = moment.unix(transaction.timestamp)
      const y = transaction
      y.timestamp = moment(x).format('HH:mm D MMM YYYY')
      
      // Set total received amount if sent to this address
      let thisReceivedAmount = 0
      if ((transaction.type === 'transfer') || (transaction.type === 'transfer_token')) {
        _.each(transaction.outputs, (output) => {
          if(output.address == thisAddress) {
            thisReceivedAmount += output.amount
          }
        })
      }
      y.thisReceivedAmount = thisReceivedAmount

      transactions.push(y)
    })
    return transactions
  },
  isMyAddress(address) {
    if(address == getXMSSDetails().address) {
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
  ts() {
    const x = moment.unix(this.timestamp)
    return moment(x).format('HH:mm D MMM YYYY')
  },
  openedAddress() {
    return getXMSSDetails().address
  },
  tokensHeld() {
    return LocalStore.get('tokensHeld')
  },
  balanceAmount() {
    return LocalStore.get('balanceAmount')
  },
  balanceSymbol() {
    return LocalStore.get('balanceSymbol')
  },
})
