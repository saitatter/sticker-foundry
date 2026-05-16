const { spawnSync } = require('node:child_process');
const path = require('node:path');

const version = process.argv[2];
if (!version) {
  throw new Error('Usage: node scripts/prepare-semantic-release.cjs <semver>');
}

const repoRoot = path.resolve(__dirname, '..');
const androidRoot = path.join(repoRoot, 'apps/android');
const gradle = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const hasSigning =
  process.env.ANDROID_KEYSTORE_PATH &&
  process.env.ANDROID_KEYSTORE_PASSWORD &&
  process.env.ANDROID_KEY_ALIAS &&
  process.env.ANDROID_KEY_PASSWORD;

run(process.execPath, [path.join(repoRoot, 'scripts/set-version.cjs'), version], { cwd: repoRoot });
run(gradle, [hasSigning ? ':app:assembleRelease' : ':app:assembleDebug'], { cwd: androidRoot });
run(process.execPath, [path.join(repoRoot, 'scripts/prepare-release-assets.mjs')], { cwd: repoRoot });

function run(command, args, options) {
  const result = spawnSync(command, args, {
    ...options,
    env: process.env,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with status ${result.status ?? 'unknown'}`);
  }
}
