import './tokenCreateConfirm.html'
import helpers from '@theqrl/explorer-helpers'

/* global QRLLIB */
/* global XMSS_OBJECT */
/* global selectedNetwork */
/* global DEFAULT_NETWORKS */
/* global wrapMeteorCall */

function confirmTokenCreation() {
  const tx = Session.get('tokenCreationConfirmationResponse')

  // Set OTS Key Index in XMSS object
  XMSS_OBJECT.setIndex(parseInt(Session.get('tokenCreationConfirmation').otsKey))

  // Concatenate Uint8Arrays
  let tmptxnhash = concatenateTypedArrays(
    Uint8Array,
      // tx.extended_transaction_unsigned.addr_from,
      toBigendianUint64BytesUnsigned(tx.extended_transaction_unsigned.tx.fee),
      tx.extended_transaction_unsigned.tx.token.symbol,
      tx.extended_transaction_unsigned.tx.token.name,
      tx.extended_transaction_unsigned.tx.token.owner,
      toBigendianUint64BytesUnsigned(tx.extended_transaction_unsigned.tx.token.decimals)
  )

  // Now append initial balances tmptxnhash
  const tokenHoldersRaw = tx.extended_transaction_unsigned.tx.token.initial_balances
  for (var i = 0; i < tokenHoldersRaw.length; i++) {
    // Add address
    tmptxnhash = concatenateTypedArrays(
      Uint8Array,
        tmptxnhash,
        tokenHoldersRaw[i].address
    )

    // Add amount
    tmptxnhash = concatenateTypedArrays(
      Uint8Array,
        tmptxnhash,
        toBigendianUint64BytesUnsigned(tokenHoldersRaw[i].amount)
    )
  }
  
  // Convert Uint8Array to VectorUChar
  let hashableBytes = toUint8Vector(tmptxnhash)

  // Create sha256 sum of hashableBytes
  let shaSum = QRLLIB.sha2_256(hashableBytes)

  // Sign the sha sum
  tx.extended_transaction_unsigned.tx.signature = binaryToBytes(XMSS_OBJECT.sign(shaSum))

  // Calculate transaction hash
  let txnHashConcat = concatenateTypedArrays(
    Uint8Array,
      binaryToBytes(shaSum),
      tx.extended_transaction_unsigned.tx.signature,
      hexToBytes(XMSS_OBJECT.getPK())
  )

  const txnHashableBytes = toUint8Vector(txnHashConcat)

  let txnHash = QRLLIB.bin2hstr(QRLLIB.sha2_256(txnHashableBytes))

  console.log('Txn Hash: ', txnHash)

  tx.network = selectedNetwork()

  wrapMeteorCall('confirmTokenCreation', tx, (err, res) => {
    if (res.error) {
      $('#tokenCreationConfirmation').hide()
      $('#transactionFailed').show()

      Session.set('transactionFailed', res.error)
    } else {
      Session.set('transactionHash', txnHash)
      Session.set('transactionSignature', res.response.signature)
      Session.set('transactionRelayedThrough', res.relayed)

      // Send to result page.
      const params = { }
      const path = FlowRouter.path('/tokens/create/result', params)
      FlowRouter.go(path)
    }
  })
}

function cancelTransaction() {
  Session.set('tokenCreationConfirmation', '')
  Session.set('tokenCreationConfirmationResponse', '')

  Session.set('transactionFailed', 'User requested cancellation')

  $('#tokenCreationConfirmation').hide()
  $('#transactionFailed').show()
}

Template.appTokenCreationConfirm.onRendered(() => {
  $('.ui.dropdown').dropdown()
})

Template.appTokenCreationConfirm.events({
  'click #confirmToken': () => {
    $('#relaying').show()
    setTimeout(() => { confirmTokenCreation() }, 200)
  },
  'click #cancelToken': () => {
    cancelTransaction()
  },
})

Template.appTokenCreationConfirm.helpers({
  bech32() {
    if (LocalStore.get('addressFormat') == 'bech32') {
      return true
    }
    return false
  },
  tokenCreationConfirmation() {
    const confirmation = Session.get('tokenCreationConfirmation')
    return confirmation
  },
  transactionFailed() {
    const failed = Session.get('transactionFailed')
    return failed
  },
  tokenHolders() {
    const tokenHoldersRaw = Session.get('tokenCreationConfirmation').initialBalances
    const tokenDecimals = Session.get('tokenCreationConfirmation').decimals
    let tokenHolders = []

    for (var i = 0; i < tokenHoldersRaw.length; i++) {
      const thisHolder = {
        address_hex: helpers.rawAddressToHexAddress(tokenHoldersRaw[i].address),
        address_b32: helpers.rawAddressToB32Address(tokenHoldersRaw[i].address),
        amount: tokenHoldersRaw[i].amount / Math.pow(10, tokenDecimals)
      }
      tokenHolders.push(thisHolder)
    }

    return tokenHolders
  },
  nodeExplorerUrl() {
    if ((Session.get('nodeExplorerUrl') === '') || (Session.get('nodeExplorerUrl') === null)) {
      return DEFAULT_NETWORKS[0].explorerUrl
    }
    return Session.get('nodeExplorerUrl')
  },
})
