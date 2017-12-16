import './viewingAddress.html'
/* global LocalStore */
/* global QRLLIB */
/* global DEFAULT_NODES */
/* global findNodeData */
/* global selectedNode */
/* global getXMSSDetails */

const ab2str = buf => String.fromCharCode.apply(null, new Uint16Array(buf))

const getAddressDetail = function (getAddress) {

  LocalStore.set('address', {})

  const grpcEndpoint = findNodeData(DEFAULT_NODES, selectedNode()).grpc

  const request = {
    address: getAddress,
    grpc: grpcEndpoint,
  }

  Meteor.call('getAddress', request, (err, res) => {
    if (err) {
      $('#unlocking').hide()
      $('#unlockError').show()
    } else {
      res.state.address = ab2str(res.state.address)
      res.state.balance /= 100000000

      LocalStore.set('address', res)

      const status = {}
      status.colour = 'green'
      status.string = res.state.address + ' is ready to use.'
      status.unlocked = true
      status.address = res.state.address

      LocalStore.set('walletStatus', status)
    }
  })
}

Template.addressViewing.onRendered(() => {
  $('.ui.dropdown').dropdown()
})

Template.addressViewing.onCreated(() => {
  // Get string address from FlowRouter
  const thisAddress = FlowRouter.getParam('address')

  // Convert string to bytes
  const thisAddressBin = QRLLIB.str2bin(thisAddress)
  let thisAddressBytes = new Uint8Array(thisAddressBin.size())
  for (let i = 0; i < thisAddressBin.size(); i++) {
    thisAddressBytes[i] = thisAddressBin.get(i)
  }

  // Request address detail
  getAddressDetail(thisAddressBytes)
})

Template.addressViewing.events({
  'click #ShowTx': () => {
    const thisTxs = LocalStore.get('address').state.transactions

    const request = {
      tx: thisTxs,
      grpc: findNodeData(DEFAULT_NODES, selectedNode()).grpc,
    }

    $('.loader').show()
    Meteor.call('addressTransactions', request, (err, res) => {
      if (err) {
        LocalStore.set('addressTransactions', { error: err })
      } else {
        LocalStore.set('addressTransactions', res)
        $('table').show()
        $('.loader').hide()
      }
    })
    $('#ShowTx').hide()
    $('#HideTx').show()
  },
  'click #HideTx': () => {
    $('table').hide()
    $('.loader').hide()
    $('#ShowTx').show()
    $('#HideTx').hide()
  },
  'click .refresh': () => {
    const thisAddressBin = QRLLIB.str2bin(getXMSSDetails().address)
    let thisAddressBytes = new Uint8Array(thisAddressBin.size())
    for (let i = 0; i < thisAddressBin.size(); i++) {
      thisAddressBytes[i] = thisAddressBin.get(i)
    }

    getAddressDetail(thisAddressBytes)
  },
})


Template.addressViewing.helpers({
  address() {
    return LocalStore.get('address')
  },
  addressTransactions() {
    const transactions = []
    _.each(LocalStore.get('addressTransactions'), function (transaction) {
      // Update timestamp from unix epoch to human readable time/date.
      const x = moment.unix(transaction.timestamp)
      transaction.timestamp = moment(x).format('HH:mm D MMM YYYY')

      // Update fee from shor to quanta
      transaction.fee /= 100000000

      transactions.push(transaction)
    })
    return transactions
  },
  QRText() {
    return LocalStore.get('address').state.address
  },
  ts() {
    const x = moment.unix(this.timestamp)
    return moment(x).format('HH:mm D MMM YYYY')
  },
  nodeExplorerUrl() {
    return LocalStore.get('nodeExplorerUrl')
  },
})
