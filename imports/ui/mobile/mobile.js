import './mobile.html'
import { WALLET_VERSION } from '../../startup/both/index.js'

Template.mobile.onCreated(() => {
//
})
Template.mobile.events({
//
})
Template.mobile.helpers({
  qrlWalletVersion() {
    return WALLET_VERSION
  },
})
