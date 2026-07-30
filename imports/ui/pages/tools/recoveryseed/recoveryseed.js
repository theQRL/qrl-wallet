/* eslint no-console:0, max-len:0 */
/* global getXMSSDetails */

import './recoveryseed.html'

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

// Seed material is rendered only once the user asks for it, so the mnemonic and
// hexseed are absent from the DOM until then rather than merely hidden by CSS.
// Cleared on create and destroy so a previous reveal never carries across
// navigation back into this page.
Template.appRecoverySeed.onCreated(() => {
  Session.set('recoverySeedRevealedFor', null)
})

Template.appRecoverySeed.onDestroyed(() => {
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
    $('#recoverySeedQR').empty()
    Session.set('recoverySeedRevealedFor', null)
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
