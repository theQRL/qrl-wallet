/* eslint no-console:0 */
/* eslint no-global-assign: 0 */
/* eslint max-len: 0 */
/* eslint no-unused-vars: 0 */
/* global QRLLIB, XMSS_OBJECT, LocalStore, QrlLedger, isElectrified, selectedNetwork,loadAddressTransactions, getTokenBalances, updateBalanceField, refreshTransferPage */
/* global pkRawToB32Address, hexOrB32, rawToHexOrB32, anyAddressToRawAddress, stringToBytes, binaryToBytes, bytesToString, bytesToHex, hexToBytes, toBigendianUint64BytesUnsigned, numberToString, decimalToBinary */
/* global getMnemonicOfFirstAddress, getXMSSDetails, isWalletFileDeprecated, waitForQRLLIB, addressForAPI, binaryToQrlAddress, toUint8Vector, concatenateTypedArrays, getQrlProtoShasum */
/* global resetWalletStatus, passwordPolicyValid, countDecimals, supportedBrowser, wrapMeteorCall, getBalance, otsIndexUsed, ledgerHasNoTokenSupport, resetLocalStorageState, nodeReturnedValidResponse, TransportStatusError */
/* global POLL_TXN_RATE, POLL_MAX_CHECKS, DEFAULT_NETWORKS, findNetworkData, SHOR_PER_QUANTA, WALLET_VERSION, QRLPROTO_SHA256,  */

import aes256 from 'aes256'
import qrlAddressValdidator from '@theqrl/validate-qrl-address'
import helpers from '@theqrl/explorer-helpers'

import 'babel-polyfill'
import Qrl from '@theqrl/hw-app-qrl'
import TransportWebUSB from '@ledgerhq/hw-transport-webusb'


bech32 = require('bech32') // eslint-disable-line

export function ledgerReturnedError(e) {
  let r = false
  try {
    if (e instanceof DOMException) {
      // DOMException will be thrown if WebUSB device is unplugged during Ledger UI event
      r = true
    }
  } catch (err) {
    r = false
  }
  try {
    if (e.name === 'TransportStatusError' || e instanceof TransportStatusError || e.name === 'TransportOpenUserCancelled') {
      r = true
    }
  } catch (err) {
    r = false
  }
  return r
}

export async function createTransport() {
  let transport = null
  transport = await TransportWebUSB.create()
  console.log('USING WEBUSB')
  const qrl = await new Qrl(transport)
  return qrl
}

// Client side function to detmine if running within Electron
export function isElectrified() {
  const userAgent = navigator.userAgent.toLowerCase()
  if (userAgent.indexOf(' electron/') > -1) {
    return true
  }
  return false
}

// Returns the selected node
selectedNetwork = () => {
  const selectedNetwork = document.getElementById('network').value
  return selectedNetwork
}

// BECH32 Address is built from the extended PK
// bech32(descr + sha2(ePK))
pkRawToB32Address = (pkRaw) => {
  const rawDescriptor = Uint8Array.from([pkRaw.get(0), pkRaw.get(1), pkRaw.get(2)])
  const ePkHash = binaryToBytes(QRLLIB.sha2_256(pkRaw)) // Uint8Vector -> Uint8Array conversion
  const descriptorAndHash = concatenateTypedArrays(Uint8Array, rawDescriptor, ePkHash)
  return helpers.b32Encode(descriptorAndHash)
}

// wrapper to decide if addresses should be converted to BECH32 for display
hexOrB32 = (hexAddress) => {
  if (LocalStore.get('addressFormat') === 'bech32') {
    return helpers.hexAddressToB32Address(hexAddress)
  }
  return hexAddress
}

// wrapper to decide if addresses should be converted to BECH32 for display
rawToHexOrB32 = (rawAddress) => {
  if (LocalStore.get('addressFormat') === 'bech32') {
    return helpers.rawAddressToB32Address(rawAddress)
  }
  return helpers.rawAddressToHexAddress(rawAddress)
}

// A Template helper cannot access the helpers for some reason, so this has to stay in qrl-wallet
anyAddressToRawAddress = (address) => {
  if (address[0] === 'q') {
    return helpers.b32AddressToRawAddress(address)
  }
  return helpers.hexAddressToRawAddress(address)
}

// Gets mnemonic phrase from wallet file
getMnemonicOfFirstAddress = (walletObject, passphrase) => {
  function handleVersion1() {
    let mnemonic = ''
    if (walletObject.encrypted === true) {
      mnemonic = aes256.decrypt(passphrase, walletObject.addresses[0].mnemonic)
    } else {
      mnemonic = walletObject.addresses[0].mnemonic // eslint-disable-line
    }
    return mnemonic
  }
  function handleVersion0() {
    let mnemonic = ''
    if (walletObject[0].encrypted === true) {
      mnemonic = aes256.decrypt(passphrase, walletObject[0].mnemonic)
    } else {
      mnemonic = walletObject[0].mnemonic // eslint-disable-line
    }
    return mnemonic
  }
  if (walletObject.version === 1) {
    return handleVersion1()
  }
  return handleVersion0()
}

