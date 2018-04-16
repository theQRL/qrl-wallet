import JSONFormatter from 'json-formatter-js'
import './tx.html'

/* global LocalStore */
/* global findNodeData */
/* global selectedNode */
/* global DEFAULT_NODES */
/* global SHOR_PER_QUANTA */
/* eslint no-console: 0 */
/* ^^^ remove once testing complete
 */

Template.appVerifyTxid.onRendered(() => {
  this.$('.value').popup()

  LocalStore.set('txhash', {})
  LocalStore.set('qrlValue', {})
  LocalStore.set('status', {})

  const thisTxId = FlowRouter.getParam('txId')
  const grpcEndpoint = findNodeData(DEFAULT_NODES, selectedNode()).grpc
  const request = {
    query: thisTxId,
    grpc: grpcEndpoint,
  }

  if (thisTxId) {
    Meteor.call('txhash', request, (err, res) => {
      if (err) {
        LocalStore.set('txhash', { error: err, id: thisTxId })
      } else {
        LocalStore.set('txhash', res)
      }
    })

    Meteor.call('QRLvalue', (err, res) => {
      if (err) {
        LocalStore.set('qrlValue', 'Error getting value from API')
      } else {
        LocalStore.set('qrlValue', res)
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
    let txhash = LocalStore.get('txhash').transaction
    let signature = txhash.tx.signature
    txhash.tx.ots_key = parseInt(signature.substring(0, 8), 16)
    return txhash
  },
  notFound() {
    if (LocalStore.get('txhash').found === false) {
      return true
    }
    return false
  },
  header() {
    return LocalStore.get('txhash').transaction.header
  },
  qrl() {
    const txhash = LocalStore.get('txhash')
    try {
      const value = txhash.transaction.tx.amount
      const x = LocalStore.get('qrlValue')
      const y = Math.round((x * value) * 100) / 100
      if (y !== 0) { return y }
    } catch (e) {
      return '...'
    }
    return '...'
  },
  amount() {
    if (this.tx.coinbase) {
      return numberToString(this.tx.coinbase.amount / SHOR_PER_QUANTA)
    }
    if (this.tx.transactionType === 'transfer') {
      return `${numberToString(this.tx.transfer.totalTransferred)} Quanta`
    }
    if (this.tx.transactionType === 'transfer_token') {
      return `${numberToString(this.tx.transfer_token.totalTransferred)} ${this.tx.transfer_token.tokenSymbol}`
    }
    return ''
  },
  isConfirmed() {
    try {
      if (this.header.block_number !== null) {
        return true
      }
      return false
    } catch (e) {
      return false
    }
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
    const x = moment.unix(this.header.timestamp_seconds)
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
  isToken() {
    if (this.explorer.type === 'CREATE TOKEN') {
      return true
    }
    return false
  },
  isTransfer() {
    if (this.explorer.type === 'TRANSFER') {
      return true
    }
    return false
  },
  isTokenTransfer() {
    if (this.explorer.type === 'TRANSFER TOKEN') {
      return true
    }
    return false
  },
  isNotCoinbase() {
    if (this.explorer.type !== 'COINBASE') {
      return true
    }
    return false
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

