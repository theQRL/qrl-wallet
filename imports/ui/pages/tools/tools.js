import './tools.html'

Template.appTools.onRendered(() => {
  if (getXMSSDetails().walletType == 'ledger') {
    $('#setXMSSIndex').show()
  }
})