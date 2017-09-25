import './view.html'
/* global LocalStore */

Template.appView.onRendered(() => {
  $('.ui.dropdown').dropdown()
})

const getAddressDetail = function (address) {
  const apiUrl = LocalStore.get('nodeApiUrl')
  HTTP.call('GET', `${apiUrl}api/address/${address}`, {}, (error, result) => {
    if (!error) {
      LocalStore.set('addressDetail', result.data)
      $('#unlocking').hide()
      $('#addressFields').hide()
      $('#addressDetail').show()
      $('#unlockError').hide()
    } else {
      $('#unlocking').hide()
      $('#unlockError').show()
    }
  })
}

Template.appView.events({
  'click #unlockButton': () => {
    $('#unlocking').show()
    // CALL WASM HERE TO VALIDATE HEX OR MNEMONIC
    // Simulate for now by getting balance of actual address
    getAddressDetail('Qfc34eae49e93eb3ffce6edd8e22db89c36e235b73a55791150a909ae66fb031a54a0')
  },
  'click #ShowTx': () => {
    $('table').show()
    $('#ShowTx').hide()
    $('#HideTx').show()
  },
  'click #HideTx': () => {
    $('table').hide()
    $('#ShowTx').show()
    $('#HideTx').hide()
  },
  'click .refresh': () => {
    getAddressDetail('Qfc34eae49e93eb3ffce6edd8e22db89c36e235b73a55791150a909ae66fb031a54a0')
  },
})

Template.appView.helpers({
  address() {
    return LocalStore.get('addressDetail')
  },
  addressQR() {
    return LocalStore.get('addressDetail').state.address
  },
  ts() {
    const x = moment.unix(this.timestamp)
    return moment(x).format('HH:mm D MMM YYYY')
  },
  txcount() {
    const addressDetail = LocalStore.get('addressDetail')
    try {
      const y = addressDetail.transactions.length
      return y
    } catch (e) {
      return 0
    }
  },
  nodeExplorerUrl() {
    return LocalStore.get('nodeExplorerUrl')
  },
})
