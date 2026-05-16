import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PackRole, StickerReviewStatus } from '@prisma/client';
import { PacksService } from './packs.service';

jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomUUID: () => 'generated-sticker-id',
}));

function createService() {
  const prisma: any = {
    appSetting: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    pack: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    sticker: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { sizeBytes: 0 } }),
      create: jest.fn(),
      delete: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn((args: unknown) => args),
    },
    stickerComment: {
      create: jest.fn(),
      delete: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
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
    user: {
      findUnique: jest.fn(),
    },
    team: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(async (operation: unknown): Promise<unknown> => {
      if (typeof operation === 'function') {
        return (operation as (tx: unknown) => Promise<unknown>)(prisma);
      }
      return operation;
    }),
  };

  const imageService = {
    processSticker: jest.fn(),
    processTrayIcon: jest.fn(),
  };

  const backgroundRemoval = {
    remove: jest.fn(async (input: Buffer) => input),
  };

  const storage = {
    writeImage: jest.fn(),
    replaceImage: jest.fn(),
    writeBuffer: jest.fn(),
    deletePack: jest.fn(),
    copyPack: jest.fn(),
    readBuffer: jest.fn().mockResolvedValue(Buffer.from('old-sticker')),
    readStream: jest.fn(),
    deleteFile: jest.fn(),
    copyFile: jest.fn(),
  };

  const config = {
    get: jest.fn((_key: string, fallback?: string) => fallback),
  };

  const audit = {
    record: jest.fn().mockResolvedValue({ id: 'audit-1' }),
  };

  const mediaQueue = {
    enqueue: jest.fn((task: () => Promise<unknown>) => task()),
  };

  const service = new PacksService(
    prisma as never,
    imageService as never,
    backgroundRemoval as never,
    config as never,
    audit as never,
    mediaQueue as never,
    storage as never,
  );
  return { service, prisma, imageService, backgroundRemoval, audit, storage };
}

