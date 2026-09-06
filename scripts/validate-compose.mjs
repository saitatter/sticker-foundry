import { execFileSync } from 'node:child_process';

const variants = [
  ['base', ['-f', 'docker-compose.yml']],
  ['development', ['-f', 'docker-compose.yml', '-f', 'docker-compose.dev.yml']],
  ['ai', ['-f', 'docker-compose.yml', '-f', 'docker-compose.ai.yml']],
  ['development + ai', ['-f', 'docker-compose.yml', '-f', 'docker-compose.dev.yml', '-f', 'docker-compose.ai.yml']],
];

for (const [name, files] of variants) {
  process.stdout.write(`Validating ${name} Compose configuration...\n`);
  execFileSync('docker', ['compose', ...files, 'config', '--quiet'], { stdio: 'inherit' });
}

process.stdout.write('All Compose configurations are valid.\n');
