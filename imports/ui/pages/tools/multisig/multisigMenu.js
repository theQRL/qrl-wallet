import { FlowRouter } from 'meteor/kadira:flow-router'

Template.appMultisigMenu.helpers({
  isActiveTab(p) {
    if (Session.get('activeMultisigTab') === p) {
      return 'active'
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
      $('#cancelWaitingForTransactionWarning').modal('transition', 'disable')
        .modal({
          onApprove: () => {
            $('#cancelWaitingForTransactionWarning').modal('transition', 'disable').modal('hide')
            Session.set('txstatus', 'Unknown')
            FlowRouter.go('/tools/multisig/create')
          },
        }).modal('show')
    }
  },
  'click #tabBtnSpend': (event) => {
    event.preventDefault()
    if (checkIfCanNavigateAway()) {
      FlowRouter.go('/tools/multisig/spend')
    } else {
      $('#cancelWaitingForTransactionWarning').modal('transition', 'disable')
        .modal({
          onApprove: () => {
            $('#cancelWaitingForTransactionWarning').modal('transition', 'disable').modal('hide')
            Session.set('txstatus', 'Unknown')
            FlowRouter.go('/tools/multisig/spend')
          },
        }).modal('show')
    }
  },
  'click #tabBtnVote': (event) => {
    event.preventDefault()
    if (checkIfCanNavigateAway()) {
      FlowRouter.go('/tools/multisig/vote')
    } else {
      $('#cancelWaitingForTransactionWarning').modal('transition', 'disable')
        .modal({
          onApprove: () => {
            $('#cancelWaitingForTransactionWarning').modal('transition', 'disable').modal('hide')
            Session.set('txstatus', 'Unknown')
            FlowRouter.go('/tools/multisig/vote')
          },
        }).modal('show')
    }
  },
})

Template.appMultisigMenu.onRendered(() => {
  Session.set('activeMultisigTab', 'create')
})
