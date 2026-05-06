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
        stickers: {
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
          select: { fileName: true, sha256: true },
        },
      },
    });

    return {
      serverTime: new Date().toISOString(),
      packs: packs.map(({ _count, stickers, ...pack }) => {
        const stickerCount = _count.stickers;
        const updatedAt = pack.updatedAt.toISOString();
        const canExport =
          stickerCount >= WHATSAPP_LIMITS.minStickersPerPack && stickerCount <= WHATSAPP_LIMITS.maxStickersPerPack;
        const contentHash = this.contentHash(pack.id, pack.imageDataVersion, stickers);

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
          contentHash,
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

  private contentHash(packId: string, imageDataVersion: string, stickers: Array<{ fileName: string; sha256: string }>) {
    const hash = createHash('sha256');
    hash.update(`${packId}:${imageDataVersion}`);
    for (const sticker of stickers) {
      hash.update(`${sticker.fileName}:${sticker.sha256}`);
    }
    return hash.digest('hex');
  }
}
