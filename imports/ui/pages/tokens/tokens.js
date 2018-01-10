import './tokens.html'

Template.appTokensHome.helpers({
  walletStatus() {
    return LocalStore.get('walletStatus')
  },
})


Template.appTokensHome.onRendered(() => {
  // If there is no wallet currently opened, send back to home.
  if (LocalStore.get('walletStatus').unlocked == false) {
  	const params = {}
    const path = FlowRouter.path('/', params)
    FlowRouter.go(path)
  }
})