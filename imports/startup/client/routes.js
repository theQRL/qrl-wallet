import { FlowRouter } from 'meteor/kadira:flow-router'
import { BlazeLayout } from 'meteor/kadira:blaze-layout'

// Import needed templates
import '../../ui/layouts/body/body.js'
import '../../ui/pages/home/home.js'
import '../../ui/pages/not-found/not-found.js'
import '../../ui/pages/create/create.js'
import '../../ui/pages/create/address.js'
import '../../ui/pages/open/open.js'
import '../../ui/pages/open/addressOpened.js'
import '../../ui/pages/close/close.js'

import '../../ui/pages/transfer/transferUnlock.js'
import '../../ui/pages/transfer/transferForm.js'
import '../../ui/pages/transfer/transferConfirm.js'
import '../../ui/pages/transfer/transferResult.js'

import '../../ui/pages/tokens/tokens.js'
import '../../ui/pages/tokens/tokenCreate.js'
import '../../ui/pages/tokens/tokenCreateConfirm.js'
import '../../ui/pages/tokens/tokenCreateResult.js'

import '../../ui/pages/tokens/tokenTransfer.js'
import '../../ui/pages/tokens/tokenTransferConfirm.js'
import '../../ui/pages/tokens/tokenTransferResult.js'

import '../../ui/pages/verify/verify.js'
import '../../ui/pages/verify/tx.js'


// Set up all routes in the app
FlowRouter.route('/', {
  name: 'App.home',
  action() {
    BlazeLayout.render('appBody', { main: 'appHome' })
  },
})
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

FlowRouter.route('/open', {
  name: 'App.view',
  action() {
    BlazeLayout.render('appBody', { main: 'appAddressOpen' })
  },
})
FlowRouter.route('/open/:address', {
  name: 'App.view',
  action() {
    BlazeLayout.render('appBody', { main: 'appAddressOpened' })
  },
})
FlowRouter.route('/close', {
  name: 'App.view',
  action() {
    BlazeLayout.render('appBody', { main: 'appAddressClose' })
  },
})

FlowRouter.route('/transfer', {
  name: 'App.transferUnlock',
  action() {
    BlazeLayout.render('appBody', { main: 'appTransferUnlock' })
  },
})
FlowRouter.route('/transfer/detail', {
  name: 'App.transferForm',
  action() {
    BlazeLayout.render('appBody', { main: 'appTransferForm' })
  },
})
FlowRouter.route('/transfer/confirm', {
  name: 'App.transferConfirm',
  action() {
    BlazeLayout.render('appBody', { main: 'appTransferConfirm' })
  },
})
FlowRouter.route('/transfer/result', {
  name: 'App.transferResult',
  action() {
    BlazeLayout.render('appBody', { main: 'appTransferResult' })
  },
})


FlowRouter.route('/tokens', {
  name: 'App.tokens',
  action() {
    BlazeLayout.render('appBody', { main: 'appTokensHome' })
  },
})
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
FlowRouter.route('/tokens/transfer', {
  name: 'App.tokensTransfer',
  action() {
    BlazeLayout.render('appBody', { main: 'appTokenTransfer' })
  },
})
FlowRouter.route('/tokens/transfer/confirm', {
  name: 'App.tokensTransferConfirm',
  action() {
    BlazeLayout.render('appBody', { main: 'appTokenTransferConfirm' })
  },
})
FlowRouter.route('/tokens/transfer/result', {
  name: 'App.tokensTransferResult',
  action() {
    BlazeLayout.render('appBody', { main: 'appTokenTransferResult' })
  },
})



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
FlowRouter.notFound = {
  action() {
    BlazeLayout.render('appBody', { main: 'appNotFound' })
  },
}
