const path = require('path');
const { spawnSync } = require('child_process');

const arch = process.env.BUILD_ARCH || process.env.npm_config_arch || process.arch;
const scriptPath = path.resolve(__dirname, '.scripts/build-installer.js');
const result = spawnSync(process.execPath, [scriptPath, '--platform=darwin', `--arch=${arch}`], {
  stdio: 'inherit',
});

process.exit(result.status || 0);
