import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobStatus, Prisma } from '@prisma/client';
import { Job, Worker } from 'bullmq';
import { PrismaService } from '../prisma.service';
import { JobExecutionService } from '../jobs/job-execution.service';
import { QueuePayload, queuePrefixFromConfig, redisConnectionFromConfig } from '../jobs/job-queue.service';
import { STORAGE_SERVICE } from '../storage/storage.token';
import { StorageMaintenanceService } from '../storage/storage.service';
import { PackStorageService } from '../storage/pack-storage.service';
import { BackgroundRemovalOptions, BackgroundRemovalService } from './background-removal.service';
import { StickerImageService, StickerProcessingOptions } from './sticker-image.service';
import { DEFAULT_STICKER_EMOJIS, WHATSAPP_LIMITS } from '../packs/whatsapp-constraints';

type MediaPayload = QueuePayload & {
  inputKey?: string;
  outputKey: string;
  mimeType: string;
  animated?: boolean;
  backgroundRemoval?: BackgroundRemovalOptions;
  processing?: StickerProcessingOptions;
  kind?: string;
  packId?: string;
  fileName?: string;
  emojis?: string[];
  accessibilityText?: string;
  createTrayIcon?: boolean;
};

@Injectable()
export class MediaWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MediaWorkerService.name);
  private worker: Worker<QueuePayload> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly imageService: StickerImageService,
    private readonly backgroundRemoval: BackgroundRemovalService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageMaintenanceService,
    private readonly packStorage: PackStorageService,
    private readonly execution: JobExecutionService,
  ) {}

  onModuleInit() {
    this.worker = new Worker<QueuePayload>('media', (job) => this.process(job), {
      connection: redisConnectionFromConfig(this.config),
      prefix: queuePrefixFromConfig(this.config),
      concurrency: this.configInt('MEDIA_QUEUE_CONCURRENCY', 1),
    });
    this.worker.on('failed', (job, error) => {
      if (job) this.logger.warn(`Media job ${job.id ?? 'unknown'} failed: ${error.message}`);
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async process(job: Job<QueuePayload>) {
    const mediaJobId = this.stringValue(job.data.mediaJobId);
    if (!mediaJobId) throw new Error('Media queue job is missing mediaJobId');

    const mediaJob = await this.prisma.mediaJob.findUnique({ where: { id: mediaJobId } });
    const payload = job.data as MediaPayload;
    if (!mediaJob) return;
    if (mediaJob.status === JobStatus.CANCELLED) {
      if (payload.inputKey) await this.storage.delete(payload.inputKey).catch(() => undefined);
      return;
    }
    if (mediaJob.status === JobStatus.COMPLETED) return;
    const claimed = await this.execution.claim(mediaJobId);
    if (!claimed) return;

    let outputUploaded = false;
    let persisted = false;
    let trayIconCreated = false;
    try {
      if (!payload.inputKey || !payload.outputKey || !payload.mimeType) {
        throw new Error('Media job requires inputKey, outputKey, and mimeType');
      }

      await this.updateProgress(mediaJobId, 15);
      const input = await this.storage.download(payload.inputKey);
      await this.updateProgress(mediaJobId, 30);

      const prepared = payload.animated
        ? input
        : await this.backgroundRemoval.remove(input, payload.backgroundRemoval ?? {});
      await this.updateProgress(mediaJobId, 50);

      const processed = await this.imageService.processSticker(prepared, {
        animated: payload.animated,
        ...(payload.processing ?? {}),
      });
      await this.updateProgress(mediaJobId, 80);
      await this.storage.upload({
        key: payload.outputKey,
        body: processed.bytes,
        mimeType: payload.mimeType,
      });
      outputUploaded = true;
      await this.updateProgress(mediaJobId, 100);

      const current = await this.prisma.mediaJob.findUnique({ where: { id: mediaJobId }, select: { status: true } });
      if (current?.status === JobStatus.CANCELLED) {
        await this.cleanupOutput(payload, trayIconCreated);
        await this.storage.delete(payload.inputKey).catch(() => undefined);
        return;
      }
      if (payload.kind === 'sticker-upload') {
        const shouldEnsureTrayIcon = await this.persistStickerUpload(mediaJob.userId, payload, processed);
        persisted = true;
        if (shouldEnsureTrayIcon) {
          trayIconCreated = await this.ensureTrayIcon(payload, prepared);
        }
      }
      await this.storage.delete(payload.inputKey).catch(() => undefined);
      await this.execution.complete(mediaJobId, {
        storageKey: payload.outputKey,
        sizeBytes: processed.sizeBytes,
        sha256: processed.sha256,
      });
      return { storageKey: payload.outputKey, size: processed.sizeBytes, sha256: processed.sha256 };
    } catch (error) {
      const attempts = job.opts.attempts ?? 1;
      const willRetry = job.attemptsMade + 1 < attempts;
      if (!willRetry && outputUploaded && !persisted) {
        await this.cleanupOutput(job.data as MediaPayload, trayIconCreated);
      }
      await this.execution.fail(mediaJobId, this.errorMessage(error), willRetry);
      throw error;
    }
  }

  private async updateProgress(mediaJobId: string, progress: number) {
    await this.execution.progress(mediaJobId, progress);
  }

  private async persistStickerUpload(
    userId: string | null,
    payload: MediaPayload,
    processed: {
      sizeBytes: number;
      sha256: string;
      perceptualHash: string;
      mimeType: string;
      width: number;
      height: number;
    },
  ) {
    if (!payload.packId || !payload.fileName) {
      throw new Error('Sticker media job is missing packId or fileName');
    }

    const emojis = payload.emojis?.filter(Boolean).slice(0, WHATSAPP_LIMITS.maxStickerEmojis) ?? DEFAULT_STICKER_EMOJIS;
    return this.prisma.$transaction(
      async (tx) => {
        const pack = await tx.pack.findUnique({
          where: { id: payload.packId },
          include: { _count: { select: { stickers: true } } },
        });
        if (!pack) throw new Error('Pack not found');

        const existing = await tx.sticker.findFirst({ where: { packId: payload.packId, fileName: payload.fileName } });
        if (existing) return Boolean(payload.createTrayIcon);
        if (pack._count.stickers >= WHATSAPP_LIMITS.maxStickersPerPack) {
          throw new Error(`A pack can contain at most ${WHATSAPP_LIMITS.maxStickersPerPack} stickers`);
        }

        const duplicate = await tx.sticker.findFirst({
          where: { packId: payload.packId, perceptualHash: processed.perceptualHash },
          select: { id: true },
        });
        if (duplicate) throw new Error('This image looks like a duplicate of an existing sticker in the pack');
        await this.assertStorageQuota(tx, userId ?? pack.ownerId, processed.sizeBytes);

        await tx.sticker.create({
          data: {
            packId: payload.packId as string,
            fileName: payload.fileName as string,
            storageKey: payload.outputKey,
            mimeType: processed.mimeType,
            width: processed.width,
            height: processed.height,
            emojis,
            accessibilityText: payload.accessibilityText,
            sizeBytes: processed.sizeBytes,
            sha256: processed.sha256,
            perceptualHash: processed.perceptualHash,
            position: pack._count.stickers,
          },
        });
        await tx.pack.update({
          where: { id: payload.packId },
          data: { imageDataVersion: this.nextImageDataVersion(pack.imageDataVersion) },
        });
        return Boolean(payload.createTrayIcon) && pack._count.stickers === 0;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async ensureTrayIcon(payload: MediaPayload, prepared: Buffer) {
    if (!payload.packId) return false;
    const trayKey = this.packStorage.storageKeyFor(payload.packId, 'tray_icon.webp');
    if (await this.storage.exists(trayKey)) return false;

    const tray = await this.imageService.processTrayIcon(prepared);
    await this.storage.upload({
      key: trayKey,
      body: tray.bytes,
      mimeType: 'image/webp',
    });
    return true;
  }

  private async cleanupOutput(payload: MediaPayload, trayIconCreated: boolean) {
    if (payload.outputKey) {
      await this.storage.delete(payload.outputKey).catch(() => undefined);
    }
    if (trayIconCreated && payload.packId) {
      await this.storage.delete(this.packStorage.storageKeyFor(payload.packId, 'tray_icon.webp')).catch(() => undefined);
    }
  }

  private nextImageDataVersion(previous: string) {
    const numeric = Number.parseInt(previous, 10);
    return Number.isFinite(numeric) ? String(numeric + 1) : String(Date.now());
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

  private async assertStorageQuota(tx: Prisma.TransactionClient, ownerId: string, incomingBytes: number) {
    const setting = await tx.appSetting.findUnique({ where: { key: 'storageQuotaBytes' } });
    const raw = setting?.value || this.config.get<string>('STORAGE_QUOTA_BYTES', '');
    const quota = Number.parseInt(raw, 10);
    if (!Number.isFinite(quota) || quota <= 0) return;

    const usage = await tx.sticker.aggregate({
      where: { pack: { ownerId } },
      _sum: { sizeBytes: true },
    });
    if ((usage._sum.sizeBytes ?? 0) + incomingBytes > quota) {
      throw new Error('Storage quota exceeded for this pack owner');
    }
  }
}