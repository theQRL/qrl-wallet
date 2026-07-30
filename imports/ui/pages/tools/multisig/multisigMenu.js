import { FlowRouter } from 'meteor/ostrio:flow-router-extra'
/* global getBalance, getXMSSDetails */

Template.appMultisigMenu.helpers({
  isActiveTab(p) {
    if (Session.get('activeMultisigTab') === p) {
      return 'tab-active'
    }
    return ''
  },
})

const checkIfCanNavigateAway = () => {
  if (Session.get('txstatus') === 'Pending') {
    return false
  }
  return true
}

Template.appMultisigMenu.events({
  'click #tabBtnCreate': (event) => {
    event.preventDefault()
    if (checkIfCanNavigateAway()) {
      FlowRouter.go('/tools/multisig/create')
    } else {
      window.walletUi.showModal('#cancelWaitingForTransactionWarning', {
        onApprove: () => {
          window.walletUi.hideModal('#cancelWaitingForTransactionWarning')
          Session.set('txstatus', 'Unknown')
          FlowRouter.go('/tools/multisig/create')
        },
      })
    }
  },
  'click #tabBtnSpend': (event) => {
    event.preventDefault()
    if (checkIfCanNavigateAway()) {
      FlowRouter.go('/tools/multisig/spend')
    } else {
      window.walletUi.showModal('#cancelWaitingForTransactionWarning', {
        onApprove: () => {
          window.walletUi.hideModal('#cancelWaitingForTransactionWarning')
          Session.set('txstatus', 'Unknown')
          FlowRouter.go('/tools/multisig/spend')
        },
      })
    }
  },
  'click #tabBtnVote': (event) => {
    event.preventDefault()
    if (checkIfCanNavigateAway()) {
      FlowRouter.go('/tools/multisig/vote')
    } else {
      window.walletUi.showModal('#cancelWaitingForTransactionWarning', {
        onApprove: () => {
          window.walletUi.hideModal('#cancelWaitingForTransactionWarning')
          Session.set('txstatus', 'Unknown')
          FlowRouter.go('/tools/multisig/vote')
        },
      })
    }
  },
})

Template.appMultisigMenu.onRendered(() => {
  Session.set('activeMultisigTab', 'create')

  // Refresh balance and OTS state for the signing address. The multisig pages
  // read otsKeyEstimate and the OTS bitfield (for the key-reuse gate) straight
  // from Session, but previously never loaded them here - they relied on
  // whatever an earlier page happened to leave behind. This is the same refresh
  // every other signing page performs on render, and it covers all three
  // multisig tabs because this template is their common ancestor.
  getBalance(getXMSSDetails().address, () => {
    if (Session.get('otsKeysRemaining') < 50) {
      window.walletUi.showModal('#lowOtsKeyWarning')
    }
  })
})
