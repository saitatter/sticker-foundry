import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import { JobExecutionService } from '../jobs/job-execution.service';
import { QueuePayload, queuePrefixFromConfig, redisConnectionFromConfig } from '../jobs/job-queue.service';
import { PackExportService } from './pack-export.service';

type ExportPayload = QueuePayload & { packId?: string };

@Injectable()
export class ExportWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExportWorkerService.name);
  private worker: Worker<QueuePayload> | undefined;

  constructor(
    private readonly config: ConfigService,
    private readonly exportService: PackExportService,
    private readonly execution: JobExecutionService,
  ) {}

  onModuleInit() {
    this.worker = new Worker<QueuePayload>('export', (job) => this.process(job), {
      connection: redisConnectionFromConfig(this.config),
      prefix: queuePrefixFromConfig(this.config),
      concurrency: this.configInt('EXPORT_QUEUE_CONCURRENCY', 1),
    });
    this.worker.on('failed', (job, error) => {
      if (job) this.logger.warn(`Export job ${job.id ?? 'unknown'} failed: ${error.message}`);
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async process(job: Job<QueuePayload>) {
    const mediaJobId = this.stringValue(job.data.mediaJobId);
    if (!mediaJobId) throw new Error('Export queue job is missing mediaJobId');

    const mediaJob = await this.execution.claim(mediaJobId);
    if (!mediaJob) return;

    const payload = job.data as ExportPayload;
    const packId = payload.packId ?? mediaJob.packId;

    try {
      if (!packId) throw new Error('Export job is missing packId');
      await this.execution.progress(mediaJobId, 25);
      const cached = await this.exportService.buildCachedZip(packId);
      await this.execution.complete(mediaJobId, {
        packId,
        contentHash: cached.contentHash,
        downloadPath: `/packs/${packId}/export`,
      });
      return { packId, contentHash: cached.contentHash };
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