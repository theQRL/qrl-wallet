Template.multisigSpend.helpers({
  isActiveTab(p) {
    if (Session.get('activeMultisigTab') === p) {
      return 'active'
    }
    return ''
  },
})

Template.multisigSpend.onRendered(() => {
  Session.set('activeMultisigTab', 'spend')
})
