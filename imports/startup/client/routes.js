import { FlowRouter } from 'meteor/kadira:flow-router'
import { BlazeLayout } from 'meteor/kadira:blaze-layout'

// Import needed templates
import '../../ui/layouts/body/body.js'
import '../../ui/pages/not-found/not-found.js'
import '../../ui/pages/create/create.js'
import '../../ui/pages/create/address.js'
import '../../ui/pages/open/open.js'
import '../../ui/pages/close/close.js'

import '../../ui/pages/transfer/transfer.js'
import '../../ui/pages/transfer/reload.js'

import '../../ui/pages/tokens/tokenCreate.js'
import '../../ui/pages/tokens/tokenCreateConfirm.js'
import '../../ui/pages/tokens/tokenCreateResult.js'

import '../../ui/pages/verify/verify.js'
import '../../ui/pages/verify/tx.js'

// Home route (create wallet)
FlowRouter.route('/', {
  name: 'App.home',
  action() {
    BlazeLayout.render('appBody', { main: 'appCreate' })
  },
})

// Wallet creation
FlowRouter.route('/create', {
  name: 'App.create',
  action() {
    BlazeLayout.render('appBody', { main: 'appCreate' })
  },
})
FlowRouter.route('/create/:address', {
  name: 'App.createAddress',
  action() {
    BlazeLayout.render('appBody', { main: 'appCreateAddress' })
  },
})

// Wallet Open/Close
FlowRouter.route('/open', {
  name: 'App.open',
  action() {
    BlazeLayout.render('appBody', { main: 'appAddressOpen' })
  },
})
FlowRouter.route('/close', {
  name: 'App.close',
  action() {
    BlazeLayout.render('appBody', { main: 'appAddressClose' })
  },
})

// Transfers (Quanta and Tokens)
FlowRouter.route('/transfer', {
  name: 'App.transfer',
  action() {
    BlazeLayout.render('appBody', { main: 'appTransfer' })
  },
})
FlowRouter.route('/reloadTransfer', {
  name: 'App.reloadTransfer',
  action() {
    BlazeLayout.render('appBody', { main: 'appReloadTransfer' })
  },
})

// Token Creation
FlowRouter.route('/tokens/create', {
  name: 'App.tokensCreate',
  action() {
    BlazeLayout.render('appBody', { main: 'appTokenCreate' })
  },
})
FlowRouter.route('/tokens/create/confirm', {
  name: 'App.tokenCreationConfirm',
  action() {
    BlazeLayout.render('appBody', { main: 'appTokenCreationConfirm' })
  },
})
FlowRouter.route('/tokens/create/result', {
  name: 'App.tokenCreationResult',
  action() {
    BlazeLayout.render('appBody', { main: 'appTokenCreationResult' })
  },
})

// Transaction Verififation
FlowRouter.route('/verify', {
  name: 'App.verify',
  action() {
    BlazeLayout.render('appBody', { main: 'appVerify' })
  },
})
FlowRouter.route('/verify-txid/:txId', {
  name: 'App.verifytxid',
  action() {
    BlazeLayout.render('appBody', { main: 'appVerifyTxid' })
  },
})

// Not found
FlowRouter.notFound = {
  action() {
    BlazeLayout.render('appBody', { main: 'appNotFound' })
  },
}
