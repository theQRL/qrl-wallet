import './view.html'
/* global LocalStore */
/* global QRLLIB */
/* global DEFAULT_NODES */
/* global findNodeData */
/* global selectedNode */

const ab2str = buf => String.fromCharCode.apply(null, new Uint16Array(buf))

Template.addressView.onRendered(() => {
  $('.ui.dropdown').dropdown()
})

const getAddressDetail = function (address) {

  const grpcEndpoint = findNodeData(DEFAULT_NODES, selectedNode()).grpc

  const request = {
    address: address,
    grpc: grpcEndpoint
  }

  Meteor.call('getAddress', request, (err, res) => {
    if (err) {
      console.log('error: ' + err)
      $('#unlocking').hide()
      $('#unlockError').show()
    } else {
      console.log(res)

      res.state.address = ab2str(res.state.address)
      res.state.balance /= 100000000

      LocalStore.set('address', res)

      $('#topsection').hide()

      $('#addressDetail').show()
    }
  })
}

function viewWallet(walletType) {
  try {
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

    let xmss = new QRLLIB.Xmss(thisSeedBin, 10)
    const thisAddress = xmss.getAddress()

    const thisAddressBin = QRLLIB.str2bin(thisAddress)
    var thisAddressBytes = new Uint8Array(thisAddressBin.size());
    for(var i=0; i<thisAddressBin.size(); i++) {
      thisAddressBytes[i] = thisAddressBin.get(i)
    }

    const walletDetail = {
      address: thisAddressBytes,
      addressString: thisAddress,
      hexSeed: thisHexSeed,
      mnemonicPhrase: thisMnemonic,
    }

    LocalStore.set('walletDetail', walletDetail)

    getAddressDetail(walletDetail.address)
  } catch (error) {
    $('#unlockError').show()
    $('#unlocking').hide()
  }
}

Template.addressView.events({
  'click #unlockButton': () => {
    $('#unlocking').show()
    const walletType = document.getElementById('walletType').value
    setTimeout(function () { viewWallet(walletType) }, 200)
  },
  'click #ShowTx': () => {
    $('table').show()
    const x = LocalStore.get('fetchedTx')
    if (x === false) {
      const tx = LocalStore.get('address').state.transactions
      Meteor.call('addressTransactions', tx, (err, res) => {
        if (err) {
          LocalStore.set('addressTransactions', { error: err })
        } else {
          LocalStore.set('addressTransactions', res)
          $('.loader').hide()
          LocalStore.set('fetchedTx', true)
        }
      })
    }
    $('#ShowTx').hide()
    $('#HideTx').show()
  },
  'click #HideTx': () => {
    $('table').hide()
    $('.loader').hide()
    $('#ShowTx').show()
    $('#HideTx').hide()
  },
  'click .refresh': () => {
    getAddressDetail(LocalStore.get('walletDetail').address)
  },
})


Template.addressView.helpers({
  address() {
    return LocalStore.get('address')
  },
  addressDetail() {
    return LocalStore.get('addressDetail')
  },
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


