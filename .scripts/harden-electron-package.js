#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  flipFuses,
  getCurrentFuseWire,
  FuseVersion,
  FuseV1Options,
} = require('@electron/fuses');

const DIST_ROOT = path.join(process.cwd(), '.electrify', '.dist');
const PLATFORM_ARG = getArg('--platform');

function getArg(flag) {
  const found = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  return found ? found.split('=')[1] : null;
}

function fail(message) {
  throw new Error(message);
}

function findPlatformTargets() {
  if (!fs.existsSync(DIST_ROOT)) {
    fail(`dist directory not found: ${DIST_ROOT}`);
  }

  const targets = [];
  const entries = fs.readdirSync(DIST_ROOT, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const bundleDir = path.join(DIST_ROOT, entry.name);
    let platform = null;

    if (entry.name.includes('-darwin-')) platform = 'darwin';
    if (entry.name.includes('-win32-')) platform = 'win32';
    if (entry.name.includes('-linux-')) platform = 'linux';
    if (!platform) continue;
    if (PLATFORM_ARG && PLATFORM_ARG !== platform) continue;

    if (platform === 'darwin') {
      const appEntry = fs.readdirSync(bundleDir, { withFileTypes: true })
        .find((dirent) => dirent.isDirectory() && dirent.name.endsWith('.app'));
      if (!appEntry) {
        fail(`No .app found in ${bundleDir}`);
      }

      targets.push({
        bundleDir,
        platform,
        arch: entry.name.split('-').pop(),
        appPath: path.join(bundleDir, appEntry.name),
      });
      continue;
    }

    if (platform === 'win32') {
      const exe = fs.readdirSync(bundleDir)
        .find((name) => name.toLowerCase().endsWith('.exe'));
      if (!exe) {
        fail(`No .exe found in ${bundleDir}`);
      }

      targets.push({
        bundleDir,
        platform,
        arch: entry.name.split('-').pop(),
        exePath: path.join(bundleDir, exe),
      });
      continue;
    }

    targets.push({
      bundleDir,
      platform,
      arch: entry.name.split('-').pop(),
    });
  }

  if (targets.length === 0) {
    const suffix = PLATFORM_ARG ? ` for platform=${PLATFORM_ARG}` : '';
    fail(`No packaged Electron targets found in ${DIST_ROOT}${suffix}`);
  }

  return targets;
}

function resourcesPathFor(target) {
  if (target.platform === 'darwin') {
    return path.join(target.appPath, 'Contents', 'Resources');
  }
  return path.join(target.bundleDir, 'resources');
}

function verifyAsarLayout(target) {
  const resourcesPath = resourcesPathFor(target);
  const asarPath = path.join(resourcesPath, 'app.asar');
  const looseAppDir = path.join(resourcesPath, 'app');

  if (!fs.existsSync(asarPath)) {
    fail(`Missing app.asar for ${target.platform} target at ${asarPath}`);
  }

  if (fs.existsSync(looseAppDir)) {
    fail(`Loose app directory found at ${looseAppDir}. Refusing insecure package layout.`);
  }

  return asarPath;
}

function restoreMissingUnpackedAppRootFiles(target) {
  const resourcesPath = resourcesPathFor(target);
  const unpackedAppDir = path.join(resourcesPath, 'app.asar.unpacked', 'app');
  const sourceAppDir = path.join(process.cwd(), '.electrify', 'app');

  if (!fs.existsSync(sourceAppDir)) {
    return;
  }

  fs.mkdirSync(unpackedAppDir, { recursive: true });

  const sourceEntries = fs.readdirSync(sourceAppDir, { withFileTypes: true });
  sourceEntries.forEach((entry) => {
    if (!entry.isFile()) {
      return;
    }

    const sourceFile = path.join(sourceAppDir, entry.name);
    const targetFile = path.join(unpackedAppDir, entry.name);
    if (fs.existsSync(targetFile)) {
      return;
    }

    fs.copyFileSync(sourceFile, targetFile);
    console.log(`[hardening] restored missing unpacked app file: ${targetFile}`);
  });
}

