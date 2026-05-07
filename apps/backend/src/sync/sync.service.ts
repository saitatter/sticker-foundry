import { Injectable } from '@nestjs/common';
import { PackRole, StickerReviewStatus } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma.service';
import { WHATSAPP_LIMITS } from '../packs/whatsapp-constraints';

@Injectable()
export class SyncService {
  constructor(private readonly prisma: PrismaService) {}

  async packs(userId: string) {
    const packs = await this.prisma.pack.findMany({
      where: {
        OR: [{ ownerId: userId }, { isPublic: true }, { members: { some: { userId } } }, { team: { members: { some: { userId } } } }],
      },
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
      include: {
        _count: { select: { stickers: true } },
        stickers: {
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
          select: { fileName: true, sha256: true, reviewStatus: true },
        },
        members: { where: { userId }, select: { userId: true, role: true } },
        team: { include: { members: { where: { userId }, select: { userId: true, role: true } } } },
      },
    });

    return {
      serverTime: new Date().toISOString(),
      packs: packs.map(({ _count, stickers, members, team, ...pack }) => {
        const exportStickers = pack.requiresApproval
          ? stickers.filter((sticker) => sticker.reviewStatus === StickerReviewStatus.APPROVED)
          : stickers;
        const stickerCount = exportStickers.length;
        const updatedAt = pack.updatedAt.toISOString();
        const canExport =
          stickerCount >= WHATSAPP_LIMITS.minStickersPerPack && stickerCount <= WHATSAPP_LIMITS.maxStickersPerPack;
        const contentHash = this.contentHash(pack.id, pack.imageDataVersion, exportStickers);

        const role =
          pack.ownerId === userId
            ? PackRole.OWNER
            : (members?.[0]?.role ?? team?.members?.[0]?.role ?? (pack.isPublic ? PackRole.VIEWER : undefined));

        return {
          id: pack.id,
          name: pack.name,
          publisher: pack.publisher,
          description: pack.description,
          isPublic: pack.isPublic,
          requiresApproval: pack.requiresApproval,
          isOwner: pack.ownerId === userId,
          role,
          teamId: pack.teamId,
          teamName: team?.name,
          canEdit: role === PackRole.OWNER || role === PackRole.EDITOR,
          canManage: role === PackRole.OWNER,
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
