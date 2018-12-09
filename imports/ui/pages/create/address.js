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
    walletDetail.addressB32 = aes256.encrypt(passphrase, walletDetail.addressB32)
    walletDetail.pk = aes256.encrypt(passphrase, walletDetail.pk)
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
  // Grab passphrase from session and reset
  passphrase = Session.get('passphrase')
  Session.set('passphrase', '')
  Session.set('modalEventTriggered', false)
})

Template.appCreateAddress.onRendered(() => {
  $('#insecureModal').modal()
  $('#saveItEducationModal').modal()

  $('#saveItModal').modal({
    onApprove: () => {
      Session.set('modalEventTriggered', true)
    },
    onDeny: () => {
      Session.set('modalEventTriggered', true)
      userDenyWalletSaveNotice()
    },
    onHide: () => {
      if (Session.get('modalEventTriggered') === false) {
        userDenyWalletSaveNotice()
      }
      Session.set('modalEventTriggered', false)
    },
  }).modal('show')

  Tracker.autorun(function () {
    if (LocalStore.get('addressFormat') == 'bech32') {
      $('.qr-code-container').empty()
      $(".qr-code-container").qrcode({width:88, height:88, text: getXMSSDetails().addressB32})
    }
    else {
      $('.qr-code-container').empty()
      $(".qr-code-container").qrcode({width:88, height:88, text: getXMSSDetails().address})
    }
  })
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
  bech32() {
    if (LocalStore.get('addressFormat') == 'bech32') {
      return true
    }
    return false
  },
  newAddress() {
    return getXMSSDetails()
  },
  QRText() {
    return getXMSSDetails().address
  },
})
