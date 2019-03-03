/* eslint no-console:0 */
/* global QRLLIB, XMSS_OBJECT, LocalStore, QrlLedger, isElectrified, selectedNetwork,loadAddressTransactions, getTokenBalances, updateBalanceField, refreshTransferPage */
/* global pkRawToB32Address, hexOrB32, rawToHexOrB32, anyAddressToRawAddress, stringToBytes, binaryToBytes, bytesToString, bytesToHex, hexToBytes, toBigendianUint64BytesUnsigned, numberToString, decimalToBinary */
/* global getMnemonicOfFirstAddress, getXMSSDetails, isWalletFileDeprecated, waitForQRLLIB, addressForAPI, binaryToQrlAddress, toUint8Vector, concatenateTypedArrays, getQrlProtoShasum */
/* global resetWalletStatus, passwordPolicyValid, countDecimals, supportedBrowser, wrapMeteorCall, getBalance, otsIndexUsed, ledgerHasNoTokenSupport, resetLocalStorageState, nodeReturnedValidResponse */
/* global POLL_TXN_RATE, POLL_MAX_CHECKS, DEFAULT_NETWORKS, findNetworkData, SHOR_PER_QUANTA, WALLET_VERSION, QRLPROTO_SHA256,  */

import async from 'async'
import './update.html'

function updateLedgerIdx(otsKey, callback) {
  if (isElectrified()) {
    Meteor.call('ledgerSetIdx', otsKey, (err, data) => {
      console.log('> Set Ledger OTS Key via USB')
      callback(null, data)
    })
  } else {
    QrlLedger.setIdx(otsKey).then(idxResponse => {
      console.log('> Set Ledger OTS Key via U2F')
      callback(null, idxResponse)
    })
  }
}

function updateLedgerOtsKeyIndex() {
  // Get OTS Index
  const otsKey = parseInt(document.getElementById('otsKey').value, 10)

  // Fail if OTS Key reuse is detected
  if (otsIndexUsed(Session.get('otsBitfield'), otsKey)) {
    $('#updatingLedger').hide()
    $('#otsKeyReuseDetected').modal('show')
    return
  }

  // Attempt to set IDX
  console.log('Setting Ledger Nano XMSS Index to: ', otsKey)
  // QrlLedger.setIdx(otsKey).then(idxResponse => {
  updateLedgerIdx(otsKey, function (err, idxResponse) {
    $('#updatingLedger').hide()
    console.log('Ledger Response')
    console.log(idxResponse)

    if (idxResponse.return_code === 36864) {
      // Success
      $('#otsKeyUpdated').show()
    } else {
      // Error
      console.log()
      $('#otsKeyUpdateFailed').show()
    }


    getBalance(getXMSSDetails().address, function () {
      console.log('Got balance')
    })
  })
}

Template.appXmssIndexUpdate.onRendered(() => {
  // Get wallet balance
  getBalance(getXMSSDetails().address, function () {
    console.log('Got balance')
  })
})

Template.appXmssIndexUpdate.events({
  'submit #updateXmssIndexForm': (event) => {
    event.preventDefault()
    event.stopPropagation()
    $('#updatingLedger').show()
    $('#otsKeyUpdated').hide()
    $('#otsKeyUpdateFailed').hide()

    setTimeout(() => { updateLedgerOtsKeyIndex() }, 200)
  },
})

Template.appXmssIndexUpdate.helpers({
  currentLedgerXMSSIndex() {
    const currentLedgerXMSSIndex = Session.get('otsKeyEstimate')
    return currentLedgerXMSSIndex
  },
  suggestedXMSSIndex() {
    const bitfield = Session.get('otsBitfield')
    // Identify the largest OTS Key utilised in the bitfield
    let largestIndex = 0
    for (let i in bitfield) { // eslint-disable-line
      if (bitfield[i] === 1) {
        largestIndex = i
      }
      // Only 255 indexs in Ledger bitfields
      if (i >= 255) {
        break
      }
    }
    // Suggested XMSS Index is largestedIndex + 1
    return parseInt(largestIndex, 10) + 1
  },
  ledgerAppVersion() {
    const appVersion = Session.get('ledgerDetailsAppVersion')
    return appVersion
  },
  transferFrom() {
    const transferFrom = {}
    transferFrom.balance = Session.get('transferFromBalance')
    transferFrom.address = hexOrB32(Session.get('transferFromAddress'))
    return transferFrom
  },
})
