Template.multisigCreate.helpers({
  isActiveTab(p) {
    if (Session.get('activeMultisigTab') === p) {
      return 'active'
    }
    return ''
  },
})

Template.multisigCreate.onRendered(() => {
  Session.set('activeMultisigTab', 'create')
})
