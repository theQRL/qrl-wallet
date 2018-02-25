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
  const sendTo = addressForAPI(document.getElementById('to').value)
  const sendAmount = document.getElementById('amount').value
  const txnFee = document.getElementById('fee').value
  const otsKey = document.getElementById('otsKey').value
  const pubKey = binaryToBytes(XMSS_OBJECT.getPK())

  // Construct request
  const grpcEndpoint = findNodeData(DEFAULT_NODES, selectedNode()).grpc
  const request = {
    fromAddress: sendFrom,
    toAddress: sendTo,
    amount: sendAmount * SHOR_PER_QUANTA,
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
      const confirmation = {
        from: binaryToQrlAddress(res.response.transaction_unsigned.addr_from),
        to: binaryToQrlAddress(res.response.transaction_unsigned.transfer.addr_to),
        amount: res.response.transaction_unsigned.transfer.amount / SHOR_PER_QUANTA,
        fee: res.response.transaction_unsigned.transfer.fee / SHOR_PER_QUANTA,
        otsKey: otsKey
      }

      LocalStore.set('transactionConfirmation', confirmation)
      LocalStore.set('transactionConfirmationAmount', res.response.transaction_unsigned.transfer.amount / SHOR_PER_QUANTA)
      LocalStore.set('transactionConfirmationFee', res.response.transaction_unsigned.transfer.fee / SHOR_PER_QUANTA)
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
      tx.transaction_unsigned.addr_from,
      stringToBytes(tx.transaction_unsigned.fee),
      tx.transaction_unsigned.transfer.addr_to,
      stringToBytes(tx.transaction_unsigned.transfer.amount)
  )

  // Convert Uint8Array to VectorUChar
  const hashableBytes = new QRLLIB.VectorUChar()
  for (i = 0; i < concatenatedArrays.length; i += 1) {
    hashableBytes.push_back(concatenatedArrays[i])
  }

  // Create sha256 sum of concatenatedarray
  let shaSum = QRLLIB.sha2_256(hashableBytes)

  // Sign the sha sum
  tx.transaction_unsigned.signature = binaryToBytes(XMSS_OBJECT.sign(shaSum))

  // Calculate transaction hash
  let txnHashConcat = concatenateTypedArrays(
    Uint8Array,
      binaryToBytes(shaSum),
      tx.transaction_unsigned.signature,
      binaryToBytes(XMSS_OBJECT.getPK())
  )

  const txnHashableBytes = new QRLLIB.VectorUChar()
  for (i = 0; i < txnHashConcat.length; i += 1) {
    txnHashableBytes.push_back(txnHashConcat[i])
  }

  let txnHash = QRLLIB.bin2hstr(QRLLIB.sha2_256(txnHashableBytes))

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

