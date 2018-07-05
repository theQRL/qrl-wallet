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

import '../../ui/pages/tools/tools.js'
import '../../ui/pages/tools/message/messageCreate.js'
import '../../ui/pages/tools/message/messageConfirm.js'
import '../../ui/pages/tools/message/messageResult.js'
import '../../ui/pages/tools/notarise/start.js'
import '../../ui/pages/tools/notarise/confirm.js'
import '../../ui/pages/tools/notarise/result.js'

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

// Tools
FlowRouter.route('/tools', {
  name: 'App.tools',
  action() {
    BlazeLayout.render('appBody', { main: 'appTools' })
  },
})
FlowRouter.route('/tools/message/create', {
  name: 'App.messageCreate',
  action() {
    BlazeLayout.render('appBody', { main: 'appMessageCreate' })
  },
})
FlowRouter.route('/tools/message/confirm', {
  name: 'App.messageConfirm',
  action() {
    BlazeLayout.render('appBody', { main: 'appMessageConfirm' })
  },
})
FlowRouter.route('/tools/message/result', {
  name: 'App.messageResult',
  action() {
    BlazeLayout.render('appBody', { main: 'appMessageResult' })
  },
})
FlowRouter.route('/tools/notarise/start', {
  name: 'App.notariseStart',
  action() {
    BlazeLayout.render('appBody', { main: 'appNotariseStart' })
  },
})
FlowRouter.route('/tools/notarise/confirm', {
  name: 'App.notariseConfirm',
  action() {
    BlazeLayout.render('appBody', { main: 'appNotariseConfirm' })
  },
})
FlowRouter.route('/tools/notarise/result', {
  name: 'App.notariseResult',
  action() {
    BlazeLayout.render('appBody', { main: 'appNotariseResult' })
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
