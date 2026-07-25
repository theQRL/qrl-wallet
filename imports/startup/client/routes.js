import { FlowRouter } from 'meteor/ostrio:flow-router-extra'
import { BlazeLayout } from 'meteor/pwix:blaze-layout'

// Import needed templates
import '/imports/ui/layouts/body/appBodyLayout.html'
import '/imports/ui/layouts/body/customNode.html'
import '../../ui/layouts/body/body.js'
import '../../ui/components/qrcode/qrcode.js'
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
import '../../ui/pages/tools/keybase/keybaseCreate.js'
import '../../ui/pages/tools/keybase/keybaseConfirm.js'
import '../../ui/pages/tools/keybase/keybaseResult.js'
import '../../ui/pages/tools/github/githubCreate.js'
import '../../ui/pages/tools/github/githubConfirm.js'
import '../../ui/pages/tools/github/githubResult.js'

import '../../ui/pages/tools/xmssindex/update.js'

import '../../ui/pages/tools/multisig/multisigMenu.html'
import '../../ui/pages/tools/multisig/multisigMenu.js'
import '../../ui/pages/tools/multisig/multisigCreate.html'
import '../../ui/pages/tools/multisig/multisigCreate.js'
import '../../ui/pages/tools/multisig/multisigSpend.html'
import '../../ui/pages/tools/multisig/multisigSpend.js'
import '../../ui/pages/tools/multisig/multisigVote.html'
import '../../ui/pages/tools/multisig/multisigVote.js'
import '../../ui/pages/tools/addTokens/addTokens.html'
import '../../ui/pages/tools/addTokens/addTokens.js'
import '../../ui/pages/tools/NFT/NFT.html'
import '../../ui/pages/tools/NFT/NFT.js'

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
    if (Session.get('walletStatus').unlocked === false) { return FlowRouter.go('/open') }
    BlazeLayout.render('appBody', { main: 'appTransfer' })
  },
})
FlowRouter.route('/reloadTransfer', {
  name: 'App.reloadTransfer',
  action() {
    if (Session.get('walletStatus').unlocked === false) { return FlowRouter.go('/open') }
    BlazeLayout.render('appBody', { main: 'appReloadTransfer' })
  },
})

