import './close.html'
/* eslint no-undef:0 */

Template.appAddressClose.onRendered(() => {
  XMSS_OBJECT = null
  resetWalletStatus()
})
