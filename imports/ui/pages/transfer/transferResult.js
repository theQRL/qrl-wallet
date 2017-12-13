import './transferResult.html'
/* global LocalStore */

Template.appTransferResult.onRendered(() => {
  $('.ui.dropdown').dropdown()
})

Template.appTransferResult.helpers({
  transactionHash() {
    const hash = LocalStore.get('transactionHash')
    return hash
  },
  transactionSignature() {
    const hash = LocalStore.get('transactionSignature')
    return hash
  },
})
