import aes256 from 'aes256'
import './address.html'
/* global getXMSSDetails */
/* global LocalStore */

let passphrase

function saveWallet(encrypted) {
  const walletDetail = getXMSSDetails()

  // Encrypt wallet data if secure wallet requested.
  if (encrypted === true) {
    walletDetail.encrypted = true
    walletDetail.address = aes256.encrypt(passphrase, walletDetail.address)
    walletDetail.mnemonic = aes256.encrypt(passphrase, walletDetail.mnemonic)
    walletDetail.hexseed = aes256.encrypt(passphrase, walletDetail.hexseed)
  } else {
    walletDetail.encrypted = false
  }

  const walletJson = ['[', JSON.stringify(walletDetail), ']'].join('')
  const binBlob = new Blob([walletJson])
  const a = window.document.createElement('a')
  a.href = window.URL.createObjectURL(binBlob, { type: 'text/plain' })
  a.download = 'wallet.json'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

function userDenyWalletSaveNotice() {
  setTimeout( function() {
    $('#saveItEducationModal').modal({
      onHide: () => {
        const path = FlowRouter.path('/', {})
        FlowRouter.go(path)
      }
    }).modal('show')
  }, 250)
}

Template.appCreateAddress.onCreated(() => {
  // Grab passphrase from LocalStore and reset
  passphrase = LocalStore.get('passphrase')
  LocalStore.set('passphrase', '')
  LocalStore.set('modalEventTriggered', false)
})

Template.appCreateAddress.onRendered(() => {
  $('#insecureModal').modal()
  $('#saveItEducationModal').modal()

  $('#saveItModal').modal({
    onApprove: () => {
      LocalStore.set('modalEventTriggered', true)
    },
    onDeny: () => {
      LocalStore.set('modalEventTriggered', true)
      userDenyWalletSaveNotice()
    },
    onHide: () => {
      if (LocalStore.get('modalEventTriggered') === false) {
        userDenyWalletSaveNotice()
      }
      LocalStore.set('modalEventTriggered', false)
    }
  }).modal('show')
})

Template.appCreateAddress.events({
  'click #openWalletButton': () => {
    const params = {}
    const path = FlowRouter.path('/open', params)
    FlowRouter.go(path)
  },
  'click #saveEncrypted': () => {
    saveWallet(true)
  },
  'click #saveUnencrypted': () => {
    $('#insecureModal').modal({
      onApprove: () => {
        saveWallet(false)
      },
    }).modal('show')
  },
})

Template.appCreateAddress.helpers({
  newAddress() {
    return getXMSSDetails()
  },
  QRText() {
    return getXMSSDetails().address
  },
})
