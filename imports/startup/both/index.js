// Import modules used by both client and server through a single index entry point
/* eslint no-console:0 */
/* eslint no-global-assign: 0 */
/* global QRLLIB, XMSS_OBJECT, LocalStore, QrlLedger, isElectrified, selectedNetwork,loadAddressTransactions, getTokenBalances, updateBalanceField, refreshTransferPage */
/* global pkRawToB32Address, hexOrB32, rawToHexOrB32, anyAddressToRawAddress, stringToBytes, binaryToBytes, bytesToString, bytesToHex, hexToBytes, toBigendianUint64BytesUnsigned, numberToString, decimalToBinary */
/* global getMnemonicOfFirstAddress, getXMSSDetails, isWalletFileDeprecated, waitForQRLLIB, addressForAPI, binaryToQrlAddress, toUint8Vector, concatenateTypedArrays, getQrlProtoShasum */
/* global resetWalletStatus, passwordPolicyValid, countDecimals, supportedBrowser, wrapMeteorCall, getBalance, otsIndexUsed, ledgerHasNoTokenSupport, resetLocalStorageState, nodeReturnedValidResponse */
/* global POLL_TXN_RATE, POLL_MAX_CHECKS, DEFAULT_NETWORKS, findNetworkData, SHOR_PER_QUANTA, WALLET_VERSION, QRLPROTO_SHA256, LEDGER_TIMEOUT,  */

import './nodes.js'

// Define amount of SHOR contained per QUANTA (10^9)
SHOR_PER_QUANTA = 1000000000

// qrl-wallet Version
WALLET_VERSION = '1.1.0'

// Ledger Timeout
LEDGER_TIMEOUT = 29000

// qrl.proto sha256 sum for each release of QRL Node
QRLPROTO_SHA256 = [
  {
    version: '1.0.0',
    protoSha256: '4565ecb1a7e3852bd46a8e357bbcc95dfc7a81bec761df50550d567a71bf6ed6',
    objectSha256: 'd538cc0164f26cdda4e082cca548f531038d70a4b879495a4483f66e4c53cae9',
  },
  {
    version: '1.1.0',
    protoSha256: '9daaa59da125167ae825bf182a65c7f12a3af78f2cc351991a5faae03fb99892',
    objectSha256: '7e841e796be583d30066e33f8d9b344ffe8160eb02fecc6cb4df80f7823e932c',
  },
  {
    version: '1.1.1',
    protoSha256: '9daaa59da125167ae825bf182a65c7f12a3af78f2cc351991a5faae03fb99892',
    objectSha256: '7e841e796be583d30066e33f8d9b344ffe8160eb02fecc6cb4df80f7823e932c',
  },
  {
    version: '1.1.2',
    protoSha256: '9daaa59da125167ae825bf182a65c7f12a3af78f2cc351991a5faae03fb99892',
    objectSha256: '7e841e796be583d30066e33f8d9b344ffe8160eb02fecc6cb4df80f7823e932c',
  },
  {
    version: '1.1.3',
    protoSha256: '9daaa59da125167ae825bf182a65c7f12a3af78f2cc351991a5faae03fb99892',
    objectSha256: '7e841e796be583d30066e33f8d9b344ffe8160eb02fecc6cb4df80f7823e932c',
  },
  {
    version: '1.1.4',
    protoSha256: '71a51e5222c50a7575f1a92c365f6674bae938cebae678416da80f22fa8327b9',
    objectSha256: '6589d425a16741104bbeceaa9ab2a1dbb33ff47453b90e29c3ee540dbad22df5',
  },
  {
    version: '1.1.5',
    protoSha256: '71a51e5222c50a7575f1a92c365f6674bae938cebae678416da80f22fa8327b9',
    objectSha256: '6589d425a16741104bbeceaa9ab2a1dbb33ff47453b90e29c3ee540dbad22df5',
  },
  {
    version: '1.1.6',
    protoSha256: '71a51e5222c50a7575f1a92c365f6674bae938cebae678416da80f22fa8327b9',
    objectSha256: '6589d425a16741104bbeceaa9ab2a1dbb33ff47453b90e29c3ee540dbad22df5',
  },
  {
    version: '1.1.7 python',
    protoSha256: '71a51e5222c50a7575f1a92c365f6674bae938cebae678416da80f22fa8327b9',
    objectSha256: '6589d425a16741104bbeceaa9ab2a1dbb33ff47453b90e29c3ee540dbad22df5',
  },
  {
    version: '1.1.8 python',
    protoSha256: '71a51e5222c50a7575f1a92c365f6674bae938cebae678416da80f22fa8327b9',
    objectSha256: '6589d425a16741104bbeceaa9ab2a1dbb33ff47453b90e29c3ee540dbad22df5',
  },
  {
    version: '1.1.9 python',
    protoSha256: '71a51e5222c50a7575f1a92c365f6674bae938cebae678416da80f22fa8327b9',
    objectSha256: '6589d425a16741104bbeceaa9ab2a1dbb33ff47453b90e29c3ee540dbad22df5',
  },
  {
    version: '1.1.10 python',
    protoSha256: '00032d07d4b4637103db15b3d68ae019c14988e870475832af6eb5bd390e04f5',
    objectSha256: '8c31491c3f6f7c3df96228644ded4ae5f3848fa74a971f3dfc8e4db684701dca',
  },
  {
    version: '1.1.11 python',
    protoSha256: '00032d07d4b4637103db15b3d68ae019c14988e870475832af6eb5bd390e04f5',
    objectSha256: '8c31491c3f6f7c3df96228644ded4ae5f3848fa74a971f3dfc8e4db684701dca',
  },
]

// function to get shasum of qrl node version
getQrlProtoShasum = (nodeVersion, callback) => {
  let itemsProcessed = 0
  QRLPROTO_SHA256.forEach((qrlnode, index, array) => {
    itemsProcessed += 1
    // Only look at health of userNetwork
    if (qrlnode.version == nodeVersion) { //eslint-disable-line
      callback(qrlnode)
    }
    // If we got to the end, and didn't callback above, the version was not found.
    // Return null
    if (itemsProcessed === array.length) {
      callback(null)
    }
  })
}

// Function to cleanly represent large decimal numbers without exponentional formatting.
numberToString = (num) => {
  const math = require('mathjs') //eslint-disable-line
  return math.format(num, { notation: 'fixed', 'lowerExp': 1e-100, 'upperExp': Infinity }) //eslint-disable-line
}

// Convert decimal value to binary
decimalToBinary = (decimalNumber) => {
  const binaryArray = []
  while (decimalNumber >= 1) {
    binaryArray.unshift(decimalNumber % 2)
    decimalNumber = Math.floor(decimalNumber / 2) //eslint-disable-line
  }
  // Pad start of array with 0s if not a full byte
  while (binaryArray.length < 8) {
    binaryArray.unshift(0)
  }
  return binaryArray
}
