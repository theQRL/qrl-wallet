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
