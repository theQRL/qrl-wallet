Template.appMultisigMenu.helpers({
  isActiveTab(p) {
    if (Session.get('activeMultisigTab') === p) {
      return 'active'
    }
    return ''
  },
})

Template.appMultisigMenu.onRendered(() => {
  Session.set('activeMultisigTab', 'create')
})
