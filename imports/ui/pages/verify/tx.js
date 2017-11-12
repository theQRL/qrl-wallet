import JSONFormatter from 'json-formatter-js'
import './tx.html'
/* global LocalStore */
/* global QRLLIB */

Template.appVerifyTxid.onRendered(() => {
  LocalStore.set('txhash', {})
  const thisTxId = FlowRouter.getParam('txId')

  console.log(QRLLIB)
  console.log(thisTxId)

  const thisTxnHashBin = QRLLIB.str2bin(thisTxId)
  var thisTxnHashBytes = new Uint8Array(thisTxnHashBin.size());
  for(var i=0; i<thisTxnHashBin.size(); i++) {
    thisTxnHashBytes[i] = thisTxnHashBin.get(i)
  }

  const grpcEndpoint = findNodeData(DEFAULT_NODES, selectedNode()).grpc
  const request = {
    query: thisTxnHashBytes,
    grpc: grpcEndpoint
  }

  console.log(request)
  
  if (thisTxId) {
    Meteor.call('getTxnHash', request, (err, res) => {
      if (err) {
        console.log('error: ' + err)
      } else {
        console.log('success')
        console.log(res)
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
