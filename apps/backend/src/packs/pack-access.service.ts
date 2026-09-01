import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PackRole, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { WHATSAPP_LIMITS } from './whatsapp-constraints';

export type AccessPack = {
  id?: string;
  ownerId: string;
  teamId?: string | null;
  imageDataVersion?: string;
  isPublic?: boolean;
  isAnimated?: boolean;
  _count?: { stickers: number };
  members?: Array<{ userId: string; role: PackRole }>;
  team?: { members?: Array<{ userId?: string; role: PackRole }> } | null;
};

@Injectable()
export class PackAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async loadPackForAccess(userId: string, packId: string) {
    return this.prisma.pack.findUnique({
      where: { id: packId },
      include: {
        members: { where: { userId }, select: { userId: true, role: true } },
        team: { include: { members: { where: { userId }, select: { userId: true, role: true } } } },
      },
    });
  }

  async requireManage(userId: string, packId: string) {
    const pack = await this.loadPackForAccess(userId, packId);
    if (!pack) {
      throw new NotFoundException('Pack not found');
    }
    if (!this.canManage(userId, pack)) {
      throw new ForbiddenException('Only the owner can manage this pack');
    }
    return pack;
  }

  async requireTeamEdit(userId: string, teamId: string) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: { members: { where: { userId }, select: { role: true } } },
    });
    if (!team) {
      throw new NotFoundException('Team not found');
    }
    const role = team.ownerId === userId ? PackRole.OWNER : team.members[0]?.role;
    if (role !== PackRole.OWNER && role !== PackRole.EDITOR) {
      throw new ForbiddenException('Only team owners and editors can create packs in this team');
    }
    return team;
  }

  async requireStickerView(userId: string, packId: string, stickerId: string) {
    const pack = await this.loadPackForAccess(userId, packId);
    if (!pack) {
      throw new NotFoundException('Pack not found');
    }
    if (!this.canView(userId, pack)) {
      throw new ForbiddenException('You do not have access to this pack');
    }
    const sticker = await this.prisma.sticker.findFirst({ where: { id: stickerId, packId }, select: { id: true } });
    if (!sticker) {
      throw new NotFoundException('Sticker not found');
    }
    return pack;
  }

  accessSummary(userId: string, pack: AccessPack) {
    const role = this.roleFor(userId, pack) ?? (pack.isPublic ? PackRole.VIEWER : undefined);
    return {
      role,
      canEdit: role === PackRole.OWNER || role === PackRole.EDITOR,
      canManage: role === PackRole.OWNER,
    };
  }

  canView(userId: string, pack: AccessPack) {
    return Boolean(pack.isPublic || this.roleFor(userId, pack));
  }

  canEdit(userId: string, pack: AccessPack) {
    const role = this.roleFor(userId, pack);
    return role === PackRole.OWNER || role === PackRole.EDITOR;
  }

  canManage(userId: string, pack: AccessPack) {
    return this.roleFor(userId, pack) === PackRole.OWNER;
  }

  roleFor(userId: string, pack: AccessPack) {
    if (pack.ownerId === userId) {
      return PackRole.OWNER;
    }
    return pack.members?.find((member) => member.userId === userId)?.role ?? pack.team?.members?.[0]?.role;
  }

  assertTargetCapacity(target: AccessPack, incomingCount: number) {
    const currentCount = target._count?.stickers ?? 0;
    if (currentCount + incomingCount > WHATSAPP_LIMITS.maxStickersPerPack) {
      throw new BadRequestException(`A pack can contain at most ${WHATSAPP_LIMITS.maxStickersPerPack} stickers`);
    }
  }

  async enforceStorageQuota(ownerId: string, incomingBytes: number, tx: Prisma.TransactionClient | PrismaService = this.prisma) {
    if (incomingBytes <= 0) return;
    const quota = await this.storageQuotaBytes();
    if (!quota) return;

    const usage = await tx.sticker.aggregate({
      where: { pack: { ownerId } },
      _sum: { sizeBytes: true },
    });
    const usedBytes = usage._sum.sizeBytes ?? 0;
    if (usedBytes + incomingBytes > quota) {
      throw new BadRequestException('Storage quota exceeded for this pack owner');
    }
  }

  async assertCanInsertSticker(
    packId: string,
    ownerId: string,
    incomingBytes: number,
    perceptualHash?: string,
    ignoreStickerId?: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const pack = await tx.pack.findUnique({
      where: { id: packId },
      include: { _count: { select: { stickers: true } } },
    });
    if (!pack) {
      throw new NotFoundException('Pack not found');
    }
    this.assertTargetCapacity(pack, 1);
    await this.rejectDuplicateSticker(packId, perceptualHash, ignoreStickerId, tx);
    await this.enforceStorageQuota(ownerId, incomingBytes, tx);
    return pack;
  }

  async rejectDuplicateSticker(
    packId: string,
    perceptualHash?: string,
    ignoreStickerId?: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    if (!perceptualHash) return;
    const duplicate = await tx.sticker.findFirst({
      where: {
        packId,
        perceptualHash,
        ...(ignoreStickerId ? { id: { not: ignoreStickerId } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new BadRequestException('This image looks like a duplicate of an existing sticker in the pack');
    }
  }

  newImageDataVersion(previous: string) {
    const numeric = Number.parseInt(previous, 10);
    if (Number.isFinite(numeric)) {
      return String(numeric + 1);
    }
    return String(Date.now());
  }

  versionFromIfMatch(ifMatch: string | undefined) {
    const value = ifMatch?.trim();
    if (!value) return null;
    return value.replace(/^W\//, '').replace(/^"|"$/g, '');
  }

  private async storageQuotaBytes() {
    const setting = await this.prisma.appSetting.findUnique({ where: { key: 'storageQuotaBytes' } });
    const raw = setting?.value || this.config.get<string>('STORAGE_QUOTA_BYTES', '');
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
}