// Tools
FlowRouter.route('/tools', {
  name: 'App.tools',
  action() {
    if (Session.get('walletStatus').unlocked === false) { return FlowRouter.go('/open') }
    BlazeLayout.render('appBody', { main: 'appTools' })
  },
})
FlowRouter.route('/tools/message/create', {
  name: 'App.messageCreate',
  action() {
    if (Session.get('walletStatus').unlocked === false) { return FlowRouter.go('/open') }
    BlazeLayout.render('appBody', { main: 'appMessageCreate' })
  },
})
FlowRouter.route('/tools/multisig', {
  name: 'App.multisigMenu',
  action() {
    if (Session.get('walletStatus').unlocked === false) { return FlowRouter.go('/open') }
    BlazeLayout.render('appBody', { main: 'appMultisigMenu', multisig: 'multisigCreate' })
  },
})
FlowRouter.route('/tools/multisig/create', {
  name: 'App.multisigMenu',
  action() {
    if (Session.get('walletStatus').unlocked === false) { return FlowRouter.go('/open') }
    BlazeLayout.render('appBody', { main: 'appMultisigMenu', multisig: 'multisigCreate' })
  },
})
FlowRouter.route('/tools/multisig/spend', {
  name: 'App.multisigMenu',
  action() {
    if (Session.get('walletStatus').unlocked === false) { return FlowRouter.go('/open') }
    BlazeLayout.render('appBody', { main: 'appMultisigMenu', multisig: 'multisigSpend' })
  },
})
FlowRouter.route('/tools/multisig/vote', {
  name: 'App.multisigMenu',
  action() {
    if (Session.get('walletStatus').unlocked === false) { return FlowRouter.go('/open') }
    BlazeLayout.render('appBody', { main: 'appMultisigMenu', multisig: 'multisigVote' })
  },
})
FlowRouter.route('/tools/keybase', {
  name: 'App.keybaseCreate',
  action() {
    if (Session.get('walletStatus').unlocked === false) { return FlowRouter.go('/open') }
    BlazeLayout.render('appBody', { main: 'appKeybaseCreate' })
  },
})
FlowRouter.route('/tools/keybase/confirm', {
  name: 'App.keybaseConfirm',
  action() {
    if (Session.get('walletStatus').unlocked === false) { return FlowRouter.go('/open') }
    BlazeLayout.render('appBody', { main: 'appKeybaseConfirm' })
  },
})
FlowRouter.route('/tools/keybase/result', {
  name: 'App.keybaseResult',
  action() {
    if (Session.get('walletStatus').unlocked === false) { return FlowRouter.go('/open') }
    BlazeLayout.render('appBody', { main: 'appKeybaseResult' })
  },
})
FlowRouter.route('/tools/github', {
  name: 'App.githubCreate',
  action() {
    if (Session.get('walletStatus').unlocked === false) { return FlowRouter.go('/open') }
    BlazeLayout.render('appBody', { main: 'appGithubCreate' })
  },
})
FlowRouter.route('/tools/github/confirm', {
  name: 'App.githubConfirm',
  action() {
    if (Session.get('walletStatus').unlocked === false) { return FlowRouter.go('/open') }
    BlazeLayout.render('appBody', { main: 'appGithubConfirm' })
  },
})
FlowRouter.route('/tools/github/result', {
  name: 'App.githubResult',
  action() {
    if (Session.get('walletStatus').unlocked === false) { return FlowRouter.go('/open') }
    BlazeLayout.render('appBody', { main: 'appGithubResult' })
  },
})
FlowRouter.route('/tools/message/confirm', {
  name: 'App.messageConfirm',
  action() {
    if (Session.get('walletStatus').unlocked === false) { return FlowRouter.go('/open') }
    BlazeLayout.render('appBody', { main: 'appMessageConfirm' })
  },
})
FlowRouter.route('/tools/message/result', {
  name: 'App.messageResult',
  action() {
    if (Session.get('walletStatus').unlocked === false) { return FlowRouter.go('/open') }
    BlazeLayout.render('appBody', { main: 'appMessageResult' })
  },
})
FlowRouter.route('/tools/notarise/start', {
  name: 'App.notariseStart',
  action() {
    if (Session.get('walletStatus').unlocked === false) { return FlowRouter.go('/open') }
    BlazeLayout.render('appBody', { main: 'appNotariseStart' })
  },
})
FlowRouter.route('/tools/notarise/confirm', {
  name: 'App.notariseConfirm',
  action() {
    if (Session.get('walletStatus').unlocked === false) { return FlowRouter.go('/open') }
    BlazeLayout.render('appBody', { main: 'appNotariseConfirm' })
  },
})
FlowRouter.route('/tools/notarise/result', {
  name: 'App.notariseResult',
  action() {
    if (Session.get('walletStatus').unlocked === false) { return FlowRouter.go('/open') }
    BlazeLayout.render('appBody', { main: 'appNotariseResult' })
  },
})

// Add tokens to list
FlowRouter.route('/tools/addTokens', {
  name: 'App.addTokens',
  action() {
    if (Session.get('walletStatus').unlocked === false) { return FlowRouter.go('/open') }
    BlazeLayout.render('appBody', { main: 'appAddTokens' })
  },
})

// Add tokens to list
FlowRouter.route('/tools/NFT', {
  name: 'App.NFT',
  action() {
    if (Session.get('walletStatus').unlocked === false) { return FlowRouter.go('/open') }
    BlazeLayout.render('appBody', { main: 'appNFT' })
  },
})

// Ledger Nano XMSS Index Update
FlowRouter.route('/tools/xmssindex/update', {
  name: 'App.xmssIndexUpdate',
  action() {
    if (Session.get('walletStatus').unlocked === false) { return FlowRouter.go('/open') }
    BlazeLayout.render('appBody', { main: 'appXmssIndexUpdate' })
  },
})

// Token Creation
FlowRouter.route('/tokens/create', {
  name: 'App.tokensCreate',
  action() {
    if (Session.get('walletStatus').unlocked === false) { return FlowRouter.go('/open') }
    BlazeLayout.render('appBody', { main: 'appTokenCreate' })
  },
})
FlowRouter.route('/tokens/create/confirm', {
  name: 'App.tokenCreationConfirm',
  action() {
    if (Session.get('walletStatus').unlocked === false) { return FlowRouter.go('/open') }
    BlazeLayout.render('appBody', { main: 'appTokenCreationConfirm' })
  },
})
FlowRouter.route('/tokens/create/result', {
  name: 'App.tokenCreationResult',
  action() {
    if (Session.get('walletStatus').unlocked === false) { return FlowRouter.go('/open') }
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