// Fetchs XMSS details from the global XMSS_OBJECT variable or saved ledger values
getXMSSDetails = () => {
  const walletStatus = Session.get('walletStatus')

  let xmssDetail

  if (walletStatus.walletType === 'ledger') {
    const thisAddress = walletStatus.address
    const thisPk = walletStatus.pubkey
    const thisAddressB32 = pkRawToB32Address(QRLLIB.hstr2bin(thisPk))
    const thisHashFunction = QRLLIB.getHashFunction(thisAddress)
    const thisSignatureType = QRLLIB.getSignatureType(thisAddress)
    const thisHeight = QRLLIB.getHeight(thisAddress)
    const thisHexSeed = null
    const thisMnemonic = null

    xmssDetail = {
      address: thisAddress,
      addressB32: thisAddressB32,
      pk: thisPk,
      hexseed: thisHexSeed,
      mnemonic: thisMnemonic,
      height: thisHeight,
      hashFunction: thisHashFunction,
      signatureType: thisSignatureType,
      index: walletStatus.xmss_index,
      walletType: 'ledger',
    }
  } else {
    const thisAddress = XMSS_OBJECT.getAddress()
    const thisPk = XMSS_OBJECT.getPK()
    const thisPkRaw = XMSS_OBJECT.getPKRaw()
    const thisAddressB32 = pkRawToB32Address(thisPkRaw)
    const thisHashFunction = QRLLIB.getHashFunction(thisAddress)
    const thisSignatureType = QRLLIB.getSignatureType(thisAddress)
    const thisHeight = XMSS_OBJECT.getHeight()
    const thisHexSeed = XMSS_OBJECT.getHexSeed()
    const thisMnemonic = XMSS_OBJECT.getMnemonic()

    xmssDetail = {
      address: thisAddress,
      addressB32: thisAddressB32,
      pk: thisPk,
      hexseed: thisHexSeed,
      mnemonic: thisMnemonic,
      height: thisHeight,
      hashFunction: thisHashFunction,
      signatureType: thisSignatureType,
      index: 0,
      walletType: 'seed',
    }
  }

  return xmssDetail
}

// Check if a wallet is deprecated
isWalletFileDeprecated = (wallet) => {
  // There are three characteristics that describe a deprecated encrypted wallet file
  // 1: The encrypted field is true and;
  // 2: The addressB32 field is unencrypted and;
  // 3: The pk field is unencrypted.
  // Whilst neither of these fields risk funds being lost, they do reveal a users public
  // address if their wallet file is stolen. This is a privacy concern.
  // We can determine if they are unencrypted by checking their lengths.
  // If addressB32 field is 64 characters in length, and pk field is 134 characters in length.
  if (
    (typeof wallet[0].encrypted !== 'undefined')
    && (typeof wallet[0].addressB32 !== 'undefined')
    && (typeof wallet[0].pk !== 'undefined')) {
    if (
      (wallet[0].encrypted === true)
      && (wallet[0].addressB32.length === 64)
      && (wallet[0].pk.length === 134)) {
      return true
    }
  }
  return false
}

resetWalletStatus = () => {
  const status = {}
  status.colour = 'red'
  status.string = 'No wallet has been opened.'
  status.address = ''
  status.pubkey = ''
  status.xmss_index = 0
  status.walletType = ''
  status.unlocked = false
  status.menuHidden = 'display: none'
  status.menuHiddenInverse = ''
  Session.set('walletStatus', status)

  // reset any Sessions
  // TO DO: advise against this if transfer is pending?
  Session.set('txstatus', '')
  Session.set('txhash', {})
  Session.set('addressTransactions', {})
  Session.set('active', '')
  Session.set('fetchedTx', false)
  Session.set('transactionGenerationError', false)
  Session.set('transactionConfirmation', false)
  Session.set('transactionConfirmationAmount', false)
  Session.set('transactionConfirmationFee', false)
  Session.set('transactionConfirmationResponse', false)
  Session.set('transactionFailed', false)
  Session.set('transactionHash', false)
  Session.set('transactionSignature', false)
  Session.set('transactionRelayedThrough', false)
  Session.set('ledgerTransaction', '')
  Session.set('ledgerTransactionHash', '')
  Session.set('tokenTransferError', false)
  Session.set('tokenTransferConfirmation', false)
  Session.set('tokenTransferConfirmationDetails', false)
  Session.set('tokenTransferConfirmationResponse', false)
  Session.set('tokenTransferConfirmationAmount', false)
}

passwordPolicyValid = (password) => {
  // If password length >=8, and password contains a digit and password contains a letter
  if ((password.length >= 8) && (/\d/.test(password)) && (/[a-zA-Z]+/.test(password))) {
    return true
  }
  return false
}

