import { SyncService } from './sync.service';

function createService() {
  const prisma = {
    pack: {
      findMany: jest.fn(),
    },
  };

  return {
    prisma,
    service: new SyncService(prisma as never),
  };
}

describe(SyncService, () => {
  it('returns sync metadata for owned and public packs', async () => {
    const { prisma, service } = createService();
    prisma.pack.findMany.mockResolvedValue([
      {
        id: 'owned-pack',
        name: 'Owned',
        publisher: 'Me',
        description: null,
        isPublic: false,
        ownerId: 'user-1',
        imageDataVersion: '4',
        updatedAt: new Date('2026-05-07T08:00:00.000Z'),
        _count: { stickers: 3 },
      },
      {
        id: 'public-pack',
        name: 'Public',
        publisher: 'Friend',
        description: 'Shared',
        isPublic: true,
        ownerId: 'user-2',
        imageDataVersion: '9',
        updatedAt: new Date('2026-05-07T09:00:00.000Z'),
        _count: { stickers: 2 },
      },
    ]);

    const result = await service.packs('user-1');

    expect(prisma.pack.findMany).toHaveBeenCalledWith({
      where: {
        OR: [{ ownerId: 'user-1' }, { isPublic: true }],
      },
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
      include: {
        _count: { select: { stickers: true } },
      },
    });
    expect(result.serverTime).toEqual(expect.any(String));
    expect(result.packs).toEqual([
      expect.objectContaining({
        id: 'owned-pack',
        isOwner: true,
        canExport: true,
        stickerCount: 3,
        updatedAt: '2026-05-07T08:00:00.000Z',
        exportPath: '/packs/owned-pack/export',
        trayIconPath: '/packs/owned-pack/tray-icon',
      }),
      expect.objectContaining({
        id: 'public-pack',
        isOwner: false,
        canExport: false,
        stickerCount: 2,
        updatedAt: '2026-05-07T09:00:00.000Z',
        exportPath: '/packs/public-pack/export',
        trayIconPath: '/packs/public-pack/tray-icon',
      }),
    ]);
    expect(result.packs[0].syncHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.packs[1].syncHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.packs[0].syncHash).not.toBe(result.packs[1].syncHash);
  });
});
