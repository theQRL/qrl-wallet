#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { build, Platform, Arch } = require('electron-builder');
const pkg = require('../package.json');

function parseArgs(argv) {
  return argv.reduce((acc, arg) => {
    if (!arg.startsWith('--')) {
      return acc;
    }

    const [key, value] = arg.replace(/^--/, '').split('=');
    acc[key] = value === undefined ? true : value;
    return acc;
  }, {});
}

function die(message) {
  console.error(`[installer] ${message}`);
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
const platform = args.platform || process.platform;
const arch = args.arch || process.env.BUILD_ARCH || process.arch;

const platformMap = {
  darwin: {
    targetPlatform: Platform.MAC,
    target: 'dmg',
  },
  win32: {
    targetPlatform: Platform.WINDOWS,
    // NSIS is the current maintained default in electron-builder and works for x64/arm64.
    target: 'nsis',
  },
  linux: {
    targetPlatform: Platform.LINUX,
    target: ['deb', 'pacman'],
  },
};

const archMap = {
  x64: Arch.x64,
  arm64: Arch.arm64,
};

if (!platformMap[platform]) {
  die(`Unsupported platform "${platform}". Expected one of: ${Object.keys(platformMap).join(', ')}`);
}

if (!archMap[arch]) {
  die(`Unsupported arch "${arch}". Expected one of: ${Object.keys(archMap).join(', ')}`);
}

const distRoot = path.resolve('.electrify/.dist');
const prepackagedRoot = path.join(distRoot, `QRLWallet-${platform}-${arch}`);
const prepackaged = platform === 'darwin'
  ? path.join(prepackagedRoot, 'QRLWallet.app')
  : prepackagedRoot;
const outputDir = path.join(distRoot, 'installers');
const iconComposerPath = path.resolve('.electrify/assets/qrl.icon');
const macPngIconPath = path.resolve('.electrify/assets/qrl-mac.png');
const fallbackIcnsPath = path.resolve('.electrify/assets/qrl.icns');
const dmgVolumeIconPath = fallbackIcnsPath;

function syncPrepackagedMacIcon(appPath, iconPath) {
  if (platform !== 'darwin') {
    return;
  }

  if (!fs.existsSync(iconPath)) {
    console.warn(`[installer] mac icon not found at ${iconPath}; skipping app icon sync.`);
    return;
  }

  const appIconPath = path.join(appPath, 'Contents', 'Resources', 'electron.icns');
  if (!fs.existsSync(appIconPath)) {
    console.warn(`[installer] expected app icon not found at ${appIconPath}; skipping app icon sync.`);
    return;
  }

  fs.copyFileSync(iconPath, appIconPath);
  console.log(`[installer] synced app icon from ${path.basename(iconPath)} to ${appIconPath}`);
}

function canUseIconComposerAsset() {
  if (platform !== 'darwin' || !fs.existsSync(iconComposerPath)) {
    return false;
  }

  const check = spawnSync('actool', ['--version'], {
    stdio: 'ignore',
  });

  return check.status === 0;
}

if (!fs.existsSync(prepackaged)) {
  die(`Prepackaged app not found: ${prepackaged}. Run electrify package first.`);
}

syncPrepackagedMacIcon(prepackaged, fallbackIcnsPath);

fs.mkdirSync(outputDir, { recursive: true });

const targetConfig = platformMap[platform];
const targets = targetConfig.targetPlatform.createTarget(targetConfig.target, archMap[arch]);
const hasMacPngIcon = fs.existsSync(macPngIconPath);
const useIconComposerAsset = !hasMacPngIcon && canUseIconComposerAsset();
const fallbackMacIconPath = useIconComposerAsset ? iconComposerPath : fallbackIcnsPath;
const macIconPath = hasMacPngIcon ? macPngIconPath : fallbackMacIconPath;

if (platform === 'darwin' && !hasMacPngIcon && !useIconComposerAsset && fs.existsSync(iconComposerPath)) {
  const fallbackLabel = path.basename(fallbackIcnsPath);
  console.warn(`[installer] actool is unavailable; falling back to ${fallbackLabel}. Run \`xcodebuild -runFirstLaunch\` to enable qrl.icon.`);
}

const builderConfig = {
  appId: 'org.theqrl.wallet',
  productName: 'QRLWallet',
  executableName: 'QRLWallet',
  artifactName: `QRLWallet-${pkg.version}-${platform}-${arch}.${'${ext}'}`,
  directories: {
    output: outputDir,
  },
  mac: {
    icon: macIconPath,
    category: 'public.app-category.finance',
  },
  dmg: {
    title: 'QRL Wallet Installer',
    background: path.resolve('.electrify/assets/dmgBackground.png'),
    icon: dmgVolumeIconPath,
  },
  win: {
    icon: path.resolve('.electrify/assets/qrl.ico'),
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    perMachine: false,
  },
  linux: {
    category: 'Finance',
    maintainer: 'The QRL Contributors',
    synopsis: 'QRL Wallet',
    description: 'Quantum Resistant Ledger desktop wallet.',
  },
};

console.log(`[installer] building ${targetConfig.target} from ${prepackaged}`);

build({
  prepackaged,
  targets,
  config: builderConfig,
  publish: 'never',
}).then((artifacts) => {
  artifacts.forEach((artifact) => {
    console.log(`[installer] created ${artifact}`);
  });
}).catch((error) => {
  die(error && error.message ? error.message : String(error));
});