// Wait for QRLLIB to load before running specified callback function
waitForQRLLIB = (callBack) => {
  setTimeout(() => { // eslint-disable-line
    // Test the QRLLIB object has the str2bin function.
    // This is sufficient to tell us QRLLIB has loaded.
    if (typeof QRLLIB.str2bin === 'function') {
      callBack()
    } else {
      return waitForQRLLIB(callBack)
    }
  }, 50)
}

// Convert a string to bytes
stringToBytes = (convertMe) => {
  // Convert String to Binary First
  const thisBinary = QRLLIB.str2bin(convertMe)
  // Now convert to Bytes
  return binaryToBytes(thisBinary)
}

// Convert Binary object to Bytes
binaryToBytes = (convertMe) => {
  const thisBytes = new Uint8Array(convertMe.size())
  for (let i = 0; i < convertMe.size(); i += 1) {
    thisBytes[i] = convertMe.get(i)
  }
  return thisBytes
}

// Convert bytes to string
bytesToString = (buf) => { // eslint-disable-line
  return String.fromCharCode.apply(null, new Uint8Array(buf))
}

// Convert bytes to hex
bytesToHex = (byteArray) => { // eslint-disable-line
  return Array.from(byteArray, function (byte) {
    return ('00' + (byte & 0xFF).toString(16)).slice(-2) // eslint-disable-line no-bitwise
  }).join('')
}

// Convert hex to bytes
hexToBytes = (hex) => { // eslint-disable-line
  return Buffer.from(hex, 'hex')
}

// Returns an address ready to send to gRPC API
addressForAPI = (address) => { // eslint-disable-line
  return Buffer.from(address.substring(1), 'hex')
}

// Create human readable QRL Address from API Binary response
binaryToQrlAddress = (binary) => {
  if (binary === null) {
    return null
  }
  return 'Q' + Buffer.from(binary).toString('hex')
}

// Take input and convert to unsigned uint64 bigendian bytes
toBigendianUint64BytesUnsigned = (input, bufferResponse = false) => {
  if (!Number.isInteger(input)) {
    input = parseInt(input, 10) // eslint-disable-line
  }

  const byteArray = [0, 0, 0, 0, 0, 0, 0, 0]

  for (let index = 0; index < byteArray.length; index += 1) {
    const byte = input & 0xff // eslint-disable-line no-bitwise
    byteArray[index] = byte
    input = (input - byte) / 256 // eslint-disable-line
  }

  byteArray.reverse()

  if (bufferResponse === true) {
    const result = Buffer.from(byteArray)
    return result
  }
  const result = new Uint8Array(byteArray)
  return result
}

toUint8Vector = (arr) => {
  const vec = new QRLLIB.Uint8Vector()
  for (let i = 0; i < arr.length; i += 1) {
    vec.push_back(arr[i])
  }
  return vec
}

// Concatenates multiple typed arrays into one.
concatenateTypedArrays = (resultConstructor, ...arrays) => {
  let totalLength = 0
  for (let arr of arrays) { // eslint-disable-line
    totalLength += arr.length
  }
  const result = new resultConstructor(totalLength) // eslint-disable-line
  let offset = 0
  for (let arr of arrays) { // eslint-disable-line
    result.set(arr, offset)
    offset += arr.length
  }
  return result
}

// Count decimals in value
countDecimals = (value) => {
  if (Math.floor(value) === Number(value)) return 0
  return value.toString().split('.')[1].length || 0
}

// Check if users web browser supports Web Assemblies
supportedBrowser = () => {
  try {
    if (typeof WebAssembly === 'object'
      && typeof WebAssembly.instantiate === 'function') {
      const module = new WebAssembly.Module(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00)) // eslint-disable-line
      if (module instanceof WebAssembly.Module) {
        return new WebAssembly.Instance(module) instanceof WebAssembly.Instance
      }
    }
  } catch (e) {
    return false
  }
  return false
}

// Wrapper for Meteor.call
wrapMeteorCall = (method, request, callback) => {
  // Modify network to gRPC endpoint for custom/localhost settings
  if (request.network === 'localhost') {
    // Override network to localhost
    request.network = 'localhost:19009'
  }
  if (request.network === 'custom') {
    // Override network to localhost
    request.network = LocalStore.get('customNodeGrpc')
  }

  Meteor.call(method, request, (err, res) => {
    callback(err, res)
  })
}

