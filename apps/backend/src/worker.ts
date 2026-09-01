import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  await NestFactory.createApplicationContext(WorkerModule, { logger: ['log', 'warn', 'error'] });
  Logger.log('Media, export, and email workers started', 'Worker');
}

void bootstrap().catch((error: unknown) => {
  Logger.error(error instanceof Error ? error.message : String(error), undefined, 'Worker');
  process.exitCode = 1;
});