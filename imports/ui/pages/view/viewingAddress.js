import './viewingAddress.html'
/* global LocalStore */
/* global QRLLIB */
/* global DEFAULT_NODES */
/* global findNodeData */
/* global selectedNode */

const ab2str = buf => String.fromCharCode.apply(null, new Uint16Array(buf))

const getAddressDetail = function (address) {
  const grpcEndpoint = findNodeData(DEFAULT_NODES, selectedNode()).grpc

  const request = {
    address: address,
    grpc: grpcEndpoint
  }

  Meteor.call('getAddress', request, (err, res) => {
    if (err) {
      $('#unlocking').hide()
      $('#unlockError').show()
    } else {
      res.state.address = ab2str(res.state.address)
      res.state.balance /= 100000000

      LocalStore.set('address', res)
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
  var thisAddressBytes = new Uint8Array(thisAddressBin.size());
  for(var i=0; i<thisAddressBin.size(); i++) {
    thisAddressBytes[i] = thisAddressBin.get(i)
  }

  // Request address detail
  getAddressDetail(thisAddressBytes)
})

Template.addressViewing.events({
  'click #ShowTx': () => {
    const tx = LocalStore.get('address').state.transactions

    const request = {
      tx: tx,
      grpc: findNodeData(DEFAULT_NODES, selectedNode()).grpc
    };

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
    getAddressDetail(getXMSSDetails().address)
  },
})


Template.addressViewing.helpers({
  address() {
    return LocalStore.get('address')
  },
  addressTransactions() {
    return LocalStore.get('addressTransactions')
  },
  addressQR() {
    return LocalStore.get('address')
  },
  ts() {
    const x = moment.unix(this.timestamp)
    return moment(x).format('HH:mm D MMM YYYY')
  },
  nodeExplorerUrl() {
    return LocalStore.get('nodeExplorerUrl')
  },
})


