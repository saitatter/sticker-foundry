import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PackRole } from '@prisma/client';
import { cp, mkdir, rm } from 'fs/promises';
import { PacksService } from './packs.service';

jest.mock('uuid', () => ({ v4: () => 'generated-sticker-id' }));
jest.mock('fs/promises', () => ({
  cp: jest.fn(),
  mkdir: jest.fn(),
  rm: jest.fn(),
}));

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
      update: jest.fn((args: unknown) => args),
    },
    packMember: {
      delete: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn((args: unknown) => args),
    },
    packInvite: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn((args: unknown) => args),
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
  beforeEach(() => {
    jest.clearAllMocks();
  });

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
      prisma.pack.update.mock.results[0].value,
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

  it('creates editor invites for pack owners and rejects owner invites', async () => {
    const { service, prisma } = createService();

    prisma.pack.findUnique.mockResolvedValue({
      id: 'pack-1',
      ownerId: 'owner-1',
      isPublic: false,
      members: [],
    });
    prisma.packInvite.create.mockImplementation(async ({ data }) => ({ id: 'invite-1', ...data }));

    const invite = await service.createInvite('owner-1', 'pack-1', {
      email: 'Friend@Example.com',
      role: PackRole.EDITOR,
    });

    expect(invite).toEqual(
      expect.objectContaining({
        packId: 'pack-1',
        email: 'friend@example.com',
        role: PackRole.EDITOR,
        createdById: 'owner-1',
      }),
    );
    expect(invite.code).toEqual(expect.any(String));

    await expect(
      service.createInvite('owner-1', 'pack-1', {
        role: PackRole.OWNER,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createInvite('owner-1', 'pack-1', {
        role: PackRole.VIEWER,
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows editors to upload stickers but blocks viewers from mutating sticker metadata', async () => {
    const { service, prisma, imageService } = createService();

    prisma.pack.findUnique
      .mockResolvedValueOnce({
        id: 'pack-1',
        ownerId: 'owner-1',
        imageDataVersion: '5',
        _count: { stickers: 1 },
      })
      .mockResolvedValueOnce({
        id: 'pack-1',
        ownerId: 'owner-1',
        imageDataVersion: '5',
        members: [{ userId: 'editor-1', role: PackRole.EDITOR }],
      })
      .mockResolvedValueOnce({
        id: 'pack-1',
        ownerId: 'owner-1',
        imageDataVersion: '6',
        members: [{ userId: 'viewer-1', role: PackRole.VIEWER }],
      });
    imageService.processSticker.mockResolvedValue({ buffer: Buffer.from('sticker'), sizeBytes: 50, sha256: 'sha' });
    prisma.sticker.create.mockImplementation(async ({ data }) => ({ id: 'sticker-2', ...data }));
    prisma.pack.update.mockResolvedValue({ id: 'pack-1', imageDataVersion: '6' });

    await expect(
      service.uploadSticker(
        'editor-1',
        'pack-1',
        { buffer: Buffer.from('source'), mimetype: 'image/png' } as Express.Multer.File,
        {},
      ),
    ).resolves.toEqual(expect.objectContaining({ position: 1 }));

    await expect(
      service.updateSticker('viewer-1', 'pack-1', 'sticker-1', {
        emojis: ['\uD83D\uDE00'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('accepts invites by adding or updating pack membership', async () => {
    const { service, prisma } = createService();

    prisma.packInvite.findUnique.mockResolvedValue({
      id: 'invite-1',
      packId: 'pack-1',
      role: PackRole.EDITOR,
      acceptedAt: null,
      expiresAt: null,
      pack: { id: 'pack-1' },
    });
    prisma.pack.findUnique.mockResolvedValue({
      id: 'pack-1',
      ownerId: 'owner-1',
      isPublic: false,
      imageDataVersion: '1',
      stickers: [],
      members: [{ userId: 'editor-1', role: PackRole.EDITOR }],
      _count: { stickers: 0 },
    });

    const pack = await service.acceptInvite('editor-1', 'invite-code');

    expect(prisma.packMember.upsert).toHaveBeenCalledWith({
      where: { packId_userId: { packId: 'pack-1', userId: 'editor-1' } },
      create: { packId: 'pack-1', userId: 'editor-1', role: PackRole.EDITOR },
      update: { role: PackRole.EDITOR },
    });
    expect(prisma.packInvite.update).toHaveBeenCalledWith({
      where: { id: 'invite-1' },
      data: { acceptedAt: expect.any(Date), acceptedById: 'editor-1' },
    });
    expect(pack).toEqual(expect.objectContaining({ role: PackRole.EDITOR, canEdit: true, canManage: false }));
  });

  it('lets owners update members, remove members, and revoke pending invites', async () => {
    const { service, prisma } = createService();

    prisma.pack.findUnique.mockResolvedValue({
      id: 'pack-1',
      ownerId: 'owner-1',
      isPublic: false,
      members: [],
    });
    prisma.packMember.findFirst.mockResolvedValue({
      id: 'member-1',
      packId: 'pack-1',
      userId: 'editor-1',
      role: PackRole.EDITOR,
    });
    prisma.packMember.update.mockResolvedValue({
      id: 'member-1',
      packId: 'pack-1',
      userId: 'editor-1',
      role: PackRole.VIEWER,
      user: { id: 'editor-1', email: 'editor@example.com', displayName: 'Editor' },
    });
    prisma.packInvite.deleteMany.mockResolvedValue({ count: 1 });

    await expect(
      service.updateMember('owner-1', 'pack-1', 'member-1', {
        role: PackRole.VIEWER,
      }),
    ).resolves.toEqual(expect.objectContaining({ role: PackRole.VIEWER }));
    await expect(service.removeMember('owner-1', 'pack-1', 'member-1')).resolves.toEqual({ deleted: true });
    await expect(service.revokeInvite('owner-1', 'pack-1', 'invite-1')).resolves.toEqual({ deleted: true });

    expect(prisma.packMember.delete).toHaveBeenCalledWith({ where: { id: 'member-1' } });
    expect(prisma.packInvite.deleteMany).toHaveBeenCalledWith({
      where: { id: 'invite-1', packId: 'pack-1', acceptedAt: null },
    });
  });

  it('copies selected stickers into another editable pack', async () => {
    const { service, prisma } = createService();

    prisma.pack.findUnique
      .mockResolvedValueOnce({
        id: 'source-pack',
        ownerId: 'owner-1',
        imageDataVersion: '3',
        members: [],
        _count: { stickers: 1 },
      })
      .mockResolvedValueOnce({
        id: 'target-pack',
        ownerId: 'owner-1',
        imageDataVersion: '7',
        members: [],
        _count: { stickers: 2 },
      })
      .mockResolvedValueOnce({
        id: 'target-pack',
        ownerId: 'owner-1',
        imageDataVersion: '8',
        isPublic: false,
        stickers: [],
        members: [],
        _count: { stickers: 3 },
      });
    prisma.sticker.findMany.mockResolvedValue([
      {
        id: 'sticker-1',
        packId: 'source-pack',
        fileName: 'source.webp',
        emojis: ['😀'],
        accessibilityText: 'happy',
        sizeBytes: 42,
        sha256: 'sha',
        position: 0,
      },
    ]);
    prisma.sticker.create.mockImplementation(async ({ data }) => ({ id: 'copy-1', ...data }));
    prisma.pack.update.mockResolvedValue({ id: 'target-pack', imageDataVersion: '8' });

    await expect(
      service.copyStickers('owner-1', 'source-pack', {
        targetPackId: 'target-pack',
        stickerIds: ['sticker-1'],
      }),
    ).resolves.toEqual(expect.objectContaining({ id: 'target-pack', stickerCount: 3 }));

    expect(mkdir).toHaveBeenCalledWith(expect.stringContaining('target-pack'), { recursive: true });
    expect(cp).toHaveBeenCalledWith(expect.stringContaining('source.webp'), expect.stringContaining('generated-sticker-id.webp'));
    expect(prisma.sticker.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        packId: 'target-pack',
        fileName: 'generated-sticker-id.webp',
        position: 2,
      }),
    });
  });

  it('moves selected stickers into another editable pack and rejects full targets', async () => {
    const { service, prisma } = createService();

    prisma.pack.findUnique
      .mockResolvedValueOnce({
        id: 'source-pack',
        ownerId: 'owner-1',
        imageDataVersion: '3',
        members: [],
        _count: { stickers: 1 },
      })
      .mockResolvedValueOnce({
        id: 'target-pack',
        ownerId: 'owner-1',
        imageDataVersion: '7',
        members: [],
        _count: { stickers: 30 },
      });
    prisma.sticker.findMany.mockResolvedValue([
      {
        id: 'sticker-1',
        packId: 'source-pack',
        fileName: 'source.webp',
        emojis: ['😀'],
        accessibilityText: 'happy',
        sizeBytes: 42,
        sha256: 'sha',
        position: 0,
      },
    ]);

    await expect(
      service.moveStickers('owner-1', 'source-pack', {
        targetPackId: 'target-pack',
        stickerIds: ['sticker-1'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(cp).not.toHaveBeenCalledWith(expect.stringContaining('source.webp'), expect.stringContaining('generated-sticker-id.webp'));

    jest.mocked(cp).mockClear();
    prisma.pack.findUnique
      .mockResolvedValueOnce({
        id: 'source-pack',
        ownerId: 'owner-1',
        imageDataVersion: '3',
        members: [],
        _count: { stickers: 1 },
      })
      .mockResolvedValueOnce({
        id: 'target-pack',
        ownerId: 'owner-1',
        imageDataVersion: '7',
        members: [],
        _count: { stickers: 2 },
      })
      .mockResolvedValueOnce({
        id: 'target-pack',
        ownerId: 'owner-1',
        imageDataVersion: '8',
        isPublic: false,
        stickers: [],
        members: [],
        _count: { stickers: 3 },
      });
    prisma.pack.update.mockResolvedValue({ id: 'pack', imageDataVersion: '8' });

    await expect(
      service.moveStickers('owner-1', 'source-pack', {
        targetPackId: 'target-pack',
        stickerIds: ['sticker-1'],
      }),
    ).resolves.toEqual(expect.objectContaining({ id: 'target-pack' }));

    expect(cp).toHaveBeenCalledWith(expect.stringContaining('source.webp'), expect.stringContaining('generated-sticker-id.webp'));
    expect(rm).toHaveBeenCalledWith(expect.stringContaining('source.webp'), { force: true });
    expect(prisma.sticker.update).toHaveBeenCalledWith({
      where: { id: 'sticker-1' },
      data: expect.objectContaining({
        packId: 'target-pack',
        fileName: 'generated-sticker-id.webp',
        position: 2,
      }),
    });
  });

  it('replaces a sticker image without changing its metadata or file name', async () => {
    const { service, prisma, imageService } = createService();
    const processed = { buffer: Buffer.from('new-sticker'), sizeBytes: 77, sha256: 'new-sha' };

    prisma.pack.findUnique.mockResolvedValue({
      id: 'pack-1',
      ownerId: 'owner-1',
      imageDataVersion: '12',
    });
    prisma.sticker.findFirst.mockResolvedValue({
      id: 'sticker-1',
      packId: 'pack-1',
      fileName: 'existing.webp',
      emojis: ['\uD83D\uDE00'],
      accessibilityText: 'same metadata',
      position: 0,
    });
    imageService.processSticker.mockResolvedValue(processed);
    prisma.sticker.update.mockImplementationOnce(async () => ({
      id: 'sticker-1',
      fileName: 'existing.webp',
      emojis: ['\uD83D\uDE00'],
      accessibilityText: 'same metadata',
      position: 0,
      sizeBytes: 77,
      sha256: 'new-sha',
    }));

    const result = await service.replaceStickerImage(
      'owner-1',
      'pack-1',
      'sticker-1',
      { buffer: Buffer.from('source'), mimetype: 'image/png' } as Express.Multer.File,
    );

    expect(imageService.writeProcessedImage).toHaveBeenCalledWith(expect.stringContaining('existing.webp'), processed);
    expect(prisma.sticker.update).toHaveBeenCalledWith({
      where: { id: 'sticker-1' },
      data: {
        sizeBytes: 77,
        sha256: 'new-sha',
      },
    });
    expect(prisma.pack.update).toHaveBeenCalledWith({
      where: { id: 'pack-1' },
      data: { imageDataVersion: '13' },
    });
    expect(result).toEqual(expect.objectContaining({ fileName: 'existing.webp', sha256: 'new-sha' }));
  });
});
