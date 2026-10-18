#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const exactVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const errors = [];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function checkExact(spec, label) {
  if (typeof spec !== 'string' || !exactVersion.test(spec)) {
    errors.push(`${label} must be an exact version, found ${JSON.stringify(spec)}`);
  }
}

function checkOverrides(overrides, label) {
  Object.entries(overrides || {}).forEach(([name, value]) => {
    if (typeof value === 'object' && value !== null) {
      checkOverrides(value, `${label}.${name}`);
    } else {
      checkExact(value, `${label}.${name}`);
    }
  });
}

function checkNpmTree(directory) {
  const prefix = directory === '.' ? '' : `${directory}/`;
  const manifest = readJson(`${prefix}package.json`);
  const lock = readJson(`${prefix}package-lock.json`);

  if (lock.lockfileVersion !== 3 || !lock.packages || !lock.packages['']) {
    errors.push(`${prefix}package-lock.json must be a version 3 lockfile`);
    return;
  }

  ['dependencies', 'devDependencies', 'optionalDependencies'].forEach((section) => {
    const declared = manifest[section] || {};
    const locked = lock.packages[''][section] || {};
    if (
      Object.keys(declared).length !== Object.keys(locked).length
      || Object.entries(declared).some(([name, spec]) => locked[name] !== spec)
    ) {
      errors.push(`${prefix}package-lock.json root ${section} differs from package.json`);
    }

    Object.entries(declared).forEach(([name, spec]) => {
      checkExact(spec, `${prefix}package.json ${section}.${name}`);
      const installed = lock.packages[`node_modules/${name}`];
      if (!installed || installed.version !== spec) {
        errors.push(`${prefix}package-lock.json does not lock ${name} to ${spec}`);
      }
    });
  });

  checkOverrides(manifest.overrides, `${prefix}package.json overrides`);

  Object.entries(lock.packages).forEach(([packagePath, entry]) => {
    if (!packagePath) return;
    if (entry.resolved) {
      let origin;
      try {
        origin = new URL(entry.resolved).origin;
      } catch {
        errors.push(`${prefix}package-lock.json has an invalid URL for ${packagePath}`);
        return;
      }
      if (origin !== 'https://registry.npmjs.org') {
        errors.push(`${prefix}package-lock.json has an unreviewed source for ${packagePath}: ${origin}`);
      }
      if (typeof entry.integrity !== 'string' || !/^sha(?:1|512)-/.test(entry.integrity)) {
        errors.push(`${prefix}package-lock.json lacks an integrity hash for ${packagePath}`);
      }
      return;
    }

    // Bundled children are included in an integrity-checked parent tarball.
    let parentPath = packagePath;
    let hasCheckedParent = false;
    while (parentPath.includes('/node_modules/')) {
      parentPath = parentPath.slice(0, parentPath.lastIndexOf('/node_modules/'));
      if (lock.packages[parentPath] && lock.packages[parentPath].integrity) {
        hasCheckedParent = true;
        break;
      }
    }
    if (!entry.inBundle || !hasCheckedParent) {
      errors.push(`${prefix}package-lock.json has an unchecked package: ${packagePath}`);
    }
  });
}

function checkMeteor() {
  const versionLines = fs.readFileSync(path.join(root, '.meteor/versions'), 'utf8').trim().split(/\r?\n/);
  const resolved = new Map(versionLines.map((line) => {
    const separator = line.lastIndexOf('@');
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
  const packageLines = fs.readFileSync(path.join(root, '.meteor/packages'), 'utf8').split(/\r?\n/);
  packageLines.forEach((line, index) => {
    const declaration = line.split('#', 1)[0].trim().split(/\s+/, 1)[0];
    if (!declaration) return;
    const separator = declaration.indexOf('@=');
    if (separator < 1) {
      errors.push(`.meteor/packages:${index + 1} must use an exact @= version`);
      return;
    }
    const name = declaration.slice(0, separator);
    const spec = declaration.slice(separator + 2);
    checkExact(spec, `.meteor/packages:${index + 1}`);
    if (resolved.get(name) !== spec) {
      errors.push(`.meteor/packages:${index + 1} differs from .meteor/versions for ${name}`);
    }
  });
}

checkNpmTree('.');
checkNpmTree('.electrify');
checkMeteor();
checkExact(fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim().replace(/^v/, ''), '.nvmrc');

if (errors.length) {
  errors.forEach((error) => console.error(`[verify-dependency-pins] ${error}`));
  process.exit(1);
}

console.log('[verify-dependency-pins] npm, Meteor, and Node pins verified');
