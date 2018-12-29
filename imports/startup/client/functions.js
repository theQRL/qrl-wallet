import aes256 from 'aes256'
import qrlAddressValdidator from '@theqrl/validate-qrl-address'
import helpers from '@theqrl/explorer-helpers'
/* global LocalStore */

bech32 = require('bech32')
/* global QRLLIB */
/* global XMSS_OBJECT */

// Client side function to detmine if running within Electron
isElectrified = () => {
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
  rawDescriptor = Uint8Array.from([pkRaw.get(0), pkRaw.get(1), pkRaw.get(2)])
  ePkHash = binaryToBytes(QRLLIB.sha2_256(pkRaw))  // Uint8Vector -> Uint8Array conversion
  descriptorAndHash = concatenateTypedArrays(Uint8Array, rawDescriptor, ePkHash)
  return helpers.b32Encode(descriptorAndHash)
}

// wrapper to decide if addresses should be converted to BECH32 for display
hexOrB32 = (hexAddress) => {
  if(LocalStore.get('addressFormat') === 'bech32') {
    return helpers.hexAddressToB32Address(hexAddress)
  }
  else {
    return hexAddress
  }
}

// wrapper to decide if addresses should be converted to BECH32 for display
rawToHexOrB32 = (rawAddress) => {
  if(LocalStore.get('addressFormat') === 'bech32') {
    return helpers.rawAddressToB32Address(rawAddress)
  }
  else {
    return helpers.rawAddressToHexAddress(rawAddress)
  }
}