const otsParse = (response, totalSignatures) => {
  // Parse OTS Bitfield, and grab the lowest unused key
  let newOtsBitfield = {}
  let thisOtsBitfield = []
  if (response.ots_bitfield_by_page[0].ots_bitfield !== undefined) {
    thisOtsBitfield = response.ots_bitfield_by_page[0].ots_bitfield
  }
  thisOtsBitfield.forEach((item, index) => {
    const thisDecimal = new Uint8Array(item)[0]
    const thisBinary = decimalToBinary(thisDecimal).reverse()
    const startIndex = index * 8
    for (let i = 0; i < 8; i += 1) {
      const thisOtsIndex = startIndex + i
      // Add to parsed array unless we have reached the end of the signatures
      if (thisOtsIndex < totalSignatures) {
        newOtsBitfield[thisOtsIndex] = thisBinary[i]
      }
    }
  })
  // console.log('otslen', newOtsBitfield)
  if (newOtsBitfield.length > totalSignatures) {
    newOtsBitfield = newOtsBitfield.slice(0, totalSignatures + 1)
  }

  // Add in OTS fields to response
  const ots = {}
  ots.keys = newOtsBitfield
  ots.nextKey = response.next_unused_ots_index
  // console.log('ots:', ots)
  return ots
}

// Get wallet address state details
getBalance = (getAddress, callBack) => {
  const request = {
    address: addressForAPI(getAddress),
    network: selectedNetwork(),
  }

  wrapMeteorCall('getAddressState', request, async (err, res) => {
    if (err) {
      console.log('err: ', err)
      Session.set('transferFromBalance', 0)
      Session.set('transferFromTokenState', [])
      Session.set('address', 'Error')
      Session.set('otsKeyEstimate', 0)
      Session.set('otsKeysRemaining', 0)
      Session.set('otsBitfield', {})
      Session.set('errorLoadingTransactions', true)
    } else {
      if (res.state.address !== '') {
        Session.set('transferFromBalance', res.state.balance / SHOR_PER_QUANTA)
        Session.set('transferFromTokenState', res.state.tokens)
        Session.set('address', res)
      } else {
        // Wallet not found, put together an empty response
        Session.set('transferFromBalance', 0)
      }

      if (getXMSSDetails().walletType === 'seed') {
        // Collect next OTS key
        request.page_from = 1
        request.page_count = 1
        request.unused_ots_index_from = 0
        Meteor.call('getOTS', request, (error, result) => {
          if (err) {
            console.log('err: ', err)
            Session.set('transferFromBalance', 0)
            Session.set('transferFromTokenState', [])
            Session.set('address', 'Error')
            Session.set('otsKeyEstimate', 0)
            Session.set('otsKeysRemaining', 0)
            Session.set('otsBitfield', {})
            Session.set('errorLoadingTransactions', true)
          } else {
            console.log('getOTS response: ', result)
            const totalSignatures = qrlAddressValdidator.hexString(res.state.address).sig.number
            const ots = otsParse(result, totalSignatures)
            res.ots = ots
            res.ots.keysConsumed = res.state.used_ots_key_count
            const keysRemaining = totalSignatures - res.ots.keysConsumed
            Session.set('otsBitfield', res.ots.keys)
            Session.set('otsKeysRemaining', keysRemaining)
            Session.set('otsKeyEstimate', res.ots.nextKey)
          }
        })
      } else if (getXMSSDetails().walletType === 'ledger') {
        // Collect next OTS key from Ledger Device
        // Whilst technically we may have unused ones - we
        // prefer to rely on state tracked in ledger device
        console.log('-- Getting QRL Ledger Nano App State --')
        if (isElectrified()) {
          Meteor.call('ledgerGetState', [], (gsErr, data) => {
            console.log('> Got Ledger Nano State from USB')
            Session.set('otsKeyEstimate', data.xmss_index)
            // Get remaining OTS Keys
            const validationResult = qrlAddressValdidator.hexString(getAddress)
            const totalSignatures = validationResult.sig.number
            const keysRemaining = totalSignatures - data.xmss_index
            // Set keys remaining
            Session.set('otsKeysRemaining', keysRemaining)

            // Store OTS Bitfield in session
            Session.set('otsBitfield', res.ots.keys)

            callBack()
          })
        } else {
          const QrlLedger = await createTransport()
          QrlLedger.get_state().then(data => {
            console.log('> Got Ledger Nano State from WebUSB')
            Session.set('otsKeyEstimate', data.xmss_index)
            // Get remaining OTS Keys
            const validationResult = qrlAddressValdidator.hexString(getAddress)
            const totalSignatures = validationResult.sig.number
            const keysRemaining = totalSignatures - data.xmss_index
            // Set keys remaining
            Session.set('otsKeysRemaining', keysRemaining)

            // Store OTS Bitfield in session
            Session.set('otsBitfield', res.ots.keys)

            callBack()
          })
        }
      }
    }
  })
}

otsIndexUsed = (otsBitfield, index) => {
  if (otsBitfield[index] === 1) {
    return true
  }
  return false
}

