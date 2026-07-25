#!/usr/bin/env node
/**
 * Applies compatibility patches after npm install.
 * - @ledgerhq/devices shims for Meteor's bundler (no package exports support)
 * - @theqrl/electrify-qrl fixes for modern electron-packager API behavior
 */

// Skip if running inside Meteor bundler (shouldn't happen with .scripts folder)
if (typeof Package !== 'undefined' || process.env.METEOR_SHELL_DIR) {
  process.exit(0);
}

const fs = require('fs');
const path = require('path');

// Use process.cwd() to get project root (works with npm scripts)
const projectRoot = process.cwd();
function patchLedgerDevices() {
  const devicesPath = path.join(projectRoot, 'node_modules', '@ledgerhq', 'devices');
  if (!fs.existsSync(devicesPath)) {
    console.log('@ledgerhq/devices not found, skipping patch');
    return;
  }

  const shims = [
    { name: 'hid-framing.js', target: './lib/hid-framing.js' },
    { name: 'ble/receiveAPDU.js', target: '../lib/ble/receiveAPDU.js' },
    { name: 'ble/sendAPDU.js', target: '../lib/ble/sendAPDU.js' },
  ];

  shims.forEach(({ name, target }) => {
    const shimPath = path.join(devicesPath, name);
    const shimDir = path.dirname(shimPath);

    if (!fs.existsSync(shimDir)) {
      fs.mkdirSync(shimDir, { recursive: true });
    }

    if (!fs.existsSync(shimPath)) {
      const content = `// Shim for Meteor's bundler (exports field not supported)\nmodule.exports = require('${target}');\n`;
      fs.writeFileSync(shimPath, content);
      console.log(`Created shim: ${name}`);
    }
  });

  console.log('@ledgerhq/devices patched for Meteor');
}

