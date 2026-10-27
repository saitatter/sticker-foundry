import { execFileSync } from 'node:child_process';

const variants = [
  ['base', ['-f', 'docker-compose.yml']],
  ['development', ['-f', 'docker-compose.yml', '-f', 'docker-compose.dev.yml']],
  ['ai', ['-f', 'docker-compose.yml', '-f', 'docker-compose.ai.yml']],
  ['development + ai', ['-f', 'docker-compose.yml', '-f', 'docker-compose.dev.yml', '-f', 'docker-compose.ai.yml']],
  ['production', ['-f', 'docker-compose.yml', '-f', 'docker-compose.production.yml']],
  [
    'published images',
    ['-f', 'docker-compose.yml', '-f', 'docker-compose.production.yml', '-f', 'docker-compose.ghcr.yml'],
  ],
];

for (const [name, files] of variants) {
  process.stdout.write(`Validating ${name} Compose configuration...\n`);
  execFileSync('docker', ['compose', ...files, 'config', '--quiet'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      JWT_SECRET: 'compose-validation-only-not-a-deployment-secret',
      CORS_ORIGIN: 'https://stickers.example.test',
      STICKER_FOUNDRY_VERSION: '2.0.0',
    },
  });
}

process.stdout.write('All Compose configurations are valid.\n');
