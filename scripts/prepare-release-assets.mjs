#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, cp, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(repoRoot, 'dist');
const packageRoot = join(distDir, 'sticker-foundry-server');
const serverArchive = join(distDir, 'sticker-foundry-server-package.tar.gz');
const androidApk = join(distDir, 'sticker-foundry-android.apk');

await mkdir(distDir, { recursive: true });
await rm(packageRoot, { recursive: true, force: true });
await rm(serverArchive, { force: true });

await copyAndroidApk();
await copyServerPackage();
await createServerArchive();

console.log(`Prepared ${relative(androidApk)}`);
console.log(`Prepared ${relative(serverArchive)}`);

async function copyAndroidApk() {
  const candidates = [
    'apps/android/app/build/outputs/apk/release/app-release.apk',
    'apps/android/app/build/outputs/apk/debug/app-debug.apk',
  ];

  const source = candidates.map((candidate) => join(repoRoot, candidate)).find((candidate) => existsSync(candidate));
  if (!source) {
    throw new Error(`Missing Android APK. Expected one of: ${candidates.join(', ')}`);
  }

  await copyFile(source, androidApk);
}

async function copyServerPackage() {
  const entries = [
    'package.json',
    'package-lock.json',
    '.dockerignore',
    '.env.example',
    'assets',
    'docker-compose.yml',
    'docker-compose.dev.yml',
    'docker-compose.ai.yml',
    'README.md',
    'LICENSE',
    'docs',
    'scripts/verify-backup.mjs',
    'apps/backend/Dockerfile',
    'apps/backend/Dockerfile.ai',
    'apps/backend/nest-cli.json',
    'apps/backend/package.json',
    'apps/backend/tsconfig.json',
    'apps/backend/tsconfig.build.json',
    'apps/backend/prisma',
    'apps/backend/src',
    'apps/web/Dockerfile',
    'apps/web/index.html',
    'apps/web/nginx.conf',
    'apps/web/package.json',
    'apps/web/public',
    'apps/web/tsconfig.json',
    'apps/web/vite.config.ts',
    'apps/web/src',
    'packages/shared-types/package.json',
    'packages/shared-types/tsconfig.json',
    'packages/shared-types/src',
  ];

  for (const entry of entries) {
    const source = join(repoRoot, entry);
    if (!existsSync(source)) {
      throw new Error(`Release package entry does not exist: ${entry}`);
    }
    const target = join(packageRoot, entry);
    await mkdir(dirname(target), { recursive: true });
    await cp(source, target, { recursive: true });
  }
}

async function createServerArchive() {
  const tar = spawnSync('tar', ['-czf', serverArchive, '-C', distDir, 'sticker-foundry-server'], {
    stdio: 'inherit',
  });
  if (tar.status !== 0) {
    throw new Error(`tar failed with status ${tar.status ?? 'unknown'}`);
  }

  const archive = await stat(serverArchive);
  if (archive.size === 0) {
    throw new Error('Server package archive is empty');
  }
}

function relative(filePath) {
  return filePath.replace(`${repoRoot}\\`, '').replace(`${repoRoot}/`, '');
}