function patchElectrifyQrl() {
  const electrifyRoot = path.join(projectRoot, 'node_modules', '@theqrl', 'electrify-qrl', 'lib');
  const cliFile = path.join(projectRoot, 'node_modules', '@theqrl', 'electrify-qrl', 'bin', 'cli.js');
  const electronFile = path.join(electrifyRoot, 'electron.js');
  const appFile = path.join(electrifyRoot, 'app.js');
  const envFile = path.join(electrifyRoot, 'env.js');
  const nodejsFile = path.join(electrifyRoot, 'plugins', 'nodejs.js');

  if (
    !fs.existsSync(cliFile)
    || !fs.existsSync(electronFile)
    || !fs.existsSync(appFile)
    || !fs.existsSync(envFile)
    || !fs.existsSync(nodejsFile)
  ) {
    console.log('@theqrl/electrify-qrl not found, skipping patch');
    return;
  }

  let cliSource = fs.readFileSync(cliFile, 'utf8');
  const oldElectronResolveLine = "  var electron_path = require('electron');";
  const newElectronResolveBlock = `  var electron_path;
  var projectElectronModule = join(electrify_dir, 'node_modules', 'electron');
  try {
    electron_path = require(projectElectronModule);
  } catch (err) {
    electron_path = require('electron');
  }`;

  if (cliSource.includes(oldElectronResolveLine)) {
    cliSource = cliSource.replace(oldElectronResolveLine, newElectronResolveBlock);
    fs.writeFileSync(cliFile, cliSource);
    console.log('Patched @theqrl/electrify-qrl CLI to prefer project Electron runtime');
  }

  let electronSource = fs.readFileSync(electronFile, 'utf8');
  const oldElectronVersionBlock = `Electron.prototype.package = function(packager_options, done) {
  var packager = require('electron-packager');
  var electronVersion = "16.0.1";

  // app name require('.electrify/package.json').name
  var packageJson = require(join(this.$.env.app.root, 'package.json'));
  var name = packageJson.name;`;
  const newElectronVersionBlock = `Electron.prototype.package = function(packager_options, done) {
  var packager = require('electron-packager');

  // app name require('.electrify/package.json').name
  var packageJson = require(join(this.$.env.app.root, 'package.json'));
  var name = packageJson.name;

  var electronVersion = "16.0.1";
  if (packageJson.dependencies && packageJson.dependencies.electron) {
    electronVersion = packageJson.dependencies.electron.replace(/^[^0-9]*/, '');
  }`;

  if (electronSource.includes(oldElectronVersionBlock)) {
    electronSource = electronSource.replace(oldElectronVersionBlock, newElectronVersionBlock);
    fs.writeFileSync(electronFile, electronSource);
    electronSource = fs.readFileSync(electronFile, 'utf8');
    console.log('Patched @theqrl/electrify-qrl Electron version resolution');
  }

  if (!electronSource.includes('var finishPackaging = function()')) {
    const oldSnippet = `  var self = this;
  packager(args, function(err) {
    if(err) throw err;
    
     // moving packaged app to .dist folder
    shell.rm('-rf', self.$.env.app.dist);
    fs.moveSync(tmp_package_dir, self.$.env.app.dist);
    self.log.info('wrote new app to ', self.$.env.app.dist);

    if(done) done();
  });`;

    const newSnippet = `  var self = this;
  var finished = false;
  var finishPackaging = function() {
    if (finished) return;
    finished = true;

    // moving packaged app to .dist folder
    shell.rm('-rf', self.$.env.app.dist);
    fs.moveSync(tmp_package_dir, self.$.env.app.dist);
    self.log.info('wrote new app to ', self.$.env.app.dist);

    if(done) done();
  };

  var maybePromise = packager(args, function(err) {
    if(err) throw err;
    finishPackaging();
  });

  if (maybePromise && typeof maybePromise.then === 'function') {
    maybePromise.then(function() {
      finishPackaging();
    }).catch(function(err) {
      throw err;
    });
  }`;

    if (electronSource.includes(oldSnippet)) {
      electronSource = electronSource.replace(oldSnippet, newSnippet);
      fs.writeFileSync(electronFile, electronSource);
      console.log('Patched @theqrl/electrify-qrl lib/electron.js');
    } else {
      console.log('Could not locate expected packager block in electrify electron.js');
    }
  }

  const oldPackagerOptionsExtend = "  _.extend(args, packager_options);";
  const newPackagerOptionsExtend = `  _.extend(args, packager_options);

  // Avoid npm prune stalls on Windows runners and keep packaging logs visible in CI.
  if (this.$.env.sys.platform === 'win32' && typeof args.prune === 'undefined') {
    args.prune = false;
  }
  if (typeof args.quiet === 'undefined') {
    args.quiet = false;
  }`;

  if (electronSource.includes(oldPackagerOptionsExtend)) {
    electronSource = electronSource.replace(oldPackagerOptionsExtend, newPackagerOptionsExtend);
    fs.writeFileSync(electronFile, electronSource);
    electronSource = fs.readFileSync(electronFile, 'utf8');
    console.log('Patched @theqrl/electrify-qrl electron-packager defaults for CI stability');
  }

  let appSource = fs.readFileSync(appFile, 'utf8');
  const oldVersionLookup = '    var pkg_version = require(pkg_path).dependencies.electrify;';
  const newVersionLookup = `    var pkg = require(pkg_path);
    var deps = pkg.dependencies || {};
    var pkg_version = deps['@theqrl/electrify-qrl'] || deps['electrify-qrl'] || deps.electrify;`;

  if (appSource.includes(oldVersionLookup)) {
    appSource = appSource.replace(oldVersionLookup, newVersionLookup);
    fs.writeFileSync(appFile, appSource);
    appSource = fs.readFileSync(appFile, 'utf8');
    console.log('Patched @theqrl/electrify-qrl lib/app.js');
  }

  const oldCopySnippet = `        // instead of entering the folder and doing an usual \`npm install\`, which
        // would imply in another bugs around node-fibers native re-build with
        // node-gyp, we just copy the whole \`node_modules\` folder that is officially
        // distributed with meteor, its 'ready to go and doesn't need to be rebuilt
        shell.cp('-r', self.$.env.meteor.server_modules, programs_server_dir);

        if(done) done();`;
  const newCopySnippet = `        // Instead of entering the folder and doing an usual \`npm install\`,
        // copy Meteor's server modules when available (legacy Meteor versions).
        if (fs.existsSync(self.$.env.meteor.server_modules)) {
          shell.cp('-r', self.$.env.meteor.server_modules, programs_server_dir);
        } else {
          self.log.warn('meteor server_modules not found at ' + self.$.env.meteor.server_modules + ', skipping legacy copy step');
        }

        if(done) done();`;

  if (appSource.includes(oldCopySnippet)) {
    appSource = appSource.replace(oldCopySnippet, newCopySnippet);
    fs.writeFileSync(appFile, appSource);
    console.log('Patched @theqrl/electrify-qrl Meteor 3 server_modules handling');
  }

  const oldDevEnsureDepsSpawn = `    spawn(npm_cmd, ['i', '--save', join(__dirname, '..')], {
      cwd: this.$.env.app.root,
      stdio: this.$.env.stdio
    }).on('exit', done);`;
  const newDevEnsureDepsSpawn = `    spawn(npm_cmd, ['i', '--save', join(__dirname, '..')], {
      cwd: this.$.env.app.root,
      stdio: this.$.env.stdio,
      shell: this.$.env.os.is_windows
    }).on('exit', done);`;

  if (appSource.includes(oldDevEnsureDepsSpawn)) {
    appSource = appSource.replace(oldDevEnsureDepsSpawn, newDevEnsureDepsSpawn);
    fs.writeFileSync(appFile, appSource);
    appSource = fs.readFileSync(appFile, 'utf8');
    console.log('Patched @theqrl/electrify-qrl ensure_deps spawn for Windows shell (dev mode)');
  }

  const oldProdEnsureDepsSpawn = `    spawn(npm_cmd, ['i'], {
      cwd: this.$.env.app.root,
      stdio: this.$.env.stdio
    }).on('exit', done);`;
  const newProdEnsureDepsSpawn = `    spawn(npm_cmd, ['i'], {
      cwd: this.$.env.app.root,
      stdio: this.$.env.stdio,
      shell: this.$.env.os.is_windows
    }).on('exit', done);`;

  if (appSource.includes(oldProdEnsureDepsSpawn)) {
    appSource = appSource.replace(oldProdEnsureDepsSpawn, newProdEnsureDepsSpawn);
    fs.writeFileSync(appFile, appSource);
    appSource = fs.readFileSync(appFile, 'utf8');
    console.log('Patched @theqrl/electrify-qrl ensure_deps spawn for Windows shell');
  }

  const oldBundleMeteorSpawn = `  spawn('meteor' + (this.$.env.os.is_windows ? '.bat' : ''), [
      'build', tmp_dir,
      '--server', null,
      // '--server', (server_url !== undefined ? server_url : null),
      '--directory'
    ], {
      cwd: this.$.env.app.meteor,
      env: env,
      stdio: this.$.env.stdio
    }
  ).on('exit', function(){`;
  const newBundleMeteorSpawn = `  var meteorCmd = 'meteor' + (this.$.env.os.is_windows ? '.bat' : '');
  var meteorArgs = ['build', tmp_dir, '--directory'];

  spawn(meteorCmd, meteorArgs, {
      cwd: this.$.env.app.meteor,
      env: env,
      stdio: 'inherit',
      shell: this.$.env.os.is_windows
    }
  ).on('exit', function(){`;

  if (appSource.includes(oldBundleMeteorSpawn)) {
    appSource = appSource.replace(oldBundleMeteorSpawn, newBundleMeteorSpawn);
    fs.writeFileSync(appFile, appSource);
    appSource = fs.readFileSync(appFile, 'utf8');
    console.log('Patched @theqrl/electrify-qrl meteor build spawn for Windows shell and Meteor 3 args');
  }

  const oldBundleMeteorSpawnWithCodeExit = `  spawn('meteor' + (this.$.env.os.is_windows ? '.bat' : ''), [
      'build', tmp_dir,
      '--server', null,
      // '--server', (server_url !== undefined ? server_url : null),
      '--directory'
    ], {
      cwd: this.$.env.app.meteor,
      env: env,
      stdio: this.$.env.stdio
    }
  ).on('exit', function(code){`;
  const newBundleMeteorSpawnWithCodeExit = `  var meteorCmd = 'meteor' + (this.$.env.os.is_windows ? '.bat' : '');
  var meteorArgs = ['build', tmp_dir, '--directory'];

  spawn(meteorCmd, meteorArgs, {
      cwd: this.$.env.app.meteor,
      env: env,
      stdio: 'inherit',
      shell: this.$.env.os.is_windows
    }
  ).on('exit', function(code){`;

  if (appSource.includes(oldBundleMeteorSpawnWithCodeExit)) {
    appSource = appSource.replace(oldBundleMeteorSpawnWithCodeExit, newBundleMeteorSpawnWithCodeExit);
    fs.writeFileSync(appFile, appSource);
    appSource = fs.readFileSync(appFile, 'utf8');
    console.log('Patched @theqrl/electrify-qrl meteor build spawn for Windows shell (code-exit variant)');
  }

  const oldBundleExitHook = ").on('exit', function(){";
  const newBundleExitHook = ").on('exit', function(code){";
  if (appSource.includes(oldBundleExitHook)) {
    appSource = appSource.replace(oldBundleExitHook, newBundleExitHook);
    fs.writeFileSync(appFile, appSource);
    appSource = fs.readFileSync(appFile, 'utf8');
    console.log('Patched @theqrl/electrify-qrl meteor bundle exit-code handling');
  }

  const oldAfterBuildStart = `    var afterBuild = function() {
        // inject meteor's settings file within the bundled app`;
  const newAfterBuildStart = `    if (code !== 0) {
      throw new Error('meteor build failed with exit code ' + code);
    }

    var afterBuild = function() {
        shell.mkdir('-p', bundled_dir);
        // inject meteor's settings file within the bundled app`;
  if (appSource.includes(oldAfterBuildStart)) {
    appSource = appSource.replace(oldAfterBuildStart, newAfterBuildStart);
    fs.writeFileSync(appFile, appSource);
    appSource = fs.readFileSync(appFile, 'utf8');
    console.log('Patched @theqrl/electrify-qrl meteor bundle output directory guard');
  }

  let envSource = fs.readFileSync(envFile, 'utf8');
  const oldEnvRootLine = "    this.meteor.root           = join(this.app.root, '../', '.meteor');";
  const newEnvRootBlock = `    this.meteor.root = join(meteor_dir, meteor_symlink);
    if (!fs.existsSync(this.meteor.root)) {
      this.meteor.root = join(this.app.root, '../', '.meteor');
    }`;

  if (envSource.includes(oldEnvRootLine)) {
    envSource = envSource.replace(oldEnvRootLine, newEnvRootBlock);
    fs.writeFileSync(envFile, envSource);
    envSource = fs.readFileSync(envFile, 'utf8');
    console.log('Patched @theqrl/electrify-qrl Meteor root detection');
  }

  const oldDevBundleBlock = `    this.meteor.dev_bundle     = join(this.meteor.root, 'local', 'dev_bundle');
    this.meteor.server_lib     = join(this.meteor.dev_bundle, 'server-lib');
    this.meteor.server_modules = join(this.meteor.server_lib, 'node_modules');`;
  const newDevBundleBlock = `    this.meteor.dev_bundle = join(this.meteor.root, 'local', 'dev_bundle');
    if (!fs.existsSync(this.meteor.dev_bundle)) {
      this.meteor.dev_bundle = join(this.meteor.tools, 'dev_bundle');
    }
    this.meteor.server_lib = join(this.meteor.dev_bundle, 'server-lib');
    this.meteor.server_modules = join(this.meteor.server_lib, 'node_modules');`;

  if (envSource.includes(oldDevBundleBlock)) {
    envSource = envSource.replace(oldDevBundleBlock, newDevBundleBlock);
    fs.writeFileSync(envFile, envSource);
    envSource = fs.readFileSync(envFile, 'utf8');
    console.log('Patched @theqrl/electrify-qrl Meteor dev_bundle detection');
  }

  const oldStdioLine = "  this.stdio = /TRACE|ALL/i.test(log_levels) ? 'inherit' : 'ignore';";
  const newStdioLine = "  this.stdio = (process.env.CI || /TRACE|ALL/i.test(log_levels)) ? 'inherit' : 'ignore';";
  if (envSource.includes(oldStdioLine)) {
    envSource = envSource.replace(oldStdioLine, newStdioLine);
    fs.writeFileSync(envFile, envSource);
    envSource = fs.readFileSync(envFile, 'utf8');
    console.log('Patched @theqrl/electrify-qrl stdio behavior for CI visibility');
  }

  const oldPackagedSettingsBlock = `  if(this.app.is_packaged) {
    this.app.settings = require(join(this.app.root, 'app', 'settings.json'));
  } else if(process.env.ELECTRIFY_SETTINGS_FILE)
    this.app.settings = require(process.env.ELECTRIFY_SETTINGS_FILE);
  else
    this.app.settings = settings || {};`;
  const newPackagedSettingsBlock = `  if(this.app.is_packaged) {
    var packagedSettingsPath = join(this.app.root, 'app', 'settings.json');
    if (!fs.existsSync(packagedSettingsPath) && /\\.asar\\.unpacked$/m.test(this.app.root)) {
      var packedRoot = this.app.root.replace(/\\.asar\\.unpacked$/m, '.asar');
      var packedSettingsPath = join(packedRoot, 'app', 'settings.json');
      if (fs.existsSync(packedSettingsPath)) {
        packagedSettingsPath = packedSettingsPath;
      }
    }
    this.app.settings = require(packagedSettingsPath);
  } else if(process.env.ELECTRIFY_SETTINGS_FILE)
    this.app.settings = require(process.env.ELECTRIFY_SETTINGS_FILE);
  else
    this.app.settings = settings || {};`;

  if (envSource.includes(oldPackagedSettingsBlock)) {
    envSource = envSource.replace(oldPackagedSettingsBlock, newPackagedSettingsBlock);
    fs.writeFileSync(envFile, envSource);
    envSource = fs.readFileSync(envFile, 'utf8');
    console.log('Patched @theqrl/electrify-qrl packaged settings fallback for ASAR');
  }

  let nodejsSource = fs.readFileSync(nodejsFile, 'utf8');
  const oldNodePathBlock = `  this.log = require('../log')($, 'electrify:plugins:nodejs');
  this.name = 'nodejs';
  this.app_node_path = join(this.$.env.app.bin, 'node');

  if(this.$.env.os.is_windows)
    this.app_node_path += '.exe';`;
  const newNodePathBlock = `  this.log = require('../log')($, 'electrify:plugins:nodejs');
  this.name = 'nodejs';
  this.runtime_root = this.$.env.app.root;
  if (/\\.asar$/m.test(this.runtime_root)) {
    this.runtime_root = this.runtime_root + '.unpacked';
  }
  if (!fs.existsSync(this.runtime_root)) {
    this.runtime_root = this.$.env.app.root;
  }
  this.app_node_path = join(this.runtime_root, 'bin', 'node');

  if(this.$.env.os.is_windows)
    this.app_node_path += '.exe';`;

  if (nodejsSource.includes(oldNodePathBlock)) {
    nodejsSource = nodejsSource.replace(oldNodePathBlock, newNodePathBlock);
    fs.writeFileSync(nodejsFile, nodejsSource);
    nodejsSource = fs.readFileSync(nodejsFile, 'utf8');
    console.log('Patched @theqrl/electrify-qrl runtime root for ASAR packaging');
  }

  const oldMeteorMainLine = "  this.meteor_main = join(this.$.env.app.root, 'app', 'main.js');";
  const newMeteorMainLine = "  this.meteor_main = join(this.runtime_root, 'app', 'main.js');";
  if (nodejsSource.includes(oldMeteorMainLine)) {
    nodejsSource = nodejsSource.replace(oldMeteorMainLine, newMeteorMainLine);
    fs.writeFileSync(nodejsFile, nodejsSource);
    nodejsSource = fs.readFileSync(nodejsFile, 'utf8');
    console.log('Patched @theqrl/electrify-qrl Meteor entrypoint path for ASAR packaging');
  }

  const oldMeteorReadyBlock = `NodeJS.prototype.meteor_ready = function(url, done) {
  var self = this;
  var fired = false;

  http.get(url, function(/* res */) {
    if(!fired) {
      fired = true;
      done();
    }
  }).on('error', function(/* err */) {
    if(fired) return;
    setTimeout(function(){
      self.meteor_ready(url, done);
    }, 30);
  });
};`;
  const newMeteorReadyBlock = `NodeJS.prototype.meteor_ready = function(url, done) {
  var self = this;
  var fired = false;
  var startedAt = Date.now();
  var maxWaitMs = 60000;

  function attempt() {
    if (fired) return;

    if (Date.now() - startedAt >= maxWaitMs) {
      self.log.warn('meteor readiness probe timed out for ' + url + ', continuing startup');
      fired = true;
      done();
      return;
    }

    var req = http.get(url, function(res) {
      res.resume();
      if (!fired) {
        fired = true;
        done();
      }
    });

    req.setTimeout(1500, function() {
      req.destroy(new Error('meteor readiness timeout'));
    });

    req.on('error', function(/* err */) {
      if (fired) return;
      setTimeout(attempt, 100);
    });
  }

  attempt();
};`;

  if (nodejsSource.includes(oldMeteorReadyBlock)) {
    nodejsSource = nodejsSource.replace(oldMeteorReadyBlock, newMeteorReadyBlock);
    fs.writeFileSync(nodejsFile, nodejsSource);
    console.log('Patched @theqrl/electrify-qrl Meteor readiness probe timeout/retry behavior');
  }
}

