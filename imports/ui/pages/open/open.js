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
    const path = FlowRouter.path('/open/:address', params)
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

    // Read file locally, extract mnemonic and open wallet
    if(walletType == "file") {
      const walletFiles = $('#walletFile').prop("files")
      const walletFile = walletFiles[0]
      var reader = new FileReader()
      reader.onload = (function(theFile) {
        return function(e) {
          const walletJson = JSON.parse(e.target.result)
          const walletMnemonic = walletJson[0].mnemonic
          $('#walletCode').val(walletMnemonic)

          setTimeout(function () { openWallet('mnemonic') }, 200)
        }
      })(walletFile)
      reader.readAsText(walletFile)
    } else {
    // Open from hexseed or mnemonic directly
      const walletType = document.getElementById('walletType').value
      setTimeout(function () { openWallet(walletType) }, 200)
    }
  },
  'change #walletType': () => {
    const walletType = document.getElementById('walletType').value
    if(walletType == "file") {
      $('#walletCode').hide()
      $('#walletFile').show()
    } else {
      $('#walletCode').show()
      $('#walletFile').hide()
    }
  },
})

