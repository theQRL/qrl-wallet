import './view.html'
/* global LocalStore */
/* global QRLLIB */
/* global XMSS_GLOBAL */
/* global DEFAULT_NODES */
/* global findNodeData */
/* global selectedNode */

Template.addressView.onRendered(() => {
  $('.ui.dropdown').dropdown()
})

function viewWallet(walletType) {
  LocalStore.set('address', '')
  LocalStore.set('addressTransactions', '')
  
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
      const path = FlowRouter.path('/view/:address', params)
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

Template.addressView.events({
  'click #unlockButton': () => {
    $('#unlocking').show()
    const walletType = document.getElementById('walletType').value
    setTimeout(function () { viewWallet(walletType) }, 200)
  },
})

