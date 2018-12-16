// Import client startup through a single index entry point
/* global LocalStore */
import { QRLLIB } from 'qrllib/build/web-libjsqrl.js'
import './routes.js'
import './functions.js'

// Global to store XMSS object
XMSS_OBJECT = null

// Rate in ms to check transaction status
POLL_TXN_RATE = 5000 // 5seconds
POLL_MAX_CHECKS = 120 // max 10 minutes checking status

// Reset wallet status
resetWalletStatus()
const openWalletPref = LocalStore.get('openWalletDefault')
if ((!openWalletPref) || (openWalletPref === 'undefined')) {
  LocalStore.set('openWalletDefault', 'file')
}

// Developer note
console.log('qrl-wallet - ',WALLET_VERSION)
console.log('We\'re hiring! jobs@theqrl.org')
console.log('Found a security bug? security@theqrl.org')
console.log('Found a problem? https://github.com/theQRL/qrl-wallet/issues')
