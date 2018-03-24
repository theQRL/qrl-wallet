// Import modules used by both client and server through a single index entry point
import './nodes.js'

// Define amount of SHOR contained per QUANTA (10^9)
SHOR_PER_QUANTA=1000000000

// qrl-wallet Version
WALLET_VERSION="0.3.0"

// Function to cleanly represent large decimal numbers without exponentional formatting.
numberToString = (num) => {
  let numStr = String(num)

  if (Math.abs(num) < 1.0) {
    let e = parseInt(num.toString().split('e-')[1])
    if (e) {
      let negative = num < 0;
      if (negative) num *= -1
      num *= Math.pow(10, e - 1)
      numStr = '0.' + (new Array(e)).join('0') + num.toString().substring(2)
      if (negative) numStr = "-" + numStr
    }
  } else {
    let e = parseInt(num.toString().split('+')[1])
    if (e > 20) {
      e -= 20;
      num /= Math.pow(10, e)
      numStr = num.toString() + (new Array(e + 1)).join('0')
    }
  }

  return numStr;
}
