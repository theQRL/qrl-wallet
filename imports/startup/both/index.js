// Import modules used by both client and server through a single index entry point
import './nodes.js'

// Define amount of SHOR contained per QUANTA (10^9)
SHOR_PER_QUANTA=1000000000

// qrl-wallet Version
WALLET_VERSION="0.3.0"

// Function to cleanly represent large decimal numbers without exponentional formatting.
numberToString = (num) => {
  const math = require('mathjs')
  return math.format(num,{exponential:{lower:0,upper:Infinity}})
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