import JSONFormatter from 'json-formatter-js'
import './tx.html'

Template.appVerifyTxid.onRendered(() => {
  LocalStore.set('txhash', {})
  LocalStore.set('qrl', 0)
  const thisTxId = FlowRouter.getParam('txId')
  const thisNodeApiUrl = LocalStore.get('nodeApiUrl')
  if (thisTxId) {
    Meteor.call('txhash', { txId: thisTxId, nodeApiUrl: thisNodeApiUrl }, (err, res) => {
      if (err) {
        LocalStore.set('txhash', { error: err, id: thisTxId })
      } else {
        LocalStore.set('txhash', res)
      }
    })
    Meteor.call('QRLvalue', (err, res) => {
      if (err) {
        LocalStore.set('qrl', 'Error getting value from API')
      } else {
        LocalStore.set('qrl', res)
      }
    })
  }
})

Template.appVerifyTxid.helpers({
  txhash() {
    return LocalStore.get('txhash')
  },
  qrl() {
    const txhash = LocalStore.get('txhash')
    try {
      const value = txhash.amount
      const x = LocalStore.get('qrl')
      return Math.round((x * value) * 100) / 100
    } catch (e) {
      return 0
    }
  },
  ts() {
    const x = moment.unix(this.timestamp)
    return moment(x).format('HH:mm D MMM YYYY')
  },
  txcolor() {
    if (this.subtype === 'COINBASE') {
      return 'teal'
    }
    if (this.subtype === 'TX') {
      return 'yellow'
    }
    if (this.subtype === 'STAKE') {
      return 'red'
    }
    return ''
  },
  json() {
    const myJSON = this
    const formatter = new JSONFormatter(myJSON)
    $('.json').append(formatter.render())
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
    $('.jsonbox').toggle()
  },
})

Template.appVerifyTxid.onRendered(() => {
  this.$('.value').popup()
})
