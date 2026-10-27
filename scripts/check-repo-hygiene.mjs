import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cases = new Map([
  ['.env', true],
  ['.env.production', true],
  ['apps/client/.env.local', true],
  ['.env.example', false],
  ['.env.production.example', false],
  ['apps/client/.dart_tool/package_config.json', true],
  ['apps/client/build/app/outputs/flutter-apk/app-debug.apk', true],
  ['apps/client/android/local.properties', true],
  ['apps/client/android/.gradle/cache.bin', true],
  ['apps/client/android/app/.cxx/cache.bin', true],
  ['apps/backend/.venv/pyvenv.cfg', true],
  ['apps/backend/.ruff_cache/cache.bin', true],
  ['apps/backend/foundry/__pycache__/main.pyc', true],
  ['apps/backend/uv.lock', false],
  ['apps/backend/data/packs/private.webp', true],
  ['test-results/phone.xml', true],
  ['test-results/playwright/trace.zip', true],
  ['release.keystore', true],
  ['release.jks', true],
  ['apps/client/android/key.properties', true],
  ['apps/client/pubspec.lock', false],
  ['package-lock.json', false],
  ['apps/client/android/gradlew', false],
  ['apps/client/android/gradle/wrapper/gradle-wrapper.jar', false],
  ['assets/brand/sticker-foundry-icon.png', false],
  ['apps/client/assets/brand/sticker-foundry-icon.png', false],
]);
for (const [path, ignored] of cases) {
  const result = spawnSync('git', ['check-ignore', '--no-index', '--', path], { cwd: root, encoding: 'utf8' });
  if (![0, 1].includes(result.status)) throw new Error(result.stderr);
  if ((result.status === 0) !== ignored)
    throw new Error(`${path}: expected ${ignored ? 'ignored' : 'version controlled'}`);
}
console.log(`${cases.size} repository ignore rules verified.`);
