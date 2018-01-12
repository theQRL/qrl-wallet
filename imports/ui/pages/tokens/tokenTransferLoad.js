import './tokenTransferLoad.html'
/* global LocalStore */

Template.appTokenTransferLoad.onCreated(() => {
  const tokenHash = FlowRouter.getParam('tokenHash')
  LocalStore.set('preLoadTokenHash', tokenHash)

  const params = { }
  const path = FlowRouter.path('/tokens/transfer', params)
  FlowRouter.go(path)
})