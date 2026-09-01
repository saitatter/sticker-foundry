import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StickerReviewStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { JobsService } from '../jobs/jobs.service';
import { PrismaService } from '../prisma.service';
import { BackgroundRemovalService } from '../media/background-removal.service';
import { CreatePackInviteDto } from './dto/create-pack-invite.dto';
import { CreatePackDto } from './dto/create-pack.dto';
import { CreateStickerCommentDto } from './dto/create-sticker-comment.dto';
import { ReorderStickersDto } from './dto/reorder-stickers.dto';
import { TransferStickersDto } from './dto/transfer-stickers.dto';
import { UpdatePackMemberDto } from './dto/update-pack-member.dto';
import { UpdatePackDto } from './dto/update-pack.dto';
import { UpdateStickerDto } from './dto/update-sticker.dto';
import { UploadStickerDto } from './dto/upload-sticker.dto';
import { MediaQueueService } from './media-queue.service';
import { PacksCollaborationService } from './packs-collaboration.service';
import { PackAccessService } from './pack-access.service';
import { PacksStickerService } from './packs-sticker.service';
import { PackStorageService } from '../storage/pack-storage.service';
import { StickerImageService } from '../media/sticker-image.service';
import { WHATSAPP_LIMITS } from './whatsapp-constraints';

