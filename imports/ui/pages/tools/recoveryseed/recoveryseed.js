/* eslint no-console:0, max-len:0 */

import './recoveryseed.html'
import * as walletCrypto from '../../../lib/wallet-crypto'

// The address of the seed wallet currently open, or null if there isn't one.
// Reveal state is keyed to this rather than being a bare boolean: if the wallet
// identity changes while this page is mounted, a previous "revealed" state would
// otherwise carry over and display the new wallet's seed with no user action.
function currentSeedIdentity() {
  try {
    const xmss = getXMSSDetails()
    if (!xmss || xmss.walletType !== 'seed' || !xmss.address) {
      return null
    }
    return xmss.address
  } catch (error) {
    return null
  }
}

function clearSaveError() {
  const error = document.getElementById('recoverySaveError')
  if (error) {
    error.textContent = ''
    error.classList.add('hidden')
  }
}

function showSaveError(message) {
  const error = document.getElementById('recoverySaveError')
  if (error) {
    error.textContent = message
    error.classList.remove('hidden')
  }
}

function clearSaveControls() {
  const modal = document.getElementById('recoveryUnencryptedModal')
  if (modal?.open) modal.close()
  for (const id of ['recoveryPassphrase', 'recoveryPassphraseConfirm']) {
    const input = document.getElementById(id)
    if (input) input.value = ''
  }
  clearSaveError()
}

function recoverySeedIsRevealedFor(address) {
  return address !== null
    && currentSeedIdentity() === address
    && Session.get('recoverySeedRevealedFor') === address
    && document.getElementById('recoverySeedDetails') !== null
}

function getRevealedWalletRecord() {
  const address = currentSeedIdentity()
  if (!recoverySeedIsRevealedFor(address)) return null
  const wallet = walletCrypto.normalizeWalletRecord(getXMSSDetails())
  return wallet.address === address ? wallet : null
}

async function saveRecoveryWallet(encrypted, passphrase) {
  const revealedDetails = document.getElementById('recoverySeedDetails')
  const wallet = getRevealedWalletRecord()
  if (!wallet) return

  const envelope = encrypted
    ? await walletCrypto.buildEncryptedEnvelope(wallet, passphrase)
    : walletCrypto.buildUnencryptedEnvelope(wallet)

  if (document.getElementById('recoverySeedDetails') === revealedDetails
      && recoverySeedIsRevealedFor(wallet.address)) {
    walletCrypto.downloadWalletFile(envelope, 'wallet.json')
  }
}

// Seed material is rendered only once the user asks for it, so the mnemonic and
// hexseed are absent from the DOM until then rather than merely hidden by CSS.
// Cleared on create and destroy so a previous reveal never carries across
// navigation back into this page.
Template.appRecoverySeed.onCreated(() => {
  Session.set('recoverySeedRevealedFor', null)
})

Template.appRecoverySeed.onDestroyed(() => {
  clearSaveControls()
  $('#recoverySeedQR').empty()
  Session.set('recoverySeedRevealedFor', null)
})

Template.appRecoverySeed.events({
  'click #revealRecoverySeed': () => {
    const address = currentSeedIdentity()
    if (!address) {
      return
    }

    Session.set('recoverySeedRevealedFor', address)

    // The QR container only exists once Blaze has rendered the revealed block.
    Tracker.afterFlush(() => {
      // Re-read the wallet here: if the identity changed between the click and
      // this flush, drawing would encode the wrong wallet's hexseed.
      const xmss = getXMSSDetails()
      if (currentSeedIdentity() !== address || !xmss) {
        $('#recoverySeedQR').empty()
        return
      }
      $('#recoverySeedQR').empty()
      $('#recoverySeedQR').qrcode({ width: 142, height: 142, text: xmss.hexseed })
    })
  },
  'click #hideRecoverySeed': () => {
    clearSaveControls()
    $('#recoverySeedQR').empty()
    Session.set('recoverySeedRevealedFor', null)
  },
  'click #saveRecoveryUnencrypted': () => {
    clearSaveError()
    if (getRevealedWalletRecord()) {
      document.getElementById('recoveryUnencryptedModal')?.showModal()
    }
  },
  'click #confirmRecoveryUnencrypted': async () => {
    document.getElementById('recoveryUnencryptedModal')?.close()
    try {
      await saveRecoveryWallet(false)
    } catch (error) {
      console.error('Failed to save unencrypted wallet:', error)
      showSaveError('Could not create the wallet file. Please try again.')
    }
  },
  'click #saveRecoveryEncrypted': async (event) => {
    clearSaveError()
    const revealedDetails = document.getElementById('recoverySeedDetails')
    const passphraseInput = document.getElementById('recoveryPassphrase')
    const confirmInput = document.getElementById('recoveryPassphraseConfirm')
    const passphrase = passphraseInput?.value || ''

    if (!passwordPolicyValid(passphrase)) {
      showSaveError('Use at least 8 characters, including a letter and a number.')
      return
    }
    if (passphrase !== confirmInput?.value) {
      showSaveError('Passphrases do not match.')
      return
    }

    const button = event.currentTarget
    const buttonLabel = button.textContent
    button.disabled = true
    button.textContent = 'Encrypting wallet...'
    try {
      await saveRecoveryWallet(true, passphrase)
      if (passphraseInput) passphraseInput.value = ''
      if (confirmInput) confirmInput.value = ''
    } catch (error) {
      console.error('Failed to save encrypted wallet:', error)
      if (document.getElementById('recoverySeedDetails') === revealedDetails) {
        showSaveError('Could not create the wallet file. Please try again.')
      }
    } finally {
      button.disabled = false
      button.textContent = buttonLabel
    }
  },
})

Template.appRecoverySeed.helpers({
  isSeedWallet() {
    return currentSeedIdentity() !== null
  },
  seedRevealed() {
    const address = currentSeedIdentity()
    // Reactive on both the reveal state and the wallet identity, so a change of
    // wallet re-hides the seed and tears the QR node down with it.
    return address !== null && Session.get('recoverySeedRevealedFor') === address
  },
  recoverySeed() {
    try {
      return getXMSSDetails()
    } catch (error) {
      return false
    }
  },
})
