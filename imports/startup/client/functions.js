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

  const thisHexSeed = QRLLIB.bin2hstr(thisRandomSeed)
  const thisMnemonic = QRLLIB.bin2mnemonic(thisRandomSeed)

  const xmssDetail = {
    address: thisAddress,
    hexseed: thisHexSeed,
    mnemonic: thisMnemonic,
    index: 0,
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