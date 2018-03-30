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

      // Collect next OTS key
      LocalStore.set('otsKeyEstimate', res.ots.nextKey)

      // Callback if set
      callBack()
    }
  })
}

loadAddressTransactions = (txArray) => {
  const request = {
    tx: txArray,
    grpc: findNodeData(DEFAULT_NODES, selectedNode()).grpc,
  }

  LocalStore.set('addressTransactions', [])
  $('#loadingTransactions').show()
  
  Meteor.call('addressTransactions', request, (err, res) => {
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
        let tokensHeld = []
        
        // Now for each res.state.token we find, go discover token name and symbol
        for (let i in res.state.tokens) {
          const tokenHash = i
          const tokenBalance = res.state.tokens[i]

          let thisToken = {}

          const grpcEndpoint = findNodeData(DEFAULT_NODES, selectedNode()).grpc
          const request = {
            query: tokenHash,
            grpc: grpcEndpoint,
          }

          Meteor.call('getTxnHash', request, (err, res) => {
            if (err) {
              // TODO - Error handling here
              console.log('err:',err)
            } else {
              // Check if this is a token hash.
              if (res.transaction.tx.transactionType !== "token") {
                // TODO - Error handling here
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

refreshTransferPage = () => {
  resetLocalStorageState()

  // Wait for QRLLIB to load
  waitForQRLLIB(function () {
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
