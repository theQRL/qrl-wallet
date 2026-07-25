#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function readFile(relativePath) {
  const absolutePath = path.join(process.cwd(), relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing file: ${relativePath}`);
  }
  return fs.readFileSync(absolutePath, 'utf8');
}

function main() {
  const checks = [
    {
      file: 'node_modules/@theqrl/electrify-qrl/lib/env.js',
      needle: "this.stdio = (process.env.CI || /TRACE|ALL/i.test(log_levels)) ? 'inherit' : 'ignore';",
      label: 'CI stdio visibility patch',
    },
    {
      file: 'node_modules/@theqrl/electrify-qrl/lib/app.js',
      needle: "var meteorArgs = ['build', tmp_dir, '--directory'];",
      label: 'Meteor build args patch',
    },
    {
      file: 'node_modules/@theqrl/electrify-qrl/lib/app.js',
      needle: 'shell: this.$.env.os.is_windows',
      label: 'Meteor spawn Windows shell patch',
    },
    {
      file: 'node_modules/@theqrl/electrify-qrl/lib/electron.js',
      needle: 'args.prune = false;',
      label: 'electron-packager prune patch',
    },
  ];

  let hasError = false;

  const cliPath = require.resolve('@theqrl/electrify-qrl/bin/cli.js');
  console.log(`electrify cli ${cliPath}`);

  checks.forEach((check) => {
    const content = readFile(check.file);
    if (!content.includes(check.needle)) {
      hasError = true;
      console.error(`[verify-electrify-patches] missing ${check.label} in ${check.file}`);
      return;
    }
    console.log(`[verify-electrify-patches] ok: ${check.label}`);
  });

  const appSource = readFile('node_modules/@theqrl/electrify-qrl/lib/app.js');
  if (appSource.includes("'--server', null")) {
    hasError = true;
    console.error("[verify-electrify-patches] legacy '--server null' bundle args still present");
  } else {
    console.log("[verify-electrify-patches] ok: legacy '--server null' args removed");
  }

  if (hasError) {
    process.exit(1);
  }
}

main();
