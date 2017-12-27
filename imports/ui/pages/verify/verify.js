import './verify.html'

Template.appVerify.events({
  'click .button': () => {
    const verifyTxnPath = '/verify-txid/:txId'
    const transactionId = document.getElementById('transactionId').value
    if (transactionId !== '') {
      const params = { txId: transactionId }
      const path = FlowRouter.path(verifyTxnPath, params)
      FlowRouter.go(path)
    }
  },
})