function verifyMacAsarIntegrityMetadata(target) {
  const infoPlist = path.join(target.appPath, 'Contents', 'Info.plist');
  let metadata;

  try {
    const output = execFileSync(
      'plutil',
      ['-extract', 'ElectronAsarIntegrity', 'json', '-o', '-', infoPlist],
      { encoding: 'utf8' },
    );
    metadata = JSON.parse(output);
  } catch (error) {
    fail(`Could not read ElectronAsarIntegrity from ${infoPlist}: ${error.message}`);
  }

  const record = metadata['Resources/app.asar'];
  if (!record) {
    fail(`ElectronAsarIntegrity missing Resources/app.asar in ${infoPlist}`);
  }

  if (record.algorithm !== 'SHA256') {
    fail(`Unexpected ASAR integrity algorithm: ${record.algorithm}`);
  }

  if (!record.hash || record.hash.length !== 64) {
    fail(`Invalid ASAR integrity hash in ${infoPlist}`);
  }
}

function verifyDarwinCodeSignature(target) {
  try {
    execFileSync(
      'codesign',
      ['--verify', '--deep', '--strict', '--verbose=2', target.appPath],
      { stdio: 'pipe' },
    );
  } catch (error) {
    const stderr = error.stderr ? error.stderr.toString() : error.message;
    fail(`codesign verification failed for ${target.appPath}: ${stderr}`);
  }
}

function assertFuseEnabled(currentValue, fuseName) {
  if (currentValue !== 49) {
    fail(`Fuse ${fuseName} is not enabled (wire value=${currentValue})`);
  }
}

function assertFuseDisabled(currentValue, fuseName) {
  if (currentValue !== 48) {
    fail(`Fuse ${fuseName} is not disabled (wire value=${currentValue})`);
  }
}

async function hardenFuses(target) {
  if (target.platform !== 'darwin' && target.platform !== 'win32') {
    return;
  }

  const binaryTarget = target.platform === 'darwin' ? target.appPath : target.exePath;
  const isWindows = target.platform === 'win32';
  const fuseConfig = {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    // NOTE: With current Electrify + electron-packager on Windows, enabling this
    // fuse can produce runtime "FindResource failed (0x715)" because the expected
    // ASAR integrity resource is not embedded in the generated EXE.
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: !isWindows,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
  };

  if (target.platform === 'darwin') {
    // Flipping fuses mutates the executable and can invalidate signatures.
    // Always restore ad-hoc signature on macOS targets (x64 and arm64).
    fuseConfig.resetAdHocDarwinSignature = true;
  }

  await flipFuses(binaryTarget, fuseConfig);

  const wire = await getCurrentFuseWire(binaryTarget);
  assertFuseDisabled(wire[FuseV1Options.RunAsNode], 'RunAsNode');
  assertFuseDisabled(
    wire[FuseV1Options.EnableNodeOptionsEnvironmentVariable],
    'EnableNodeOptionsEnvironmentVariable',
  );
  assertFuseDisabled(
    wire[FuseV1Options.EnableNodeCliInspectArguments],
    'EnableNodeCliInspectArguments',
  );
  if (isWindows) {
    assertFuseDisabled(
      wire[FuseV1Options.EnableEmbeddedAsarIntegrityValidation],
      'EnableEmbeddedAsarIntegrityValidation',
    );
  } else {
    assertFuseEnabled(
      wire[FuseV1Options.EnableEmbeddedAsarIntegrityValidation],
      'EnableEmbeddedAsarIntegrityValidation',
    );
  }
  assertFuseEnabled(wire[FuseV1Options.OnlyLoadAppFromAsar], 'OnlyLoadAppFromAsar');
}

async function main() {
  const targets = findPlatformTargets();

  for (const target of targets) {
    const asarPath = verifyAsarLayout(target);
    console.log(`[hardening] verified asar layout: ${asarPath}`);
    restoreMissingUnpackedAppRootFiles(target);

    if (target.platform === 'darwin') {
      verifyMacAsarIntegrityMetadata(target);
      console.log(`[hardening] verified ElectronAsarIntegrity: ${target.appPath}`);
    }

    await hardenFuses(target);
    if (target.platform === 'darwin' || target.platform === 'win32') {
      console.log(`[hardening] flipped and verified fuses: ${target.platform} (${target.arch})`);
    }

    if (target.platform === 'darwin') {
      verifyDarwinCodeSignature(target);
      console.log(`[hardening] verified codesign seal: ${target.appPath}`);
    }
  }

  console.log('[hardening] Electron package hardening checks passed');
}

main().catch((error) => {
  console.error(`[hardening] ${error.message}`);
  process.exit(1);
});
