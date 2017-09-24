import './verify.html'

Template.appVerify.events({
  'click .button': function() {
    const verifyTxnPath = '/verify-txid/:txId'
    const transactionId = document.getElementById('transactionId').value
    const params = { txId: transactionId }
    const path = FlowRouter.path(verifyTxnPath, params)
    FlowRouter.go(path)
  },
})
