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
  const thisAddress = XMSS_OBJECT.getAddress()
  const thisRandomSeed = XMSS_OBJECT.getSeed()
  const thisHeight = XMSS_OBJECT.getHeight()

  const thisHexSeed = QRLLIB.bin2hstr(thisRandomSeed)
  const thisMnemonic = QRLLIB.bin2mnemonic(thisRandomSeed)

  const xmssDetail = {
    address: thisAddress,
    hexseed: thisHexSeed,
    mnemonic: thisMnemonic,
    height: thisHeight,
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
  // Convert Binary to Bytes
  const thisBytes = new Uint8Array(convertMe.size())
  for (let i = 0; i < convertMe.size(); i += 1) {
    thisBytes[i] = convertMe.get(i)
  }
  return thisBytes
}

// Get wallet address state details
getBalance = (getAddress) => {
  const grpcEndpoint = findNodeData(DEFAULT_NODES, selectedNode()).grpc
  const request = {
    address: stringToBytes(getAddress),
    grpc: grpcEndpoint,
  }

  Meteor.call('getAddress', request, (err, res) => {
    if (err) {
      // TODO - Error handling
    } else {
      if (res.state.address !== '') {
        LocalStore.set('transferFromBalance', res.state.balance / SHOR_PER_QUANTA)
        LocalStore.set('transferFromAddress', new TextDecoder('utf-8').decode(res.state.address))
        LocalStore.set('transferFromTokenState', res.state.tokens)
      } else {
        // Wallet not found, put together an empty response
        LocalStore.set('transferFromBalance', 0)
        LocalStore.set('transferFromAddress', new TextDecoder('utf-8').decode(getAddress))
      }

      // Rudimentary way to set otsKey
      LocalStore.set('otsKeyEstimate', res.state.txcount)
    }
  })
}

