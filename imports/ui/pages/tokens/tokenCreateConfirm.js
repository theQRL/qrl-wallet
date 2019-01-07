/* eslint no-console:0 */
/* global QRLLIB, XMSS_OBJECT, LocalStore, QrlLedger, isElectrified, selectedNetwork,loadAddressTransactions, getTokenBalances, updateBalanceField, refreshTransferPage */
/* global pkRawToB32Address, hexOrB32, rawToHexOrB32, anyAddressToRawAddress, stringToBytes, binaryToBytes, bytesToString, bytesToHex, hexToBytes, toBigendianUint64BytesUnsigned, numberToString, decimalToBinary */
/* global getMnemonicOfFirstAddress, getXMSSDetails, isWalletFileDeprecated, waitForQRLLIB, addressForAPI, binaryToQrlAddress, toUint8Vector, concatenateTypedArrays, getQrlProtoShasum */
/* global resetWalletStatus, passwordPolicyValid, countDecimals, supportedBrowser, wrapMeteorCall, getBalance, otsIndexUsed, ledgerHasNoTokenSupport, resetLocalStorageState, nodeReturnedValidResponse */
/* global POLL_TXN_RATE, POLL_MAX_CHECKS, DEFAULT_NETWORKS, findNetworkData, SHOR_PER_QUANTA, WALLET_VERSION, QRLPROTO_SHA256,  */

import './tokenCreateConfirm.html'
import helpers from '@theqrl/explorer-helpers'

function confirmTokenCreation() {
  const tx = Session.get('tokenCreationConfirmationResponse')

  // Set OTS Key Index in XMSS object
  XMSS_OBJECT.setIndex(parseInt(Session.get('tokenCreationConfirmation').otsKey, 10))

  // Concatenate Uint8Arrays
  let tmptxnhash = concatenateTypedArrays(
    Uint8Array,
    // tx.extended_transaction_unsigned.addr_from,
    toBigendianUint64BytesUnsigned(tx.extended_transaction_unsigned.tx.fee),
    tx.extended_transaction_unsigned.tx.token.symbol,
    tx.extended_transaction_unsigned.tx.token.name,
    tx.extended_transaction_unsigned.tx.token.owner,
    toBigendianUint64BytesUnsigned(tx.extended_transaction_unsigned.tx.token.decimals) // eslint-disable-line
  )

  // Now append initial balances tmptxnhash
  const tokenHoldersRaw = tx.extended_transaction_unsigned.tx.token.initial_balances
  for (let i = 0; i < tokenHoldersRaw.length; i += 1) {
    // Add address
    tmptxnhash = concatenateTypedArrays(
      Uint8Array,
      tmptxnhash,
      tokenHoldersRaw[i].address // eslint-disable-line
    )

    // Add amount
    tmptxnhash = concatenateTypedArrays(
      Uint8Array,
      tmptxnhash,
      toBigendianUint64BytesUnsigned(tokenHoldersRaw[i].amount) // eslint-disable-line
    )
  }

  // Convert Uint8Array to VectorUChar
  const hashableBytes = toUint8Vector(tmptxnhash)

  // Create sha256 sum of hashableBytes
  const shaSum = QRLLIB.sha2_256(hashableBytes)

  // Sign the sha sum
  tx.extended_transaction_unsigned.tx.signature = binaryToBytes(XMSS_OBJECT.sign(shaSum))

  // Calculate transaction hash
  const txnHashConcat = concatenateTypedArrays(
    Uint8Array,
    binaryToBytes(shaSum),
    tx.extended_transaction_unsigned.tx.signature,
    hexToBytes(XMSS_OBJECT.getPK()) // eslint-disable-line
  )

  const txnHashableBytes = toUint8Vector(txnHashConcat)

  const txnHash = QRLLIB.bin2hstr(QRLLIB.sha2_256(txnHashableBytes))

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
    if (LocalStore.get('addressFormat') === 'bech32') {
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
    const tokenHolders = []

    for (let i = 0; i < tokenHoldersRaw.length; i += 1) {
      const thisHolder = {
        address_hex: helpers.rawAddressToHexAddress(tokenHoldersRaw[i].address),
        address_b32: helpers.rawAddressToB32Address(tokenHoldersRaw[i].address),
        amount: tokenHoldersRaw[i].amount / Math.pow(10, tokenDecimals) // eslint-disable-line
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
