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

Template.appCreateAddress.onCreated(() => {
  // Grab passphrase from LocalStore and reset
  passphrase = LocalStore.get('passphrase')
  LocalStore.set('passphrase', '')
})

Template.appCreateAddress.events({
  'click #saveEncrypted': () => {
    saveWallet(true)
  },
  'click #saveUnencrypted': () => {
    saveWallet(false)
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
