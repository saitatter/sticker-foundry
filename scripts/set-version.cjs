const fs = require('fs');
const path = require('path');

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error('Usage: node scripts/set-version.cjs <semver>');
}

const repoRoot = path.resolve(__dirname, '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function writeJson(relativePath, value) {
  fs.writeFileSync(path.join(repoRoot, relativePath), `${JSON.stringify(value, null, 2)}\n`);
}

for (const packagePath of ['package.json', 'apps/backend/package.json', 'packages/shared-types/package.json']) {
  const packageJson = readJson(packagePath);
  packageJson.version = version;
  writeJson(packagePath, packageJson);
}

const lockPath = 'package-lock.json';
const lockJson = readJson(lockPath);
lockJson.version = version;
if (lockJson.packages) {
  for (const packagePath of ['', 'apps/backend', 'packages/shared-types']) {
    if (lockJson.packages[packagePath]) {
      lockJson.packages[packagePath].version = version;
    }
  }
}
writeJson(lockPath, lockJson);

const [major, minor, patch] = version.split(/[+-]/)[0].split('.').map((part) => Number.parseInt(part, 10));
const versionCode = major * 10000 + minor * 100 + patch;
const pubspecPath = path.join(repoRoot, 'apps/client/pubspec.yaml');
const pubspec = fs.readFileSync(pubspecPath, 'utf8').replace(/^version: .+$/m, `version: ${version}+${versionCode}`);
fs.writeFileSync(pubspecPath, pubspec);
