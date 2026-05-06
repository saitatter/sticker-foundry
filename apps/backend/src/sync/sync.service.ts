import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma.service';
import { WHATSAPP_LIMITS } from '../packs/whatsapp-constraints';

@Injectable()
export class SyncService {
  constructor(private readonly prisma: PrismaService) {}

  async packs(userId: string) {
    const packs = await this.prisma.pack.findMany({
      where: {
        OR: [{ ownerId: userId }, { isPublic: true }],
      },
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
      include: {
        _count: { select: { stickers: true } },
      },
    });

    return {
      serverTime: new Date().toISOString(),
      packs: packs.map(({ _count, ...pack }) => {
        const stickerCount = _count.stickers;
        const updatedAt = pack.updatedAt.toISOString();
        const canExport =
          stickerCount >= WHATSAPP_LIMITS.minStickersPerPack && stickerCount <= WHATSAPP_LIMITS.maxStickersPerPack;

        return {
          id: pack.id,
          name: pack.name,
          publisher: pack.publisher,
          description: pack.description,
          isPublic: pack.isPublic,
          isOwner: pack.ownerId === userId,
          imageDataVersion: pack.imageDataVersion,
          stickerCount,
          canExport,
          updatedAt,
          syncHash: this.syncHash(pack.id, pack.imageDataVersion, stickerCount, updatedAt),
          exportPath: `/packs/${pack.id}/export`,
          trayIconPath: `/packs/${pack.id}/tray-icon`,
        };
      }),
    };
  }

  private syncHash(packId: string, imageDataVersion: string, stickerCount: number, updatedAt: string) {
    return createHash('sha256').update(`${packId}:${imageDataVersion}:${stickerCount}:${updatedAt}`).digest('hex');
  }
}
