Template.multisigVote.helpers({
  isActiveTab(p) {
    if (Session.get('activeMultisigTab') === p) {
      return 'active'
    }
    return ''
  },
})

Template.multisigVote.onRendered(() => {
  Session.set('activeMultisigTab', 'vote')
})
