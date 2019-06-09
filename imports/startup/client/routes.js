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
import '../../ui/pages/tools/keybase/keybaseCreate.js'
import '../../ui/pages/tools/keybase/keybaseConfirm.js'
import '../../ui/pages/tools/keybase/keybaseResult.js'
import '../../ui/pages/tools/github/githubCreate.js'
import '../../ui/pages/tools/github/githubConfirm.js'
import '../../ui/pages/tools/github/githubResult.js'

import '../../ui/pages/tools/xmssindex/update.js'

import '../../ui/pages/tokens/tokenCreate.js'
import '../../ui/pages/tokens/tokenCreateConfirm.js'
import '../../ui/pages/tokens/tokenCreateResult.js'

import '../../ui/pages/tools/multisig/create.js'
import '../../ui/pages/tools/multisig/createConfirm.js'
import '../../ui/pages/tools/multisig/createResult.js'

import '../../ui/pages/tools/multisig/spend.js'
import '../../ui/pages/tools/multisig/spendConfirm.js'
import '../../ui/pages/tools/multisig/spendResult.js'

import '../../ui/pages/tools/multisig/vote.js'
import '../../ui/pages/tools/multisig/voteConfirm.js'
import '../../ui/pages/tools/multisig/voteResult.js'

import '../../ui/pages/verify/verify.js'
import '../../ui/pages/verify/tx.js'

import '../../ui/mobile/mobile.js'

function useMobile() {
  // set mobile limits
  const mobileLimit = 640
  // route based on screensize
  if (window.matchMedia(`(min-width: ${mobileLimit}px)`).matches) {
    return true
  }
  return false
}

// Home route (create wallet)
FlowRouter.route('/', {
  name: 'App.home',
  action() {
    if (useMobile()) {
      BlazeLayout.render('appBody', { main: 'appCreate' })
    } else {
      BlazeLayout.render('mobile', { main: 'appCreate' })
    }
  },
})

// Wallet creation
FlowRouter.route('/create', {
  name: 'App.create',
  action() {
    if (useMobile()) {
      BlazeLayout.render('appBody', { main: 'appCreate' })
    } else {
      BlazeLayout.render('mobile', { main: 'appCreate' })
    }
  },
})
FlowRouter.route('/create/:address', {
  name: 'App.createAddress',
  action() {
    if (useMobile()) {
      BlazeLayout.render('appBody', { main: 'appCreateAddress' })
    } else {
      BlazeLayout.render('mobile', { main: 'appCreateAddress' })
    }
  },
})

// Wallet Open/Close
FlowRouter.route('/open', {
  name: 'App.open',
  action() {
    if (useMobile()) {
      BlazeLayout.render('appBody', { main: 'appAddressOpen' })
    } else {
      BlazeLayout.render('mobile', { main: 'appAddressOpen' })
    }
  },
})
FlowRouter.route('/close', {
  name: 'App.close',
  action() {
    if (useMobile()) {
      BlazeLayout.render('appBody', { main: 'appAddressClose' })
    } else {
      BlazeLayout.render('mobile', { main: 'appAddressClose' })
    }
  },
})

// Transfers (Quanta and Tokens)
FlowRouter.route('/transfer', {
  name: 'App.transfer',
  action() {
    if (Session.get('walletStatus').unlocked === false) { FlowRouter.go('/open') }
    if (useMobile()) {
      BlazeLayout.render('appBody', { main: 'appTransfer' })
    } else {
      BlazeLayout.render('mobile', { main: 'appTransfer' })
    }
  },
})
FlowRouter.route('/reloadTransfer', {
  name: 'App.reloadTransfer',
  action() {
    if (Session.get('walletStatus').unlocked === false) { FlowRouter.go('/open') }
    if (useMobile()) {
      BlazeLayout.render('appBody', { main: 'appReloadTransfer' })
    } else {
      BlazeLayout.render('mobile', { main: 'appReloadTransfer' })
    }
  },
})

