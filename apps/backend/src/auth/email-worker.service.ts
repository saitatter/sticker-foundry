import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import { JobExecutionService } from '../jobs/job-execution.service';
import { QueuePayload, queuePrefixFromConfig, redisConnectionFromConfig } from '../jobs/job-queue.service';
import { MailerService } from './mailer.service';

type EmailPayload = QueuePayload & {
  email?: string;
  displayName?: string;
  resetUrl?: string;
  expiresAt?: string;
};

@Injectable()
export class EmailWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailWorkerService.name);
  private worker: Worker<QueuePayload> | undefined;

  constructor(
    private readonly config: ConfigService,
    private readonly mailer: MailerService,
    private readonly execution: JobExecutionService,
  ) {}

  onModuleInit() {
    this.worker = new Worker<QueuePayload>('email', (job) => this.process(job), {
      connection: redisConnectionFromConfig(this.config),
      prefix: queuePrefixFromConfig(this.config),
      concurrency: this.configInt('EMAIL_QUEUE_CONCURRENCY', 2),
    });
    this.worker.on('failed', (job, error) => {
      if (job) this.logger.warn(`Email job ${job.id ?? 'unknown'} failed: ${error.message}`);
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async process(job: Job<QueuePayload>) {
    const mediaJobId = this.stringValue(job.data.mediaJobId);
    if (!mediaJobId) throw new Error('Email queue job is missing mediaJobId');

    const mediaJob = await this.execution.claim(mediaJobId);
    if (!mediaJob) return;

    try {
      const payload = job.data as EmailPayload;
      if (!payload.email || !payload.displayName || !payload.resetUrl || !payload.expiresAt) {
        throw new Error('Password reset email job is missing required fields');
      }
      await this.execution.progress(mediaJobId, 50);
      await this.mailer.sendPasswordReset(
        payload.email,
        payload.displayName,
        payload.resetUrl,
        new Date(payload.expiresAt),
      );
      await this.execution.complete(mediaJobId);
    } catch (error) {
      const attempts = job.opts.attempts ?? 1;
      const willRetry = job.attemptsMade + 1 < attempts;
      await this.execution.fail(mediaJobId, this.errorMessage(error), willRetry);
      throw error;
    }
  }

  private stringValue(value: unknown) {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }

  private configInt(key: string, fallback: number) {
    const parsed = Number.parseInt(this.config.get<string>(key, String(fallback)), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}