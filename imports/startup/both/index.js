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
