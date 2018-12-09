import aes256 from 'aes256'
import './open.html'

/* global QRLLIB */
/* global XMSS_OBJECT */
/* global resetLocalStorageState */
/* global getMnemonicOfFirstAddress */
/* global isWalletFileDeprecated */
/* global LocalStore */

Template.appAddressOpen.onCreated(() => {
  Session.set('modalEventTriggered', false)
})

Template.appAddressOpen.onRendered(() => {
  $('.ui.dropdown').dropdown()

  // Restore local storage state
  resetLocalStorageState()

  // Route to transfer if wallet is already opened
  if (Session.get('walletStatus').unlocked === true) {
    const params = {}
    const path = FlowRouter.path('/transfer', params)
    FlowRouter.go(path)
  }

  // determine last used means of opening wallet from LocalStore
  let openWalletPref = LocalStore.get('openWalletDefault')
  if (!openWalletPref) {
    openWalletPref = 'json'
  }
  if (openWalletPref === 'json') {
    $('#walletCode').hide()
    $('#walletFile').show()
    $('#passphraseArea').show()
  } else {
    $('#walletCode').show()
    $('#walletFile').hide()
    $('#passphraseArea').hide()
    $('#walletType').val(openWalletPref).change()
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
      Session.set('walletStatus', status)
      Session.set('transferFromAddress', thisAddress)
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

function triggerOpen(walletJson, passphrase) {
  const walletMnemonic = getMnemonicOfFirstAddress(walletJson, passphrase)

  // Validate we have a valid mnemonic before attempting to open file
  if ((walletMnemonic.split(' ').length - 1) !== 33) {
    // Invalid mnemonic in wallet file
    $('#unlocking').hide()
    $('#noWalletFileSelected').show()
  } else {
    // Open wallet file
    setTimeout(() => { openWallet('mnemonic', walletMnemonic) }, 200)
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
          const walletDetail = JSON.parse(e.target.result)

          // Check if wallet file is deprecated
          if(isWalletFileDeprecated(walletDetail)) {
            $('#updateWalletFileFormat').modal({
              onApprove: () => {
                Session.set('modalEventTriggered', true)
                // User has requested to update wallet file, resave with updated fields
                walletDetail[0].addressB32 = aes256.encrypt(passphrase, walletDetail[0].addressB32)
                walletDetail[0].pk = aes256.encrypt(passphrase, walletDetail[0].pk)

                const walletJson = ['[', JSON.stringify(walletDetail[0]), ']'].join('')
                const binBlob = new Blob([walletJson])
                const a = window.document.createElement('a')
                a.href = window.URL.createObjectURL(binBlob, { type: 'text/plain' })
                a.download = 'wallet.json'
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)

                // Reset the state of the open wallet page.
                $('#unlocking').hide()
                $("#walletFile").val('')
                $("#passphrase").val('')
              },
              onDeny: () => {
                Session.set('modalEventTriggered', true)
                triggerOpen(walletDetail, passphrase)
              },
              onHide: () => {
                if (Session.get('modalEventTriggered') === false) {
                  triggerOpen(walletDetail, passphrase)
                }
                Session.set('modalEventTriggered', false)
              },
            }).modal('show')
          } else {
            // Wallet is not bugged version - go ahead and trigger opening it
            triggerOpen(walletDetail, passphrase)
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
      LocalStore.set('openWalletDefault', 'json')
    } else {
      $('#walletCode').show()
      $('#walletFile').hide()
      $('#passphraseArea').hide()
      LocalStore.set('openWalletDefault', $('#walletType :selected').val())
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
