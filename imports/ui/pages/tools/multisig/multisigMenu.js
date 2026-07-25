import { FlowRouter } from 'meteor/ostrio:flow-router-extra'

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
})
