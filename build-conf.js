// Defines build configuration that is for each platform build.
const path = require('path')
const pjson = require('./package.json')

const config = {
  name: 'QRL Wallet',
  safeName: 'qrl-wallet',
  description: 'QRL Wallet',
  version: pjson.version,
  manufacturer: 'DIE QRL STIFTUNG, Zug Switzerland',
  homepage: 'https://www.theqrl.org/',
  windows: {
    electronPath: path.resolve('.electrify/dist/QRLWallet-win32-x64'),
    outPath: path.resolve('.electrify/dist'),
    installFolderName: 'QRL',
    icon: path.resolve('.electrify/assets/qrl.ico'),
    exeName: 'QRLWallet',
  },
  macos: {
    electronPath: path.resolve('.electrify/.dist/QRLWallet-darwin-x64/QRLWallet.app'),
    outPath: path.resolve('.electrify/.dist/'),
    dmgTitle: 'QRL Wallet Installer',
    dmgBackground: path.resolve('./.electrify/assets/dmgBackground.png'),
    dmgIcon: path.resolve('.electrify/assets/qrl.icns'),
  },
  deb: {
    electronPath: path.resolve('.electrify/.dist/QRLWallet-linux-x64/'),
    outPath: path.resolve('.electrify/.dist/'),
    arch: 'amd64',
    icon: path.resolve('.electrify/assets/qrl.ico'),
  },
}

module.exports = config
