import './close.html'
/* global LocalStore */
/* global XMSS_OBJECT */

Template.addressClose.onRendered(() => {
  XMSS_OBJECT = null
  resetWalletStatus()
})
