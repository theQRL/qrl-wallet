import aes256 from 'aes256'
import './open.html'

/* global LocalStore */
/* global QRLLIB */
/* global XMSS_OBJECT */
/* global resetLocalStorageState */

Template.appAddressOpen.onRendered(() => {
  $('.ui.dropdown').dropdown()

  $('#openWalletTabs .item').tab()
  $('#xmssHeightDropdown').dropdown({direction: 'upward' })

  // Restore local storage state
  resetLocalStorageState()

  // Route to transfer if wallet is already opened
  if (LocalStore.get('walletStatus').unlocked === true) {
    const params = {}
    const path = FlowRouter.path('/transfer', params)
    FlowRouter.go(path)
  }
})

function openWallet(walletType, walletCode) {
  try {
    // Create XMSS object from seed
    if (walletType === 'hexseed') {
      XMSS_OBJECT = QRLLIB.Xmss.fromHexSeed(walletCode)
    } else if (walletType === 'mnemonic') {
      XMSS_OBJECT = QRLLIB.Xmss.fromMnemonic(walletCode)
    }

    const thisAddress = XMSS_OBJECT.getAddress()

    // If it worked, send the user to the address page.
    if (thisAddress !== '') {
      const status = {}
      status.colour = 'green'
      status.string = `${thisAddress} is ready to use.`
      status.unlocked = true
      status.address = thisAddress
      status.menuHidden = ''
      status.menuHiddenInverse = 'display: none'
      LocalStore.set('walletStatus', status)
      LocalStore.set('transferFromAddress', thisAddress)
      console.log('Opened address ', thisAddress)

      const params = {}
      const path = FlowRouter.path('/transfer', params)
      FlowRouter.go(path)
    } else {
      $('#unlockError').show()
      $('#unlocking').hide()
    }
  } catch (error) {
    console.log(error)
    $('#unlockError').show()
    $('#unlocking').hide()
  }
}

function unlockWallet() {
  let walletType = document.getElementById('walletType').value
  let walletCode = document.getElementById('walletCode').value
  let walletFiles = $('#walletFile').prop('files')
  let passphrase = document.getElementById('passphrase').value

  // Read file locally, extract mnemonic and open wallet
  if (walletType === 'file') {
    const walletFile = walletFiles[0]
    const reader = new FileReader()
    reader.onload = (function(theFile) {
      return function(e) {
        try {
          const walletJson = JSON.parse(e.target.result)
          const walletEncrypted = walletJson[0].encrypted

          // Decrypt an encrypted wallet file
          if (walletEncrypted === true) {
            // Decrypt wallet items before proceeding
            walletJson[0].address = aes256.decrypt(passphrase, walletJson[0].address)
            walletJson[0].mnemonic = aes256.decrypt(passphrase, walletJson[0].mnemonic)
            walletJson[0].hexseed = aes256.decrypt(passphrase, walletJson[0].hexseed)
          }

          const walletMnemonic = walletJson[0].mnemonic

          // Validate we have a valid mnemonic before attemptint to open file
          if ((walletMnemonic.split(' ').length - 1) !== 33) {
            // Invalid mnemonic in wallet file
            $('#unlocking').hide()
            $('#noWalletFileSelected').show()
          } else {
            // Open wallet file
            setTimeout(() => { openWallet('mnemonic', walletMnemonic) }, 200)
          }
        } catch (err) {
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
    // Open from hexseed or mnemonic directly
    setTimeout(() => { openWallet(walletType, walletCode) }, 200)
  }
}

Template.appAddressOpen.events({
  'click #unlockButton': () => {
    $('#unlocking').show()
    $('#unlockError').hide()
    $('#noWalletFileSelected').hide()
    setTimeout(() => { unlockWallet() }, 50)
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
  'input #walletCode': () => {
    const walletCode = $('#walletCode').val()
    if (walletCode.length > 10) {
      if (walletCode.indexOf(' ') > -1) {
        $('#walletType').val('mnemonic').change()
      } else {
        $('#walletType').val('hexseed').change()
      }
    }
  },
})

