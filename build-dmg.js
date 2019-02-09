const createDMG = require('electron-installer-dmg')
const buildConfig = require('./build-conf.js')

const options = {
  appPath: buildConfig.macos.electronPath,
  out: buildConfig.macos.outPath,
  name: buildConfig.safeName,
  title: buildConfig.macos.dmgTitle,
  background: buildConfig.macos.dmgBackground,
  icon: buildConfig.macos.dmgIcon,
}

console.log('Building MacOS DMG Installer for QRLWallet')

createDMG(options, function done(err) {
  console.log('Successfully created package')
})
