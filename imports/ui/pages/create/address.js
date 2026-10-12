import { FlowRouter } from 'meteor/ostrio:flow-router-extra'
/* eslint no-console:0 */

import './address.html'
import {
  buildEncryptedEnvelope,
  buildUnencryptedEnvelope,
  downloadWalletFile,
  normalizeWalletRecord,
} from '../../lib/wallet-crypto'

let passphrase

function closeAllOpenDialogs() {
  const openDialogs = document.querySelectorAll('dialog[open]')
  openDialogs.forEach((dialog) => {
    try {
      dialog.close()
    } catch (error) {
      // Ignore dialog close errors during route transitions.
    }
  })
}

async function saveWallet(encrypted) {
  const walletDetail = getXMSSDetails()
  const normalizedWallet = normalizeWalletRecord(walletDetail)

  if (encrypted === true && !passphrase) {
    throw new Error('Passphrase is required for encrypted wallet save')
  }

  const walletEnvelope = encrypted
    ? await buildEncryptedEnvelope(normalizedWallet, passphrase)
    : buildUnencryptedEnvelope(normalizedWallet)

  downloadWalletFile(walletEnvelope, 'wallet.json')
}

function userDenyWalletSaveNotice() {
  setTimeout(function () {
    const educationModal = document.getElementById('saveItEducationModal')
    if (educationModal) {
      educationModal.addEventListener('close', () => {
        const path = FlowRouter.path('/', {})
        FlowRouter.go(path)
      }, { once: true })
      educationModal.showModal()
    }
  }, 250)
}

Template.appCreateAddress.onCreated(() => {
  // Grab passphrase from session and reset
  passphrase = Session.get('passphrase')
  Session.set('passphrase', '')
  Session.set('modalEventTriggered', false)
})

Template.appCreateAddress.onRendered(() => {
  // Show save reminder modal
  const saveItModal = document.getElementById('saveItModal')
  if (saveItModal) {
    // Handle approve button
    const approveBtn = document.getElementById('saveItApprove')
    if (approveBtn) {
      approveBtn.addEventListener('click', () => {
        Session.set('modalEventTriggered', true)
        saveItModal.close()
      })
    }
    // Handle modal close (cancel or backdrop)
    saveItModal.addEventListener('close', () => {
      if (Session.get('modalEventTriggered') === false) {
        userDenyWalletSaveNotice()
      }
      Session.set('modalEventTriggered', false)
    }, { once: true })

    saveItModal.showModal()
  }
})

Template.appCreateAddress.onDestroyed(() => {
  closeAllOpenDialogs()
})

Template.appCreateAddress.events({
  'click #openWalletButton': () => {
    closeAllOpenDialogs()
    const params = {}
    const path = FlowRouter.path('/open', params)
    FlowRouter.go(path)
  },
  'click #saveEncrypted': () => {
    saveWallet(true).catch((error) => {
      console.error('Failed to save encrypted wallet:', error)
    })
  },
  'click #saveUnencrypted': () => {
    const insecureModal = document.getElementById('insecureModal')
    if (insecureModal) {
      // Set up approve handler
      const approveBtn = document.getElementById('insecureApprove')
      if (approveBtn) {
        approveBtn.onclick = () => {
          saveWallet(false).catch((error) => {
            console.error('Failed to save unencrypted wallet:', error)
          })
          insecureModal.close()
        }
      }
      insecureModal.showModal()
    }
  },
})

Template.appCreateAddress.helpers({
  bech32() {
    if (LocalStore.get('addressFormat') === 'bech32') {
      return true
    }
    return false
  },
  newAddress() {
    return getXMSSDetails()
  },
  QRText() {
    if (LocalStore.get('addressFormat') === 'bech32') {
      return getXMSSDetails().addressB32
    }
    return getXMSSDetails().address
  },
})
