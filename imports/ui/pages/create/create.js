/* eslint no-console:0 */
/* global QRLLIB, XMSS_OBJECT, LocalStore, QrlLedger, isElectrified, selectedNetwork,loadAddressTransactions, getTokenBalances, updateBalanceField, refreshTransferPage */
/* global pkRawToB32Address, hexOrB32, rawToHexOrB32, anyAddressToRawAddress, stringToBytes, binaryToBytes, bytesToString, bytesToHex, hexToBytes, toBigendianUint64BytesUnsigned, numberToString, decimalToBinary */
/* global getMnemonicOfFirstAddress, getXMSSDetails, isWalletFileDeprecated, waitForQRLLIB, addressForAPI, binaryToQrlAddress, toUint8Vector, concatenateTypedArrays, getQrlProtoShasum */
/* global resetWalletStatus, passwordPolicyValid, countDecimals, supportedBrowser, wrapMeteorCall, getBalance, otsIndexUsed, ledgerHasNoTokenSupport, resetLocalStorageState, nodeReturnedValidResponse */
/* global POLL_TXN_RATE, POLL_MAX_CHECKS, DEFAULT_NETWORKS, findNetworkData, SHOR_PER_QUANTA, WALLET_VERSION, QRLPROTO_SHA256,  */

import './create.html'

// eslint-disable-next-line consistent-return
function generateWallet() {
  // Determine XMSS Tree Height
  const xmssHeight = parseInt(document.getElementById('xmssHeight').value, 10)
  const passphrase = document.getElementById('passphrase').value
  const passphraseConfirm = document.getElementById('passphraseConfirm').value
  const hashFunctionSelection = document.getElementById('hashFunction').value

  // Set hash function to user selected hash function
  let hashFunction
  switch (hashFunctionSelection) {
    case 'SHAKE_128':
      hashFunction = QRLLIB.eHashFunction.SHAKE_128
      console.log('shake 128')
      break
    case 'SHAKE_256':
      hashFunction = QRLLIB.eHashFunction.SHAKE_256
      console.log('shake 256')
      break
    case 'SHA2_256':
      hashFunction = QRLLIB.eHashFunction.SHA2_256
      console.log('SHA2_256')
      break
    default:
      $('#generating').hide()
      $('#error').show()
      return false
  }

  // Check that each passphrase matches
  if (passphrase === passphraseConfirm) {
    // Check that passphrase matches the password policy
    if (passwordPolicyValid(passphrase)) {
      // Generate random seed for XMSS tree
      // eslint-disable-next-line global-require
      const randomSeed = toUint8Vector(require('crypto').randomBytes(48))

      // Generate XMSS object.
      // eslint-disable-next-line no-global-assign,new-cap
      XMSS_OBJECT = new QRLLIB.Xmss.fromParameters(randomSeed, xmssHeight, hashFunction)
      const newAddress = XMSS_OBJECT.getAddress()

      // If it worked, send the user to the address page.
      if (newAddress !== '') {
        Session.set('passphrase', passphrase)
        Session.set('xmssHeight', xmssHeight)

        const params = { address: newAddress }
        const path = FlowRouter.path('/create/:address', params)
        FlowRouter.go(path)
      } else {
        // Error generating walled with QRLLIB.
        $('#generating').hide()
        $('#error').show()
      }
    } else {
      // Invalid passphrase policy
      $('#generating').hide()
      $('#passError').show()
      $('#generate').show()
    }
  } else {
    // Passphrases do not match
    $('#generating').hide()
    $('#passMismatchError').show()
    $('#generate').show()
  }
}

Template.appCreate.onRendered(() => {
  $('#xmssHeightDropdown').dropdown({ direction: 'upward' })
  $('#hashFunctionDropdown').dropdown({ direction: 'upward' })
})

Template.appCreate.events({
  'click #generate': () => {
    $('#passError').hide()
    $('#passMismatchError').hide()
    $('#generating').show()
    // Delay so we get the generating icon up.
    setTimeout(() => { generateWallet() }, 200)
  },
})
