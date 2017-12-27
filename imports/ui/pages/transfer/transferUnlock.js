import aes256 from 'aes256'
import './transferUnlock.html'

/* global QRLLIB */
/* global LocalStore */
/* global XMSS_OBJECT */

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

    // eslint-disable-next-line no-global-assign
    XMSS_OBJECT = new QRLLIB.Xmss(thisSeedBin, 10)
    const thisAddress = XMSS_OBJECT.getAddress()

    if (thisAddress !== '') {
      const status = {}
      status.colour = 'green'
      status.string = `${thisAddress} is ready to use.`
      status.unlocked = true
      status.address = thisAddress
      status.menuHidden = ''
      LocalStore.set('walletStatus', status)


      const params = {}
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

  LocalStore.set('transferFromBalance', '')
  LocalStore.set('transferFromAddress', '')

  // Route to view address if wallet is already opened
  if (LocalStore.get('walletStatus').unlocked === true) {
    const params = {}
    const path = FlowRouter.path('/transfer/detail', params)
    FlowRouter.go(path)
  }
})

Template.appTransferUnlock.events({
  'click #unlockButton': () => {
    $('#unlocking').show()
    $('#noWalletFileSelected').hide()

    const walletType = document.getElementById('walletType').value

    // Read file locally, extract mnemonic and open wallet
    if (walletType === 'file') {
      const walletFiles = $('#walletFile').prop('files')
      const walletFile = walletFiles[0]
      const reader = new FileReader()
      reader.onload = (function(theFile) {
        return function(e) {
          try {
            const walletJson = JSON.parse(e.target.result)
            const walletEncrypted = walletJson[0].encrypted

            // Decrypt an encrypted wallet file
            if (walletEncrypted === true) {
              const passphrase = document.getElementById('passphrase').value
              // Decrypt wallet items before proceeding
              walletJson[0].address = aes256.decrypt(passphrase, walletJson[0].address)
              walletJson[0].mnemonic = aes256.decrypt(passphrase, walletJson[0].mnemonic)
              walletJson[0].hexseed = aes256.decrypt(passphrase, walletJson[0].hexseed)
            }

            const walletMnemonic = walletJson[0].mnemonic
            $('#walletCode').val(walletMnemonic)

            // Validate we have a valid mnemonic before attemptint to open file
            if ((walletMnemonic.split(' ').length - 1) !== 31) {
              // Invalid mnemonic in wallet file
              $('#unlocking').hide()
              $('#noWalletFileSelected').show()
            } else {
              // Open wallet file
              setTimeout(() => { unlockWallet('mnemonic') }, 200)
            }
          } catch (eDec) {
            // Invalid file format
            $('#unlocking').hide()
            $('#noWalletFileSelected').show()
          }
        }
      })(walletFile)

      // Validate we've got a wallet file
      if (walletFile === undefined) {
        $('#unlocking').hide()
        $('#noWalletFileSelected').show()
      } else {
        reader.readAsText(walletFile)
      }
    } else {
    // Open from hexseed of mnemonic directly
      const walletTypeDir = document.getElementById('walletType').value
      setTimeout(() => { unlockWallet(walletTypeDir) }, 200)
    }
  },
  'change #walletType': () => {
    const walletType = document.getElementById('walletType').value
    if (walletType === 'file') {
      $('#walletCode').hide()
      $('#walletFile').show()
      $('#passphraseArea').show()
    } else {
      $('#walletCode').show()
      $('#walletFile').hide()
      $('#passphraseArea').hide()
    }
  },
})
