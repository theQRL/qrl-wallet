import './transferForm.html'
/* global LocalStore */
/* global QRLLIB */
/* global selectedNode */
/* global XMSS_OBJECT */
/* global findNodeData */
/* global DEFAULT_NODES */

const getBalance = function (getAddress) {
  const grpcEndpoint = findNodeData(DEFAULT_NODES, selectedNode()).grpc
  const request = {
    address: getAddress,
    grpc: grpcEndpoint,
  }

  Meteor.call('getAddress', request, (err, res) => {
    if (err) {
      // TODO - Error handling
    } else {
      if (res.state.address !== '') {
        LocalStore.set('transferFromBalance', res.state.balance / 100000000) // FIXME - Magic Number
        LocalStore.set('transferFromAddress', new TextDecoder('utf-8').decode(res.state.address))
      } else {
        // Wallet not found, put together an empty response
        LocalStore.set('transferFromBalance', 0)
        LocalStore.set('transferFromAddress', new TextDecoder('utf-8').decode(getAddress))
      }

      // Rudimentary way to set otsKey
      LocalStore.set('otsKeyEstimate', res.state.txcount)
    }
  })
}

function generateTransaction() {
  // Get to/amount details
  const sendFrom = LocalStore.get('transferFromAddress')
  const sendTo = document.getElementById('to').value
  const sendAmount = document.getElementById('amount').value
  const txnFee = document.getElementById('fee').value
  const otsKey = document.getElementById('otsKey').value


  const binaryPublicKey = XMSS_OBJECT.getPK()
  let pubKey = new Uint8Array(binaryPublicKey.size())
  for (let i = 0; i < binaryPublicKey.size(); i++) {
    pubKey[i] = binaryPublicKey.get(i)
  }

  const sendFromBin = QRLLIB.str2bin(sendFrom)
  let sendFromAddress = new Uint8Array(sendFromBin.size())
  for (let i = 0; i < sendFromBin.size(); i++) {
    sendFromAddress[i] = sendFromBin.get(i)
  }

  const sendToBin = QRLLIB.str2bin(sendTo)
  let sendToAddress = new Uint8Array(sendToBin.size())
  for (let i = 0; i < sendToBin.size(); i++) {
    sendToAddress[i] = sendToBin.get(i)
  }

  // Construct request
  const grpcEndpoint = findNodeData(DEFAULT_NODES, selectedNode()).grpc
  const request = {
    fromAddress: sendFromAddress,
    toAddress: sendToAddress,
    amount: sendAmount * 100000000, // Fixme - Magic Number
    fee: txnFee * 100000000, // Fixme - Magic Number
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
        amount: res.response.transaction_unsigned.transfer.amount,
        fee: res.response.transaction_unsigned.transfer.fee,
        otsKey: res.response.transaction_unsigned.ots_key,
      }

      LocalStore.set('transactionConfirmation', confirmation)
      LocalStore.set('transactionConfirmationAmount', res.response.transaction_unsigned.transfer.amount / 100000000) // Fixme - Magic Number
      LocalStore.set('transactionConfirmationFee', res.response.transaction_unsigned.transfer.fee / 100000000) // Fixme - Magic Number
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

  const thisAddressBin = QRLLIB.str2bin(XMSS_OBJECT.getAddress())
  let thisAddressBytes = new Uint8Array(thisAddressBin.size())
  for (let i = 0; i < thisAddressBin.size(); i++) {
    thisAddressBytes[i] = thisAddressBin.get(i)
  }

  getBalance(thisAddressBytes)
})

Template.appTransferForm.events({
  'submit #generateTransactionForm': function (event) {
    event.preventDefault()
    event.stopPropagation()
    $('#generating').show()
    setTimeout(function () { generateTransaction() }, 200)
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
})
