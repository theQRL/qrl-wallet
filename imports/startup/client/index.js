// Import client startup through a single index entry point
import { QRLLIB } from 'qrllib/build/web-libjsqrl.js'
import './routes.js'
import './functions.js'
/* global LocalStore */


// Global to store XMSS object
XMSS_OBJECT = null

// Reset wallet status
const status = {}
status.colour = 'red'
status.string = 'No wallet has been opened.'
status.address = ''
status.unlocked = false
LocalStore.set('walletStatus', status)
