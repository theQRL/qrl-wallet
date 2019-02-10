const installer = require('electron-installer-debian')
const buildConfig = require('./build-conf.js')

const options = {
  src: buildConfig.deb.electronPath,
  dest: buildConfig.deb.outPath,
  arch: buildConfig.deb.arch,
  options: {
    name: buildConfig.safeName,
    productName: buildConfig.name,
    description: buildConfig.name,
    version: buildConfig.version,
    maintainer: buildConfig.manufacturer,
    homepage: buildConfig.homepage,
    icon: buildConfig.deb.icon,
  },
}

console.log('Building Ubuntu DEB Installer for QRLWallet')

installer(options)
  .then(() => console.log(`Successfully created package at ${options.dest}`))
  .catch(err => {
    console.error(err, err.stack)
    process.exit(1)
  })
