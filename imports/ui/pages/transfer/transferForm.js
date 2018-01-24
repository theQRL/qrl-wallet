import './transferForm.html'
/* global LocalStore */
/* global QRLLIB */
/* global selectedNode */
/* global XMSS_OBJECT */
/* global findNodeData */
/* global DEFAULT_NODES */
/* global SHOR_PER_QUANTA */

function generateTransaction() {
  // Get to/amount details
  const sendFrom = LocalStore.get('transferFromAddress')
  const sendTo = document.getElementById('to').value
  const sendAmount = document.getElementById('amount').value
  const txnFee = document.getElementById('fee').value
  const otsKey = document.getElementById('otsKey').value

  const pubKey = binaryToBytes(XMSS_OBJECT.getPK())
  const sendFromAddress = stringToBytes(sendFrom)
  const sendToAddress = stringToBytes(sendTo)

  // Construct request
  const grpcEndpoint = findNodeData(DEFAULT_NODES, selectedNode()).grpc
  const request = {
    fromAddress: sendFromAddress,
    toAddress: sendToAddress,
    amount: sendAmount * SHOR_PER_QUANTA,
    fee: txnFee * SHOR_PER_QUANTA,
    xmssPk: pubKey,
    xmssOtsKey: otsKey,
    grpc: grpcEndpoint,
  }

  Meteor.call('transferCoins', request, (err, res) => {
    if (err) {
      LocalStore.set('transactionGenerationError', err)
      $('#transactionGenFailed').show()
      $('#transferForm').hide()
    } else {
      const confirmation = {
        hash: res.txnHash,
        from: new TextDecoder('utf-8').decode(res.response.transaction_unsigned.addr_from),
        to: new TextDecoder('utf-8').decode(res.response.transaction_unsigned.transfer.addr_to),
        amount: res.response.transaction_unsigned.transfer.amount / SHOR_PER_QUANTA,
        fee: res.response.transaction_unsigned.transfer.fee / SHOR_PER_QUANTA,
        otsKey: otsKey
      }

      LocalStore.set('transactionConfirmation', confirmation)
      LocalStore.set('transactionConfirmationAmount', res.response.transaction_unsigned.transfer.amount / SHOR_PER_QUANTA)
      LocalStore.set('transactionConfirmationFee', res.response.transaction_unsigned.transfer.fee / SHOR_PER_QUANTA)
      LocalStore.set('transactionConfirmationResponse', res.response)

      // Send to confirm page.
      const params = { }
      const path = FlowRouter.path('/transfer/confirm', params)
      FlowRouter.go(path)
    }
  })
}

Template.appTransferForm.onRendered(() => {
  $('.ui.dropdown').dropdown()
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
            type: 'exactLength[73]',
            prompt: 'QRL address must be exactly 73 characters',
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

  getBalance(XMSS_OBJECT.getAddress())
})

Template.appTransferForm.events({
  'submit #generateTransactionForm': (event) => {
    event.preventDefault()
    event.stopPropagation()
    $('#generating').show()
    setTimeout(() => { generateTransaction() }, 200)
  },
})

Template.appTransferForm.helpers({
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
    const transactionConfirmationFee = LocalStore.get('transactionConfirmationFee')
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
})
