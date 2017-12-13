import JSONFormatter from 'json-formatter-js'
import './tx.html'
// import '../../stylesheets/overrides.css'

Template.appVerifyTxid.onCreated(() => {
  LocalStore.set('txhash', {})
  LocalStore.set('status', {})

  const thisTxId = FlowRouter.getParam('txId')
  const grpcEndpoint = findNodeData(DEFAULT_NODES, selectedNode()).grpc
  const request = {
    query: thisTxId,
    grpc: grpcEndpoint
  }

  if (thisTxId) {
    Meteor.call('getTxnHash', request, (err, res) => {
      if (err) {
        LocalStore.set('txhash', { error: err, id: thisTxId })
      } else {
        LocalStore.set('txhash', res)
      }
    })
    Meteor.call('status', request, (err, res) => {
      if (err) {
        LocalStore.set('status', { error: err })
      } else {
        LocalStore.set('status', res)
      }
    })
  }
})

Template.appVerifyTxid.helpers({
  tx() {
    return LocalStore.get('txhash').transaction
  },
  header() {
    return LocalStore.get('txhash').transaction.header
  },
  confirmations() {
    const x = LocalStore.get('status')
    try {
      return x.node_info.block_height - this.header.block_number
    } catch (e) {
      return 0
    }
  },
  ts() {
    const x = moment.unix(this.header.timestamp.seconds)
    return moment(x).format('HH:mm D MMM YYYY')
  },
  color() {
    if (this.tx.transactionType === 'coinbase') {
      return 'teal'
    }
    if (this.tx.transactionType === 'stake') {
      return 'red'
    }
    if (this.tx.transactionType === 'transfer') {
      return 'yellow'
    }
    return ''
  },
  nodeExplorerUrl() {
    return LocalStore.get('nodeExplorerUrl')
  },
})

Template.appVerifyTxid.events({
  'click .close': () => {
    $('.message').hide()
  },
  'click .jsonclick': () => {
    if (!($('.json').html())) {
      const myJSON = LocalStore.get('txhash').transaction
      const formatter = new JSONFormatter(myJSON)
      $('.json').html(formatter.render())
    }
    $('.jsonbox').toggle()
  },
})

Template.appVerifyTxid.onRendered(() => {
  this.$('.value').popup()
})
