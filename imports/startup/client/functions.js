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
selectedNode = () => {
  const selectedNode = document.getElementById('network').value
  return selectedNode
}

// Fetchs XMSS details from the global XMSS_OBJECT variable
getXMSSDetails = () => {
  const thisAddressBytes = XMSS_OBJECT.getAddress()
  const thisAddress = QRLLIB.bin2hstr(thisAddressBytes)
  const thisPk = XMSS_OBJECT.getPK()
  
  const thisHashFunction = QRLLIB.getHashFunction(thisAddressBytes)
  const thisSignatureType = QRLLIB.getSignatureType(thisAddressBytes)
  const thisHeight = QRLLIB.getHeight(thisAddressBytes)

  const thisRandomSeed = XMSS_OBJECT.getExtendedSeed()

  const thisHexSeed = QRLLIB.bin2hstr(thisRandomSeed)
  const thisMnemonic = QRLLIB.bin2mnemonic(thisRandomSeed)

  const xmssDetail = {
    address: 'Q' + thisAddress,
    pk: thisPk,
    hexseed: thisHexSeed,
    mnemonic: thisMnemonic,
    height: thisHeight,
    hashFunction: thisHashFunction,
    signatureType: thisSignatureType,
    index: 0
  }

  return xmssDetail
}

resetWalletStatus = () => {
  const status = {}
  status.colour = 'red'
  status.string = 'No wallet has been opened.'
  status.address = ''
  status.unlocked = false
  status.menuHidden = 'display: none'
  status.menuHiddenInverse = ''
  LocalStore.set('walletStatus', status)
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

// Get wallet address state details
getBalance = (getAddress, callBack) => {
  const grpcEndpoint = findNodeData(DEFAULT_NODES, selectedNode()).grpc
  const request = {
    address: addressForAPI(getAddress),
    grpc: grpcEndpoint,
  }

  Meteor.call('getAddress', request, (err, res) => {
    if (err) {
      // TODO - Error handling
    } else {
      if (res.state.address !== '') {
        LocalStore.set('transferFromBalance', res.state.balance / SHOR_PER_QUANTA)
        LocalStore.set('transferFromAddress', binaryToQrlAddress(res.state.address))
        LocalStore.set('transferFromTokenState', res.state.tokens)
        LocalStore.set('address', res)
      } else {
        // Wallet not found, put together an empty response
        LocalStore.set('transferFromBalance', 0)
        LocalStore.set('transferFromAddress', binaryToQrlAddress(getAddress))
      }

      // Rudimentary way to set otsKey
      LocalStore.set('otsKeyEstimate', res.state.txcount)

      // Callback if set
      callBack()
    }
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
