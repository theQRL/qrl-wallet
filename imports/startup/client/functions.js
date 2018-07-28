import qrlAddressValdidator from '@theqrl/validate-qrl-address'
import async from 'async'

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

// Fetchs XMSS details from the global XMSS_OBJECT variable or saved ledger values
getXMSSDetails = () => {
  const walletStatus = LocalStore.get('walletStatus')
  let xmssDetail

  if(walletStatus.walletType == 'ledger') {
    const thisAddress = walletStatus.address
    const thisPk = walletStatus.pubkey
    const thisHashFunction = QRLLIB.getHashFunction(thisAddress)
    const thisSignatureType = QRLLIB.getSignatureType(thisAddress)
    const thisHeight = QRLLIB.getHeight(thisAddress)
    const thisHexSeed = null
    const thisMnemonic = null

    xmssDetail = {
      address: thisAddress,
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
    const thisHashFunction = QRLLIB.getHashFunction(thisAddress)
    const thisSignatureType = QRLLIB.getSignatureType(thisAddress)
    const thisHeight = XMSS_OBJECT.getHeight()
    const thisHexSeed = XMSS_OBJECT.getHexSeed()
    const thisMnemonic = XMSS_OBJECT.getMnemonic()

    xmssDetail = {
      address: thisAddress,
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
  LocalStore.set('walletStatus', status)
}

signWithLedger = (message, callback) => {
  let signature = new Uint8Array()

  async.waterfall([
    // Call the QrlLedger.sign function with message to sign
    function(cb) {
      console.log('async - sign')
      let signMe = binaryToBytes(message)

      QrlLedger.sign(signMe).then(data => {
        console.log('sign response: ', data)
        cb(null, data)
      })
    },
    // signNext - 1/11
    function(data, cb) {
      console.log('async - signNext 1')
      // Add last signature chunk to array.
      signature = concatenateTypedArrays(
        Uint8Array,
          signature,
          data.signature_chunk
      )
      // Now get next Signature chunk
      QrlLedger.signNext().then(data => {
        console.log('signNext response: ', data)
        cb(null, data)
      })
    },
    // signNext - 2/11
    function(data, cb) {
      console.log('async - signNext 2')
      // Add last signature chunk to array.
      signature = concatenateTypedArrays(
        Uint8Array,
          signature,
          data.signature_chunk
      )
      // Now get next Signature chunk
      QrlLedger.signNext().then(data => {
        console.log('signNext response: ', data)
        cb(null, data)
      })
    },
    // signNext - 3/11
    function(data, cb) {
      console.log('async - signNext 3')
      // Add last signature chunk to array.
      signature = concatenateTypedArrays(
        Uint8Array,
          signature,
          data.signature_chunk
      )
      // Now get next Signature chunk
      QrlLedger.signNext().then(data => {
        console.log('signNext response: ', data)
        cb(null, data)
      })
    },
    // signNext - 4/11
    function(data, cb) {
      console.log('async - signNext 4')
      // Add last signature chunk to array.
      signature = concatenateTypedArrays(
        Uint8Array,
          signature,
          data.signature_chunk
      )
      // Now get next Signature chunk
      QrlLedger.signNext().then(data => {
        console.log('signNext response: ', data)
        cb(null, data)
      })
    },
    // signNext - 5/11
    function(data, cb) {
      console.log('async - signNext 5')
      // Add last signature chunk to array.
      signature = concatenateTypedArrays(
        Uint8Array,
          signature,
          data.signature_chunk
      )
      // Now get next Signature chunk
      QrlLedger.signNext().then(data => {
        console.log('signNext response: ', data)
        cb(null, data)
      })
    },
    // signNext - 6/11
    function(data, cb) {
      console.log('async - signNext 6')
      // Add last signature chunk to array.
      signature = concatenateTypedArrays(
        Uint8Array,
          signature,
          data.signature_chunk
      )
      // Now get next Signature chunk
      QrlLedger.signNext().then(data => {
        console.log('signNext response: ', data)
        cb(null, data)
      })
    },
    // signNext - 7/11
    function(data, cb) {
      console.log('async - signNext 7')
      // Add last signature chunk to array.
      signature = concatenateTypedArrays(
        Uint8Array,
          signature,
          data.signature_chunk
      )
      // Now get next Signature chunk
      QrlLedger.signNext().then(data => {
        console.log('signNext response: ', data)
        cb(null, data)
      })
    },
    // signNext - 8/11
    function(data, cb) {
      console.log('async - signNext 8')
      // Add last signature chunk to array.
      signature = concatenateTypedArrays(
        Uint8Array,
          signature,
          data.signature_chunk
      )
      // Now get next Signature chunk
      QrlLedger.signNext().then(data => {
        console.log('signNext response: ', data)
        cb(null, data)
      })
    },
    // signNext - 9/11
    function(data, cb) {
      console.log('async - signNext 9')
      // Add last signature chunk to array.
      signature = concatenateTypedArrays(
        Uint8Array,
          signature,
          data.signature_chunk
      )
      // Now get next Signature chunk
      QrlLedger.signNext().then(data => {
        console.log('signNext response: ', data)
        cb(null, data)
      })
    },
    // signNext - 10/11
    function(data, cb) {
      console.log('async - signNext 10')
      // Add last signature chunk to array.
      signature = concatenateTypedArrays(
        Uint8Array,
          signature,
          data.signature_chunk
      )
      // Now get next Signature chunk
      QrlLedger.signNext().then(data => {
        console.log('signNext response: ', data)
        cb(null, data)
      })
    },
    // signNext - 11/11
    function(data, cb) {
      console.log('async - signNext 11')
      // Add last signature chunk to array.
      signature = concatenateTypedArrays(
        Uint8Array,
          signature,
          data.signature_chunk
      )
      // Now get next Signature chunk
      QrlLedger.signNext().then(data => {
        console.log('signNext response: ', data)
        cb(null, data)
      })
    },
    // signNext - 1/11
    function(data, cb) {
      console.log('async - last capture of signature chunk')
      // Add last signature chunk to array.
      signature = concatenateTypedArrays(
        Uint8Array,
          signature,
          data.signature_chunk
      )
      cb()
    },
  ], () => {
    console.log('message signed')
    console.log(signature)
    callback(signature)
  })
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
toBigendianUint64BytesUnsigned = (input) => {
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

  const result = new Uint8Array(byteArray)
  return result
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
  if(Math.floor(value) === value) return 0
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
  if (request.network == "localhost") {
    // Override network to localhost
    request.network = 'localhost:9009'
  }
  if (request.network == "custom") {
    // Override network to localhost
    request.network = LocalStore.get('nodeGrpc')
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
      LocalStore.set('transferFromBalance', 0)
      LocalStore.set('transferFromTokenState', [])
      LocalStore.set('address', 'Error')
      LocalStore.set('otsKeyEstimate', 0)
      LocalStore.set('otsKeysRemaining', 0)
    } else {
      if (res.state.address !== '') {
        LocalStore.set('transferFromBalance', res.state.balance / SHOR_PER_QUANTA)
        LocalStore.set('transferFromTokenState', res.state.tokens)
        LocalStore.set('address', res)
      } else {
        // Wallet not found, put together an empty response
        LocalStore.set('transferFromBalance', 0)
      }

      if(getXMSSDetails().walletType == 'seed') {
        // Collect next OTS key
        LocalStore.set('otsKeyEstimate', res.ots.nextKey)

        // Get remaining OTS Keys
        const validationResult = qrlAddressValdidator.hexString(getAddress)
        const { keysConsumed } = res.ots
        const totalSignatures = validationResult.sig.number
        const keysRemaining = totalSignatures - keysConsumed

        // Set keys remaining
        LocalStore.set('otsKeysRemaining', keysRemaining)

        // Callback if set
        callBack()
      } else if(getXMSSDetails().walletType == 'ledger') {
        // Collect next OTS key from Ledger Device
        // Whilst technically we may have unused ones - we prefer to rely on state tracked in ledger device
        QrlLedger.get_state().then(data => {
          LocalStore.set('otsKeyEstimate', data.xmss_index)

          // Get remaining OTS Keys
          const validationResult = qrlAddressValdidator.hexString(getAddress)
          const totalSignatures = validationResult.sig.number
          const keysRemaining = totalSignatures - data.xmss_index

          // Set keys remaining
          LocalStore.set('otsKeysRemaining', keysRemaining)

          callBack()
        })
      }
    }
  })
}

loadAddressTransactions = (txArray) => {
  const request = {
    tx: txArray,
    network: selectedNetwork(),
  }

  LocalStore.set('addressTransactions', [])
  $('#loadingTransactions').show()
  
  wrapMeteorCall('addressTransactions', request, (err, res) => {
    if (err) {
      LocalStore.set('addressTransactions', { error: err })
    } else {
      LocalStore.set('addressTransactions', res)
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
      LocalStore.set('transferFromBalance', 0)
      LocalStore.set('transferFromTokenState', [])
      LocalStore.set('address', 'Error')
      LocalStore.set('otsKeyEstimate', 0)
      LocalStore.set('otsKeysRemaining', 0)
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
              LocalStore.set('tokensHeld', [])
            } else {
              // Check if this is a token hash.
              if (res.transaction.tx.transactionType !== "token") {
                console.log('err: ',err)
                LocalStore.set('tokensHeld', [])
              } else {
                let tokenDetails = res.transaction.tx.token

                thisToken.hash = tokenHash
                thisToken.name = bytesToString(tokenDetails.name)
                thisToken.symbol = bytesToString(tokenDetails.symbol)
                thisToken.balance = tokenBalance / Math.pow(10, tokenDetails.decimals)
                thisToken.decimals = tokenDetails.decimals

                tokensHeld.push(thisToken)

                LocalStore.set('tokensHeld', tokensHeld)
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
    LocalStore.set('balanceAmount', LocalStore.get('transferFromBalance'))
    LocalStore.set('balanceSymbol', 'Quanta')
  } else {
    // First extract the token Hash
    tokenHash = selectedType.split('-')[1]

    // Now calculate the token balance.
    _.each(LocalStore.get('tokensHeld'), (token) => {
      if(token.hash == tokenHash) {
        LocalStore.set('balanceAmount', token.balance)
        LocalStore.set('balanceSymbol', token.symbol)
      }
    })
  }
}

refreshTransferPage = (callback) => {
  resetLocalStorageState()

  // Wait for QRLLIB to load
  waitForQRLLIB(function () {
    // Set transfer from address
    LocalStore.set('transferFromAddress', getXMSSDetails().address)

    // Get address balance
    getBalance(getXMSSDetails().address, function() {
      // Load Wallet Transactions
      const addressState = LocalStore.get('address')
      const numPages = Math.ceil(addressState.state.transactions.length / 10)
      const pages = []
      while (pages.length !== numPages) {
        pages.push({
          number: pages.length + 1,
          from: ((pages.length + 1) * 10) + 1,
          to: ((pages.length + 1) * 10) + 10,
        })
      }
      LocalStore.set('pages', pages)
      let txArray = addressState.state.transactions.reverse()
      if (txArray.length > 10) {
        txArray = txArray.slice(0, 9)
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

// Reset wallet localstorage state
resetLocalStorageState = () => {
  LocalStore.set('address', '')
  LocalStore.set('addressTransactions', '')
  LocalStore.set('transferFromAddress', '')
  LocalStore.set('transferFromBalance', '')
  LocalStore.set('transferFromTokenState', '')
  LocalStore.set('xmssHeight', '')
  LocalStore.set('tokensHeld', '')
  LocalStore.set('otsKeyEstimate', '')
  LocalStore.set('balanceAmount', '')
  LocalStore.set('balanceSymbol', '')
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
    if(binaryToQrlAddress(request.fromAddress) !== response.from) {
      console.log('Transaction Validation - From address mismatch')
      logRequestResponse(request, response)
      return false
    }

    // Validate output (to addresses and amounts)
    // Modify structure of request payload to match response payload
    let request_outputs = []
    for (var i = 0; i < request.addresses_to.length; i++) {
      const thisOutput = {
        address: binaryToQrlAddress(request.addresses_to[i]),
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
      if (request_outputs[i].address !== response.outputs[i].address) {
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
    if(binaryToQrlAddress(request.addressFrom) !== response.from) {
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
        address: binaryToQrlAddress(request.addresses_to[i]),
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
      if (request_outputs[i].address !== response.outputs[i].address) {
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
    if(binaryToQrlAddress(request.addressFrom) !== response.from) {
      console.log('Transaction Validation - From address mismatch')
      logRequestResponse(request, response)
      return false
    }

    // Validate Owner address
    if(binaryToQrlAddress(request.owner) !== response.owner) {
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
      if (binaryToQrlAddress(request.initialBalances[i].address) !== 
        binaryToQrlAddress(response.initialBalances[i].address)) {
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
  }

  // We should not get this far - return false as failsafe
  return false
}