function patchShellJs() {
  const candidates = [
    path.join(projectRoot, 'node_modules', 'shelljs', 'shell.js'),
    path.join(projectRoot, '.electrify', 'node_modules', 'shelljs', 'shell.js'),
  ];

  const oldLoadBlock = `require('./commands').forEach(function (command) {
  require('./src/' + command);
});`;

  const newLoadBlock = `var __meteorStaticShelljsCommands = {
  cat: require('./src/cat'),
  cd: require('./src/cd'),
  chmod: require('./src/chmod'),
  cp: require('./src/cp'),
  dirs: require('./src/dirs'),
  echo: require('./src/echo'),
  exec: require('./src/exec'),
  find: require('./src/find'),
  grep: require('./src/grep'),
  head: require('./src/head'),
  ln: require('./src/ln'),
  ls: require('./src/ls'),
  mkdir: require('./src/mkdir'),
  mv: require('./src/mv'),
  pwd: require('./src/pwd'),
  rm: require('./src/rm'),
  sed: require('./src/sed'),
  set: require('./src/set'),
  sort: require('./src/sort'),
  tail: require('./src/tail'),
  tempdir: require('./src/tempdir'),
  test: require('./src/test'),
  to: require('./src/to'),
  toEnd: require('./src/toEnd'),
  touch: require('./src/touch'),
  uniq: require('./src/uniq'),
  which: require('./src/which'),
};

require('./commands').forEach(function (command) {
  __meteorStaticShelljsCommands[command] || require('./src/' + command);
});`;

  candidates.forEach((shellFile) => {
    if (!fs.existsSync(shellFile)) {
      return;
    }

    let source = fs.readFileSync(shellFile, 'utf8');
    if (source.includes('__meteorStaticShelljsCommands')) {
      return;
    }

    if (source.includes(oldLoadBlock)) {
      source = source.replace(oldLoadBlock, newLoadBlock);
      fs.writeFileSync(shellFile, source);
      console.log(`Patched shelljs static command requires for Meteor: ${shellFile}`);
    }
  });
}

function patchProtobufCSP() {
  // @protobufjs/inquire uses an obfuscated eval() to dynamically require modules:
  //   eval("quire".replace(/^/,"re"))(moduleName)
  // Replace with a direct require() — identical behavior, no eval needed.
  const inquirePath = path.join(projectRoot, 'node_modules', '@protobufjs', 'inquire', 'index.js');
  if (fs.existsSync(inquirePath)) {
    let source = fs.readFileSync(inquirePath, 'utf8');
    const oldEval = 'eval("quire".replace(/^/,"re"))(moduleName)';
    if (source.includes(oldEval)) {
      source = source.replace(oldEval, 'require(moduleName)');
      fs.writeFileSync(inquirePath, source);
      console.log('Patched @protobufjs/inquire: replaced eval() with require()');
    }
  }

  // Note: @protobufjs/codegen uses new Function() for runtime serializer generation.
  // This cannot be patched without pre-compiling .proto files to static JS modules.
  // Similarly, qrllib's Emscripten WASM glue uses new Function() in createNamedFunction.
  // Both require 'unsafe-eval' in CSP — this is a known, documented limitation.
}

patchLedgerDevices();
patchElectrifyQrl();
patchShellJs();
patchProtobufCSP();
