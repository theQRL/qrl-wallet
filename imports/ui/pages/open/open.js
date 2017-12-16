import './open.html'
/* global LocalStore */
/* global QRLLIB */
/* global XMSS_OBJECT */

Template.addressOpen.onRendered(() => {
  $('.ui.dropdown').dropdown()

  LocalStore.set('address', '')
  LocalStore.set('addressTransactions', '')

  // Route to view address if wallet is already opened
  if (LocalStore.get('walletStatus').unlocked === true) {
    const params = { address: LocalStore.get('walletStatus').address }
    const path = FlowRouter.path('/view/:address', params)
    FlowRouter.go(path)
  }
})

function openWallet(walletType) {
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

    // If it worked, send the user to the address page.
    if (thisAddress !== '') {
      const params = { address: thisAddress }
      const path = FlowRouter.path('/open/:address', params)
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

Template.addressOpen.events({
  'click #unlockButton': () => {
    $('#unlocking').show()
    const walletType = document.getElementById('walletType').value
    setTimeout(function () { openWallet(walletType) }, 200)
  },
})

