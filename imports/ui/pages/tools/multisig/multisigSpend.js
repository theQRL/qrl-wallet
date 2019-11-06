/* global hexOrB32, wrapMeteorCall, selectedNetwork, getXMSSDetails, SHOR_PER_QUANTA */
Template.multisigSpend.helpers({
  isActiveTab(p) {
    if (Session.get('activeMultisigTab') === p) {
      return 'active'
    }
    return ''
  },
  transferFrom() {
    const transferFrom = {}
    if (Session.get('multisigTransferFromAddressSet') === true) {
      transferFrom.balance = Session.get('multisigTransferFromBalance')
      transferFrom.address = hexOrB32(Session.get('multisigTransferFromAddress'))
      return transferFrom
    }
    return { address: 'No multisig address selected', balance: 'N/A' }
  },
  hasAddressSet() {
    return Session.get('multisigTransferFromAddressSet')
  },
})
Template.msTable.helpers({
  msAddresses() {
    return Session.get('multiSigAddresses')
  },
  msLoading() {
    return Session.get('loadingmultiSigAddresses')
  },
  hasMultisig() {
    if (Session.get('multiSigAddresses').length > 0) {
      return true
    }
    return false
  },
})
const loadMultisigs = (a, p) => {
  const addresstx = Buffer.from(a.substring(1), 'hex')
  const request = {
    address: addresstx,
    network: selectedNetwork(),
    item_per_page: 10,
    page_number: p,
  }
  console.log('loadmultisig req:', request)
  Session.set('multiSigAddresses', [])
  Session.set('loadingmultiSigAddresses', true)

  wrapMeteorCall('getMultiSigAddressesByAddress', request, (err, res) => {
    // console.log('err:', err)
    // console.log('res:', res)
    if (err) {
      Session.set('multiSigAddresses', { error: err })
      Session.set('errorLoadingMultiSig', true)
    } else {
      Session.set('active', p)
      const add = []
      _.each(res.multi_sig_detail, (item => {
        add.push({ address: `Q${Buffer.from(item.address).toString('hex')}`, balance: item.balance / SHOR_PER_QUANTA })
      }))
      Session.set('multiSigAddresses', add)
      Session.set('loadingmultiSigAddresses', false)
      Session.set('errorLoadingMultiSig', false)
    }
  })
}

Template.multisigSpend.events({
  'click #changeAddress': () => {
    Session.set('multisigTransferFromAddressSet', false)
    // call api to get addresses
    loadMultisigs(getXMSSDetails().address, 1)
    $('#chooseSpendAddress').modal('show')
  },
})
Template.msTable.events({
  'click #chooseSpendAddressTable tr': (event) => {
    const a = event.currentTarget.cells[0].textContent.trim()
    const b = event.currentTarget.cells[1].textContent.trim()
    Session.set('multisigTransferFromAddress', a)
    Session.set('multisigTransferFromBalance', b)
    Session.set('multisigTransferFromAddressSet', true)
    $('#chooseSpendAddress').modal('hide')
  },
})
Template.multisigSpend.onRendered(() => {
  Session.set('activeMultisigTab', 'spend')
  Session.set('multisigTransferFromAddressSet', false)
})
