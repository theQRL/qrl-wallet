#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = process.cwd();
const electrifyRoot = path.join(projectRoot, '.electrify');

function fileExists(filePath) {
  return fs.existsSync(filePath);
}

function runOrExit(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function ensureElectrifyWorkspace() {
  const required = [
    path.join(electrifyRoot, 'package.json'),
    path.join(electrifyRoot, 'index.js'),
  ];

  const missing = required.find((filePath) => !fileExists(filePath));
  if (missing) {
    console.error(`[electron-prepare] Missing required file: ${missing}`);
    console.error('[electron-prepare] .electrify workspace is incomplete.');
    process.exit(1);
  }
}

function needsElectrifyInstall() {
  const required = {
    app: path.join(electrifyRoot, 'node_modules', '@theqrl', 'electrify-qrl', 'lib', 'app.js'),
    env: path.join(electrifyRoot, 'node_modules', '@theqrl', 'electrify-qrl', 'lib', 'env.js'),
    nodejsPlugin: path.join(electrifyRoot, 'node_modules', '@theqrl', 'electrify-qrl', 'lib', 'plugins', 'nodejs.js'),
    shelljs: path.join(electrifyRoot, 'node_modules', 'shelljs', 'shell.js'),
    electronPkg: path.join(electrifyRoot, 'node_modules', 'electron', 'package.json'),
  };

  if (
    !fileExists(required.app)
    || !fileExists(required.env)
    || !fileExists(required.nodejsPlugin)
    || !fileExists(required.shelljs)
    || !fileExists(required.electronPkg)
  ) {
    return true;
  }

  const appSource = fs.readFileSync(required.app, 'utf8');
  const envSource = fs.readFileSync(required.env, 'utf8');
  const nodejsPluginSource = fs.readFileSync(required.nodejsPlugin, 'utf8');
  const shelljsSource = fs.readFileSync(required.shelljs, 'utf8');

  const hasAppPatch = appSource.includes("var pkg = require(pkg_path);")
    && appSource.includes('meteor build failed with exit code');
  const hasEnvPatch = envSource.includes('if (!fs.existsSync(this.meteor.root))')
    && envSource.includes('if (!fs.existsSync(this.meteor.dev_bundle))')
    && envSource.includes('var packagedSettingsPath = join(this.app.root, \'app\', \'settings.json\');');
  const hasAsarRuntimePatch = nodejsPluginSource.includes('this.runtime_root = this.$.env.app.root;');
  const hasReadinessTimeoutPatch = nodejsPluginSource.includes('maxWaitMs = 60000');
  const hasShelljsPatch = shelljsSource.includes('__meteorStaticShelljsCommands');

  return !(hasAppPatch && hasEnvPatch && hasAsarRuntimePatch && hasReadinessTimeoutPatch && hasShelljsPatch);
}

function main() {
  ensureElectrifyWorkspace();

  if (needsElectrifyInstall()) {
    console.log('[electron-prepare] Installing/updating .electrify dependencies...');
    runOrExit('npm', ['--prefix', electrifyRoot, 'install', '--no-audit', '--no-fund'], { cwd: projectRoot });
  }

  console.log('[electron-prepare] Applying compatibility patches...');
  runOrExit('node', [path.join(projectRoot, '.scripts', 'patch-ledger-exports.js')], { cwd: projectRoot });
}

main();
