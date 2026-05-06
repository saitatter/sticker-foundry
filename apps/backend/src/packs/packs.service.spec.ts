import { BadRequestException } from '@nestjs/common';
import { PacksService } from './packs.service';

jest.mock('uuid', () => ({ v4: () => 'generated-sticker-id' }));

function createService() {
  const prisma = {
    pack: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    sticker: {
      create: jest.fn(),
      delete: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(({ where, data }) => ({ where, data })),
    },
    $transaction: jest.fn(async (operations: unknown[]) => operations),
  };

  const exportService = {
    packDirectory: jest.fn((packId: string) => `C:/tmp/sticker-foundry/${packId}`),
  };

  const imageService = {
    processSticker: jest.fn(),
    processTrayIcon: jest.fn(),
    writeProcessedImage: jest.fn(),
  };

  const service = new PacksService(prisma as never, exportService as never, imageService as never);
  return { service, prisma, exportService, imageService };
}

describe(PacksService, () => {
  it('stores uploaded stickers at the next pack position and creates a tray icon for the first sticker', async () => {
    const { service, prisma, imageService } = createService();
    const processedSticker = { buffer: Buffer.from('sticker'), sizeBytes: 42, sha256: 'sticker-sha' };
    const processedTray = { buffer: Buffer.from('tray'), sizeBytes: 20, sha256: 'tray-sha' };

    prisma.pack.findUnique.mockResolvedValue({
      id: 'pack-1',
      ownerId: 'owner-1',
      imageDataVersion: '4',
      _count: { stickers: 0 },
    });
    imageService.processSticker.mockResolvedValue(processedSticker);
    imageService.processTrayIcon.mockResolvedValue(processedTray);
    prisma.sticker.create.mockImplementation(async ({ data }) => ({ id: 'sticker-1', ...data }));
    prisma.pack.update.mockResolvedValue({ id: 'pack-1', imageDataVersion: '5' });

    const sticker = await service.uploadSticker(
      'owner-1',
      'pack-1',
      {
        buffer: Buffer.from('source'),
        mimetype: 'image/png',
      } as Express.Multer.File,
      { emojis: ['\uD83D\uDE00', '\uD83D\uDD25'], accessibilityText: 'happy sticker' },
    );

    expect(sticker).toEqual(
      expect.objectContaining({
        fileName: 'generated-sticker-id.webp',
        position: 0,
        sha256: 'sticker-sha',
      }),
    );
    expect(imageService.writeProcessedImage).toHaveBeenCalledWith(
      expect.stringContaining('generated-sticker-id.webp'),
      processedSticker,
    );
    expect(imageService.writeProcessedImage).toHaveBeenCalledWith(expect.stringContaining('tray_icon.webp'), processedTray);
    expect(prisma.pack.update).toHaveBeenCalledWith({
      where: { id: 'pack-1' },
      data: { imageDataVersion: '5' },
    });
  });

  it('assigns later uploaded stickers after the existing sticker count without replacing the tray icon', async () => {
    const { service, prisma, imageService } = createService();

    prisma.pack.findUnique.mockResolvedValue({
      id: 'pack-1',
      ownerId: 'owner-1',
      imageDataVersion: '9',
      _count: { stickers: 2 },
    });
    imageService.processSticker.mockResolvedValue({ buffer: Buffer.from('sticker'), sizeBytes: 50, sha256: 'sha' });
    prisma.sticker.create.mockImplementation(async ({ data }) => ({ id: 'sticker-3', ...data }));
    prisma.pack.update.mockResolvedValue({ id: 'pack-1', imageDataVersion: '10' });

    const sticker = await service.uploadSticker(
      'owner-1',
      'pack-1',
      { buffer: Buffer.from('source'), mimetype: 'image/jpeg' } as Express.Multer.File,
      {},
    );

    expect(sticker.position).toBe(2);
    expect(imageService.processTrayIcon).not.toHaveBeenCalled();
    expect(imageService.writeProcessedImage).toHaveBeenCalledTimes(1);
  });

  it('reorders stickers only when the request contains every sticker in the pack', async () => {
    const { service, prisma } = createService();
    const returnedPack = {
      id: 'pack-1',
      ownerId: 'owner-1',
      isPublic: false,
      stickers: [
        { id: 'sticker-c', position: 0 },
        { id: 'sticker-a', position: 1 },
        { id: 'sticker-b', position: 2 },
      ],
      _count: { stickers: 3 },
    };

    prisma.pack.findUnique
      .mockResolvedValueOnce({
        id: 'pack-1',
        ownerId: 'owner-1',
        imageDataVersion: '11',
        stickers: [{ id: 'sticker-a' }, { id: 'sticker-b' }, { id: 'sticker-c' }],
      })
      .mockResolvedValueOnce(returnedPack);
    prisma.pack.update.mockResolvedValue({ id: 'pack-1', imageDataVersion: '12' });

    const result = await service.reorderStickers('owner-1', 'pack-1', {
      stickerIds: ['sticker-c', 'sticker-a', 'sticker-b'],
    });

    expect(prisma.sticker.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'sticker-c' },
      data: { position: 0 },
    });
    expect(prisma.sticker.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'sticker-a' },
      data: { position: 1 },
    });
    expect(prisma.sticker.update).toHaveBeenNthCalledWith(3, {
      where: { id: 'sticker-b' },
      data: { position: 2 },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith([
      { where: { id: 'sticker-c' }, data: { position: 0 } },
      { where: { id: 'sticker-a' }, data: { position: 1 } },
      { where: { id: 'sticker-b' }, data: { position: 2 } },
    ]);
    expect(prisma.pack.update).toHaveBeenCalledWith({
      where: { id: 'pack-1' },
      data: { imageDataVersion: '12' },
    });
    expect(result.stickerCount).toBe(3);
  });

  it('rejects reorder requests with missing or foreign sticker ids', async () => {
    const { service, prisma } = createService();

    prisma.pack.findUnique.mockResolvedValue({
      id: 'pack-1',
      ownerId: 'owner-1',
      imageDataVersion: '1',
      stickers: [{ id: 'sticker-a' }, { id: 'sticker-b' }],
    });

    await expect(
      service.reorderStickers('owner-1', 'pack-1', {
        stickerIds: ['sticker-a', 'other-pack-sticker'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.pack.update).not.toHaveBeenCalled();
  });
});
