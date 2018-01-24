import './tokenTransfer.html'
/* global LocalStore */
/* global QRLLIB */
/* global selectedNode */
/* global XMSS_OBJECT */
/* global findNodeData */
/* global DEFAULT_NODES */
/* global SHOR_PER_QUANTA */

function loadToken() {
  const sendFrom = LocalStore.get('transferFromAddress')
  const tokenHash = document.getElementById('tokenHash').value

  // Update address balance in case the token state has changed.
  getBalance(XMSS_OBJECT.getAddress())

  // Construct request
  const grpcEndpoint = findNodeData(DEFAULT_NODES, selectedNode()).grpc
  const request = {
    query: tokenHash,
    grpc: grpcEndpoint,
  }

  Meteor.call('getTxnHash', request, (err, res) => {
    $('#loading').hide()

    if (err) {
      $('#tokenLoadFailed').show()
      LocalStore.set('txhash', { error: err, id: tokenHash })
    } else {

      // Check if this is a token hash.
      if (res.transaction.tx.type !== "TOKEN") {
        $('#tokenLoadFailed').show()
        LocalStore.set('txhash', { error: "Hash does not belong to a token", id: tokenHash })
      } else {
        // It's a valid token hash
        LocalStore.set('txhash', res)

        // Show transfer form
        $('#tokenTransferForm').show()

        // Hide load form
        $('#transferLoadForm').hide()
      }      
    }
  })
}

function sendTokensTxnCreate() {
  // Get to/amount details
  const sendFrom = LocalStore.get('transferFromAddress')

  const tokenHash = document.getElementById('tokenHash').value
  const to = document.getElementById('to').value
  const amount = document.getElementById('amount').value
  const txnFee = document.getElementById('fee').value
  const otsKey = document.getElementById('otsKey').value

  // Convert strings to bytes
  const pubKey = binaryToBytes(XMSS_OBJECT.getPK())
  const sendFromAddress = stringToBytes(sendFrom)
  const sendToAddress = stringToBytes(to)
  const tokenHashBytes = stringToBytes(tokenHash)

  // Construct request
  const grpcEndpoint = findNodeData(DEFAULT_NODES, selectedNode()).grpc
  const request = {
    addressFrom: sendFromAddress,
    addressTo: sendToAddress,
    tokenHash: tokenHashBytes,
    amount: amount * SHOR_PER_QUANTA,
    fee: txnFee * SHOR_PER_QUANTA,
    xmssPk: pubKey,
    xmssOtsKey: otsKey,
    grpc: grpcEndpoint,
  }

  Meteor.call('createTokenTransferTxn', request, (err, res) => {
    if (err) {
      LocalStore.set('tokenTransferError', err)
      $('#tokenTransferTxnGenFailed').show()
      $('#tokenTransferForm').hide()
    } else {
      const confirmation = {
        hash: res.txnHash,
        from: new TextDecoder('utf-8').decode(res.response.transaction_unsigned.addr_from),
        to: new TextDecoder('utf-8').decode(res.response.transaction_unsigned.transfer_token.addr_to),
        amount: res.response.transaction_unsigned.transfer_token.amount / SHOR_PER_QUANTA,
        fee: res.response.transaction_unsigned.fee / SHOR_PER_QUANTA,
        otsKey: otsKey,
      }

      const tokenDetails = {
        symbol: new TextDecoder('utf-8').decode(LocalStore.get('txhash').transaction.tx.token.symbol),
        name: new TextDecoder('utf-8').decode(LocalStore.get('txhash').transaction.tx.token.name),
        token_txhash: tokenHash
      }
      LocalStore.set('tokenTransferConfirmationDetails', tokenDetails)

      LocalStore.set('tokenTransferConfirmation', confirmation)
      LocalStore.set('tokenTransferConfirmationResponse', res.response)

      // Send to confirm page.
      const params = { }
      const path = FlowRouter.path('/tokens/transfer/confirm', params)
      FlowRouter.go(path)
    }
  })
}

Template.appTokenTransfer.onRendered(() => {
  $('.ui.dropdown').dropdown()

  LocalStore.set('transferFromTokenState', '')
  getBalance(XMSS_OBJECT.getAddress())

  // Preload Token Hash
  const presetTokenHash = LocalStore.get('preLoadTokenHash')
  var regTest = /[0-9A-Fa-f]{64}/g;
  if(regTest.test(presetTokenHash)) {

    $('#tokenLoadFailed').hide()
    $('#loading').show()
    LocalStore.set('preLoadTokenHash', '')

    $('#tokenHash').val(presetTokenHash)
    setTimeout(() => { loadToken() }, 200)
  }

})

Template.appTokenTransfer.events({

  'submit #transferLoadForm': (event) => {
    event.preventDefault()
    event.stopPropagation()
    $('#tokenLoadFailed').hide()
    $('#loading').show()

    setTimeout(() => { loadToken() }, 200)
  },

  'submit #tokenTransferForm': (event) => {
    event.preventDefault()
    event.stopPropagation()
    $('#generating').show()

    setTimeout(() => { sendTokensTxnCreate() }, 200)
  },

})

Template.appTokenTransfer.helpers({
  transferFrom() {
    const transferFrom = {}
    transferFrom.balance = LocalStore.get('transferFromBalance')
    transferFrom.address = LocalStore.get('transferFromAddress')
    return transferFrom
  },
  tokenDetails() {
    let tokenDetails = LocalStore.get('txhash').transaction.tx.token
    tokenDetails.symbol = new TextDecoder('utf-8').decode(tokenDetails.symbol)
    tokenDetails.name = new TextDecoder('utf-8').decode(tokenDetails.name)
    tokenDetails.owner = new TextDecoder('utf-8').decode(tokenDetails.owner)

    const tokenHash = document.getElementById('tokenHash').value  
    const addressTokenState = LocalStore.get('transferFromTokenState')
    if (addressTokenState.hasOwnProperty(tokenHash)) {
      tokenDetails.balance = addressTokenState[tokenHash] / SHOR_PER_QUANTA
    } else {
      tokenDetails.balance = 0
    }

    tokenDetails.token_txhash = tokenHash

    return tokenDetails
  },
  tokenLoadError() {
    const error = LocalStore.get('txhash').error
    return error
  },
  tokenTransferError() {
    const error = LocalStore.get('tokenTransferError')
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
})
