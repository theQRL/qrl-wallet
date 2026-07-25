/* eslint no-console:0 */
/* global QRLLIB, XMSS_OBJECT, LocalStore, QrlLedger, isElectrified, selectedNetwork,loadAddressTransactions, getTokenBalances, updateBalanceField, refreshTransferPage */
/* global pkRawToB32Address, hexOrB32, rawToHexOrB32, anyAddressToRawAddress, stringToBytes, binaryToBytes, bytesToString, bytesToHex, hexToBytes, toBigendianUint64BytesUnsigned, numberToString, decimalToBinary */
/* global getMnemonicOfFirstAddress, getXMSSDetails, isWalletFileDeprecated, waitForQRLLIB, addressForAPI, binaryToQrlAddress, toUint8Vector, concatenateTypedArrays, getQrlProtoShasum */
/* global resetWalletStatus, passwordPolicyValid, countDecimals, supportedBrowser, wrapMeteorCall, getBalance, otsIndexUsed, ledgerHasNoTokenSupport, resetLocalStorageState, nodeReturnedValidResponse */
/* global POLL_TXN_RATE, POLL_MAX_CHECKS, DEFAULT_NETWORKS, findNetworkData, SHOR_PER_QUANTA, WALLET_VERSION, QRLPROTO_SHA256,  */

import './close.html'
import { openDialog, resolve } from '../../lib/dom'

Template.appAddressClose.onRendered(() => {
  XMSS_OBJECT = null // eslint-disable-line
  resetWalletStatus()
  if (Session.get('closedWithError')) {
    const modal = openDialog('closedWithError')
    if (modal) {
      const clearErrorState = () => {
        Session.set('closedWithError', false)
        modal.removeEventListener('close', clearErrorState)
      }
      modal.addEventListener('close', clearErrorState)
    }
  }
})
Template.appAddressClose.events({
  'click #closedWithError .modal-backdrop button': () => {
    const modal = resolve('closedWithError')
    if (modal && modal.open) modal.close()
  },
})
