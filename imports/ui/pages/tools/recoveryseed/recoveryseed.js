/* eslint no-console:0, max-len:0 */
/* global getXMSSDetails */

import './recoveryseed.html'

// Seed material is rendered only once the user asks for it, so the mnemonic and
// hexseed are absent from the DOM until then rather than merely hidden by CSS.
// Reset on create and destroy so a previous reveal never carries across
// navigation back into this page.
Template.appRecoverySeed.onCreated(() => {
  Session.set('recoverySeedRevealed', false)
})

Template.appRecoverySeed.onDestroyed(() => {
  $('#recoverySeedQR').empty()
  Session.set('recoverySeedRevealed', false)
})

Template.appRecoverySeed.events({
  'click #revealRecoverySeed': () => {
    const xmss = getXMSSDetails()
    if (!xmss || xmss.walletType !== 'seed') {
      return
    }

    Session.set('recoverySeedRevealed', true)

    // The QR container only exists once Blaze has rendered the revealed block.
    Tracker.afterFlush(() => {
      $('#recoverySeedQR').empty()
      $('#recoverySeedQR').qrcode({ width: 142, height: 142, text: xmss.hexseed })
    })
  },
  'click #hideRecoverySeed': () => {
    $('#recoverySeedQR').empty()
    Session.set('recoverySeedRevealed', false)
  },
})

Template.appRecoverySeed.helpers({
  isSeedWallet() {
    try {
      return getXMSSDetails().walletType === 'seed'
    } catch (error) {
      return false
    }
  },
  seedRevealed() {
    return Session.get('recoverySeedRevealed') === true
  },
  recoverySeed() {
    try {
      return getXMSSDetails()
    } catch (error) {
      return false
    }
  },
})