loadAddressTransactions = (a, p) => {
  const addresstx = Buffer.from(a.substring(1), 'hex')
  const request = {
    address: addresstx,
    network: selectedNetwork(),
    item_per_page: 10,
    page_number: p,
  }

  Session.set('addressTransactions', [])
  Session.set('loadingTransactions', true)

  wrapMeteorCall('getTransactionsByAddress', request, (err, res) => {
    if (err) { console.log('err:', err) }
    // console.log('res:', res)
    if (err) {
      Session.set('addressTransactions', { error: err })
      Session.set('errorLoadingTransactions', true)
    } else {
      Session.set('active', p)

      const transactions = []
      const thisAddress = a
      _.each(res.transactions_detail, (transaction) => {
        const y = transaction
        // Update timestamp from unix epoch to human readable time/date.
        if (moment.unix(transaction.timestamp).isValid()) {
          y.timestamp = moment.unix(transaction.timestamp).format('HH:mm D MMM YYYY')
        } else {
          y.timestamp = 'Unconfirmed Tx'
        }
        // Set total received amount if sent to this address
        let thisReceivedAmount = 0
        let totalSent = 0
        if (y.tx.transactionType === 'transfer') {
          _.each(y.tx.transfer.addrs_to, (output, index) => {
            totalSent += parseFloat(y.tx.transfer.amounts[index] / SHOR_PER_QUANTA)
            if (output === thisAddress) {
              thisReceivedAmount += parseFloat(y.tx.transfer.amounts[index] / SHOR_PER_QUANTA)
            }
          })
        }
        if (y.tx.transactionType === 'transfer_token') {
          // FIXME: sort token decimals here
          _.each(y.tx.transfer_token.addrs_to, (output, index) => {
            totalSent += parseFloat(y.tx.transfer_token.amounts[index])
            if (output === thisAddress) {
              thisReceivedAmount += parseFloat(y.tx.transfer_token.amounts[index])
            }
          })
        }
        y.thisReceivedAmount = numberToString(thisReceivedAmount)
        y.totalTransferred = totalSent
        transactions.push(y)
        Session.set('addressTransactions', transactions)
      })
      Session.set('loadingTransactions', false)
      Session.set('errorLoadingTransactions', false)
      $('#noTransactionsFound').show()
    }
  })
}

const getTokenBalances = (getAddress, callback) => {
  const request = {
    address: Buffer.from(getAddress.substring(1), 'hex'),
    network: selectedNetwork(),
  }
  const tokensHeld = []
  Meteor.call('getFullAddressState', request, (err, res) => {
    if (err) {
      // TODO - Error handling
    } else {
      // Now for each res.state.token we find, go discover token name and symbol
      // eslint-disable-next-line
      if (res.state.address !== '') {
        Object.keys(res.state.tokens).forEach((key) => {
          const tokenHash = key
          const tokenBalance = res.state.tokens[key]

          const thisToken = {}

          const req = {
            query: Buffer.from(tokenHash, 'hex'),
            network: selectedNetwork(),
          }

          Meteor.call('getObject', req, (objErr, objRes) => {
            if (err) {
              // TODO - Error handling here
              console.log('err:', objErr)
            } else {
              // Check if this is a token hash.
              // eslint-disable-next-line
              if (objRes.transaction.tx.transactionType !== 'token') {
                // TODO - Error handling here
              } else {
                const tokenDetails = objRes.transaction.tx.token

                thisToken.hash = tokenHash
                thisToken.name = bytesToString(tokenDetails.name)
                thisToken.symbol = bytesToString(tokenDetails.symbol) // eslint-disable-next-line
                thisToken.balance = tokenBalance / Math.pow(10, tokenDetails.decimals)
                thisToken.decimals = tokenDetails.decimals
                tokensHeld.push(thisToken)

                Session.set('tokensHeld', tokensHeld)
              }
            }
          })
        })
      }
    }
  })
  $('#tokenBalancesLoading').hide()
}

updateBalanceField = () => {
  try {
    const selectedType = document.getElementById('amountType').value

    // Quanta Balances
    if (selectedType === 'quanta') {
      Session.set('balanceAmount', Session.get('transferFromBalance'))
      Session.set('balanceSymbol', 'Quanta')
      $('#showMessageField').show()
    } else {
      $('#showMessageField').hide()
      // First extract the token Hash
      const tokenHash = selectedType.split('-')[1]

      // Now calculate the token balance.
      _.each(Session.get('tokensHeld'), (token) => {
        if (token.hash === tokenHash) {
          Session.set('balanceAmount', token.balance)
          Session.set('balanceSymbol', token.symbol)
        }
      })
    }
  } catch (error) {
    // not in main transfer page, so use transferFromBalance session
    Session.set('balanceAmount', Session.get('transferFromBalance'))
    Session.set('balanceSymbol', 'Quanta')
  }
}

