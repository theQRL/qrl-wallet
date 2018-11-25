import './messageConfirm.html'
/* global QRLLIB */
/* global XMSS_OBJECT */
/* global selectedNetwork */
/* global DEFAULT_NETWORKS */
/* global wrapMeteorCall */

function confirmMessageCreation() {
  const tx = Session.get('messageCreationConfirmationResponse')

  // Set OTS Key Index in XMSS object
  XMSS_OBJECT.setIndex(parseInt(Session.get('messageCreationConfirmation').otsKey))

  // Concatenate Uint8Arrays
  let tmptxnhash = concatenateTypedArrays(
    Uint8Array,
      // tx.extended_transaction_unsigned.addr_from,
      toBigendianUint64BytesUnsigned(tx.extended_transaction_unsigned.tx.fee),
      tx.extended_transaction_unsigned.tx.message.message_hash
  )

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

  wrapMeteorCall('confirmMessageCreation', tx, (err, res) => {
    if (res.error) {
      $('#messageCreationConfirmation').hide()
      $('#transactionFailed').show()

      Session.set('transactionFailed', res.error)
    } else {
      Session.set('transactionHash', txnHash)
      Session.set('transactionSignature', res.response.signature)
      Session.set('transactionRelayedThrough', res.relayed)

      // Send to result page.
      const params = { }
      const path = FlowRouter.path('/tools/message/result', params)
      FlowRouter.go(path)
    }
  })
}

function cancelTransaction() {
  Session.set('messageCreationConfirmation', '')
  Session.set('messageCreationConfirmationResponse', '')

  Session.set('transactionFailed', 'User requested cancellation')

  $('#messageCreationConfirmation').hide()
  $('#transactionFailed').show()
}

Template.appMessageConfirm.onRendered(() => {
  $('.ui.dropdown').dropdown()
})

Template.appMessageConfirm.events({
  'click #confirmMessage': () => {
    $('#relaying').show()
    setTimeout(() => { confirmMessageCreation() }, 200)
  },
  'click #cancelMessage': () => {
    cancelTransaction()
  },
})

Template.appMessageConfirm.helpers({
  transferFrom() {
    const transferFrom = {}
    transferFrom.balance = Session.get('transferFromBalance')
    transferFrom.address = hexOrB32(Session.get('transferFromAddress'))
    return transferFrom
  },
  messageCreationConfirmation() {
    const confirmation = Session.get('messageCreationConfirmation')
    return confirmation
  },
  transactionFailed() {
    const failed = Session.get('transactionFailed')
    return failed
  },
  nodeExplorerUrl() {
    if ((Session.get('nodeExplorerUrl') === '') || (Session.get('nodeExplorerUrl') === null)) {
      return DEFAULT_NETWORKS[0].explorerUrl
    }
    return Session.get('nodeExplorerUrl')
  },
})
