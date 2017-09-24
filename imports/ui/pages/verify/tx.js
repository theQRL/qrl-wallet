import JSONFormatter from 'json-formatter-js'
import './tx.html'

Template.appVerifyTxid.onRendered(() => {
  Session.set('txhash', {})
  Session.set('qrl', 0)
  const thisTxId = FlowRouter.getParam('txId')
  const thisNodeApiUrl = Session.get('nodeApiUrl')
  if (thisTxId) {
    Meteor.call('txhash', { txId: thisTxId, nodeApiUrl: thisNodeApiUrl }, (err, res) => {
      if (err) {
        Session.set('txhash', { error: err, id: thisTxId })
      } else {
        Session.set('txhash', res)
      }
    })
    Meteor.call('QRLvalue', (err, res) => {
      if (err) {
        Session.set('qrl', 'Error getting value from API')
      } else {
        Session.set('qrl', res)
      }
    })
  }
})

Template.appVerifyTxid.helpers({
  txhash() {
    return Session.get('txhash')
  },
  qrl() {
    const txhash = Session.get('txhash')
    try {
      const value = txhash.amount
      const x = Session.get('qrl')
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
    return Session.get('nodeExplorerUrl')
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
