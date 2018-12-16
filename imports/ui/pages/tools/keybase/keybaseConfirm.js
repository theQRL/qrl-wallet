import './keybaseConfirm.html'

/* global QRLLIB, XMSS_OBJECT, selectedNetwork, DEFAULT_NETWORKS, wrapMeteorCall */
/* global concatenateTypedArrays, toBigendianUint64BytesUnsigned */
/* global toUint8Vector, binaryToBytes, hexToBytes, hexOrB32 */
/* eslint no-console:0 */

function confirmKeybaseCreation() {
  const tx = Session.get('messageCreationConfirmationResponse')

  if ((getXMSSDetails().walletType == 'seed') && (XMSS_OBJECT === null)) {
    // session ended before confirmation was completed: show as failure
    $('#messageCreationConfirmation').hide()
    $('#transactionFailed').show()
    Session.set('transactionFailed', 'Session ended before transaction was confirmed')
  }

  // Set OTS Key Index in XMSS object
  if (getXMSSDetails().walletType == 'seed') {
    XMSS_OBJECT.setIndex(parseInt(Session.get('messageCreationConfirmation').otsKey, 10))
  }

  // Concatenate Uint8Arrays
  const tmptxnhash = concatenateTypedArrays(
    Uint8Array,
    // tx.extended_transaction_unsigned.addr_from,
    toBigendianUint64BytesUnsigned(tx.extended_transaction_unsigned.tx.fee),
    tx.extended_transaction_unsigned.tx.message.message_hash,
  )

  // Convert Uint8Array to VectorUChar
  const hashableBytes = toUint8Vector(tmptxnhash)

  // Create sha256 sum of hashableBytes
  const shaSum = QRLLIB.sha2_256(hashableBytes)

  if (getXMSSDetails().walletType == 'seed') {
    // Sign the sha sum
    tx.extended_transaction_unsigned.tx.signature = binaryToBytes(XMSS_OBJECT.sign(shaSum))

    // Calculate transaction hash
    const txnHashConcat = concatenateTypedArrays(
      Uint8Array,
      binaryToBytes(shaSum),
      tx.extended_transaction_unsigned.tx.signature,
      hexToBytes(XMSS_OBJECT.getPK()),
    )

    const txnHashableBytes = toUint8Vector(txnHashConcat)

    const txnHash = QRLLIB.bin2hstr(QRLLIB.sha2_256(txnHashableBytes))

    console.log('Txn Hash: ', txnHash)

    tx.network = selectedNetwork()

    wrapMeteorCall('confirmKeybaseCreation', tx, (err, res) => {
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
        const path = FlowRouter.path('/tools/keybase/result', params)
        FlowRouter.go(path)
      }
    })
  } else if (getXMSSDetails().walletType == 'ledger') {
    // Create a transaction
    const source_addr = hexToBytes(QRLLIB.getAddress(getXMSSDetails().pk))
    const fee = toBigendianUint64BytesUnsigned(tx.extended_transaction_unsigned.tx.fee, true)

    QrlLedger.createMessageTx(source_addr, fee, Buffer.from(tx.extended_transaction_unsigned.tx.message.message_hash)).then(txn => {
      console.log(txn)

      QrlLedger.retrieveSignature(txn).then(sig => {
        tx.extended_transaction_unsigned.tx.signature = sig.signature

        // Calculate transaction hash
        let txnHashConcat = concatenateTypedArrays(
          Uint8Array,
            binaryToBytes(shaSum),
            tx.extended_transaction_unsigned.tx.signature,
            hexToBytes(getXMSSDetails().pk)
        )

        const txnHashableBytes = toUint8Vector(txnHashConcat)

        let txnHash = QRLLIB.bin2hstr(QRLLIB.sha2_256(txnHashableBytes))

        console.log('Txn Hash: ', txnHash)

        // Prepare gRPC call
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
            const path = FlowRouter.path('/tools/keybase/result', params)
            FlowRouter.go(path)
          }
        })
      })
    })
  }
}

function cancelTransaction() {
  Session.set('messageCreationConfirmation', '')
  Session.set('messageCreationConfirmationResponse', '')

  Session.set('transactionFailed', 'User requested cancellation')

  $('#messageCreationConfirmation').hide()
  $('#transactionFailed').show()
}

Template.appKeybaseConfirm.onRendered(() => {
  $('.ui.dropdown').dropdown()
})

Template.appKeybaseConfirm.events({
  'click #confirmMessage': () => {
    $('#relaying').show()
    setTimeout(() => { confirmKeybaseCreation() }, 200)
  },
  'click #cancelMessage': () => {
    cancelTransaction()
  },
})

Template.appKeybaseConfirm.helpers({
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
  keybaseOperation() {
    const keybaseOperation = Session.get('keybaseOperation')
    if (keybaseOperation.addorremove === 'AA') { keybaseOperation.addorremove = 'ADD' }
    if (keybaseOperation.addorremove === 'AF') { keybaseOperation.addorremove = 'REMOVE' }
    return keybaseOperation
  },
})