describe(PacksService, () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stores uploaded stickers at the next pack position and creates a tray icon for the first sticker', async () => {
    const { service, prisma, imageService, storage } = createService();
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
    prisma.sticker.create.mockImplementation(async ({ data }: { data: any }) => ({ id: 'sticker-1', ...data }));
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
    expect(storage.writeImage).toHaveBeenCalledWith('pack-1', 'generated-sticker-id.webp', processedSticker);
    expect(storage.writeImage).toHaveBeenCalledWith('pack-1', 'tray_icon.webp', processedTray);
    expect(prisma.pack.update).toHaveBeenCalledWith({
      where: { id: 'pack-1' },
      data: { imageDataVersion: '5' },
    });
  });

  it('creates packs inside editable teams', async () => {
    const { service, prisma } = createService();
    prisma.team.findUnique.mockResolvedValue({
      id: 'team-1',
      ownerId: 'other-user',
      members: [{ role: PackRole.EDITOR }],
    });
    prisma.pack.create.mockResolvedValue({
      id: 'pack-1',
      ownerId: 'editor-1',
      teamId: 'team-1',
      name: 'Team Pack',
      publisher: 'Team',
      isPublic: false,
    });
    prisma.pack.findUnique.mockResolvedValue({
      id: 'pack-1',
      ownerId: 'editor-1',
      teamId: 'team-1',
      name: 'Team Pack',
      publisher: 'Team',
      isPublic: false,
      team: { name: 'Team', members: [{ userId: 'editor-1', role: PackRole.EDITOR }] },
      members: [],
      stickers: [],
      _count: { stickers: 0 },
    });

    await expect(
      service.create('editor-1', {
        name: 'Team Pack',
        publisher: 'Team',
        isPublic: false,
        teamId: 'team-1',
      }),
    ).resolves.toEqual(expect.objectContaining({ teamId: 'team-1', teamName: 'Team' }));
    expect(prisma.team.findUnique).toHaveBeenCalledWith({
      where: { id: 'team-1' },
      include: { members: { where: { userId: 'editor-1' }, select: { role: true } } },
    });
    expect(prisma.pack.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ teamId: 'team-1' }),
    });
  });

  it('lists public packs without exposing sticker rows', async () => {
    const { service, prisma } = createService();
    prisma.pack.findMany.mockResolvedValue([
      {
        id: 'public-pack',
        ownerId: 'owner-1',
        name: 'Public Pack',
        publisher: 'Foundry',
        description: null,
        isPublic: true,
        requiresApproval: true,
        isAnimated: false,
        imageDataVersion: '3',
        updatedAt: new Date('2026-05-07T10:00:00Z'),
        stickers: [{ id: 'approved-1' }],
        _count: { stickers: 4 },
      },
    ]);

    await expect(service.publicPacks()).resolves.toEqual([
      expect.objectContaining({
        id: 'public-pack',
        stickerCount: 4,
        exportStickerCount: 1,
        canExport: false,
        stickers: undefined,
      }),
    ]);
    expect(prisma.pack.findMany).toHaveBeenCalledWith({
      where: { isPublic: true },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { stickers: true } },
        stickers: { where: { reviewStatus: StickerReviewStatus.APPROVED }, select: { id: true } },
      },
    });
  });

  it('assigns later uploaded stickers after the existing sticker count without replacing the tray icon', async () => {
    const { service, prisma, imageService, storage } = createService();

    prisma.pack.findUnique.mockResolvedValue({
      id: 'pack-1',
      ownerId: 'owner-1',
      imageDataVersion: '9',
      _count: { stickers: 2 },
    });
    imageService.processSticker.mockResolvedValue({ buffer: Buffer.from('sticker'), sizeBytes: 50, sha256: 'sha' });
    prisma.sticker.create.mockImplementation(async ({ data }: { data: any }) => ({ id: 'sticker-3', ...data }));
    prisma.pack.update.mockResolvedValue({ id: 'pack-1', imageDataVersion: '10' });

    const sticker = await service.uploadSticker(
      'owner-1',
      'pack-1',
      { buffer: Buffer.from('source'), mimetype: 'image/jpeg' } as Express.Multer.File,
      {},
    );

    expect(sticker.position).toBe(2);
    expect(imageService.processTrayIcon).not.toHaveBeenCalled();
    expect(storage.writeImage).toHaveBeenCalledTimes(1);
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

  it('rejects stale If-Match pack versions before edits', async () => {
    const { service, prisma } = createService();
    prisma.pack.findUnique.mockResolvedValue({
      id: 'pack-1',
      ownerId: 'owner-1',
      imageDataVersion: '12',
      members: [],
    });

    await expect(service.assertPackVersion('owner-1', 'pack-1', '"11"')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.assertPackVersion('owner-1', 'pack-1', '"12"')).resolves.toBeUndefined();
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
    prisma.packInvite.create.mockImplementation(async ({ data }: { data: any }) => ({ id: 'invite-1', ...data }));

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
        imageDataVersion: '5',
        _count: { stickers: 1 },
      })
      .mockResolvedValueOnce({
        id: 'pack-1',
        ownerId: 'owner-1',
        imageDataVersion: '5',
        _count: { stickers: 1 },
      })
      .mockResolvedValueOnce({
        id: 'pack-1',
        ownerId: 'owner-1',
        imageDataVersion: '6',
        members: [{ userId: 'viewer-1', role: PackRole.VIEWER }],
      });
    imageService.processSticker.mockResolvedValue({ buffer: Buffer.from('sticker'), sizeBytes: 50, sha256: 'sha' });
    prisma.sticker.create.mockImplementation(async ({ data }: { data: any }) => ({ id: 'sticker-2', ...data }));
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

  it('adds and deletes sticker comments for collaborators', async () => {
    const { service, prisma } = createService();
    prisma.pack.findUnique.mockResolvedValue({
      id: 'pack-1',
      ownerId: 'owner-1',
      imageDataVersion: '1',
      members: [{ userId: 'editor-1', role: PackRole.EDITOR }],
    });
    prisma.sticker.findFirst.mockResolvedValue({ id: 'sticker-1' });
    prisma.stickerComment.create.mockImplementation(async ({ data }: { data: any }) => ({
      id: 'comment-1',
      ...data,
      createdAt: new Date('2026-05-07T09:00:00.000Z'),
      updatedAt: new Date('2026-05-07T09:00:00.000Z'),
      user: { id: data.userId, email: 'editor@example.com', displayName: 'Editor' },
    }));
    prisma.stickerComment.findFirst.mockResolvedValue({ id: 'comment-1', stickerId: 'sticker-1', userId: 'editor-1' });

    await expect(
      service.createStickerComment('editor-1', 'pack-1', 'sticker-1', {
        body: '  needs a brighter outline  ',
      }),
    ).resolves.toEqual(expect.objectContaining({ body: 'needs a brighter outline' }));
    await expect(service.deleteStickerComment('editor-1', 'pack-1', 'sticker-1', 'comment-1')).resolves.toEqual({
      deleted: true,
    });

    expect(prisma.stickerComment.delete).toHaveBeenCalledWith({ where: { id: 'comment-1' } });
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

  it('rejects email-bound invites for a different signed-in user', async () => {
    const { service, prisma } = createService();

    prisma.packInvite.findUnique.mockResolvedValue({
      id: 'invite-1',
      packId: 'pack-1',
      email: 'friend@example.com',
      role: PackRole.EDITOR,
      acceptedAt: null,
      expiresAt: null,
      pack: { id: 'pack-1' },
    });
    prisma.user.findUnique.mockResolvedValue({ email: 'other@example.com' });

    await expect(service.acceptInvite('other-user', 'invite-code')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.packMember.upsert).not.toHaveBeenCalled();
    expect(prisma.packInvite.update).not.toHaveBeenCalled();
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
    const { service, prisma, storage } = createService();

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
    prisma.sticker.create.mockImplementation(async ({ data }: { data: any }) => ({ id: 'copy-1', ...data }));
    prisma.pack.update.mockResolvedValue({ id: 'target-pack', imageDataVersion: '8' });

    await expect(
      service.copyStickers('owner-1', 'source-pack', {
        targetPackId: 'target-pack',
        stickerIds: ['sticker-1'],
      }),
    ).resolves.toEqual(expect.objectContaining({ id: 'target-pack', stickerCount: 3 }));

    expect(storage.copyFile).toHaveBeenCalledWith('source-pack', 'source.webp', 'target-pack', 'generated-sticker-id.webp');
    expect(prisma.sticker.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        packId: 'target-pack',
        fileName: 'generated-sticker-id.webp',
        position: 2,
      }),
    });
  });

  it('blocks sticker uploads when the owner storage quota would be exceeded', async () => {
    const { service, prisma, imageService, storage } = createService();

    prisma.appSetting.findUnique.mockResolvedValue({ key: 'storageQuotaBytes', value: '100' });
    prisma.sticker.aggregate.mockResolvedValue({ _sum: { sizeBytes: 80 } });
    prisma.pack.findUnique
      .mockResolvedValueOnce({
        id: 'pack-1',
        ownerId: 'owner-1',
        imageDataVersion: '1',
        _count: { stickers: 0 },
      })
      .mockResolvedValueOnce({
        id: 'pack-1',
        ownerId: 'owner-1',
        imageDataVersion: '1',
        members: [],
      })
      .mockResolvedValueOnce({
        id: 'pack-1',
        ownerId: 'owner-1',
        imageDataVersion: '1',
        _count: { stickers: 0 },
      });
    imageService.processSticker.mockResolvedValue({ buffer: Buffer.from('sticker'), sizeBytes: 50, sha256: 'sha' });

    await expect(
      service.uploadSticker(
        'owner-1',
        'pack-1',
        { buffer: Buffer.from('source'), mimetype: 'image/png' } as Express.Multer.File,
        {},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(storage.writeImage).not.toHaveBeenCalled();
    expect(prisma.sticker.create).not.toHaveBeenCalled();
  });

  it('moves selected stickers into another editable pack and rejects full targets', async () => {
    const { service, prisma, storage } = createService();

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
    expect(storage.copyFile).not.toHaveBeenCalled();

    storage.copyFile.mockClear();
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
        id: 'source-pack',
        ownerId: 'owner-1',
        imageDataVersion: '3',
      })
      .mockResolvedValueOnce({
        id: 'target-pack',
        ownerId: 'owner-1',
        imageDataVersion: '7',
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

    expect(storage.copyFile).toHaveBeenCalledWith('source-pack', 'source.webp', 'target-pack', 'generated-sticker-id.webp');
    expect(storage.deleteFile).toHaveBeenCalledWith('source-pack', 'source.webp');
    expect(prisma.sticker.update).toHaveBeenCalledWith({
      where: { id: 'sticker-1' },
      data: expect.objectContaining({
        packId: 'target-pack',
        fileName: 'generated-sticker-id.webp',
        position: 2,
      }),
    });
  });

  it('keeps a successful move response when source file cleanup needs later attention', async () => {
    const { service, prisma, storage, audit } = createService();

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
        id: 'source-pack',
        ownerId: 'owner-1',
        imageDataVersion: '3',
      })
      .mockResolvedValueOnce({
        id: 'target-pack',
        ownerId: 'owner-1',
        imageDataVersion: '7',
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
    prisma.pack.update.mockResolvedValue({ id: 'pack', imageDataVersion: '8' });
    storage.deleteFile.mockRejectedValue(new Error('storage is temporarily locked'));

    await expect(
      service.moveStickers('owner-1', 'source-pack', {
        targetPackId: 'target-pack',
        stickerIds: ['sticker-1'],
      }),
    ).resolves.toEqual(expect.objectContaining({ id: 'target-pack' }));

    expect(storage.deleteFile).toHaveBeenCalledTimes(2);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'owner-1',
        action: 'sticker.move.sourceCleanup.failed',
        entityType: 'pack',
        entityId: 'source-pack',
        metadata: expect.objectContaining({ fileNames: ['source.webp'], targetPackId: 'target-pack' }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'owner-1',
        action: 'sticker.move',
        entityType: 'pack',
        entityId: 'target-pack',
      }),
    );
  });

  it('replaces a sticker image without changing its metadata or file name', async () => {
    const { service, prisma, imageService, storage } = createService();
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

    expect(storage.replaceImage).toHaveBeenCalledWith('pack-1', 'existing.webp', processed);
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