// Tools
FlowRouter.route('/tools', {
  name: 'App.tools',
  action() {
    if (Session.get('walletStatus').unlocked === false) { FlowRouter.go('/open') }
    if (useMobile()) {
      BlazeLayout.render('appBody', { main: 'appTools' })
    } else {
      BlazeLayout.render('mobile', { main: 'appTools' })
    }
  },
})
FlowRouter.route('/tools/message/create', {
  name: 'App.messageCreate',
  action() {
    if (Session.get('walletStatus').unlocked === false) { FlowRouter.go('/open') }
    if (useMobile()) {
      BlazeLayout.render('appBody', { main: 'appMessageCreate' })
    } else {
      BlazeLayout.render('mobile', { main: 'appMessageCreate' })
    }
  },
})
FlowRouter.route('/tools/keybase', {
  name: 'App.keybaseCreate',
  action() {
    if (Session.get('walletStatus').unlocked === false) { FlowRouter.go('/open') }
    if (useMobile()) {
      BlazeLayout.render('appBody', { main: 'appKeybaseCreate' })
    } else {
      BlazeLayout.render('mobile', { main: 'appKeybaseCreate' })
    }
  },
})
FlowRouter.route('/tools/keybase/confirm', {
  name: 'App.keybaseConfirm',
  action() {
    if (Session.get('walletStatus').unlocked === false) { FlowRouter.go('/open') }
    if (useMobile()) {
      BlazeLayout.render('appBody', { main: 'appKeybaseConfirm' })
    } else {
      BlazeLayout.render('mobile', { main: 'appKeybaseConfirm' })
    }
  },
})
FlowRouter.route('/tools/keybase/result', {
  name: 'App.keybaseResult',
  action() {
    if (Session.get('walletStatus').unlocked === false) { FlowRouter.go('/open') }
    if (useMobile()) {
      BlazeLayout.render('appBody', { main: 'appKeybaseResult' })
    } else {
      BlazeLayout.render('mobile', { main: 'appKeybaseResult' })
    }
  },
})
FlowRouter.route('/tools/github', {
  name: 'App.githubCreate',
  action() {
    if (Session.get('walletStatus').unlocked === false) { FlowRouter.go('/open') }
    if (useMobile()) {
      BlazeLayout.render('appBody', { main: 'appGithubCreate' })
    } else {
      BlazeLayout.render('mobile', { main: 'appGithubCreate' })
    }
  },
})
FlowRouter.route('/tools/github/confirm', {
  name: 'App.githubConfirm',
  action() {
    if (Session.get('walletStatus').unlocked === false) { FlowRouter.go('/open') }
    if (useMobile()) {
      BlazeLayout.render('appBody', { main: 'appGithubConfirm' })
    } else {
      BlazeLayout.render('mobile', { main: 'appGithubConfirm' })
    }
  },
})
FlowRouter.route('/tools/github/result', {
  name: 'App.githubResult',
  action() {
    if (Session.get('walletStatus').unlocked === false) { FlowRouter.go('/open') }
    if (useMobile()) {
      BlazeLayout.render('appBody', { main: 'appGithubResult' })
    } else {
      BlazeLayout.render('mobile', { main: 'appGithubResult' })
    }
  },
})

FlowRouter.route('/tools/multisig/create', {
  name: 'App.multisigCreate',
  action() {
    if (Session.get('walletStatus').unlocked === false) { FlowRouter.go('/open') }
    if (useMobile()) {
      BlazeLayout.render('appBody', { main: 'appMultisigCreate' })
    } else {
      BlazeLayout.render('mobile', { main: 'appMultisigCreate' })
    }
  },
})
FlowRouter.route('/tools/multisig/confirm', {
  name: 'App.multisigConfirm',
  action() {
    if (Session.get('walletStatus').unlocked === false) { FlowRouter.go('/open') }
    if (useMobile()) {
      BlazeLayout.render('appBody', { main: 'appMultisigCreationConfirm' })
    } else {
      BlazeLayout.render('mobile', { main: 'appMultisigCreationConfirm' })
    }
  },
})
FlowRouter.route('/tools/multisig/result', {
  name: 'App.multisigResult',
  action() {
    if (Session.get('walletStatus').unlocked === false) { FlowRouter.go('/open') }
    if (useMobile()) {
      BlazeLayout.render('appBody', { main: 'appMultisigCreationResult' })
    } else {
      BlazeLayout.render('mobile', { main: 'appMultisigCreationResult' })
    }
  },
})