refreshTransferPage = (callback) => {
  resetLocalStorageState()

  // Wait for QRLLIB to load
  waitForQRLLIB(function () {
    // Set transfer from address
    Session.set('transferFromAddress', getXMSSDetails().address)
    // Get Tokens and Balances
    getTokenBalances(getXMSSDetails().address, function () {
      // Update balance field
      updateBalanceField()

      $('#tokenBalancesLoading').hide()

      // Render dropdown
      $('.ui.dropdown').dropdown()
    })
    // Get address balance
    getBalance(getXMSSDetails().address, function () {
      // Load Wallet Transactions
      const addressState = Session.get('address')
      const numPages = Math.ceil(addressState.state.transaction_hash_count / 10)
      const pages = []
      while (pages.length !== numPages) {
        pages.push({
          number: pages.length + 1,
          from: ((pages.length + 1) * 10) + 1,
          to: ((pages.length + 1) * 10) + 10,
        })
      }
      Session.set('pages', pages)
      Session.set('active', 1)
      Session.set('fetchedTx', false)
      loadAddressTransactions(getXMSSDetails().address, 1)
      callback()
    })
  })
}

ledgerHasNoTokenSupport = () => {
  // Ledger Nano not supported here.
  if (getXMSSDetails().walletType === 'ledger') {
    $('#ledgerNotSupported').modal('transition', 'disable')
      .modal({
        onApprove: () => {
          const reloadPath = FlowRouter.path('/transfer', {})
          FlowRouter.go(reloadPath)
        },
        onHide: () => {
          const reloadPath = FlowRouter.path('/transfer', {})
          FlowRouter.go(reloadPath)
        },
        onDeny: () => {
          const reloadPath = FlowRouter.path('/transfer', {})
          FlowRouter.go(reloadPath)
        },
      }).modal('show')
  }
}

// Reset wallet localstorage state
resetLocalStorageState = () => {
  Session.set('address', '')
  Session.set('addressFormat', 'hex')
  Session.set('addressTransactions', '')
  Session.set('transferFromAddress', '')
  Session.set('transferFromBalance', '')
  Session.set('transferFromTokenState', '')
  Session.set('xmssHeight', '')
  Session.set('tokensHeld', '')
  Session.set('otsKeyEstimate', '')
  Session.set('balanceAmount', '')
  Session.set('balanceSymbol', '')
  Session.set('otsBitfield', '')
  Session.set('active', 1)
  Session.set('pages', [])
}

function logRequestResponse(request, response) {
  console.log('DEBUG - Invalid Request and Response Identified')
  console.log('---Request---')
  console.log(request)
  console.log('---Response---')
  console.log(response)
  console.log('---END---')
}

