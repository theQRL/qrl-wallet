#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const sourcePngPath = path.resolve('.electrify/assets/qrl-mac.png');
const targetIcnsPath = path.resolve('.electrify/assets/qrl.icns');

function runOrThrow(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
  });

  if (result.status === 0) {
    return;
  }

  const stderr = (result.stderr || '').trim();
  const stdout = (result.stdout || '').trim();
  const output = stderr || stdout || `exit code ${result.status}`;
  throw new Error(`${command} ${args.join(' ')} failed: ${output}`);
}

function syncMacIcon() {
  if (process.platform !== 'darwin') {
    console.log('[icon-sync] skipping mac icon sync on non-darwin platform');
    return;
  }

  if (!fs.existsSync(sourcePngPath)) {
    throw new Error(`[icon-sync] source icon not found: ${sourcePngPath}`);
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qrl-iconset-'));
  const iconsetPath = path.join(tempRoot, 'qrl.iconset');

  try {
    fs.mkdirSync(iconsetPath, { recursive: true });

    const iconVariants = [
      { size: 16, fileName: 'icon_16x16.png' },
      { size: 32, fileName: 'icon_16x16@2x.png' },
      { size: 32, fileName: 'icon_32x32.png' },
      { size: 64, fileName: 'icon_32x32@2x.png' },
      { size: 128, fileName: 'icon_128x128.png' },
      { size: 256, fileName: 'icon_128x128@2x.png' },
      { size: 256, fileName: 'icon_256x256.png' },
      { size: 512, fileName: 'icon_256x256@2x.png' },
      { size: 512, fileName: 'icon_512x512.png' },
      { size: 1024, fileName: 'icon_512x512@2x.png' },
    ];

    iconVariants.forEach((variant) => {
      const outPath = path.join(iconsetPath, variant.fileName);
      const resizeSource = variant.size === 1024
        ? path.join(iconsetPath, 'icon_512x512.png')
        : sourcePngPath;
      runOrThrow('sips', [
        '-z',
        String(variant.size),
        String(variant.size),
        resizeSource,
        '--out',
        outPath,
      ]);
    });

    runOrThrow('iconutil', ['-c', 'icns', iconsetPath, '-o', targetIcnsPath]);
    console.log(`[icon-sync] wrote ${targetIcnsPath} from ${sourcePngPath}`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

try {
  syncMacIcon();
} catch (error) {
  const message = error && error.message ? error.message : String(error);
  if (fs.existsSync(targetIcnsPath)) {
    console.warn(`[icon-sync] ${message}`);
    console.warn(`[icon-sync] retaining existing icon file: ${targetIcnsPath}`);
    process.exit(0);
  }

  console.error(message);
  process.exit(1);
}
