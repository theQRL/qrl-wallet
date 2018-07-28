import './confirm.html'
/* global LocalStore */
/* global QRLLIB */
/* global XMSS_OBJECT */
/* global selectedNetwork */
/* global DEFAULT_NETWORKS */
/* global wrapMeteorCall */

function confirmMessageCreation() {
  const tx = LocalStore.get('notariseCreationConfirmationResponse')

  // Set OTS Key Index for seed wallets
  if(getXMSSDetails().walletType == 'seed') {
    XMSS_OBJECT.setIndex(parseInt(LocalStore.get('notariseCreationConfirmation').otsKey))
  }

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

  // Sign the transaction and relay into network.
  if(getXMSSDetails().walletType == 'seed') {
    // Sign the sha sum
    tx.extended_transaction_unsigned.tx.signature = binaryToBytes(XMSS_OBJECT.sign(shaSum))

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

    tx.network = selectedNetwork()

    wrapMeteorCall('confirmMessageCreation', tx, (err, res) => {
      if (res.error) {
        $('#notariseCreationConfirmation').hide()
        $('#transactionFailed').show()

        LocalStore.set('transactionFailed', res.error)
      } else {
        LocalStore.set('transactionHash', txnHash)
        LocalStore.set('transactionSignature', res.response.signature)
        LocalStore.set('transactionRelayedThrough', res.relayed)

        // Send to result page.
        const params = { }
        const path = FlowRouter.path('/tools/notarise/result', params)
        FlowRouter.go(path)
      }
    })
  } else if(getXMSSDetails().walletType == 'ledger') {
    signWithLedger(shaSum, (response) => {
      // Sign the sha sum
      tx.extended_transaction_unsigned.tx.signature = response

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

      tx.network = selectedNetwork()

      wrapMeteorCall('confirmMessageCreation', tx, (err, res) => {
        if (res.error) {
          $('#notariseCreationConfirmation').hide()
          $('#transactionFailed').show()

          LocalStore.set('transactionFailed', res.error)
        } else {
          LocalStore.set('transactionHash', txnHash)
          LocalStore.set('transactionSignature', res.response.signature)
          LocalStore.set('transactionRelayedThrough', res.relayed)

          // Send to result page.
          const params = { }
          const path = FlowRouter.path('/tools/notarise/result', params)
          FlowRouter.go(path)
        }
      })
    })
  }
}

function cancelTransaction() {
  LocalStore.set('notariseCreationConfirmation', '')
  LocalStore.set('notariseCreationConfirmationResponse', '')

  LocalStore.set('transactionFailed', 'User requested cancellation')

  $('#notariseCreationConfirmation').hide()
  $('#transactionFailed').show()
}

Template.appNotariseConfirm.onRendered(() => {
  $('.ui.dropdown').dropdown()
})

Template.appNotariseConfirm.events({
  'click #confirmMessage': () => {
    $('#relaying').show()
    setTimeout(() => { confirmMessageCreation() }, 200)
  },
  'click #cancelMessage': () => {
    cancelTransaction()
  },
})

Template.appNotariseConfirm.helpers({
  transferFrom() {
    const transferFrom = {}
    transferFrom.balance = LocalStore.get('transferFromBalance')
    transferFrom.address = LocalStore.get('transferFromAddress')
    return transferFrom
  },
  notariseCreationConfirmation() {
    const confirmation = LocalStore.get('notariseCreationConfirmation')
    return confirmation
  },
  transactionFailed() {
    const failed = LocalStore.get('transactionFailed')
    return failed
  },
  nodeExplorerUrl() {
    if ((LocalStore.get('nodeExplorerUrl') === '') || (LocalStore.get('nodeExplorerUrl') === null)) {
      return DEFAULT_NETWORKS[0].explorerUrl
    }
    return LocalStore.get('nodeExplorerUrl')
  },
})
