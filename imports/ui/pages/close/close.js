/* eslint no-console:0 */

import './close.html'
import { openDialog, resolve } from '../../lib/dom'

Template.appAddressClose.onRendered(() => {
  XMSS_OBJECT = null // eslint-disable-line
  resetWalletStatus()
  if (Session.get('closedWithError')) {
    const modal = openDialog('closedWithError')
    if (modal) {
      const clearErrorState = () => {
        Session.set('closedWithError', false)
        modal.removeEventListener('close', clearErrorState)
      }
      modal.addEventListener('close', clearErrorState)
    }
  }
})
Template.appAddressClose.events({
  'click #closedWithError .modal-backdrop button': () => {
    const modal = resolve('closedWithError')
    if (modal && modal.open) modal.close()
  },
})
