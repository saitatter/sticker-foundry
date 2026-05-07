#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';

const args = parseArgs(process.argv.slice(2));
const checks = [];

if (!args.postgres && !args.data) {
  fail('Usage: npm run verify:backup -- --postgres stickers.sql --data foundry-data.tgz');
}

if (args.postgres) {
  checks.push(verifyPostgresBackup(args.postgres));
}
if (args.data) {
  checks.push(verifyDataBackup(args.data));
}

const failed = checks.filter((check) => !check.ok);
for (const check of checks) {
  const marker = check.ok ? 'OK' : 'FAIL';
  console.log(`[${marker}] ${check.message}`);
}

if (failed.length > 0) {
  process.exit(1);
}

function verifyPostgresBackup(inputPath) {
  const filePath = resolve(inputPath);
  const file = fileInfo(filePath);
  if (!file.ok) return file;

  const header = readFileSync(filePath, { encoding: null, flag: 'r' }).subarray(0, 512);
  if (header.subarray(0, 5).toString('ascii') === 'PGDMP') {
    const pgRestore = spawnSync('pg_restore', ['--list', filePath], { encoding: 'utf8' });
    if (pgRestore.status === 0) {
      return ok(`PostgreSQL custom dump is readable (${formatBytes(file.size)})`);
    }
    return failResult(
      `PostgreSQL custom dump detected, but pg_restore --list failed or pg_restore is unavailable: ${pgRestore.stderr || pgRestore.error?.message || 'unknown error'}`,
    );
  }

  const sample = header.toString('utf8');
  const looksLikePlainSql =
    sample.includes('PostgreSQL database dump') ||
    sample.includes('CREATE TABLE') ||
    sample.includes('INSERT INTO') ||
    sample.includes('COPY ');
  if (!looksLikePlainSql) {
    return failResult('PostgreSQL backup does not look like plain SQL or a pg_dump custom archive');
  }

  return ok(`PostgreSQL plain SQL dump looks readable (${formatBytes(file.size)})`);
}

function verifyDataBackup(inputPath) {
  const filePath = resolve(inputPath);
  const file = fileInfo(filePath);
  if (!file.ok) return file;

  if (statSync(filePath).isDirectory()) {
    const entryCount = countDirectoryEntries(filePath);
    if (entryCount === 0) return failResult('Data backup directory is empty');
    return ok(`Data backup directory is readable (${entryCount} entries)`);
  }

  const extension = extname(filePath).toLowerCase();
  if (!filePath.endsWith('.tar.gz') && !filePath.endsWith('.tgz') && extension !== '.tar') {
    return failResult('Data backup should be a .tgz, .tar.gz, .tar, or an extracted directory');
  }

  const tarArgs = extension === '.tar' ? ['-tf', filePath] : ['-tzf', filePath];
  const tar = spawnSync('tar', tarArgs, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  if (tar.status !== 0) {
    return failResult(`Cannot list data archive with tar: ${tar.stderr || tar.error?.message || 'unknown error'}`);
  }

  const entries = tar.stdout.split(/\r?\n/).filter(Boolean);
  if (entries.length === 0) return failResult('Data archive is empty');
  const unsafe = entries.find((entry) => entry.startsWith('/') || entry.includes('..'));
  if (unsafe) return failResult(`Data archive contains an unsafe path: ${unsafe}`);

  return ok(`Data archive is readable (${entries.length} entries, ${formatBytes(file.size)})`);
}

function fileInfo(filePath) {
  if (!existsSync(filePath)) return failResult(`Missing file: ${filePath}`);
  const stats = statSync(filePath);
  if (!stats.isFile() && !stats.isDirectory()) return failResult(`Path is neither file nor directory: ${filePath}`);
  if (stats.size === 0 && stats.isFile()) return failResult(`Backup file is empty: ${filePath}`);
  return { ok: true, size: stats.size, message: '' };
}

function countDirectoryEntries(directory) {
  let count = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    count += 1;
    if (entry.isDirectory()) {
      count += countDirectoryEntries(resolve(directory, entry.name));
    }
  }
  return count;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--postgres') parsed.postgres = argv[++index];
    else if (key === '--data') parsed.data = argv[++index];
    else fail(`Unknown argument: ${key}`);
  }
  return parsed;
}

function ok(message) {
  return { ok: true, message };
}

function failResult(message) {
  return { ok: false, message };
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}
