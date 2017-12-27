import './close.html'
/* eslint no-undef:0 */

Template.addressClose.onRendered(() => {
  XMSS_OBJECT = null
  resetWalletStatus()
})