function sendTokensTxnCreate(tokenHash) {
  // Get to/amount details
  const sendFrom = LocalStore.get('transferFromAddress')
  const to = document.getElementById('to').value
  const amount = document.getElementById('amount').value
  const txnFee = document.getElementById('fee').value
  const otsKey = document.getElementById('otsKey').value

  // Convert strings to bytes
  const pubKey = binaryToBytes(XMSS_OBJECT.getPK())
  const tokenHashBytes = stringToBytes(tokenHash)
  const sendFromAddress = addressForAPI(sendFrom)
  const sendToAddress = addressForAPI(to)
  
  // Construct request
  const grpcEndpoint = findNodeData(DEFAULT_NODES, selectedNode()).grpc
  const request = {
    addressFrom: sendFromAddress,
    addressTo: sendToAddress,
    tokenHash: tokenHashBytes,
    amount: amount * SHOR_PER_QUANTA,
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
      const confirmation = {
        hash: res.txnHash,
        from: binaryToQrlAddress(res.response.transaction_unsigned.addr_from),
        to: binaryToQrlAddress(res.response.transaction_unsigned.transfer_token.addr_to),
        amount: res.response.transaction_unsigned.transfer_token.amount / SHOR_PER_QUANTA,
        fee: res.response.transaction_unsigned.fee / SHOR_PER_QUANTA,
        otsKey: otsKey,
      }

      let tokenDetails = {}
      _.each(LocalStore.get('tokensHeld'), (token) => {
        if(token.hash == tokenHash) {
          tokenDetails.symbol = token.symbol
          tokenDetails.name = token.symbol
          tokenDetails.token_txhash = token.hash
        }
      })

      LocalStore.set('tokenTransferConfirmationDetails', tokenDetails)
      LocalStore.set('tokenTransferConfirmation', confirmation)
      LocalStore.set('tokenTransferConfirmationResponse', res.response)

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
      tx.transaction_unsigned.addr_from,
      stringToBytes(tx.transaction_unsigned.fee),
      tx.transaction_unsigned.transfer_token.token_txhash,
      tx.transaction_unsigned.transfer_token.addr_to,
      stringToBytes(tx.transaction_unsigned.transfer_token.amount)
  )

  // Convert Uint8Array to VectorUChar
  const hashableBytes = new QRLLIB.VectorUChar()
  for (i = 0; i < concatenatedArrays.length; i += 1) {
    hashableBytes.push_back(concatenatedArrays[i])
  }

  // Create sha256 sum of concatenatedarray
  let shaSum = QRLLIB.sha2_256(hashableBytes)

  // Sign the sha sum
  tx.transaction_unsigned.signature = binaryToBytes(XMSS_OBJECT.sign(shaSum))

  // Calculate transaction hash
  let txnHashConcat = concatenateTypedArrays(
    Uint8Array,
      binaryToBytes(shaSum),
      tx.transaction_unsigned.signature,
      binaryToBytes(XMSS_OBJECT.getPK())
  )

  const txnHashableBytes = new QRLLIB.VectorUChar()
  for (i = 0; i < txnHashConcat.length; i += 1) {
    txnHashableBytes.push_back(txnHashConcat[i])
  }

  let txnHash = QRLLIB.bin2hstr(QRLLIB.sha2_256(txnHashableBytes))

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
    $('.json').html(formatter.render())
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
      $('.loading').hide()
      $('#loadingHeader').hide()
    } else if (LocalStore.get('txhash').error != null) {
      // We attempt to find the transaction 5 times below absolutely failing.
      if(failureCount < 5) {
        failureCount += 1
        setTimeout(() => { pollTransaction(thisTxId, false, failureCount) }, POLL_TXN_RATE)
      } else {
        // Transaction error - Give up
        const errorMessage = `Error - ${LocalStore.get('txhash').error}`
        LocalStore.set('txstatus', errorMessage)
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

function loadAddressTransactions() {
  const thisTxs = LocalStore.get('address').state.transactions.reverse()

  const request = {
    tx: thisTxs,
    grpc: findNodeData(DEFAULT_NODES, selectedNode()).grpc,
  }

  LocalStore.set('addressTransactions', [])
  $('#loadingTransactions').show()
  
  Meteor.call('addressTransactions', request, (err, res) => {
    if (err) {
      LocalStore.set('addressTransactions', { error: err })
    } else {
      LocalStore.set('addressTransactions', res)
      $('#loadingTransactions').hide()
    }
  })
}

const getTokenBalances = (getAddress, callback) => {
  const grpcEndpoint = findNodeData(DEFAULT_NODES, selectedNode()).grpc
  const request = {
    address: addressForAPI(getAddress),
    grpc: grpcEndpoint,
  }

  Meteor.call('getAddress', request, (err, res) => {
    if (err) {
      // TODO - Error handling
    } else {
      if (res.state.address !== '') {
        // Now for each res.state.token we find, go discover token name and symbol
        for (let i in res.state.tokens) {
          const tokenHash = i
          const tokenBalance = res.state.tokens[i]

          let thisToken = {}

          const grpcEndpoint = findNodeData(DEFAULT_NODES, selectedNode()).grpc
          const request = {
            query: tokenHash,
            grpc: grpcEndpoint,
          }

          Meteor.call('getTxnHash', request, (err, res) => {
            if (err) {
              // TODO - Error handling here
              console.log('err:',err)
            } else {
              // Check if this is a token hash.
              if (res.transaction.tx.transactionType !== "token") {
                // TODO - Error handling here
              } else {
                let tokenDetails = res.transaction.tx.token

                thisToken.hash = tokenHash
                thisToken.name = bytesToString(tokenDetails.name)
                thisToken.symbol = bytesToString(tokenDetails.symbol)
                thisToken.balance = tokenBalance / SHOR_PER_QUANTA

                tokensHeld.push(thisToken)

                LocalStore.set('tokensHeld', tokensHeld)
              }
            }
          })
        }

        callback()

        // When done hide loading section
        $('#loading').hide()
      } else {
        // Wallet not found, put together an empty response
        callback()
      }
    }
  })
}

function updateBalanceField() {
  const selectedType = document.getElementById('amountType').value

  // Quanta Balances
  if(selectedType == 'quanta') {
    LocalStore.set('balanceAmount', LocalStore.get('transferFromBalance'))
    LocalStore.set('balanceSymbol', 'Quanta')
  } else {
    // First extract the token Hash
    tokenHash = selectedType.split('-')[1]

    // Now calculate the token balance.
    _.each(LocalStore.get('tokensHeld'), (token) => {
      if(token.hash == tokenHash) {
        LocalStore.set('balanceAmount', token.balance)
        LocalStore.set('balanceSymbol', token.symbol)
      }
    })
  }
}


Template.appTransfer.onRendered(() => {
  $('.ui.dropdown').dropdown()
  
  // Route to open wallet is already opened
  if (LocalStore.get('walletStatus').unlocked === false) {
    const params = {}
    const path = FlowRouter.path('/open', params)
    FlowRouter.go(path)
  }

  // Transfer validation
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

  $('#sendReceiveTabs .item').tab()

  tokensHeld = []
  LocalStore.set('tokensHeld', [])

  // Wait for QRLLIB to load
  waitForQRLLIB(function () {
    // Get address balance
    getBalance(getXMSSDetails().address, function() {
      // Load Wallet Transactions
      loadAddressTransactions()
    })

    // Get Tokens and Balances
    getTokenBalances(getXMSSDetails().address, function() {
      // Update balance field
      updateBalanceField()
      
      $('#tokenBalancesLoading').hide()
      
      // Render dropdown
      $('.ui.dropdown').dropdown()
    })
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
        tokenHash = selectedType.split('-')[1]
        sendTokensTxnCreate(tokenHash)
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
  'click .jsonclick': () => {
    if (!($('.json').html())) {
      setRawDetail()
    }
    $('.jsonbox').toggle()
  },
  'change #amountType': () => {
    updateBalanceField()
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
      LocalStore.get('transactionConfirmationResponse').transaction_unsigned.fee / SHOR_PER_QUANTA
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
    _.each(LocalStore.get('addressTransactions'), (transaction) => {
      // Update timestamp from unix epoch to human readable time/date.
      const x = moment.unix(transaction.timestamp)
      const y = transaction
      y.timestamp = moment(x).format('HH:mm D MMM YYYY')

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
