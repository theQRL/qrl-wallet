// Import client startup through a single index entry point
import { QRLLIB } from 'qrllib/build/web-libjsqrl.js'
import './routes.js'
import './functions.js'
/* global LocalStore */


// Global to store XMSS object
XMSS_OBJECT = null

// Reset wallet status
resetWalletStatus()
