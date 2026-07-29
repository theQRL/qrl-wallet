/* eslint no-console:0, max-len:0 */
/* global getXMSSDetails */

import './recoveryseed.html'

Template.appRecoverySeed.onDestroyed(() => {
  $('#recoverySeedQR').empty()
})

Template.appRecoverySeed.events({
  'click #revealRecoverySeed': () => {
    const xmss = getXMSSDetails()
    if (!xmss || xmss.walletType !== 'seed') {
      return
    }

    $('#recoverySeedQR').empty()
    $('#recoverySeedQR').qrcode({ width: 142, height: 142, text: xmss.hexseed })

    $('#revealRecoverySeedArea').hide()
    $('#recoverySeedDetails').show()
  },
  'click #hideRecoverySeed': () => {
    $('#recoverySeedDetails').hide()
    $('#recoverySeedQR').empty()
    $('#revealRecoverySeedArea').show()
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
  recoverySeed() {
    try {
      return getXMSSDetails()
    } catch (error) {
      return false
    }
  },
})
