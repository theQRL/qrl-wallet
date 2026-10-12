// Import client startup through a single index entry point
/* eslint no-console:0 */

// import { QRLLIB } from 'qrllib/build/web-libjsqrl.js' // eslint-disable-line
import { QRLLIBmodule } from 'qrllib/build/offline-libjsqrl' // eslint-disable-line
import '../../ui/lib/ui-interactions'
import './routes.js'
import './functions.js'

// Global to store XMSS object
XMSS_OBJECT = null // eslint-disable-line

// Rate in ms to check transaction status
// eslint-disable-next-line
POLL_TXN_RATE = 5000 // 5seconds
// eslint-disable-next-line
POLL_MAX_CHECKS = 120 // max 10 minutes checking status

// Reset wallet status
resetWalletStatus()
const openWalletPref = LocalStore.get('openWalletDefault')
if ((!openWalletPref) || (openWalletPref === 'undefined')) {
  LocalStore.set('openWalletDefault', 'file')
}

// Developer note
console.log('qrl-wallet - ', WALLET_VERSION)
console.log('Work with us! jobs@theqrl.org')
console.log('Found a security bug? security@theqrl.org')
console.log('Found a problem? https://github.com/theQRL/qrl-wallet/issues')
