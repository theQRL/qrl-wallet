import JSONFormatter from 'json-formatter-js'
import './tx.html'

Template.appVerifyTxid.onRendered(() => {
  LocalStore.set('txhash', {})
  const thisTxId = FlowRouter.getParam('txId')
  const apiUrl = LocalStore.get('nodeApiUrl')
  if (thisTxId) {
    HTTP.call('GET', `${apiUrl}api/txhash/${thisTxId}`, {}, (error, result) => {
      if (!error) {
        LocalStore.set('txhash', result.data)
      } else {
        LocalStore.set('txhash', { error: err, id: thisTxId })
      }
    })
  }
})

Template.appVerifyTxid.helpers({
  txhash() {
    return LocalStore.get('txhash')
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