@Injectable()
export class PacksService {
  private readonly access: PackAccessService;
  private readonly stickerService: PacksStickerService;
  private readonly collaboration: PacksCollaborationService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly imageService: StickerImageService,
    private readonly backgroundRemoval: BackgroundRemovalService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly mediaQueue: MediaQueueService,
    private readonly storage: PackStorageService,
    @Optional() private readonly jobs?: JobsService,
    @Optional() access?: PackAccessService,
    @Optional() stickerService?: PacksStickerService,
    @Optional() collaboration?: PacksCollaborationService,
  ) {
    this.access = access ?? new PackAccessService(prisma, config);
    this.stickerService =
      stickerService ??
      new PacksStickerService(prisma, imageService, backgroundRemoval, audit, mediaQueue, storage, this.access, jobs);
    this.collaboration = collaboration ?? new PacksCollaborationService(prisma, audit, this.access);
  }

  async create(ownerId: string, dto: CreatePackDto) {
    if (dto.teamId) {
      await this.access.requireTeamEdit(ownerId, dto.teamId);
    }
    const pack = await this.prisma.pack.create({
      data: {
        ownerId,
        teamId: dto.teamId,
        name: dto.name,
        publisher: dto.publisher,
        description: dto.description,
        isPublic: dto.isPublic ?? false,
        requiresApproval: dto.requiresApproval ?? false,
        isAnimated: dto.isAnimated ?? false,
      },
    });
    await this.audit.record({ actorId: ownerId, action: 'pack.create', entityType: 'pack', entityId: pack.id });
    return this.get(ownerId, pack.id);
  }

  async list(userId: string) {
    const packs = await this.prisma.pack.findMany({
      where: {
        OR: [{ ownerId: userId }, { isPublic: true }, { members: { some: { userId } } }, { team: { members: { some: { userId } } } }],
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { stickers: true } },
        stickers: { where: { reviewStatus: StickerReviewStatus.APPROVED }, select: { id: true } },
        members: { where: { userId }, select: { userId: true, role: true } },
        team: { include: { members: { where: { userId }, select: { userId: true, role: true } } } },
      },
    });

    return packs.map(({ _count, stickers, ...pack }) => ({
      ...pack,
      teamName: pack.team?.name,
      stickerCount: _count.stickers,
      exportStickerCount: pack.requiresApproval ? stickers.length : _count.stickers,
      ...this.access.accessSummary(userId, pack),
    }));
  }

  async get(userId: string, id: string) {
    const pack = await this.prisma.pack.findUnique({
      where: { id },
      include: {
        stickers: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
        _count: { select: { stickers: true } },
        members: { where: { userId }, select: { userId: true, role: true } },
        team: { include: { members: { where: { userId }, select: { userId: true, role: true } } } },
      },
    });
    if (!pack) {
      throw new NotFoundException('Pack not found');
    }
    if (!this.access.canView(userId, pack)) {
      throw new ForbiddenException('You do not have access to this pack');
    }

    const { _count, ...rest } = pack;
    return {
      ...rest,
      teamName: pack.team?.name,
      stickerCount: _count.stickers,
      exportStickerCount: pack.requiresApproval
        ? pack.stickers.filter((sticker) => sticker.reviewStatus === StickerReviewStatus.APPROVED).length
        : _count.stickers,
      ...this.access.accessSummary(userId, pack),
    };
  }

  async publicPack(id: string) {
    const pack = await this.prisma.pack.findUnique({
      where: { id },
      include: {
        stickers: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
        _count: { select: { stickers: true } },
      },
    });
    if (!pack || !pack.isPublic) {
      throw new NotFoundException('Public pack not found');
    }

    return this.publicPackSummary(pack);
  }

  async publicPacks() {
    const packs = await this.prisma.pack.findMany({
      where: { isPublic: true },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { stickers: true } },
        stickers: { where: { reviewStatus: StickerReviewStatus.APPROVED }, select: { id: true } },
      },
    });

    return packs.map((pack) => this.publicPackSummary(pack));
  }

  private publicPackSummary<
    T extends {
      requiresApproval: boolean;
      stickers: Array<{ id?: string; reviewStatus?: StickerReviewStatus }>;
      _count: { stickers: number };
    },
  >(pack: T) {
    const { _count, ...rest } = pack;
    const approvedCount = pack.stickers.filter((sticker) => sticker.reviewStatus === StickerReviewStatus.APPROVED || !sticker.reviewStatus).length;
    const exportStickerCount = rest.requiresApproval ? approvedCount : _count.stickers;
    return {
      ...rest,
      stickers: rest.stickers?.[0]?.reviewStatus ? rest.stickers : undefined,
      stickerCount: _count.stickers,
      exportStickerCount,
      canExport:
        exportStickerCount >= WHATSAPP_LIMITS.minStickersPerPack &&
        exportStickerCount <= WHATSAPP_LIMITS.maxStickersPerPack,
    };
  }

  async delete(ownerId: string, id: string) {
    const pack = await this.prisma.pack.findUnique({
      where: { id },
      include: {
        members: { where: { userId: ownerId }, select: { userId: true, role: true } },
        team: { include: { members: { where: { userId: ownerId }, select: { userId: true, role: true } } } },
      },
    });
    if (!pack) {
      throw new NotFoundException('Pack not found');
    }
    if (!this.access.canManage(ownerId, pack)) {
      throw new ForbiddenException('Only the owner can delete this pack');
    }

    await this.prisma.pack.delete({ where: { id } });
    await this.storage.deletePack(id);
    await this.audit.record({ actorId: ownerId, action: 'pack.delete', entityType: 'pack', entityId: id });

    return { deleted: true };
  }

  async members(ownerId: string, packId: string) {
    return this.collaboration.members(ownerId, packId);
  }

  async updateMember(ownerId: string, packId: string, memberId: string, dto: UpdatePackMemberDto) {
    return this.collaboration.updateMember(ownerId, packId, memberId, dto);
  }

  async removeMember(ownerId: string, packId: string, memberId: string) {
    return this.collaboration.removeMember(ownerId, packId, memberId);
  }

  async invites(ownerId: string, packId: string) {
    return this.collaboration.invites(ownerId, packId);
  }

  async activity(userId: string, packId: string) {
    return this.collaboration.activity(userId, packId);
  }

  async createInvite(ownerId: string, packId: string, dto: CreatePackInviteDto) {
    return this.collaboration.createInvite(ownerId, packId, dto);
  }

  async revokeInvite(ownerId: string, packId: string, inviteId: string) {
    return this.collaboration.revokeInvite(ownerId, packId, inviteId);
  }

  async acceptInvite(userId: string, code: string) {
    const packId = await this.collaboration.acceptInvite(userId, code);
    return this.get(userId, packId);
  }

  async clone(userId: string, id: string) {
    const source = await this.prisma.pack.findUnique({
      where: { id },
      include: {
        stickers: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
        members: { where: { userId }, select: { userId: true, role: true } },
        team: { include: { members: { where: { userId }, select: { userId: true, role: true } } } },
      },
    });
    if (!source) {
      throw new NotFoundException('Pack not found');
    }
    if (!this.access.canView(userId, source)) {
      throw new ForbiddenException('You do not have access to this pack');
    }

    await this.access.enforceStorageQuota(userId, source.stickers.reduce((total, sticker) => total + sticker.sizeBytes, 0));
    const clonedPackId = randomUUID();
    const cloned = await this.prisma.pack.create({
      data: {
        id: clonedPackId,
        ownerId: userId,
        name: `${source.name} Copy`.slice(0, 128),
        publisher: source.publisher,
        description: source.description,
        isPublic: false,
        isAnimated: source.isAnimated,
        imageDataVersion: source.imageDataVersion,
        stickers: {
          create: source.stickers.map((sticker) => ({
            storageKey: this.storage.storageKeyFor(clonedPackId, sticker.fileName),
            mimeType: sticker.mimeType,
            width: sticker.width,
            height: sticker.height,
            fileName: sticker.fileName,
            emojis: sticker.emojis,
            accessibilityText: sticker.accessibilityText,
            sizeBytes: sticker.sizeBytes,
            sha256: sticker.sha256,
            perceptualHash: sticker.perceptualHash,
            position: sticker.position,
            reviewStatus: sticker.reviewStatus,
          })),
        },
      },
    });

    try {
      await this.storage.copyPack(source.id, cloned.id);
    } catch (error) {
      await this.prisma.pack.delete({ where: { id: cloned.id } });
      throw error;
    }

    await this.audit.record({
      actorId: userId,
      action: 'pack.clone',
      entityType: 'pack',
      entityId: cloned.id,
      metadata: { sourcePackId: source.id },
    });
    return this.get(userId, cloned.id);
  }

  async update(ownerId: string, id: string, dto: UpdatePackDto) {
    const pack = await this.prisma.pack.findUnique({
      where: { id },
      include: {
        members: { where: { userId: ownerId }, select: { userId: true, role: true } },
        team: { include: { members: { where: { userId: ownerId }, select: { userId: true, role: true } } } },
      },
    });
    if (!pack) {
      throw new NotFoundException('Pack not found');
    }
    if (!this.access.canManage(ownerId, pack)) {
      throw new ForbiddenException('Only the owner can update this pack');
    }

    await this.prisma.pack.update({
      where: { id },
      data: {
        name: dto.name,
        publisher: dto.publisher,
        description: dto.description,
        isPublic: dto.isPublic,
        requiresApproval: dto.requiresApproval,
        isAnimated: dto.isAnimated,
      },
    });
    await this.audit.record({ actorId: ownerId, action: 'pack.update', entityType: 'pack', entityId: id });

    return this.get(ownerId, id);
  }

  async uploadSticker(ownerId: string, packId: string, file: Express.Multer.File | undefined, dto: UploadStickerDto) {
    return this.stickerService.uploadSticker(ownerId, packId, file, dto);
  }

  async queueStickerUpload(ownerId: string, packId: string, file: Express.Multer.File | undefined, dto: UploadStickerDto) {
    return this.stickerService.queueStickerUpload(ownerId, packId, file, dto);
  }

  async queueExport(userId: string, packId: string) {
    if (!this.jobs) {
      throw new ServiceUnavailableException('Job queue is not available');
    }
    await this.assertCanExport(userId, packId);
    return this.jobs.enqueue({
      type: 'export',
      name: 'pack-export',
      userId,
      packId,
      data: { packId },
    });
  }

  async uploadTrayIcon(ownerId: string, packId: string, file: Express.Multer.File | undefined) {
    return this.stickerService.uploadTrayIcon(ownerId, packId, file);
  }

  async getTrayIconFilePath(userId: string, packId: string) {
    await this.get(userId, packId);
    return this.stickerService.readTrayIcon(packId);
  }

  async getStickerFilePath(userId: string, packId: string, stickerId: string) {
    await this.get(userId, packId);
    return this.stickerService.readStickerFile(packId, stickerId);
  }

  async deleteSticker(ownerId: string, packId: string, stickerId: string) {
    return this.stickerService.deleteSticker(ownerId, packId, stickerId);
  }

  async replaceStickerImage(
    ownerId: string,
    packId: string,
    stickerId: string,
    file: Express.Multer.File | undefined,
    dto: UploadStickerDto = {},
  ) {
    return this.stickerService.replaceStickerImage(ownerId, packId, stickerId, file, dto);
  }

  async updateSticker(ownerId: string, packId: string, stickerId: string, dto: UpdateStickerDto) {
    return this.stickerService.updateSticker(ownerId, packId, stickerId, dto);
  }

  async stickerComments(userId: string, packId: string, stickerId: string) {
    return this.stickerService.stickerComments(userId, packId, stickerId);
  }

  async createStickerComment(userId: string, packId: string, stickerId: string, dto: CreateStickerCommentDto) {
    return this.stickerService.createStickerComment(userId, packId, stickerId, dto);
  }

  async deleteStickerComment(userId: string, packId: string, stickerId: string, commentId: string) {
    return this.stickerService.deleteStickerComment(userId, packId, stickerId, commentId);
  }

  async reorderStickers(ownerId: string, packId: string, dto: ReorderStickersDto) {
    await this.stickerService.reorderStickers(ownerId, packId, dto);
    return this.get(ownerId, packId);
  }

  async copyStickers(userId: string, sourcePackId: string, dto: TransferStickersDto) {
    await this.stickerService.copyStickers(userId, sourcePackId, dto);
    return this.get(userId, dto.targetPackId);
  }

  async moveStickers(userId: string, sourcePackId: string, dto: TransferStickersDto) {
    await this.stickerService.moveStickers(userId, sourcePackId, dto);
    return this.get(userId, dto.targetPackId);
  }

  async assertCanExport(userId: string, packId: string) {
    await this.get(userId, packId);
  }

  async assertPackVersion(userId: string, packId: string, ifMatch: string | undefined) {
    const expectedVersion = this.access.versionFromIfMatch(ifMatch);
    if (!expectedVersion) return;

    const pack = await this.access.loadPackForAccess(userId, packId);
    if (!pack) {
      throw new NotFoundException('Pack not found');
    }
    if (!this.access.canEdit(userId, pack)) {
      throw new ForbiddenException('Only editors can modify this pack');
    }
    if (pack.imageDataVersion !== expectedVersion) {
      throw new ConflictException('Pack changed on the server. Sync the latest version before editing.');
    }
  }

}