// Function to validate that request and response payloads of transactions match the user intention
nodeReturnedValidResponse = (request, response, type, tokenDecimals = 0) => {
  // First validate fields shared across all transaction types
  // Validate fee
  if ((request.fee / SHOR_PER_QUANTA) !== response.fee) {
    console.log('Transaction Validation - Fee mismatch')
    logRequestResponse(request, response)
    return false
  }

  // Validate that the request payload matches the response data for a standard transaction
  if (type === 'transferCoins') {
    // Validate From address
    if (!Buffer.from(request.fromAddress).equals(Buffer.from(response.from))) {
      console.log('Transaction Validation - From address mismatch')
      logRequestResponse(request, response)
      return false
    }

    // Validate output (to addresses and amounts)
    // Modify structure of request payload to match response payload
    const requestOutputs = []
    for (let i = 0; i < request.addresses_to.length; i += 1) {
      const thisOutput = {
        address: request.addresses_to[i],
        amount: request.amounts[i] / SHOR_PER_QUANTA,
      }
      requestOutputs.push(thisOutput)
    }

    // Now check count of outputs on request and response matches
    if (requestOutputs.length !== response.outputs.length) {
      console.log('Transaction Validation - Outputs length mismatch')
      logRequestResponse(request, response)
      return false
    }

    // Now check that all outputs are identical
    for (let i = 0; i < requestOutputs.length; i += 1) {
      if (!Buffer.from(requestOutputs[i].address).equals(Buffer.from(response.outputs[i].address))) { // eslint-disable-line
        console.log('Transaction Validation - Output address mismatch')
        logRequestResponse(request, response)
        return false
      }
      if (requestOutputs[i].amount !== response.outputs[i].amount) {
        console.log('Transaction Validation - Output amount mismatch')
        logRequestResponse(request, response)
        return false
      }
    }

    // If we got here, everything matches the request
    return true
  // Validate that the request payload matches the response data for a token transfer transaction
  } else if (type === 'createTokenTransferTxn') { // eslint-disable-line
    // Validate From address
    if (!Buffer.from(request.addressFrom).equals(Buffer.from(response.from))) {
      console.log('Transaction Validation - From address mismatch')
      logRequestResponse(request, response)
      return false
    }

    // Validate token hash
    if (bytesToString(request.tokenHash) !== Buffer.from(response.tokenHash).toString('hex')) {
      console.log('Transaction Validation - Token Hash mismatch')
      logRequestResponse(request, response)
      return false
    }

    // Validate output (to addresses and amounts)
    // Modify structure of request payload to match response payload
    const requestOutputs = []
    for (let i = 0; i < request.addresses_to.length; i += 1) {
      const thisOutput = {
        address: request.addresses_to[i],
        amount: request.amounts[i] / Math.pow(10, tokenDecimals), // eslint-disable-line
      }
      requestOutputs.push(thisOutput)
    }

    // Now check count of outputs on request and response matches
    if (requestOutputs.length !== response.outputs.length) {
      console.log('Transaction Validation - Outputs length mismatch')
      logRequestResponse(request, response)
      return false
    }

    // Now check that all outputs are identical
    for (let i = 0; i < requestOutputs.length; i += 1) {
      if (!Buffer.from(requestOutputs[i].address).equals(Buffer.from(response.outputs[i].address))) { // eslint-disable-line
        console.log('Transaction Validation - Output address mismatch')
        logRequestResponse(request, response)
        return false
      }
      if (requestOutputs[i].amount !== response.outputs[i].amount) {
        console.log('Transaction Validation - Output amount mismatch')
        logRequestResponse(request, response)
        return false
      }
    }
    // If we got here, everything matches the request
    return true
  // Validate that the request payload matches the response data for a token creation transaction
  } else if (type === 'createTokenTxn') {
    // Validate From address
    if (!Buffer.from(request.addressFrom).equals(Buffer.from(response.from))) {
      console.log('Transaction Validation - From address mismatch')
      logRequestResponse(request, response)
      return false
    }

    // Validate Owner address
    if (!Buffer.from(request.owner).equals(Buffer.from(response.owner))) {
      console.log('Transaction Validation - Owner address mismatch')
      logRequestResponse(request, response)
      return false
    }

    // Validate Token Symbol
    if (bytesToString(request.symbol) !== response.symbol) {
      console.log('Transaction Validation - Token symbol mismatch')
      logRequestResponse(request, response)
      return false
    }

    // Validate Token Name
    if (bytesToString(request.name) !== response.name) {
      console.log('Transaction Validation - Token name mismatch')
      logRequestResponse(request, response)
      return false
    }

    // Validate Token decimals
    if (request.decimals !== response.decimals) {
      console.log('Transaction Validation - Token decimals mismatch')
      logRequestResponse(request, response)
      return false
    }

    // Now check count of initial balances
    if (request.initialBalances.length !== response.initialBalances.length) {
      console.log('Transaction Validation - Initial balances length mismatch')
      logRequestResponse(request, response)
      return false
    }

    // Now check that all initial balances  are identical
    for (let i = 0; i < request.initialBalances.length; i += 1) {
      if (!Buffer.from(request.initialBalances[i].address).equals(Buffer.from(response.initialBalances[i].address))) { //eslint-disable-line
        console.log('Transaction Validation - Initial balance address mismatch')
        logRequestResponse(request, response)
        return false
      }
      if (request.initialBalances[i].amount !== parseInt(response.initialBalances[i].amount, 10)) {
        console.log('Transaction Validation - Initial balance amount mismatch')
        logRequestResponse(request, response)
        return false
      }
    }

    // If we got here, everything matches the request
    return true
  } else if (type === 'createMessageTxn') {
    // Validate Message
    if (bytesToString(request.message) !== response.message) {
      console.log('Transaction Validation - Message mismatch')
      logRequestResponse(request, response)
      return false
    }

    // If we got here, everything matches the request
    return true
  } else if (type === 'createGithubTxn') {
    // Validate Message
    if (bytesToString(request.message) !== response.message) {
      console.log('Transaction Validation - Github Message mismatch')
      logRequestResponse(request, response)
      return false
    }

    // If we got here, everything matches the request
    return true
  } else if (type === 'createKeybaseTxn') {
    // Validate Message
    if (bytesToString(request.message) !== response.message) {
      console.log('Transaction Validation - Keybase Message mismatch')
      logRequestResponse(request, response)
      return false
    }

    // If we got here, everything matches the request
    return true
  } else if (type === 'multiSigCreate') {
    if (!Buffer.from(request.master_addr).equals(Buffer.from(response.from))) {
      console.log('Transaction Validation - Creator mismatch')
      logRequestResponse(request, response)
      return false
    }
    let testOutputs = true
    _.each(request.signatories, (item, index) => {
      if (!Buffer.from(item).equals(Buffer.from(response.outputs[index].address))) {
        console.log('Transaction Validation - Signatories mismatch')
        logRequestResponse(request, response)
        testOutputs = false
      }
      if (request.weights[index] !== response.outputs[index].weight) {
        console.log('Transaction Validation - Weights mismatch')
        logRequestResponse(request, response)
        testOutputs = false
      }
    })
    if (testOutputs === false) { return false }
    if (request.threshold !== response.threshold) {
      console.log('Transaction Validation - Threshold mismatch')
      logRequestResponse(request, response)
      testOutputs = false
    }
    if (!Buffer.from(request.xmssPk).equals(Buffer.from(response.xmssPk))) {
      console.log('Transaction Validation - XMSS PK mismatch')
      logRequestResponse(request, response)
      return false
    }
    // if we've made it here all the MS_CREATE details match
    return true
  } else if (type === 'multiSigSpend') {
    if (!Buffer.from(request.multi_sig_address).equals(Buffer.from(response.multi_sig_address))) {
      console.log('Transaction Validation - Multisig Address mismatch')
      logRequestResponse(request, response)
      return false
    }
    if (!Buffer.from(request.master_addr).equals(Buffer.from(response.from))) {
      console.log('Transaction Validation - Creator mismatch')
      logRequestResponse(request, response)
      return false
    }
    let testOutputs = true
    _.each(request.addrs_to, (item, index) => {
      if (!Buffer.from(item).equals(Buffer.from(response.outputs[index].address))) {
        console.log('Transaction Validation - Recipient address mismatch')
        logRequestResponse(request, response)
        testOutputs = false
      }
      if (request.amounts[index] !== parseInt(response.outputs[index].amount, 10)) {
        console.log('Transaction Validation - Send amount mismatch')
        logRequestResponse(request, response)
        testOutputs = false
      }
    })
    if (testOutputs === false) { return false }
    if (request.expiry_block_number !== parseInt(response.expiry_block_number, 10)) {
      console.log('Transaction Validation - Expiry block number mismatch')
      logRequestResponse(request, response)
      return false
    }
    if (!Buffer.from(request.xmssPk).equals(Buffer.from(response.xmssPk))) {
      console.log('Transaction Validation - XMSS PK mismatch')
      logRequestResponse(request, response)
      return false
    }
    // if we've made it here all the MS_SPEND details match
    return true
  } else if (type === 'multiSigVote') {
    if (!Buffer.from(request.master_addr).equals(Buffer.from(response.from))) {
      console.log('Transaction Validation - Creator mismatch')
      logRequestResponse(request, response)
      return false
    }
    if (!Buffer.from(request.shared_key).equals(Buffer.from(response.shared_key))) {
      console.log('Transaction Validation - Shared key mismatch')
      logRequestResponse(request, response)
      return false
    }
    if (request.unvote !== response.unvote) {
      console.log('Transaction Validation - Vote status [unvote flag] mismatch')
      logRequestResponse(request, response)
      return false
    }
    if (!Buffer.from(request.xmssPk).equals(Buffer.from(response.xmssPk))) {
      console.log('Transaction Validation - XMSS PK mismatch')
      logRequestResponse(request, response)
      return false
    }
    // if we've made it here all the MS_VOTE details match
    return true
  }

  // We should not get this far - return false as failsafe
  return false
}

