// Import client startup through a single index entry point
import './routes.js'
// import './web-libjsqrl.js'
import { QRLLIB } from 'qrllib/build/web-libjsqrl.js'


// Client side function to detmine if running within Electron
isElectrified = () => {
  var userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.indexOf(' electron/') > -1) {
     return true
  }
  return false
}

selectedNode = () => {
  const selectedNode = document.getElementById('network').value
  return selectedNode
}