FlowRouter.route('/tools/multisig/spend', {
  name: 'App.multisigSpend',
  action() {
    if (Session.get('walletStatus').unlocked === false) { FlowRouter.go('/open') }
    if (useMobile()) {
      BlazeLayout.render('appBody', { main: 'appMultisigSpend' })
    } else {
      BlazeLayout.render('mobile', { main: 'appMultisigSpend' })
    }
  },
})
FlowRouter.route('/tools/multisig/spend-confirm', {
  name: 'App.multisigSpendConfirm',
  action() {
    if (Session.get('walletStatus').unlocked === false) { FlowRouter.go('/open') }
    if (useMobile()) {
      BlazeLayout.render('appBody', { main: 'appMultisigSpendConfirm' })
    } else {
      BlazeLayout.render('mobile', { main: 'appMultisigSpendConfirm' })
    }
  },
})
FlowRouter.route('/tools/multisig/spend-result', {
  name: 'App.multisigSpendResult',
  action() {
    if (Session.get('walletStatus').unlocked === false) { FlowRouter.go('/open') }
    if (useMobile()) {
      BlazeLayout.render('appBody', { main: 'appMultisigSpendResult' })
    } else {
      BlazeLayout.render('mobile', { main: 'appMultisigSpendResult' })
    }
  },
})


FlowRouter.route('/tools/multisig/vote', {
  name: 'App.multisigVote',
  action() {
    if (Session.get('walletStatus').unlocked === false) { FlowRouter.go('/open') }
    if (useMobile()) {
      BlazeLayout.render('appBody', { main: 'appMultisigVote' })
    } else {
      BlazeLayout.render('mobile', { main: 'appMultisigVote' })
    }
  },
})
FlowRouter.route('/tools/multisig/vote-confirm', {
  name: 'App.multisigVoteConfirm',
  action() {
    if (Session.get('walletStatus').unlocked === false) { FlowRouter.go('/open') }
    if (useMobile()) {
      BlazeLayout.render('appBody', { main: 'appMultisigVoteConfirm' })
    } else {
      BlazeLayout.render('mobile', { main: 'appMultisigVoteConfirm' })
    }
  },
})
FlowRouter.route('/tools/multisig/vote-result', {
  name: 'App.multisigVoteResult',
  action() {
    if (Session.get('walletStatus').unlocked === false) { FlowRouter.go('/open') }
    if (useMobile()) {
      BlazeLayout.render('appBody', { main: 'appMultisigVoteResult' })
    } else {
      BlazeLayout.render('mobile', { main: 'appMultisigVoteResult' })
    }
  },
})


