// Import modules used by both client and server through a single index entry point
import './nodes.js'

// Define amount of SHOR contained per QUANTA (10^9)
SHOR_PER_QUANTA=1000000000

// qrl-wallet Version
WALLET_VERSION="1.0.2"

// qrl.proto sha256 sum for each release of QRL Node
QRLPROTO_SHA256 = [
  {
    version: "1.0.0",
    sha256: "4565ecb1a7e3852bd46a8e357bbcc95dfc7a81bec761df50550d567a71bf6ed6"
  },
  {
    version: "1.1.0",
    sha256: "9daaa59da125167ae825bf182a65c7f12a3af78f2cc351991a5faae03fb99892"
  },
  {
    version: "1.1.1",
    sha256: "9daaa59da125167ae825bf182a65c7f12a3af78f2cc351991a5faae03fb99892"
  },
  {
    version: "1.1.2",
    sha256: "9daaa59da125167ae825bf182a65c7f12a3af78f2cc351991a5faae03fb99892"
  },
  {
    version: "1.1.3",
    sha256: "9daaa59da125167ae825bf182a65c7f12a3af78f2cc351991a5faae03fb99892"
  },
]

// function to get shasum of qrl node version
getQrlProtoShasum = (nodeVersion, callback) => {
  let itemsProcessed
  QRLPROTO_SHA256.forEach((qrlnode, index, array) => {
    itemsProcessed++
    // Only look at health of userNetwork
    if (qrlnode.version == nodeVersion) {
      callback(qrlnode.sha256)
    }
    // If we got to the end, and didn't callback above, the version was not found.
    // Return null
    if(itemsProcessed === array.length) {
      callback(null)
    }
  })
}

// Function to cleanly represent large decimal numbers without exponentional formatting.
numberToString = (num) => {
  const math = require('mathjs')
  return math.format(num, { notation: 'fixed', "lowerExp": 1e-100, "upperExp": Infinity });
}

// Convert decimal value to binary
decimalToBinary = (decimalNumber) => {
  let binaryArray = []
  while(decimalNumber >= 1) {
    binaryArray.unshift(decimalNumber % 2)
    decimalNumber = Math.floor(decimalNumber / 2)
  }
  // Pad start of array with 0s if not a full byte
  while(binaryArray.length < 8) {
  	binaryArray.unshift(0)
  }
  return binaryArray
}
