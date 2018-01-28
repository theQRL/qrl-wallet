import aes256 from 'aes256'
import './open.html'

/* global LocalStore */
/* global QRLLIB */
/* global XMSS_OBJECT */

Template.appAddressOpen.onRendered(() => {
  $('.ui.dropdown').dropdown()

  $('#openWalletTabs .item').tab()
  $('#xmssHeightDropdown').dropdown({direction: 'upward' })

  LocalStore.set('address', '')
  LocalStore.set('addressTransactions', '')

  // Route to view address if wallet is already opened
  if (LocalStore.get('walletStatus').unlocked === true) {
    const params = { address: LocalStore.get('walletStatus').address }
    const path = FlowRouter.path('/open/:address', params)
    FlowRouter.go(path)
  }
})

function openWallet(walletType, walletCode, xmssHeight) {
  try {
    // Generate binary seed
    if (walletType === 'hexseed') {
      thisSeedBin = QRLLIB.hstr2bin(walletCode)
    } else if (walletType === 'mnemonic') {
      thisSeedBin = QRLLIB.mnemonic2bin(walletCode)
    }

    // eslint-disable-next-line no-global-assign
    XMSS_OBJECT = new QRLLIB.Xmss(thisSeedBin, xmssHeight)
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

function unlockWallet(basicOrAdvanced) {
  let xmssHeight
  let walletType
  let walletCode
  let walletFiles
  let passphrase

  if (basicOrAdvanced === 'basic') {
    xmssHeight = 10
    walletType = document.getElementById('walletTypeBasic').value
    walletCode = document.getElementById('walletCodeBasic').value
    walletFiles = $('#walletFileBasic').prop('files')
    passphrase = document.getElementById('basicPassphrase').value
  } else {
    xmssHeight = parseInt(document.getElementById('xmssHeight').value)
    walletType = document.getElementById('walletTypeAdvanced').value
    walletCode = document.getElementById('walletCodeAdvanced').value
    walletFiles = $('#walletFileAdvanced').prop('files')
    passphrase = document.getElementById('advancedPassphrase').value
  }

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
          if ((walletMnemonic.split(' ').length - 1) !== 31) {
            // Invalid mnemonic in wallet file
            $('#unlocking').hide()
            $('#noWalletFileSelected').show()
          } else {
            // Open wallet file
            setTimeout(() => { openWallet('mnemonic', walletMnemonic, walletJson[0].height) }, 200)
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
    setTimeout(() => { openWallet(walletType, walletCode, xmssHeight) }, 200)
  }
}

Template.appAddressOpen.events({
  'click #unlockButtonBasic': () => {
    $('#unlocking').show()
    $('#unlockError').hide()
    $('#noWalletFileSelected').hide()
    setTimeout(() => { unlockWallet('basic') }, 50)
  },
  'click #unlockButtonAdvanced': () => {
    $('#unlocking').show()
    $('#unlockError').hide()
    $('#noWalletFileSelected').hide()
    setTimeout(() => { unlockWallet('advanced') }, 50)
  },
  'change #walletTypeBasic': () => {
    const walletType = document.getElementById('walletTypeBasic').value
    if (walletType === 'file') {
      $('#walletCodeBasic').hide()
      $('#walletFileBasic').show()
      $('#passphraseAreaBasic').show()
    } else {
      $('#walletCode').show()
      $('#walletFile').hide()
      $('#passphraseAreaBasic').hide()
    }
  },
  'change #walletTypeAdvanced': () => {
    const walletType = document.getElementById('walletTypeAdvanced').value
    if (walletType === 'file') {
      $('#walletCodeAdvanced').hide()
      $('#walletFileAdvanced').show()
      $('#passphraseAreaAdvanced').show()
      $('#xmssHeightDropdown').hide()
    } else {
      $('#walletCodeAdvanced').show()
      $('#walletFileAdvanced').hide()
      $('#passphraseAreaAdvanced').hide()
      $('#xmssHeightDropdown').show()
    }
  },
})

