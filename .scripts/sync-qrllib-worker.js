#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const buildRoot = path.dirname(require.resolve('qrllib/build/web-libjsqrl.js'));
const workerRoot = path.join(projectRoot, 'public', 'workers');
const files = ['web-libjsqrl.js', 'web-libjsqrl.wasm'];
const legacyBundle = path.join(workerRoot, 'qrllib.js');
const check = process.argv.includes('--check');

for (const file of files) {
  const source = path.join(buildRoot, file);
  const target = path.join(workerRoot, file);

  if (check) {
    if (!fs.existsSync(target) || !fs.readFileSync(source).equals(fs.readFileSync(target))) {
      console.error(`[qrllib-worker] ${target} differs from locked qrllib`);
      process.exitCode = 1;
    }
  } else {
    fs.copyFileSync(source, target);
    console.log(`[qrllib-worker] copied ${file} from qrllib`);
  }
}

if (check && fs.existsSync(legacyBundle)) {
  console.error('[qrllib-worker] obsolete worker bundle is still present');
  process.exitCode = 1;
} else if (!check && fs.existsSync(legacyBundle)) {
  fs.unlinkSync(legacyBundle);
  console.log('[qrllib-worker] removed obsolete worker bundle');
}

if (check && !process.exitCode) {
  console.log('[qrllib-worker] browser worker assets match locked qrllib');
}
