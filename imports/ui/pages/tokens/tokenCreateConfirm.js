import './tokenCreateConfirm.html'
/* global LocalStore */
/* global QRLLIB */
/* global selectedNode */
/* global XMSS_OBJECT */
/* global findNodeData */
/* global selectedNode */
/* global DEFAULT_NODES */

function confirmTokenCreation() {
  const tx = LocalStore.get('tokenCreationConfirmationResponse')

  // Set OTS Key Index in XMSS object
  XMSS_OBJECT.setIndex(parseInt(LocalStore.get('tokenCreationConfirmation').otsKey))

  // Concatenate Uint8Arrays
  let tmptxnhash = concatenateTypedArrays(
    Uint8Array,
      tx.transaction_unsigned.addr_from,
      toBigendianUint64BytesUnsigned(tx.transaction_unsigned.fee),
      tx.transaction_unsigned.token.symbol,
      tx.transaction_unsigned.token.name,
      tx.transaction_unsigned.token.owner,
      toBigendianUint64BytesUnsigned(tx.transaction_unsigned.token.decimals)
  )

  // Now append initial balances tmptxnhash
  const tokenHoldersRaw = tx.transaction_unsigned.token.initial_balances
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
  let hashableBytes = new QRLLIB.VectorUChar()
  for (i = 0; i < tmptxnhash.length; i += 1) {
    hashableBytes.push_back(tmptxnhash[i])
  }

  // Create sha256 sum of hashableBytes
  let shaSum = QRLLIB.sha2_256(hashableBytes)

  // Sign the sha sum
  tx.transaction_unsigned.signature = binaryToBytes(XMSS_OBJECT.sign(shaSum))

  // Calculate transaction hash
  let txnHashConcat = concatenateTypedArrays(
    Uint8Array,
      binaryToBytes(shaSum),
      tx.transaction_unsigned.signature,
      binaryToBytes(XMSS_OBJECT.getPK())
  )

  const txnHashableBytes = new QRLLIB.VectorUChar()
  for (i = 0; i < txnHashConcat.length; i += 1) {
    txnHashableBytes.push_back(txnHashConcat[i])
  }

  let txnHash = QRLLIB.bin2hstr(QRLLIB.sha2_256(txnHashableBytes))

  console.log('Txn Hash: ', txnHash)

  const grpcEndpoint = findNodeData(DEFAULT_NODES, selectedNode()).grpc
  tx.grpc = grpcEndpoint

  Meteor.call('confirmTokenCreation', tx, (err, res) => {
    if (res.error) {
      $('#tokenCreationConfirmation').hide()
      $('#transactionFailed').show()

      LocalStore.set('transactionFailed', res.error)
    } else {
      LocalStore.set('transactionHash', txnHash)
      LocalStore.set('transactionSignature', res.response.signature)
      LocalStore.set('transactionRelayedThrough', res.relayed)

      // Send to result page.
      const params = { }
      const path = FlowRouter.path('/tokens/create/result', params)
      FlowRouter.go(path)
    }
  })
}

function cancelTransaction() {
  LocalStore.set('tokenCreationConfirmation', '')
  LocalStore.set('tokenCreationConfirmationResponse', '')

  LocalStore.set('transactionFailed', 'User requested cancellation')

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
  tokenCreationConfirmation() {
    const confirmation = LocalStore.get('tokenCreationConfirmation')
    return confirmation
  },
  transactionFailed() {
    const failed = LocalStore.get('transactionFailed')
    return failed
  },
  tokenHolders() {
    const tokenHoldersRaw = LocalStore.get('tokenCreationConfirmation').initialBalances
    const tokenDecimals = LocalStore.get('tokenCreationConfirmation').decimals
    let tokenHolders = []

    for (var i = 0; i < tokenHoldersRaw.length; i++) {
      const thisHolder = {
        address: binaryToQrlAddress(tokenHoldersRaw[i].address),
        amount: tokenHoldersRaw[i].amount / Math.pow(10, tokenDecimals)
      }
      tokenHolders.push(thisHolder)
    }

    return tokenHolders
  },
  nodeExplorerUrl() {
    if ((LocalStore.get('nodeExplorerUrl') === '') || (LocalStore.get('nodeExplorerUrl') === null)) {
      return DEFAULT_NODES[0].explorerUrl
    }
    return LocalStore.get('nodeExplorerUrl')
  },
})
