import './transfer.html'

Template.appTransfer.onRendered(() => {
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
            type: 'exactLength[69]',
            prompt: 'QRL address must be exactly 69 characters',
          },
        ],
      },
      amount: {
        identifier: 'amount',
        rules: [
          {
            type: 'empty',
            prompt: 'You must enter an amount of QRL to send',
          },
          {
            type: 'number',
            prompt: 'QRL Amount must be a number',
          },
        ],
      },
    },
  })
})

const getBalance = function (address) {
  const apiUrl = LocalStore.get('nodeApiUrl')
  HTTP.call('GET', `${apiUrl}api/address/${address}`, {}, (error, result) => {
    if (!error) {
      LocalStore.set('transferFromBalance', result.data.state.balance)
      LocalStore.set('transferFromAddress', result.data.state.address)
      $('#unlocking').hide()
      $('#addressFields').hide()
      $('#transferForm').show()
      $('#unlockError').hide()
    } else {
      $('#unlocking').hide()
      $('#unlockError').show()
    }
  })
}

Template.appTransfer.events({
  'click #unlockButton': () => {
    $('#unlocking').show()
    // CALL WASM HERE TO VALIDATE HEX OR MNEMONIC
    // Simulate for now by getting balance of actual address
    getBalance('Qfc34eae49e93eb3ffce6edd8e22db89c36e235b73a55791150a909ae66fb031a54a0')
  },
})

Template.appTransfer.helpers({
  transferFrom() {
    const transferFrom = {}
    transferFrom.balance = LocalStore.get('transferFromBalance')
    transferFrom.address = LocalStore.get('transferFromAddress')
    return transferFrom
  },
})