export function checkIfLedgerTreesMatch() {
  const appLedger = hexOrB32(Session.get('transferFromAddress'))
  console.log('appLedger', appLedger)
  console.log('-- Getting QRL Ledger Nano Public Key --')
  if (isElectrified()) {
    Meteor.call('ledgerPublicKey', [], (err, data) => {
      console.log('> Got Ledger Public Key from USB')
      // Convert Uint to hex
      const pkHex = Buffer.from(data.public_key).toString('hex')
      // Get address from pk
      const qAddress = QRLLIB.getAddress(pkHex)
      const ledgerQAddress = `Q${qAddress}`
      console.log(ledgerQAddress)
      if (appLedger !== ledgerQAddress) {
        console.log('Trees switched: logout!')
        Session.set('closedWithError', 'XMSS-trees-change')
        FlowRouter.go('/close')
      }
      // callback(null, data)
    })
  } else {
    createTransport().then(QrlLedger => {
      QrlLedger.publickey().then(data => {
        if (ledgerReturnedError()) {
          console.log('-- Ledger error --')
        } else {
          console.log('> Got Ledger Public Key from WebUSB')
          // Convert Uint to hex
          const pkHex = Buffer.from(data.public_key).toString('hex')
          // Get address from pk
          const qAddress = QRLLIB.getAddress(pkHex)
          const ledgerQAddress = `Q${qAddress}`
          console.log(ledgerQAddress)
          if (appLedger !== ledgerQAddress) {
            console.log('Trees switched: logout!')
            Session.set('closedWithError', 'XMSS-trees-change')
            FlowRouter.go('/close')
          }
          // callback(null, data)
        }
      }, e => {
        console.log(`-- Ledger error: ${e} --`)
      }).catch(e => {
        console.log(`-- Ledger error: ${e} --`)
      }).catch(e => {
        console.log(`-- Ledger error: ${e} --`)
      })
    }, e => {
      console.log(`-- Ledger error: ${e} --`)
    })
  }
}
