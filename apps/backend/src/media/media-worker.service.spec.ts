import { JobStatus } from '@prisma/client';
import { MediaWorkerService } from './media-worker.service';

function createWorker(options: { stickerCount?: number; existingSticker?: boolean } = {}) {
  const transactionClient = {
    appSetting: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    pack: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'pack-1',
        ownerId: 'owner-1',
        imageDataVersion: '4',
        _count: { stickers: options.stickerCount ?? 0 },
      }),
      update: jest.fn(),
    },
    sticker: {
      findFirst: jest.fn().mockResolvedValue(options.existingSticker ? { id: 'sticker-1' } : null),
      create: jest.fn().mockResolvedValue({ id: 'sticker-2' }),
      aggregate: jest.fn().mockResolvedValue({ _sum: { sizeBytes: 0 } }),
    },
  };
  const prisma = {
    mediaJob: {
      findUnique: jest
        .fn()
        .mockResolvedValueOnce({ id: 'job-1', status: JobStatus.QUEUED, userId: 'owner-1' })
        .mockResolvedValue({ status: JobStatus.PROCESSING }),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(async (callback: (client: typeof transactionClient) => Promise<unknown>) => callback(transactionClient)),
  };
  const imageService = {
    processSticker: jest.fn().mockResolvedValue({
      bytes: Buffer.from('sticker'),
      sizeBytes: 7,
      sha256: 'sha256',
      perceptualHash: 'perceptual-hash',
    }),
    processTrayIcon: jest.fn().mockResolvedValue({
      bytes: Buffer.from('tray'),
      sizeBytes: 4,
      sha256: 'tray-sha256',
      perceptualHash: 'tray-hash',
    }),
  };
  const backgroundRemoval = {
    remove: jest.fn().mockImplementation(async (input: Buffer) => input),
  };
  const storage = {
    download: jest.fn().mockResolvedValue(Buffer.from('source')),
    upload: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    exists: jest.fn().mockResolvedValue(false),
  };
  const packStorage = {
    storageKeyFor: jest.fn().mockReturnValue('packs/pack-1/cover.webp'),
  };
  const execution = {
    claim: jest.fn().mockResolvedValue({ id: 'job-1', status: JobStatus.PROCESSING }),
    progress: jest.fn().mockResolvedValue({ count: 1 }),
    complete: jest.fn().mockResolvedValue(true),
    fail: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const config = {
    get: jest.fn((_key: string, fallback?: string) => fallback),
  };
  const service = new MediaWorkerService(
    prisma as never,
    config as never,
    imageService as never,
    backgroundRemoval as never,
    storage as never,
    packStorage as never,
    execution as never,
  );
  return { service, prisma, transactionClient, imageService, storage, packStorage, execution };
}

function stickerJob() {
  return {
    attemptsMade: 0,
    opts: { attempts: 3 },
    data: {
      mediaJobId: 'job-1',
      kind: 'sticker-upload',
      inputKey: 'packs/jobs/job-1/input',
      outputKey: 'packs/pack-1/stickers/sticker.webp',
      mimeType: 'image/webp',
      packId: 'pack-1',
      fileName: 'sticker.webp',
      createTrayIcon: true,
    },
  };
}

describe(MediaWorkerService, () => {
  it('persists a processed sticker and repairs its tray icon from storage', async () => {
    const { service, transactionClient, imageService, storage } = createWorker();

    await (service as unknown as { process: (job: unknown) => Promise<unknown> }).process(stickerJob());

    expect(transactionClient.sticker.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        packId: 'pack-1',
        fileName: 'sticker.webp',
        position: 0,
        sizeBytes: 7,
        sha256: 'sha256',
      }),
    });
    expect(imageService.processTrayIcon).toHaveBeenCalledWith(Buffer.from('source'));
    expect(storage.upload).toHaveBeenCalledWith({
      key: 'packs/pack-1/cover.webp',
      body: Buffer.from('tray'),
      mimeType: 'image/webp',
    });
    expect(storage.delete).toHaveBeenCalledWith('packs/jobs/job-1/input');
    expect((storage.upload as jest.Mock).mock.calls[0][0]).toEqual(
      expect.objectContaining({ key: 'packs/pack-1/stickers/sticker.webp' }),
    );
  });

  it('does not reject an idempotent retry when the pack has reached its sticker limit', async () => {
    const { service, transactionClient, imageService } = createWorker({ stickerCount: 30, existingSticker: true });

    await (service as unknown as { process: (job: unknown) => Promise<unknown> }).process(stickerJob());

    expect(transactionClient.sticker.create).not.toHaveBeenCalled();
    expect(imageService.processTrayIcon).toHaveBeenCalled();
  });
});