// A Template helper cannot access the helpers for some reason, so this has to stay in qrl-wallet
anyAddressToRawAddress = (address) => {
  if ( address[0] === 'q') {
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
      mnemonic = walletObject.addresses[0].mnemonic
    }
    return mnemonic
  }
  function handleVersion0() {
    let mnemonic = ''
    if (walletObject[0].encrypted === true) {
      mnemonic = aes256.decrypt(passphrase, walletObject[0].mnemonic)
    } else {
      mnemonic = walletObject[0].mnemonic
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

  if(walletStatus.walletType == 'ledger') {
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
      (typeof wallet[0].encrypted !== 'undefined') &&
      (typeof wallet[0].addressB32 !== 'undefined') &&
      (typeof wallet[0].pk !== 'undefined')
    ) {
      if (
        (wallet[0].encrypted === true) &&
        (wallet[0].addressB32.length === 64) &&
        (wallet[0].pk.length === 134)
      ) {
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
}

passwordPolicyValid = (password) => {
  // If password length >=8, and password contains a digit and password contains a letter
  if((password.length >= 8) && (/\d/.test(password)) && (/[a-zA-Z]+/.test(password))) {
    return true
  }
  return false
}

// Wait for QRLLIB to load before running specified callback function
waitForQRLLIB = (callBack) => {
  setTimeout(() => {
    // Test the QRLLIB object has the str2bin function.
    // This is sufficient to tell us QRLLIB has loaded.
    if(typeof QRLLIB.str2bin === "function") {
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
bytesToString = (buf) => {
  return String.fromCharCode.apply(null, new Uint8Array(buf))
}

// Convert bytes to hex
bytesToHex = (byteArray) => {
  return Array.from(byteArray, function(byte) {
    return ('00' + (byte & 0xFF).toString(16)).slice(-2)
  }).join('')
}

// Convert hex to bytes
hexToBytes = (hex) => {
  return Buffer.from(hex, 'hex')
}

// Returns an address ready to send to gRPC API
addressForAPI = (address) => {
  return Buffer.from(address.substring(1), 'hex')
}

// Create human readable QRL Address from API Binary response
binaryToQrlAddress = (binary) => {
  if(binary === null) {
    return null
  } else {
    return 'Q' + Buffer.from(binary).toString('hex')
  }
}

// Take input and convert to unsigned uint64 bigendian bytes
toBigendianUint64BytesUnsigned = (input, bufferResponse = false) => {
  if(!Number.isInteger(input)) {
    input = parseInt(input)
  }

  const byteArray = [0, 0, 0, 0, 0, 0, 0, 0]

  for ( let index = 0; index < byteArray.length; index ++ ) {
    const byte = input & 0xff
    byteArray[index] = byte
    input = (input - byte) / 256
  }

  byteArray.reverse()

  if(bufferResponse == true) {
    let result = Buffer.from(byteArray)
    return result
  } else {
    let result = new Uint8Array(byteArray)
    return result
  }
}

toUint8Vector = (arr) => {
  let vec = new QRLLIB.Uint8Vector()
  for (let i = 0; i < arr.length; i++) {
    vec.push_back(arr[i])
  }
  return vec
}

// Concatenates multiple typed arrays into one.
concatenateTypedArrays = (resultConstructor, ...arrays) => {
    let totalLength = 0
    for (let arr of arrays) {
      totalLength += arr.length
    }
    let result = new resultConstructor(totalLength)
    let offset = 0
    for (let arr of arrays) {
      result.set(arr, offset)
      offset += arr.length
    }
    return result
}

// Count decimals in value
countDecimals = (value) => {
  if(Math.floor(value) === Number(value)) return 0
  return value.toString().split(".")[1].length || 0
}

// Check if users web browser supports Web Assemblies
supportedBrowser = () => {
  try {
    if (typeof WebAssembly === "object"
      && typeof WebAssembly.instantiate === "function") {
      const module = new WebAssembly.Module(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00))
      if (module instanceof WebAssembly.Module)
          return new WebAssembly.Instance(module) instanceof WebAssembly.Instance
    }
  } catch (e) {
  }
  return false
}


// Wrapper for Meteor.call
wrapMeteorCall = (method, request, callback) => {
  // Modify network to gRPC endpoint for custom/localhost settings
  if (request.network === "localhost") {
    // Override network to localhost
    request.network = 'localhost:19009'
  }
  if (request.network === "custom") {
    // Override network to localhost
    request.network = LocalStore.get('customNodeGrpc')
  }

  Meteor.call(method, request, (err, res) => {
    callback(err, res)
  })
}

// Get wallet address state details
getBalance = (getAddress, callBack) => {
  const request = {
    address: addressForAPI(getAddress),
    network: selectedNetwork(),
  }

  wrapMeteorCall('getAddress', request, (err, res) => {
    if (err) {
      console.log('err: ',err)
      Session.set('transferFromBalance', 0)
      Session.set('transferFromTokenState', [])
      Session.set('address', 'Error')
      Session.set('otsKeyEstimate', 0)
      Session.set('otsKeysRemaining', 0)
      Session.set('otsBitfield', {})
    } else {
      if (res.state.address !== '') {
        Session.set('transferFromBalance', res.state.balance / SHOR_PER_QUANTA)
        Session.set('transferFromTokenState', res.state.tokens)
        Session.set('address', res)
      } else {
        // Wallet not found, put together an empty response
        Session.set('transferFromBalance', 0)
      }

      if(getXMSSDetails().walletType == 'seed') {
        // Collect next OTS key
        Session.set('otsKeyEstimate', res.ots.nextKey)

        // Get remaining OTS Keys
        const validationResult = qrlAddressValdidator.hexString(getAddress)
        const { keysConsumed } = res.ots
        const totalSignatures = validationResult.sig.number
        const keysRemaining = totalSignatures - keysConsumed

        // Set keys remaining
        Session.set('otsKeysRemaining', keysRemaining)

        // Store OTS Bitfield in session
        Session.set('otsBitfield', res.ots.keys)

        // Callback if set
        callBack()
      } else if(getXMSSDetails().walletType == 'ledger') {
        // Collect next OTS key from Ledger Device
        // Whilst technically we may have unused ones - we prefer to rely on state tracked in ledger device
        QrlLedger.get_state().then(data => {
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
  })
}

otsIndexUsed = (otsBitfield, index) => {
  if(otsBitfield[index] === 1) {
    return true
  }
  return false
}

loadAddressTransactions = (txArray) => {
  const request = {
    tx: txArray,
    network: selectedNetwork(),
  }

  Session.set('addressTransactions', [])
  $('#loadingTransactions').show()
  
  wrapMeteorCall('addressTransactions', request, (err, res) => {
    if (err) {
      Session.set('addressTransactions', { error: err })
    } else {
      Session.set('addressTransactions', res)
      $('#loadingTransactions').hide()
      $('#noTransactionsFound').show()
    }
  })
}

getTokenBalances = (getAddress, callback) => {
  const request = {
    address: addressForAPI(getAddress),
    network: selectedNetwork(),
  }

  wrapMeteorCall('getAddress', request, (err, res) => {
    if (err) {
      console.log('err: ',err)
      Session.set('transferFromBalance', 0)
      Session.set('transferFromTokenState', [])
      Session.set('address', 'Error')
      Session.set('otsKeyEstimate', 0)
      Session.set('otsKeysRemaining', 0)
    } else {
      if (res.state.address !== '') {
        let tokensHeld = []
        
        // Now for each res.state.token we find, go discover token name and symbol
        for (let i in res.state.tokens) {
          const tokenHash = i
          const tokenBalance = res.state.tokens[i]

          let thisToken = {}

          const request = {
            query: tokenHash,
            network: selectedNetwork(),
          }

          wrapMeteorCall('getTxnHash', request, (err, res) => {
            if (err) {
              console.log('err:',err)
              Session.set('tokensHeld', [])
            } else {
              // Check if this is a token hash.
              if (res.transaction.tx.transactionType !== "token") {
                console.log('err: ',err)
                Session.set('tokensHeld', [])
              } else {
                let tokenDetails = res.transaction.tx.token

                thisToken.hash = tokenHash
                thisToken.name = bytesToString(tokenDetails.name)
                thisToken.symbol = bytesToString(tokenDetails.symbol)
                thisToken.balance = tokenBalance / Math.pow(10, tokenDetails.decimals)
                thisToken.decimals = tokenDetails.decimals

                tokensHeld.push(thisToken)

                Session.set('tokensHeld', tokensHeld)
              }
            }
          })
        }
        callback()

        // When done hide loading section
        $('#loading').hide()
      } else {
        // Wallet not found, put together an empty response
        callback()
      }
    }
  })
}

updateBalanceField = () => {
  const selectedType = document.getElementById('amountType').value

  // Quanta Balances
  if(selectedType == 'quanta') {
    Session.set('balanceAmount', Session.get('transferFromBalance'))
    Session.set('balanceSymbol', 'Quanta')
  } else {
    // First extract the token Hash
    tokenHash = selectedType.split('-')[1]

    // Now calculate the token balance.
    _.each(Session.get('tokensHeld'), (token) => {
      if(token.hash == tokenHash) {
        Session.set('balanceAmount', token.balance)
        Session.set('balanceSymbol', token.symbol)
      }
    })
  }
}

refreshTransferPage = (callback) => {
  resetLocalStorageState()

  // Wait for QRLLIB to load
  waitForQRLLIB(function () {
    // Set transfer from address
    Session.set('transferFromAddress', getXMSSDetails().address)

    // Get address balance
    getBalance(getXMSSDetails().address, function() {
      // Load Wallet Transactions
      const addressState = Session.get('address')
      const numPages = Math.ceil(addressState.state.transactions.length / 10)
      const pages = []
      while (pages.length !== numPages) {
        pages.push({
          number: pages.length + 1,
          from: ((pages.length + 1) * 10) + 1,
          to: ((pages.length + 1) * 10) + 10,
        })
      }
      Session.set('pages', pages)
      let txArray = addressState.state.transactions.reverse()
      if (txArray.length > 10) {
        txArray = txArray.slice(0, 10)
      }
      loadAddressTransactions(txArray)

      callback()
    })

    // Get Tokens and Balances
    getTokenBalances(getXMSSDetails().address, function() {
      // Update balance field
      updateBalanceField()
      
      $('#tokenBalancesLoading').hide()
      
      // Render dropdown
      $('.ui.dropdown').dropdown()
    })
  })
}

ledgerHasNoTokenSupport = () => {
  // Ledger Nano not supported here.
  if (getXMSSDetails().walletType === 'ledger') {
    $('#ledgerNotSupported').modal('transition', 'disable')
    .modal({
      onApprove: () => {
        //$('#ledgerNotSupported').modal('transition', 'disable').modal('hide')
        const reloadPath = FlowRouter.path('/transfer', {})
        FlowRouter.go(reloadPath)
      },
      onHide: () => {
        //$('#ledgerNotSupported').modal('transition', 'disable').modal('hide')
        const reloadPath = FlowRouter.path('/transfer', {})
        FlowRouter.go(reloadPath)
      },
      onDeny: () => {
        //$('#ledgerNotSupported').modal('transition', 'disable').modal('hide')
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
    if(!Buffer.from(request.fromAddress).equals(Buffer.from(response.from))) {
      console.log('Transaction Validation - From address mismatch')
      logRequestResponse(request, response)
      return false
    }

    // Validate output (to addresses and amounts)
    // Modify structure of request payload to match response payload
    let request_outputs = []
    for (var i = 0; i < request.addresses_to.length; i++) {
      const thisOutput = {
        address: request.addresses_to[i],
        amount: request.amounts[i] / SHOR_PER_QUANTA
      }
      request_outputs.push(thisOutput)
    }

    // Now check count of outputs on request and response matches
    if (request_outputs.length !== response.outputs.length) {
      console.log('Transaction Validation - Outputs length mismatch')
      logRequestResponse(request, response)
      return false
    }

    // Now check that all outputs are identical
    for (var i = 0; i < request_outputs.length; i++) {
      if (!Buffer.from(request_outputs[i].address).equals(Buffer.from(response.outputs[i].address))) {
        console.log('Transaction Validation - Output address mismatch')
        logRequestResponse(request, response)
        return false
      }
      if (request_outputs[i].amount !== response.outputs[i].amount) {
        console.log('Transaction Validation - Output amount mismatch')
        logRequestResponse(request, response)
        return false
      }
    }

    // If we got here, everything matches the request
    return true
  // Validate that the request payload matches the response data for a token transfer transaction
  } else if (type === 'createTokenTransferTxn') {
    // Validate From address
    if(!Buffer.from(request.addressFrom).equals(Buffer.from(response.from))) {
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
    let request_outputs = []
    for (var i = 0; i < request.addresses_to.length; i++) {
      const thisOutput = {
        address: request.addresses_to[i],
        amount: request.amounts[i] / Math.pow(10, tokenDecimals)
      }
      request_outputs.push(thisOutput)
    }

    // Now check count of outputs on request and response matches
    if (request_outputs.length !== response.outputs.length) {
      console.log('Transaction Validation - Outputs length mismatch')
      logRequestResponse(request, response)
      return false
    }

    // Now check that all outputs are identical
    for (var i = 0; i < request_outputs.length; i++) {
      if (!Buffer.from(request_outputs[i].address).equals(Buffer.from(response.outputs[i].address))) {
        console.log('Transaction Validation - Output address mismatch')
        logRequestResponse(request, response)
        return false
      }
      if (request_outputs[i].amount !== response.outputs[i].amount) {
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
    if(!Buffer.from(request.addressFrom).equals(Buffer.from(response.from))) {
      console.log('Transaction Validation - From address mismatch')
      logRequestResponse(request, response)
      return false
    }

    // Validate Owner address
    if(!Buffer.from(request.owner).equals(Buffer.from(response.owner))) {
      console.log('Transaction Validation - Owner address mismatch')
      logRequestResponse(request, response)
      return false
    }

    // Validate Token Symbol
    if(bytesToString(request.symbol) !== response.symbol) {
      console.log('Transaction Validation - Token symbol mismatch')
      logRequestResponse(request, response)
      return false
    }

    // Validate Token Name
    if(bytesToString(request.name) !== response.name) {
      console.log('Transaction Validation - Token name mismatch')
      logRequestResponse(request, response)
      return false
    }

    // Validate Token decimals
    if(request.decimals !== response.decimals) {
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
    for (var i = 0; i < request.initialBalances.length; i++) {
      if (!Buffer.from(request.initialBalances[i].address).equals(Buffer.from(response.initialBalances[i].address))) {
        console.log('Transaction Validation - Initial balance address mismatch')
        logRequestResponse(request, response)
        return false
      }
      if (request.initialBalances[i].amount !== parseInt(response.initialBalances[i].amount)) {
        console.log('Transaction Validation - Initial balance amount mismatch')
        logRequestResponse(request, response)
        return false
      }
    }

    // If we got here, everything matches the request
    return true
  } else if (type === 'createMessageTxn') {
    // Validate Message
    if(bytesToString(request.message) !== response.message) {
      console.log('Transaction Validation - Message mismatch')
      logRequestResponse(request, response)
      return false
    } 

    // If we got here, everything matches the request
    return true
  } else if (type === 'createKeybaseTxn') {
    // Validate Message
    if(bytesToString(request.message) !== response.message) {
      console.log('Transaction Validation - Message mismatch')
      logRequestResponse(request, response)
      return false
    } 

    // If we got here, everything matches the request
    return true
  }

  // We should not get this far - return false as failsafe
  return false
}
