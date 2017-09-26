import './view.html'
/* global LocalStore */
/* global QRLLIB */

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

function viewWallet(walletType) {
  const userBinSeed = document.getElementById('walletCode').value
  let thisSeedBin

  // Generate binary seed
  if (walletType === 'hexseed') {
    thisSeedBin = QRLLIB.hstr2bin(userBinSeed)
  } else if (walletType === 'mnemonic') {
    thisSeedBin = QRLLIB.mnemonic2bin(userBinSeed)
  }

  const thisHexSeed = QRLLIB.bin2hstr(thisSeedBin)
  const thisMnemonic = QRLLIB.bin2mnemonic(thisSeedBin)

  let xmss = new QRLLIB.Xmss(thisSeedBin, 12)
  const thisAddress = xmss.getAddress()

  const walletDetail = {
    address: thisAddress,
    hexSeed: thisHexSeed,
    mnemonicPhrase: thisMnemonic,
  }

  LocalStore.set('walletDetail', walletDetail)

  getAddressDetail(walletDetail.address)
}

Template.appView.events({
  'click #unlockButton': () => {
    $('#unlocking').show()
    $('#unlocking').show()
    // CALL WASM HERE TO VALIDATE HEX OR MNEMONIC
    const walletType = document.getElementById('walletType').value
    setTimeout(viewWallet(walletType), 1000)
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
    getAddressDetail(LocalStore.get('walletDetail').address)
  },
})

Template.appView.helpers({
  walletDetail() {
    return LocalStore.get('walletDetail')
  },
  addressQR() {
    return LocalStore.get('walletDetail').address
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
