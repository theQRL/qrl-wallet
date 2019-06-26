// Import client startup through a single index entry point
/* eslint no-console:0 */
/* global QRLLIB, XMSS_OBJECT, LocalStore, QrlLedger, isElectrified, selectedNetwork,loadAddressTransactions, getTokenBalances, updateBalanceField, refreshTransferPage */
/* global pkRawToB32Address, hexOrB32, rawToHexOrB32, anyAddressToRawAddress, stringToBytes, binaryToBytes, bytesToString, bytesToHex, hexToBytes, toBigendianUint64BytesUnsigned, numberToString, decimalToBinary */
/* global getMnemonicOfFirstAddress, getXMSSDetails, isWalletFileDeprecated, waitForQRLLIB, addressForAPI, binaryToQrlAddress, toUint8Vector, concatenateTypedArrays, getQrlProtoShasum */
/* global resetWalletStatus, passwordPolicyValid, countDecimals, supportedBrowser, wrapMeteorCall, getBalance, otsIndexUsed, ledgerHasNoTokenSupport, resetLocalStorageState, nodeReturnedValidResponse */
/* global POLL_TXN_RATE, POLL_MAX_CHECKS, DEFAULT_NETWORKS, findNetworkData, SHOR_PER_QUANTA, WALLET_VERSION, QRLPROTO_SHA256,  */

// import { QRLLIB } from 'qrllib/build/web-libjsqrl.js' // eslint-disable-line
import { QRLLIBmodule } from 'qrllib/build/offline-libjsqrl'
import './routes.js'
import './functions.js'

// Global to store XMSS object
XMSS_OBJECT = null // eslint-disable-line

// Rate in ms to check transaction status
// eslint-disable-next-line
POLL_TXN_RATE = 5000 // 5seconds
// eslint-disable-next-line
POLL_MAX_CHECKS = 120 // max 10 minutes checking status

// Reset wallet status
resetWalletStatus()
const openWalletPref = LocalStore.get('openWalletDefault')
if ((!openWalletPref) || (openWalletPref === 'undefined')) {
  LocalStore.set('openWalletDefault', 'file')
}

// Developer note
console.log('qrl-wallet - ', WALLET_VERSION)
console.log('We\'re hiring! jobs@theqrl.org')
console.log('Found a security bug? security@theqrl.org')
console.log('Found a problem? https://github.com/theQRL/qrl-wallet/issues')
