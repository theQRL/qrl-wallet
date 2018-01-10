import './addressOpened.html'
/* global LocalStore */
/* global QRLLIB */
/* global DEFAULT_NODES */
/* global findNodeData */
/* global selectedNode */
/* global getXMSSDetails */
/* global SHOR_PER_QUANTA */

const ab2str = buf => String.fromCharCode.apply(null, new Uint16Array(buf))

const getAddressDetail = (getAddress) => {
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
      res.state.balance /= SHOR_PER_QUANTA

      LocalStore.set('address', res)

      const status = {}
      status.colour = 'green'
      status.string = `${res.state.address} is ready to use.`
      status.unlocked = true
      status.address = res.state.address
      status.menuHidden = ''

      LocalStore.set('walletStatus', status)
    }
  })
}

Template.appAddressOpened.onRendered(() => {
  $('.ui.dropdown').dropdown()
})

Template.appAddressOpened.onCreated(() => {
  // Get string address from FlowRouter
  const thisAddress = FlowRouter.getParam('address')

  // Convert string to bytes
  const thisAddressBin = QRLLIB.str2bin(thisAddress)
  const thisAddressBytes = new Uint8Array(thisAddressBin.size())
  for (let i = 0; i < thisAddressBin.size(); i += 1) {
    thisAddressBytes[i] = thisAddressBin.get(i)
  }

  // Request address detail
  getAddressDetail(thisAddressBytes)
})

Template.appAddressOpened.events({
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
    const thisAddressBytes = new Uint8Array(thisAddressBin.size())
    for (let i = 0; i < thisAddressBin.size(); i += 1) {
      thisAddressBytes[i] = thisAddressBin.get(i)
    }

    getAddressDetail(thisAddressBytes)
  },
})


Template.appAddressOpened.helpers({
  address() {
    return LocalStore.get('address')
  },
  addressTransactions() {
    const transactions = []
    _.each(LocalStore.get('addressTransactions'), (transaction) => {
      // Update timestamp from unix epoch to human readable time/date.
      const x = moment.unix(transaction.timestamp)
      const y = transaction
      y.timestamp = moment(x).format('HH:mm D MMM YYYY')

      // Update fee from shor to quanta
      y.fee /= SHOR_PER_QUANTA

      transactions.push(y)
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
