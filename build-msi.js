const MSICreator = require('electron-wix-msi-qrl').MSICreator;
const buildConfig = require('./build-conf.js')

// Step 1: Instantiate the MSICreator
const msiCreator = new MSICreator({
  appDirectory: buildConfig.windows.electronPath,
  description: buildConfig.name,
  exe: buildConfig.safeName,
  name: buildConfig.name,
  manufacturer: buildConfig.manufacturer,
  version: buildConfig.version,
  outputDirectory: buildConfig.windows.outPath,
  programFilesFolderName: buildConfig.windows.installFolderName,
  shortcutFolderName: buildConfig.name,
  ui: {
    enabled: true,
    chooseDirectory: false,
    images: {
      exclamationIcon: buildConfig.windows.icon,
      infoIcon: buildConfig.windows.icon,
    }
  }
});

async function build() {
  // Step 2: Create a .wxs template file
  await msiCreator.create();

  // Step 3: Compile the template to a .msi file
  await msiCreator.compile();

  console.log('Successfully created installer.')
}

console.log('Building Windows MSI Installer for QRLWallet')
build();
