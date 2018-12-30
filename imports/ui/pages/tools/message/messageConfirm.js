import './messageConfirm.html'
/* global QRLLIB */
/* global XMSS_OBJECT */
/* global LocalStore */
/* global selectedNetwork */
/* global DEFAULT_NETWORKS */
/* global wrapMeteorCall */

function confirmMessageCreation() {
  const tx = Session.get('messageCreationConfirmationResponse')

  // Set OTS Key Index for seed wallets
  if (getXMSSDetails().walletType == 'seed') {
    XMSS_OBJECT.setIndex(parseInt(Session.get('messageCreationConfirmation').otsKey))
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

  if (getXMSSDetails().walletType == 'seed') {
    // Show relaying message
    $('#relaying').show()

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
  } else if (getXMSSDetails().walletType == 'ledger') {
    // Reset ledger sign modal view state
    $('#awaitingLedgerConfirmation').show()
    $('#signOnLedgerRejected').hide()
    $('#signOnLedgerTimeout').hide()
    $('#ledgerHasConfirmed').hide()
    $('#relayLedgerTxnButton').hide()

    // Show ledger sign modal
    $("#ledgerConfirmationModal").modal({
      closable: false,
      onDeny: () => {
        // Clear session state for transaction
        Session.set('ledgerTransaction', '')
        Session.set('ledgerTransactionHash', '')
      },
      onApprove: () => {
        // Hide modal, and show relaying message
        $('#ledgerConfirmationModal').modal('hide')
        $('#relaying').show()

        // Relay the transaction
        wrapMeteorCall('confirmMessageCreation', Session.get('ledgerTransaction'), (err, res) => {
          if (res.error) {
            $('#messageCreationConfirmation').hide()
            $('#transactionFailed').show()

            Session.set('transactionFailed', res.error)
          } else {
            Session.set('transactionHash', Session.get('ledgerTransactionHash'))
            Session.set('transactionSignature', res.response.signature)
            Session.set('transactionRelayedThrough', res.relayed)

            // Send to result page.
            const params = { }
            const path = FlowRouter.path('/tools/message/result', params)
            FlowRouter.go(path)
          }
        })
      }
    }).modal('show')

    // Create a transaction
    const source_addr = hexToBytes(QRLLIB.getAddress(getXMSSDetails().pk))
    const fee = toBigendianUint64BytesUnsigned(tx.extended_transaction_unsigned.tx.fee, true)

    QrlLedger.createMessageTx(source_addr, fee, Buffer.from(tx.extended_transaction_unsigned.tx.message.message_hash)).then(txn => {
      QrlLedger.retrieveSignature(txn).then(sigResponse => {
        // Hide the awaiting ledger confirmation spinner
        $('#awaitingLedgerConfirmation').hide()

        // Check if ledger rejected transaction
        if(sigResponse.return_code == 27014) {
          $('#signOnLedgerRejected').show()
        // Check if the the request timed out waiting for response on ledger
        } else if(sigResponse.return_code == 14) {
          $('#signOnLedgerTimeout').show()
        } else {
          // Show confirmation message
          $('#ledgerHasConfirmed').show()

          tx.extended_transaction_unsigned.tx.signature = sigResponse.signature

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

          // Set session values for later relaying
          Session.set('ledgerTransaction', tx)
          Session.set('ledgerTransactionHash', txnHash)

          // Show relay button
          $('#relayLedgerTxnButton').show()
        }
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

Template.appMessageConfirm.onRendered(() => {
  $('.ui.dropdown').dropdown()
})

Template.appMessageConfirm.events({
  'click #confirmMessage': () => {
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
  isSeedWallet() {
    if (getXMSSDetails().walletType == 'seed') {
      return true
    }
    return false
  },
  isLedgerWallet() {
    if (getXMSSDetails().walletType == 'ledger') {
      return true
    }
    return false
  },
  ledgerVerificationMessage() {
    const message = Session.get('messageCreationConfirmation').message
    const hexMessage = new Buffer(message).toString('hex')
    return hexMessage
  },
})
