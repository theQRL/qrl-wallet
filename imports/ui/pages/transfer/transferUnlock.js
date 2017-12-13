import './transferUnlock.html'
/* global QRLLIB */

function unlockWallet(walletType) {
  try {
    const userBinSeed = document.getElementById('walletCode').value
    let thisSeedBin

    // Generate binary seed
    if (walletType === 'hexseed') {
      thisSeedBin = QRLLIB.hstr2bin(userBinSeed)
    } else if (walletType === 'mnemonic') {
      thisSeedBin = QRLLIB.mnemonic2bin(userBinSeed)
    }

    XMSS_OBJECT = new QRLLIB.Xmss(thisSeedBin, 10)
    const thisAddress = XMSS_OBJECT.getAddress()

    if (thisAddress !== '') {
      const params = { }
      const path = FlowRouter.path('/transfer/detail', params)
      FlowRouter.go(path)
    } else {
      $('#unlockError').show()
      $('#unlocking').hide()
    }
  } catch (error) {
    $('#unlockError').show()
    $('#unlocking').hide()
  }
}

Template.appTransferUnlock.onRendered(() => {
  $('.ui.dropdown').dropdown()
})

Template.appTransferUnlock.events({
  'click #unlockButton': () => {
    $('#unlocking').show()
    const walletType = document.getElementById('walletType').value
    setTimeout(function () { unlockWallet(walletType) }, 200)
  },
})
