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
        requiresApproval: false,
        ownerId: 'user-1',
        imageDataVersion: '4',
        updatedAt: new Date('2026-05-07T08:00:00.000Z'),
        _count: { stickers: 3 },
        stickers: [
          { fileName: 'a.webp', sha256: 'a-sha' },
          { fileName: 'b.webp', sha256: 'b-sha' },
          { fileName: 'c.webp', sha256: 'c-sha' },
        ],
      },
      {
        id: 'public-pack',
        name: 'Public',
        publisher: 'Friend',
        description: 'Shared',
        isPublic: true,
        requiresApproval: false,
        ownerId: 'user-2',
        imageDataVersion: '9',
        updatedAt: new Date('2026-05-07T09:00:00.000Z'),
        _count: { stickers: 2 },
        stickers: [
          { fileName: 'one.webp', sha256: 'one-sha' },
          { fileName: 'two.webp', sha256: 'two-sha' },
        ],
      },
    ]);

    const result = await service.packs('user-1');

    expect(prisma.pack.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { ownerId: 'user-1' },
          { isPublic: true },
          { members: { some: { userId: 'user-1' } } },
          { team: { members: { some: { userId: 'user-1' } } } },
        ],
      },
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
      include: {
        _count: { select: { stickers: true } },
        stickers: {
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
          select: { fileName: true, sha256: true, reviewStatus: true },
        },
        members: { where: { userId: 'user-1' }, select: { userId: true, role: true } },
        team: { include: { members: { where: { userId: 'user-1' }, select: { userId: true, role: true } } } },
      },
    });
    expect(result.serverTime).toEqual(expect.any(String));
    expect(result.packs).toEqual([
      expect.objectContaining({
        id: 'owned-pack',
        isOwner: true,
        requiresApproval: false,
        role: 'OWNER',
        canEdit: true,
        canManage: true,
        canExport: true,
        stickerCount: 3,
        updatedAt: '2026-05-07T08:00:00.000Z',
        exportPath: '/packs/owned-pack/export',
        trayIconPath: '/packs/owned-pack/tray-icon',
      }),
      expect.objectContaining({
        id: 'public-pack',
        isOwner: false,
        requiresApproval: false,
        role: 'VIEWER',
        canEdit: false,
        canManage: false,
        canExport: false,
        stickerCount: 2,
        updatedAt: '2026-05-07T09:00:00.000Z',
        exportPath: '/packs/public-pack/export',
        trayIconPath: '/packs/public-pack/tray-icon',
      }),
    ]);
    expect(result.packs[0].syncHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.packs[1].syncHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.packs[0].contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.packs[1].contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.packs[0].syncHash).not.toBe(result.packs[1].syncHash);
    expect(result.packs[0].contentHash).not.toBe(result.packs[1].contentHash);
  });
});
