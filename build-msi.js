const path = require('path');
const { spawnSync } = require('child_process');

// Legacy entrypoint kept for compatibility; installer creation is now handled by electron-builder.
const arch = process.env.BUILD_ARCH || process.env.npm_config_arch || process.arch;
const scriptPath = path.resolve(__dirname, '.scripts/build-installer.js');
const result = spawnSync(process.execPath, [scriptPath, '--platform=win32', `--arch=${arch}`], {
  stdio: 'inherit',
});

process.exit(result.status || 0);
