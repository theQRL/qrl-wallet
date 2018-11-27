// Import modules used by both client and server through a single index entry point
import './nodes.js'

// Define amount of SHOR contained per QUANTA (10^9)
SHOR_PER_QUANTA=1000000000

// qrl-wallet Version
WALLET_VERSION="1.0.5"

// qrl.proto sha256 sum for each release of QRL Node
QRLPROTO_SHA256 = [
  {
    version: "1.0.0",
    protoSha256: "4565ecb1a7e3852bd46a8e357bbcc95dfc7a81bec761df50550d567a71bf6ed6",
    objectSha256: "d538cc0164f26cdda4e082cca548f531038d70a4b879495a4483f66e4c53cae9",
  },
  {
    version: "1.1.0",
    protoSha256: "9daaa59da125167ae825bf182a65c7f12a3af78f2cc351991a5faae03fb99892",
    objectSha256: "7e841e796be583d30066e33f8d9b344ffe8160eb02fecc6cb4df80f7823e932c",
  },
  {
    version: "1.1.1",
    protoSha256: "9daaa59da125167ae825bf182a65c7f12a3af78f2cc351991a5faae03fb99892",
    objectSha256: "7e841e796be583d30066e33f8d9b344ffe8160eb02fecc6cb4df80f7823e932c",
  },
  {
    version: "1.1.2",
    protoSha256: "9daaa59da125167ae825bf182a65c7f12a3af78f2cc351991a5faae03fb99892",
    objectSha256: "7e841e796be583d30066e33f8d9b344ffe8160eb02fecc6cb4df80f7823e932c",
  },
  {
    version: "1.1.3",
    protoSha256: "71a51e5222c50a7575f1a92c365f6674bae938cebae678416da80f22fa8327b9",
    objectSha256: "6589d425a16741104bbeceaa9ab2a1dbb33ff47453b90e29c3ee540dbad22df5",
  },
  {
    version: "1.1.4",
    protoSha256: "71a51e5222c50a7575f1a92c365f6674bae938cebae678416da80f22fa8327b9",
    objectSha256: "6589d425a16741104bbeceaa9ab2a1dbb33ff47453b90e29c3ee540dbad22df5",
  },
  {
    version: "1.1.5",
    protoSha256: "71a51e5222c50a7575f1a92c365f6674bae938cebae678416da80f22fa8327b9",
    objectSha256: "6589d425a16741104bbeceaa9ab2a1dbb33ff47453b90e29c3ee540dbad22df5",
  },
  {
    version: "1.1.6",
    protoSha256: "71a51e5222c50a7575f1a92c365f6674bae938cebae678416da80f22fa8327b9",
    objectSha256: "6589d425a16741104bbeceaa9ab2a1dbb33ff47453b90e29c3ee540dbad22df5",
  },
  {
    version: "1.1.7 python",
    protoSha256: "71a51e5222c50a7575f1a92c365f6674bae938cebae678416da80f22fa8327b9",
    objectSha256: "6589d425a16741104bbeceaa9ab2a1dbb33ff47453b90e29c3ee540dbad22df5",
  },
  {
    version: "1.1.8 python",
    protoSha256: "71a51e5222c50a7575f1a92c365f6674bae938cebae678416da80f22fa8327b9",
    objectSha256: "6589d425a16741104bbeceaa9ab2a1dbb33ff47453b90e29c3ee540dbad22df5",
  },
]

// function to get shasum of qrl node version
getQrlProtoShasum = (nodeVersion, callback) => {
  let itemsProcessed = 0
  QRLPROTO_SHA256.forEach((qrlnode, index, array) => {
    itemsProcessed++
    // Only look at health of userNetwork
    if (qrlnode.version == nodeVersion) {
      callback(qrlnode)
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