FlowRouter.route('/tools/message/confirm', {
  name: 'App.messageConfirm',
  action() {
    if (Session.get('walletStatus').unlocked === false) { FlowRouter.go('/open') }
    if (useMobile()) {
      BlazeLayout.render('appBody', { main: 'appMessageConfirm' })
    } else {
      BlazeLayout.render('mobile', { main: 'appMessageConfirm' })
    }
  },
})
FlowRouter.route('/tools/message/result', {
  name: 'App.messageResult',
  action() {
    if (Session.get('walletStatus').unlocked === false) { FlowRouter.go('/open') }
    if (useMobile()) {
      BlazeLayout.render('appBody', { main: 'appMessageResult' })
    } else {
      BlazeLayout.render('mobile', { main: 'appMessageResult' })
    }
  },
})
FlowRouter.route('/tools/notarise/start', {
  name: 'App.notariseStart',
  action() {
    if (Session.get('walletStatus').unlocked === false) { FlowRouter.go('/open') }
    if (useMobile()) {
      BlazeLayout.render('appBody', { main: 'appNotariseStart' })
    } else {
      BlazeLayout.render('mobile', { main: 'appNotariseStart' })
    }
  },
})
FlowRouter.route('/tools/notarise/confirm', {
  name: 'App.notariseConfirm',
  action() {
    if (Session.get('walletStatus').unlocked === false) { FlowRouter.go('/open') }
    if (useMobile()) {
      BlazeLayout.render('appBody', { main: 'appNotariseConfirm' })
    } else {
      BlazeLayout.render('mobile', { main: 'appNotariseConfirm' })
    }
  },
})
FlowRouter.route('/tools/notarise/result', {
  name: 'App.notariseResult',
  action() {
    if (Session.get('walletStatus').unlocked === false) { FlowRouter.go('/open') }
    if (useMobile()) {
      BlazeLayout.render('appBody', { main: 'appNotariseResult' })
    } else {
      BlazeLayout.render('mobile', { main: 'appNotariseResult' })
    }
  },
})

// Ledger Nano XMSS Index Update
FlowRouter.route('/tools/xmssindex/update', {
  name: 'App.xmssIndexUpdate',
  action() {
    if (Session.get('walletStatus').unlocked === false) { FlowRouter.go('/open') }
    if (useMobile()) {
      BlazeLayout.render('appBody', { main: 'appXmssIndexUpdate' })
    } else {
      BlazeLayout.render('mobile', { main: 'appXmssIndexUpdate' })
    }
  },
})

// Token Creation
FlowRouter.route('/tokens/create', {
  name: 'App.tokensCreate',
  action() {
    if (Session.get('walletStatus').unlocked === false) { FlowRouter.go('/open') }
    if (useMobile()) {
      BlazeLayout.render('appBody', { main: 'appTokenCreate' })
    } else {
      BlazeLayout.render('mobile', { main: 'appTokenCreate' })
    }
  },
})
FlowRouter.route('/tokens/create/confirm', {
  name: 'App.tokenCreationConfirm',
  action() {
    if (Session.get('walletStatus').unlocked === false) { FlowRouter.go('/open') }
    if (useMobile()) {
      BlazeLayout.render('appBody', { main: 'appTokenCreationConfirm' })
    } else {
      BlazeLayout.render('mobile', { main: 'appTokenCreationConfirm' })
    }
  },
})
FlowRouter.route('/tokens/create/result', {
  name: 'App.tokenCreationResult',
  action() {
    if (Session.get('walletStatus').unlocked === false) { FlowRouter.go('/open') }
    if (useMobile()) {
      BlazeLayout.render('appBody', { main: 'appTokenCreationResult' })
    } else {
      BlazeLayout.render('mobile', { main: 'appTokenCreationResult' })
    }
  },
})

// Transaction Verififation
FlowRouter.route('/verify', {
  name: 'App.verify',
  action() {
    if (useMobile()) {
      BlazeLayout.render('appBody', { main: 'appVerify' })
    } else {
      BlazeLayout.render('mobile', { main: 'appVerify' })
    }
  },
})
FlowRouter.route('/verify-txid/:txId', {
  name: 'App.verifytxid',
  action() {
    if (useMobile()) {
      BlazeLayout.render('appBody', { main: 'appVerifyTxid' })
    } else {
      BlazeLayout.render('mobile', { main: 'appVerifyTxid' })
    }
  },
})

// Not found
FlowRouter.notFound = {
  action() {
    if (useMobile()) {
      BlazeLayout.render('appBody', { main: 'appNotFound' })
    } else {
      BlazeLayout.render('mobile', { main: 'appNotFound' })
    }
  },
}
