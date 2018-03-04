import './reload.html'

Template.appReloadTransfer.onCreated(() => {
  const path = FlowRouter.path('/transfer', {})
  FlowRouter.go(path)
})
