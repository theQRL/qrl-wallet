// Import client startup through a single index entry point
import { QRLLIB } from 'qrllib/build/web-libjsqrl.js'
import './routes.js'
import './functions.js'
/* global LocalStore */


// Global to store XMSS object
XMSS_OBJECT = null

// Rate in ms to check transaction status
POLL_TXN_RATE = 5000 // 5seconds
POLL_MAX_CHECKS = 120 // max 10 minutes checking status


// Reset wallet status
resetWalletStatus()

// Developer note
console.log('qrl-wallet - ',WALLET_VERSION)
console.log('We\'re hiring! https://angel.co/theqrl/jobs')
console.log('Found a security bug? security@theqrl.org')
console.log('Found a problem? https://github.com/theQRL/qrl-wallet/issues')
