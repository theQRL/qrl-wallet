const path = require('path');
const pjson = require('./package.json');

const buildArch = process.env.BUILD_ARCH || process.env.npm_config_arch || process.arch;
const distRoot = path.resolve('.electrify/.dist');
const installerOutPath = path.join(distRoot, 'installers');

const linuxDebArchMap = {
  x64: 'amd64',
  arm64: 'arm64',
};

module.exports = {
  name: 'QRL Wallet',
  safeName: 'qrl-wallet',
  description: 'QRL Wallet',
  version: pjson.version,
  manufacturer: 'DIE QRL STIFTUNG, Zug Switzerland',
  homepage: 'https://www.theqrl.org/',
  buildArch,
  distRoot,
  installerOutPath,
  windows: {
    electronPath: path.join(distRoot, `QRLWallet-win32-${buildArch}`),
    outPath: installerOutPath,
    installFolderName: 'QRL',
    icon: path.resolve('.electrify/assets/qrl.ico'),
    exeName: 'QRLWallet',
  },
  macos: {
    electronPath: path.join(distRoot, `QRLWallet-darwin-${buildArch}`, 'QRLWallet.app'),
    outPath: installerOutPath,
    dmgTitle: 'QRL Wallet Installer',
    dmgBackground: path.resolve('.electrify/assets/dmgBackground.png'),
    dmgIcon: path.resolve('.electrify/assets/qrl.icns'),
  },
  deb: {
    electronPath: path.join(distRoot, `QRLWallet-linux-${buildArch}`),
    outPath: installerOutPath,
    arch: linuxDebArchMap[buildArch] || buildArch,
    icon: path.resolve('.electrify/assets/qrl.ico'),
  },
};
