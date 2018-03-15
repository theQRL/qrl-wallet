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

const ab2str = buf => String.fromCharCode.apply(null, new Uint16Array(buf))

const txResultsRefactor = (res) => {
  // rewrite all arrays as strings (Q-addresses) or hex (hashes)
  const output = res
  // console.log(res)
  if (res.transaction.header) {
    output.transaction.header.hash_header = Buffer.from(output.transaction.header.hash_header).toString('hex')
    output.transaction.header.hash_header_prev = Buffer.from(output.transaction.header.hash_header_prev).toString('hex')
    output.transaction.header.merkle_root = Buffer.from(output.transaction.header.merkle_root).toString('hex')
    output.transaction.header.PK = Buffer.from(output.transaction.header.PK).toString('hex')

    output.transaction.tx.transaction_hash = Buffer.from(output.transaction.tx.transaction_hash).toString('hex')
    // output.transaction.tx.addr_to = ''
    output.transaction.tx.amount = ''

    if (output.transaction.tx.transactionType === 'coinbase') {
      output.transaction.tx.addr_from = 'Q' + Buffer.from(output.transaction.tx.addr_from).toString('hex')
      output.transaction.tx.addr_to = 'Q' + Buffer.from(output.transaction.tx.coinbase.addr_to).toString('hex')
      output.transaction.tx.coinbase.addr_to = 'Q' + Buffer.from(output.transaction.tx.coinbase.addr_to).toString('hex')
      output.transaction.tx.amount = output.transaction.tx.coinbase.amount / SHOR_PER_QUANTA

      output.transaction.tx.public_key = Buffer.from(output.transaction.tx.public_key).toString('hex')
      output.transaction.tx.signature = Buffer.from(output.transaction.tx.signature).toString('hex')
      output.transaction.tx.coinbase.headerhash = Buffer.from(output.transaction.tx.coinbase.headerhash).toString('hex')

      output.transaction.explorer = {
        from: '',
        to: output.transaction.tx.addr_to,
        type: 'COINBASE',
      }
    }
  } else {
    output.transaction.tx.transaction_hash = Buffer.from(output.transaction.tx.transaction_hash).toString('hex')
  }

  if (output.transaction.tx.transactionType === 'transfer') {
    output.transaction.tx.addr_from = 'Q' + Buffer.from(output.transaction.tx.addr_from).toString('hex')
    output.transaction.tx.addr_to = 'Q' + Buffer.from(output.transaction.tx.transfer.addr_to).toString('hex')
    output.transaction.tx.transfer.addr_to = 'Q' + Buffer.from(output.transaction.tx.transfer.addr_to).toString('hex')
    output.transaction.tx.amount = output.transaction.tx.transfer.amount / SHOR_PER_QUANTA
    output.transaction.tx.fee = output.transaction.tx.fee / SHOR_PER_QUANTA
    output.transaction.tx.public_key = Buffer.from(output.transaction.tx.public_key).toString('hex')
    output.transaction.tx.signature = Buffer.from(output.transaction.tx.signature).toString('hex')
    output.transaction.explorer = {
      from: output.transaction.tx.addr_from,
      to: output.transaction.tx.addr_to,
      type: 'TRANSFER',
    }
  }

  if (output.transaction.tx.transactionType === 'token') {
    const balances = []
    output.transaction.tx.token.initial_balances.forEach((value) => {
      const edit = value
      edit.address = 'Q' + Buffer.from(edit.address).toString('hex'),
      edit.amount = edit.amount / Math.pow(10, output.transaction.tx.token.decimals)
      balances.push(edit)
    })

    output.transaction.tx.addr_from = 'Q' + Buffer.from(output.transaction.tx.addr_from).toString('hex')
    output.transaction.tx.public_key = Buffer.from(output.transaction.tx.public_key).toString('hex')
    output.transaction.tx.signature = Buffer.from(output.transaction.tx.signature).toString('hex')

    output.transaction.tx.token.symbol = ab2str(output.transaction.tx.token.symbol)
    output.transaction.tx.token.name = ab2str(output.transaction.tx.token.name)
    output.transaction.tx.token.owner = 'Q' + Buffer.from(output.transaction.tx.token.owner).toString('hex')

    output.transaction.tx.fee = output.transaction.tx.fee / SHOR_PER_QUANTA
    output.transaction.explorer = {
      from: output.transaction.tx.addr_from,
      to: output.transaction.tx.addr_from,
      signature: output.transaction.tx.signature,
      publicKey: output.transaction.tx.public_key,
      symbol: output.transaction.tx.token.symbol,
      name: output.transaction.tx.token.name,
      owner: output.transaction.tx.token.owner,
      initialBalances: balances,
      type: 'CREATE TOKEN',
    }
  }
  
  if (output.transaction.tx.transactionType === 'transfer_token') {
    output.transaction.tx.fee = output.transaction.tx.fee / SHOR_PER_QUANTA

    output.transaction.tx.addr_from = 'Q' + Buffer.from(output.transaction.tx.addr_from).toString('hex')
    output.transaction.tx.public_key = Buffer.from(output.transaction.tx.public_key).toString('hex')
    output.transaction.tx.signature = Buffer.from(output.transaction.tx.signature).toString('hex')
    output.transaction.tx.transfer_token.addr_to = 'Q' + Buffer.from(output.transaction.tx.transfer_token.addr_to).toString('hex')
    output.transaction.tx.transfer_token.token_txhash = Buffer.from(output.transaction.tx.transfer_token.token_txhash).toString('hex')
    
    output.transaction.explorer = {
      from: output.transaction.tx.addr_from,
      to: output.transaction.tx.transfer_token.addr_to,
      signature: output.transaction.tx.signature,
      publicKey: output.transaction.tx.public_key,
      token_txhash: output.transaction.tx.transfer_token.token_txhash,
      amount: output.transaction.tx.transfer_token.amount / SHOR_PER_QUANTA,
      type: 'TRANSFER TOKEN',
    }
  }

  if (output.transaction.tx.transactionType === 'slave') {
    output.transaction.tx.fee = output.transaction.tx.fee / SHOR_PER_QUANTA

    output.transaction.tx.public_key = Buffer.from(output.transaction.tx.public_key).toString('hex')
    output.transaction.tx.signature = Buffer.from(output.transaction.tx.signature).toString('hex')
    output.transaction.tx.addr_from = 'Q' + Buffer.from(output.transaction.tx.addr_from).toString('hex')

    output.transaction.explorer = {
      from: output.transaction.tx.addr_from,
      to: '',
      signature: output.transaction.tx.signature,
      publicKey: output.transaction.tx.public_key,
      amount: output.transaction.tx.amount,
      type: 'SLAVE',
    }
  }
  return output
}


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
    Meteor.call('getTxnHash', request, (err, res) => {
      if (err) {
        LocalStore.set('txhash', { error: err, id: thisTxId })
      } else {
        LocalStore.set('txhash', txResultsRefactor(res))
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
    let signature = bytesToHex(txhash.tx.signature)
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
      return (this.tx.coinbase.amount / SHOR_PER_QUANTA).toFixed(9)
    }
    if (this.tx.transfer) {
      return (this.tx.transfer.amount / SHOR_PER_QUANTA).toFixed(9)
    }
    return ''
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
  isTokenTransfer() {
    if (this.explorer.type === 'TRANSFER TOKEN') {
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

