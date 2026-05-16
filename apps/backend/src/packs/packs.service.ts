import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PackRole, Prisma, StickerReviewStatus } from '@prisma/client';
import { randomBytes, randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import { BackgroundRemovalService } from './background-removal.service';
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
import { PackStorageService } from './pack-storage.service';
import { StickerImageService } from './sticker-image.service';
import { DEFAULT_STICKER_EMOJIS, WHATSAPP_LIMITS } from './whatsapp-constraints';

type AccessPack = {
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
export class PacksService {
  private readonly logger = new Logger(PacksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly imageService: StickerImageService,
    private readonly backgroundRemoval: BackgroundRemovalService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly mediaQueue: MediaQueueService,
    private readonly storage: PackStorageService,
  ) {}

  async create(ownerId: string, dto: CreatePackDto) {
    if (dto.teamId) {
      await this.requireTeamEdit(ownerId, dto.teamId);
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
      ...this.accessSummary(userId, pack),
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
    if (!this.canView(userId, pack)) {
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
      ...this.accessSummary(userId, pack),
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
    if (!this.canManage(ownerId, pack)) {
      throw new ForbiddenException('Only the owner can delete this pack');
    }

    await this.prisma.pack.delete({ where: { id } });
    await this.storage.deletePack(id);
    await this.audit.record({ actorId: ownerId, action: 'pack.delete', entityType: 'pack', entityId: id });

    return { deleted: true };
  }

  async members(ownerId: string, packId: string) {
    await this.requireManage(ownerId, packId);
    return this.prisma.packMember.findMany({
      where: { packId },
      orderBy: [{ role: 'desc' }, { createdAt: 'asc' }],
      include: { user: { select: { id: true, email: true, displayName: true } } },
    });
  }

  async updateMember(ownerId: string, packId: string, memberId: string, dto: UpdatePackMemberDto) {
    await this.requireManage(ownerId, packId);
    if (dto.role === PackRole.OWNER) {
      throw new BadRequestException('Owner role cannot be assigned to members');
    }

    const member = await this.prisma.packMember.findFirst({ where: { id: memberId, packId } });
    if (!member) {
      throw new NotFoundException('Member not found');
    }

    const updated = await this.prisma.packMember.update({
      where: { id: memberId },
      data: { role: dto.role },
      include: { user: { select: { id: true, email: true, displayName: true } } },
    });
    await this.audit.record({
      actorId: ownerId,
      action: 'pack.member.update',
      entityType: 'packMember',
      entityId: memberId,
      metadata: { packId, role: dto.role },
    });
    return updated;
  }

  async removeMember(ownerId: string, packId: string, memberId: string) {
    await this.requireManage(ownerId, packId);
    const member = await this.prisma.packMember.findFirst({ where: { id: memberId, packId } });
    if (!member) {
      throw new NotFoundException('Member not found');
    }

    await this.prisma.packMember.delete({ where: { id: memberId } });
    await this.audit.record({
      actorId: ownerId,
      action: 'pack.member.remove',
      entityType: 'packMember',
      entityId: memberId,
      metadata: { packId, userId: member.userId },
    });
    return { deleted: true };
  }

  async invites(ownerId: string, packId: string) {
    await this.requireManage(ownerId, packId);
    return this.prisma.packInvite.findMany({
      where: { packId },
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, email: true, displayName: true } },
        acceptedBy: { select: { id: true, email: true, displayName: true } },
      },
    });
  }

  async activity(userId: string, packId: string) {
    const pack = await this.loadPackForAccess(userId, packId);
    if (!pack) {
      throw new NotFoundException('Pack not found');
    }
    if (!this.canView(userId, pack)) {
      throw new ForbiddenException('You do not have access to this pack');
    }

    return this.prisma.auditLog.findMany({
      where: {
        OR: [
          { entityType: 'pack', entityId: packId },
          { metadata: { path: ['packId'], equals: packId } },
          { metadata: { path: ['sourcePackId'], equals: packId } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: { actor: { select: { id: true, email: true, displayName: true } } },
    });
  }

  async createInvite(ownerId: string, packId: string, dto: CreatePackInviteDto) {
    await this.requireManage(ownerId, packId);
    if (dto.role === PackRole.OWNER) {
      throw new BadRequestException('Owner invites are not supported yet');
    }
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : undefined;
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Invite expiration must be in the future');
    }

    const invite = await this.prisma.packInvite.create({
      data: {
        packId,
        email: dto.email?.toLowerCase(),
        role: dto.role,
        code: this.newInviteCode(),
        expiresAt,
        createdById: ownerId,
      },
    });
    await this.audit.record({
      actorId: ownerId,
      action: 'pack.invite.create',
      entityType: 'packInvite',
      entityId: invite.id,
      metadata: { packId, role: invite.role, email: invite.email ?? null, expiresAt: invite.expiresAt?.toISOString() ?? null },
    });
    return invite;
  }

  async revokeInvite(ownerId: string, packId: string, inviteId: string) {
    await this.requireManage(ownerId, packId);
    const result = await this.prisma.packInvite.deleteMany({ where: { id: inviteId, packId, acceptedAt: null } });
    if (result.count === 0) {
      throw new NotFoundException('Pending invite not found');
    }

    await this.audit.record({
      actorId: ownerId,
      action: 'pack.invite.revoke',
      entityType: 'packInvite',
      entityId: inviteId,
      metadata: { packId },
    });
    return { deleted: true };
  }

  async acceptInvite(userId: string, code: string) {
    const invite = await this.prisma.packInvite.findUnique({ where: { code }, include: { pack: true } });
    if (!invite) {
      throw new NotFoundException('Invite not found');
    }
    if (invite.acceptedAt) {
      throw new BadRequestException('Invite has already been accepted');
    }
    if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Invite has expired');
    }
    if (invite.email) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
      if (user?.email.toLowerCase() !== invite.email.toLowerCase()) {
        throw new ForbiddenException('This invite is assigned to a different email address');
      }
    }

    await this.prisma.$transaction([
      this.prisma.packMember.upsert({
        where: { packId_userId: { packId: invite.packId, userId } },
        create: { packId: invite.packId, userId, role: invite.role },
        update: { role: invite.role },
      }),
      this.prisma.packInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date(), acceptedById: userId },
      }),
    ]);
    await this.audit.record({
      actorId: userId,
      action: 'pack.invite.accept',
      entityType: 'packInvite',
      entityId: invite.id,
      metadata: { packId: invite.packId, role: invite.role },
    });

    return this.get(userId, invite.packId);
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
    if (!this.canView(userId, source)) {
      throw new ForbiddenException('You do not have access to this pack');
    }

    await this.enforceStorageQuota(userId, source.stickers.reduce((total, sticker) => total + sticker.sizeBytes, 0));
    const cloned = await this.prisma.pack.create({
      data: {
        ownerId: userId,
        name: `${source.name} Copy`.slice(0, 128),
        publisher: source.publisher,
        description: source.description,
        isPublic: false,
        isAnimated: source.isAnimated,
        imageDataVersion: source.imageDataVersion,
        stickers: {
          create: source.stickers.map((sticker) => ({
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
    if (!this.canManage(ownerId, pack)) {
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
    if (!file) {
      throw new BadRequestException('A multipart file field named "file" is required');
    }

    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Only image uploads are accepted');
    }

    const pack = await this.prisma.pack.findUnique({
      where: { id: packId },
      include: { _count: { select: { stickers: true } } },
    });
    if (!pack) {
      throw new NotFoundException('Pack not found');
    }
    const accessPack = await this.loadPackForAccess(ownerId, packId);
    if (!accessPack) {
      throw new NotFoundException('Pack not found');
    }
    if (!this.canEdit(ownerId, accessPack)) {
      throw new ForbiddenException('Only editors can upload stickers');
    }
    if (pack._count.stickers >= WHATSAPP_LIMITS.maxStickersPerPack) {
      throw new BadRequestException(`A pack can contain at most ${WHATSAPP_LIMITS.maxStickersPerPack} stickers`);
    }

    const preparedInput = await this.mediaQueue.enqueue(() => this.prepareStickerInput(file.buffer, pack.isAnimated, dto));
    const processed = await this.mediaQueue.enqueue(() => this.imageService.processSticker(preparedInput, this.stickerProcessingOptions(pack.isAnimated, dto)));
    await this.assertCanInsertSticker(packId, pack.ownerId, processed.sizeBytes, processed.perceptualHash);
    const fileName = `${randomUUID()}.webp`;
    await this.storage.writeImage(packId, fileName, processed);

    if (pack._count.stickers === 0) {
      const tray = await this.mediaQueue.enqueue(() => this.imageService.processTrayIcon(preparedInput));
      await this.storage.writeImage(packId, 'tray_icon.webp', tray);
    }

    const emojis = (dto.emojis?.filter(Boolean) ?? DEFAULT_STICKER_EMOJIS).slice(0, WHATSAPP_LIMITS.maxStickerEmojis);
    let sticker: Awaited<ReturnType<typeof this.prisma.sticker.create>>;
    try {
      sticker = await this.prisma.$transaction(
        async (tx) => {
          const freshPack = await this.assertCanInsertSticker(
            packId,
            pack.ownerId,
            processed.sizeBytes,
            processed.perceptualHash,
            undefined,
            tx,
          );
          const created = await tx.sticker.create({
            data: {
              packId,
              fileName,
              emojis,
              accessibilityText: dto.accessibilityText,
              sizeBytes: processed.sizeBytes,
              sha256: processed.sha256,
              perceptualHash: processed.perceptualHash,
              position: freshPack._count.stickers,
            },
          });
          await tx.pack.update({
            where: { id: packId },
            data: { imageDataVersion: this.newImageDataVersion(freshPack.imageDataVersion) },
          });
          return created;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      await this.deleteFilesWithRetry(packId, [fileName], {
        actorId: ownerId,
        action: 'sticker.upload.rollbackCleanup.failed',
      });
      throw error;
    }
    await this.audit.record({
      actorId: ownerId,
      action: 'sticker.upload',
      entityType: 'sticker',
      entityId: sticker.id,
      metadata: { packId, sizeBytes: sticker.sizeBytes },
    });

    return sticker;
  }

  async uploadTrayIcon(ownerId: string, packId: string, file: Express.Multer.File | undefined) {
    if (!file) {
      throw new BadRequestException('A multipart file field named "file" is required');
    }

    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Only image uploads are accepted');
    }

    const pack = await this.loadPackForAccess(ownerId, packId);
    if (!pack) {
      throw new NotFoundException('Pack not found');
    }
    if (!this.canEdit(ownerId, pack)) {
      throw new ForbiddenException('Only editors can update the tray icon');
    }

    const tray = await this.mediaQueue.enqueue(() => this.imageService.processTrayIcon(file.buffer));
    await this.storage.writeImage(packId, 'tray_icon.webp', tray);

    const updated = await this.prisma.pack.update({
      where: { id: packId },
      data: { imageDataVersion: this.newImageDataVersion(pack.imageDataVersion) },
    });
    await this.audit.record({ actorId: ownerId, action: 'pack.trayIcon.replace', entityType: 'pack', entityId: packId });
    return updated;
  }

  async getTrayIconFilePath(userId: string, packId: string) {
    await this.get(userId, packId);
    return this.storage.readStream(packId, 'tray_icon.webp');
  }

  async getStickerFilePath(userId: string, packId: string, stickerId: string) {
    await this.get(userId, packId);
    const sticker = await this.prisma.sticker.findFirst({
      where: { id: stickerId, packId },
    });
    if (!sticker) {
      throw new NotFoundException('Sticker not found');
    }

    return {
      fileName: sticker.fileName,
      stream: await this.storage.readStream(packId, sticker.fileName),
    };
  }

  async deleteSticker(ownerId: string, packId: string, stickerId: string) {
    const pack = await this.loadPackForAccess(ownerId, packId);
    if (!pack) {
      throw new NotFoundException('Pack not found');
    }
    if (!this.canEdit(ownerId, pack)) {
      throw new ForbiddenException('Only editors can delete stickers');
    }

    const sticker = await this.prisma.sticker.findFirst({
      where: { id: stickerId, packId },
    });
    if (!sticker) {
      throw new NotFoundException('Sticker not found');
    }

    await this.prisma.sticker.delete({ where: { id: stickerId } });
    await this.storage.deleteFile(packId, sticker.fileName);
    await this.compactStickerPositions(packId);
    await this.prisma.pack.update({
      where: { id: packId },
      data: { imageDataVersion: this.newImageDataVersion(pack.imageDataVersion) },
    });
    await this.audit.record({
      actorId: ownerId,
      action: 'sticker.delete',
      entityType: 'sticker',
      entityId: stickerId,
      metadata: { packId },
    });

    return { deleted: true };
  }

  async replaceStickerImage(
    ownerId: string,
    packId: string,
    stickerId: string,
    file: Express.Multer.File | undefined,
    dto: UploadStickerDto = {},
  ) {
    if (!file) {
      throw new BadRequestException('A multipart file field named "file" is required');
    }

    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Only image uploads are accepted');
    }

    const pack = await this.loadPackForAccess(ownerId, packId);
    if (!pack) {
      throw new NotFoundException('Pack not found');
    }
    if (!this.canEdit(ownerId, pack)) {
      throw new ForbiddenException('Only editors can replace sticker images');
    }

    const sticker = await this.prisma.sticker.findFirst({
      where: { id: stickerId, packId },
    });
    if (!sticker) {
      throw new NotFoundException('Sticker not found');
    }

    const preparedInput = await this.mediaQueue.enqueue(() => this.prepareStickerInput(file.buffer, pack.isAnimated, dto));
    const processed = await this.mediaQueue.enqueue(() => this.imageService.processSticker(preparedInput, this.stickerProcessingOptions(pack.isAnimated, dto)));
    await this.rejectDuplicateSticker(packId, processed.perceptualHash, stickerId);
    const existingSize = typeof sticker.sizeBytes === 'number' ? sticker.sizeBytes : 0;
    await this.enforceStorageQuota(pack.ownerId, Math.max(0, processed.sizeBytes - existingSize));
    const previousBytes = await this.storage.readBuffer(packId, sticker.fileName).catch(() => null);
    await this.storage.replaceImage(packId, sticker.fileName, processed);

    let updated: Awaited<ReturnType<typeof this.prisma.sticker.update>>;
    try {
      updated = await this.prisma.$transaction(
        async (tx) => {
          const freshPack = await tx.pack.findUnique({ where: { id: packId } });
          if (!freshPack) {
            throw new NotFoundException('Pack not found');
          }
          const freshSticker = await tx.sticker.findFirst({ where: { id: stickerId, packId } });
          if (!freshSticker) {
            throw new NotFoundException('Sticker not found');
          }

          await this.rejectDuplicateSticker(packId, processed.perceptualHash, stickerId, tx);
          const freshExistingSize = typeof freshSticker.sizeBytes === 'number' ? freshSticker.sizeBytes : 0;
          await this.enforceStorageQuotaForClient(
            freshPack.ownerId,
            Math.max(0, processed.sizeBytes - freshExistingSize),
            tx,
          );

          const stickerData = {
            sizeBytes: processed.sizeBytes,
            sha256: processed.sha256,
            ...(processed.perceptualHash ? { perceptualHash: processed.perceptualHash } : {}),
          };
          const nextSticker = await tx.sticker.update({
            where: { id: stickerId },
            data: stickerData,
          });
          await tx.pack.update({
            where: { id: packId },
            data: { imageDataVersion: this.newImageDataVersion(freshPack.imageDataVersion) },
          });
          return nextSticker;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (previousBytes) {
        await this.storage.writeBuffer(packId, sticker.fileName, previousBytes).catch((restoreError: unknown) => {
          this.logger.warn(
            `Failed to restore sticker file ${sticker.fileName} after metadata update failed: ${
              restoreError instanceof Error ? restoreError.message : String(restoreError)
            }`,
          );
        });
      }
      throw error;
    }
    await this.audit.record({
      actorId: ownerId,
      action: 'sticker.image.replace',
      entityType: 'sticker',
      entityId: stickerId,
      metadata: { packId, sizeBytes: updated.sizeBytes },
    });

    return updated;
  }

  async updateSticker(ownerId: string, packId: string, stickerId: string, dto: UpdateStickerDto) {
    const pack = await this.loadPackForAccess(ownerId, packId);
    if (!pack) {
      throw new NotFoundException('Pack not found');
    }
    if (!this.canEdit(ownerId, pack)) {
      throw new ForbiddenException('Only editors can update stickers');
    }

    const sticker = await this.prisma.sticker.findFirst({
      where: { id: stickerId, packId },
    });
    if (!sticker) {
      throw new NotFoundException('Sticker not found');
    }

    const updated = await this.prisma.sticker.update({
      where: { id: stickerId },
      data: {
        emojis: dto.emojis?.filter(Boolean).slice(0, WHATSAPP_LIMITS.maxStickerEmojis),
        accessibilityText: dto.accessibilityText,
        reviewStatus: dto.reviewStatus,
      },
    });

    await this.prisma.pack.update({
      where: { id: packId },
      data: { imageDataVersion: this.newImageDataVersion(pack.imageDataVersion) },
    });
    await this.audit.record({
      actorId: ownerId,
      action: 'sticker.update',
      entityType: 'sticker',
      entityId: stickerId,
      metadata: { packId },
    });

    return updated;
  }

  async stickerComments(userId: string, packId: string, stickerId: string) {
    await this.requireStickerView(userId, packId, stickerId);
    return this.prisma.stickerComment.findMany({
      where: { stickerId },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, email: true, displayName: true } } },
    });
  }

  async createStickerComment(userId: string, packId: string, stickerId: string, dto: CreateStickerCommentDto) {
    await this.requireStickerView(userId, packId, stickerId);
    const body = dto.body.trim();
    if (!body) {
      throw new BadRequestException('Comment body is required');
    }

    const comment = await this.prisma.stickerComment.create({
      data: { stickerId, userId, body },
      include: { user: { select: { id: true, email: true, displayName: true } } },
    });
    await this.audit.record({
      actorId: userId,
      action: 'sticker.comment.create',
      entityType: 'stickerComment',
      entityId: comment.id,
      metadata: { packId, stickerId },
    });
    return comment;
  }

  async deleteStickerComment(userId: string, packId: string, stickerId: string, commentId: string) {
    const pack = await this.requireStickerView(userId, packId, stickerId);
    const comment = await this.prisma.stickerComment.findFirst({ where: { id: commentId, stickerId } });
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }
    if (comment.userId !== userId && !this.canManage(userId, pack)) {
      throw new ForbiddenException('Only comment authors or pack owners can delete comments');
    }

    await this.prisma.stickerComment.delete({ where: { id: commentId } });
    await this.audit.record({
      actorId: userId,
      action: 'sticker.comment.delete',
      entityType: 'stickerComment',
      entityId: commentId,
      metadata: { packId, stickerId },
    });
    return { deleted: true };
  }

  async reorderStickers(ownerId: string, packId: string, dto: ReorderStickersDto) {
    const pack = await this.prisma.pack.findUnique({
      where: { id: packId },
      include: {
        stickers: { select: { id: true } },
        members: { where: { userId: ownerId }, select: { userId: true, role: true } },
        team: { include: { members: { where: { userId: ownerId }, select: { userId: true, role: true } } } },
      },
    });
    if (!pack) {
      throw new NotFoundException('Pack not found');
    }
    if (!this.canEdit(ownerId, pack)) {
      throw new ForbiddenException('Only editors can reorder stickers');
    }

    const existingIds = pack.stickers.map((sticker) => sticker.id).sort();
    const requestedIds = [...dto.stickerIds].sort();
    if (existingIds.length !== requestedIds.length || existingIds.some((id, index) => id !== requestedIds[index])) {
      throw new BadRequestException('Reorder request must include every sticker in this pack exactly once');
    }

    await this.prisma.$transaction([
      ...dto.stickerIds.map((id, position) =>
        this.prisma.sticker.update({
          where: { id },
          data: { position },
        }),
      ),
      this.prisma.pack.update({
        where: { id: packId },
        data: { imageDataVersion: this.newImageDataVersion(pack.imageDataVersion) },
      }),
    ]);
    await this.audit.record({
      actorId: ownerId,
      action: 'sticker.reorder',
      entityType: 'pack',
      entityId: packId,
      metadata: { stickerCount: dto.stickerIds.length },
    });

    return this.get(ownerId, packId);
  }

  async copyStickers(userId: string, sourcePackId: string, dto: TransferStickersDto) {
    const { target, stickers } = await this.loadTransfer(userId, sourcePackId, dto);
    this.assertTargetCapacity(target, stickers.length);
    await this.enforceStorageQuota(target.ownerId, stickers.reduce((total, sticker) => total + sticker.sizeBytes, 0));

    const copies = stickers.map((sticker, index) => ({
      fileName: `${randomUUID()}.webp`,
      sourceFileName: sticker.fileName,
      position: (target._count?.stickers ?? 0) + index,
      sticker,
    }));

    try {
      await Promise.all(
        copies.map((copy) =>
          this.storage.copyFile(sourcePackId, copy.sourceFileName, dto.targetPackId, copy.fileName),
        ),
      );

      await this.prisma.$transaction([
        ...copies.map((copy) =>
          this.prisma.sticker.create({
            data: {
              packId: dto.targetPackId,
              fileName: copy.fileName,
              emojis: copy.sticker.emojis,
              accessibilityText: copy.sticker.accessibilityText,
              sizeBytes: copy.sticker.sizeBytes,
              sha256: copy.sticker.sha256,
              perceptualHash: copy.sticker.perceptualHash,
              position: copy.position,
              reviewStatus: copy.sticker.reviewStatus,
            },
          }),
        ),
        this.prisma.pack.update({
          where: { id: dto.targetPackId },
          data: { imageDataVersion: this.newImageDataVersion(target.imageDataVersion ?? '1') },
        }),
      ]);
    } catch (error) {
      await Promise.all(
        copies.map((copy) => this.storage.deleteFile(dto.targetPackId, copy.fileName)),
      );
      throw error;
    }

    await this.audit.record({
      actorId: userId,
      action: 'sticker.copy',
      entityType: 'pack',
      entityId: dto.targetPackId,
      metadata: { sourcePackId, stickerCount: stickers.length },
    });
    return this.get(userId, dto.targetPackId);
  }

  async moveStickers(userId: string, sourcePackId: string, dto: TransferStickersDto) {
    if (sourcePackId === dto.targetPackId) {
      throw new BadRequestException('Source and target packs must be different when moving stickers');
    }

    const { source, target, stickers } = await this.loadTransfer(userId, sourcePackId, dto);
    this.assertTargetCapacity(target, stickers.length);
    if (source.ownerId !== target.ownerId) {
      await this.enforceStorageQuota(target.ownerId, stickers.reduce((total, sticker) => total + sticker.sizeBytes, 0));
    }

    const moves = stickers.map((sticker) => ({
      fileName: `${randomUUID()}.webp`,
      sticker,
    }));

    try {
      await Promise.all(
        moves.map((move) =>
          this.storage.copyFile(sourcePackId, move.sticker.fileName, dto.targetPackId, move.fileName),
        ),
      );

      await this.prisma.$transaction(
        async (tx) => {
          const [freshSource, freshTarget, freshStickers] = await Promise.all([
            tx.pack.findUnique({ where: { id: sourcePackId } }),
            tx.pack.findUnique({
              where: { id: dto.targetPackId },
              include: { _count: { select: { stickers: true } } },
            }),
            tx.sticker.findMany({
              where: { packId: sourcePackId, id: { in: moves.map((move) => move.sticker.id) } },
              orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
            }),
          ]);
          if (!freshSource) {
            throw new NotFoundException('Source pack not found');
          }
          if (!freshTarget) {
            throw new NotFoundException('Target pack not found');
          }
          if (freshStickers.length !== moves.length) {
            throw new BadRequestException('Transfer request must include stickers from the source pack only');
          }

          this.assertTargetCapacity(freshTarget, freshStickers.length);
          const moveByStickerId = new Map(moves.map((move) => [move.sticker.id, move]));
          const targetStartPosition = freshTarget._count.stickers;
          for (const [index, sticker] of freshStickers.entries()) {
            const move = moveByStickerId.get(sticker.id);
            if (!move) continue;
            await tx.sticker.update({
              where: { id: sticker.id },
              data: {
                packId: dto.targetPackId,
                fileName: move.fileName,
                position: targetStartPosition + index,
              },
            });
          }

          const remainingSourceStickers = await tx.sticker.findMany({
            where: { packId: sourcePackId },
            orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
            select: { id: true },
          });
          for (const [position, sticker] of remainingSourceStickers.entries()) {
            await tx.sticker.update({
              where: { id: sticker.id },
              data: { position },
            });
          }

          await tx.pack.update({
            where: { id: sourcePackId },
            data: { imageDataVersion: this.newImageDataVersion(freshSource.imageDataVersion ?? '1') },
          });
          await tx.pack.update({
            where: { id: dto.targetPackId },
            data: { imageDataVersion: this.newImageDataVersion(freshTarget.imageDataVersion ?? '1') },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      await this.deleteFilesWithRetry(sourcePackId, moves.map((move) => move.sticker.fileName), {
        actorId: userId,
        action: 'sticker.move.sourceCleanup.failed',
        targetPackId: dto.targetPackId,
      });
    } catch (error) {
      await this.deleteFilesWithRetry(dto.targetPackId, moves.map((move) => move.fileName), {
        actorId: userId,
        action: 'sticker.move.rollbackCleanup.failed',
        targetPackId: dto.targetPackId,
      });
      throw error;
    }

    await this.audit.record({
      actorId: userId,
      action: 'sticker.move',
      entityType: 'pack',
      entityId: dto.targetPackId,
      metadata: { sourcePackId, stickerCount: stickers.length },
    });
    return this.get(userId, dto.targetPackId);
  }

  async assertCanExport(userId: string, packId: string) {
    await this.get(userId, packId);
  }

  async assertPackVersion(userId: string, packId: string, ifMatch: string | undefined) {
    const expectedVersion = this.versionFromIfMatch(ifMatch);
    if (!expectedVersion) return;

    const pack = await this.loadPackForAccess(userId, packId);
    if (!pack) {
      throw new NotFoundException('Pack not found');
    }
    if (!this.canEdit(userId, pack)) {
      throw new ForbiddenException('Only editors can modify this pack');
    }
    if (pack.imageDataVersion !== expectedVersion) {
      throw new ConflictException('Pack changed on the server. Sync the latest version before editing.');
    }
  }

  private async compactStickerPositions(packId: string) {
    const stickers = await this.prisma.sticker.findMany({
      where: { packId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });

    await this.prisma.$transaction(
      stickers.map((sticker, position) =>
        this.prisma.sticker.update({
          where: { id: sticker.id },
          data: { position },
        }),
      ),
    );
  }

  private async deleteFilesWithRetry(
    packId: string,
    fileNames: string[],
    context: { actorId: string; action: string; targetPackId?: string },
  ) {
    let pending = [...new Set(fileNames)];
    for (let attempt = 1; attempt <= 2 && pending.length > 0; attempt += 1) {
      const results = await Promise.allSettled(pending.map((fileName) => this.storage.deleteFile(packId, fileName)));
      pending = pending.filter((_, index) => results[index].status === 'rejected');
    }

    if (pending.length === 0) return;

    this.logger.warn(`Failed to delete ${pending.length} storage file(s) from pack ${packId}: ${pending.join(', ')}`);
    await this.audit.record({
      actorId: context.actorId,
      action: context.action,
      entityType: 'pack',
      entityId: packId,
      metadata: {
        targetPackId: context.targetPackId ?? null,
        fileNames: pending,
      },
    }).catch((error: unknown) => {
      this.logger.warn(`Failed to record storage cleanup audit entry: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  private newImageDataVersion(previous: string) {
    const numeric = Number.parseInt(previous, 10);
    if (Number.isFinite(numeric)) {
      return String(numeric + 1);
    }
    return String(Date.now());
  }

  private versionFromIfMatch(ifMatch: string | undefined) {
    const value = ifMatch?.trim();
    if (!value) return null;
    return value.replace(/^W\//, '').replace(/^"|"$/g, '');
  }

  private async loadPackForAccess(userId: string, packId: string) {
    return this.prisma.pack.findUnique({
      where: { id: packId },
      include: {
        members: { where: { userId }, select: { userId: true, role: true } },
        team: { include: { members: { where: { userId }, select: { userId: true, role: true } } } },
      },
    });
  }

  private async loadTransfer(userId: string, sourcePackId: string, dto: TransferStickersDto) {
    const stickerIds = [...new Set(dto.stickerIds)];
    if (stickerIds.length !== dto.stickerIds.length) {
      throw new BadRequestException('Sticker ids must be unique');
    }

    const [source, target, stickers] = await Promise.all([
      this.prisma.pack.findUnique({
        where: { id: sourcePackId },
        include: {
          members: { where: { userId }, select: { userId: true, role: true } },
          team: { include: { members: { where: { userId }, select: { userId: true, role: true } } } },
          _count: { select: { stickers: true } },
        },
      }),
      this.prisma.pack.findUnique({
        where: { id: dto.targetPackId },
        include: {
          members: { where: { userId }, select: { userId: true, role: true } },
          team: { include: { members: { where: { userId }, select: { userId: true, role: true } } } },
          _count: { select: { stickers: true } },
        },
      }),
      this.prisma.sticker.findMany({
        where: { packId: sourcePackId, id: { in: stickerIds } },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);

    if (!source) {
      throw new NotFoundException('Source pack not found');
    }
    if (!target) {
      throw new NotFoundException('Target pack not found');
    }
    if (!this.canEdit(userId, source)) {
      throw new ForbiddenException('Only editors can copy or move stickers from this pack');
    }
    if (!this.canEdit(userId, target)) {
      throw new ForbiddenException('Only editors can copy or move stickers into the target pack');
    }
    if (stickers.length !== stickerIds.length) {
      throw new BadRequestException('Transfer request must include stickers from the source pack only');
    }

    return { source, target, stickers };
  }

  private assertTargetCapacity(target: AccessPack, incomingCount: number) {
    const currentCount = target._count?.stickers ?? 0;
    if (currentCount + incomingCount > WHATSAPP_LIMITS.maxStickersPerPack) {
      throw new BadRequestException(`A pack can contain at most ${WHATSAPP_LIMITS.maxStickersPerPack} stickers`);
    }
  }

  private async enforceStorageQuota(ownerId: string, incomingBytes: number) {
    await this.enforceStorageQuotaForClient(ownerId, incomingBytes, this.prisma);
  }

  private async assertCanInsertSticker(
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
    await this.enforceStorageQuotaForClient(ownerId, incomingBytes, tx);
    return pack;
  }

  private async enforceStorageQuotaForClient(
    ownerId: string,
    incomingBytes: number,
    tx: Prisma.TransactionClient | PrismaService,
  ) {
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

  private async rejectDuplicateSticker(
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

  private async storageQuotaBytes() {
    const setting = await this.prisma.appSetting.findUnique({ where: { key: 'storageQuotaBytes' } });
    const raw = setting?.value || this.config.get<string>('STORAGE_QUOTA_BYTES', '');
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private async requireManage(userId: string, packId: string) {
    const pack = await this.loadPackForAccess(userId, packId);
    if (!pack) {
      throw new NotFoundException('Pack not found');
    }
    if (!this.canManage(userId, pack)) {
      throw new ForbiddenException('Only the owner can manage this pack');
    }
    return pack;
  }

  private async requireTeamEdit(userId: string, teamId: string) {
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

  private async requireStickerView(userId: string, packId: string, stickerId: string) {
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

  private accessSummary(userId: string, pack: AccessPack) {
    const role = this.roleFor(userId, pack) ?? (pack.isPublic ? PackRole.VIEWER : undefined);
    return {
      role,
      canEdit: role === PackRole.OWNER || role === PackRole.EDITOR,
      canManage: role === PackRole.OWNER,
    };
  }

  private canView(userId: string, pack: AccessPack) {
    return Boolean(pack.isPublic || this.roleFor(userId, pack));
  }

  private canEdit(userId: string, pack: AccessPack) {
    const role = this.roleFor(userId, pack);
    return role === PackRole.OWNER || role === PackRole.EDITOR;
  }

  private canManage(userId: string, pack: AccessPack) {
    return this.roleFor(userId, pack) === PackRole.OWNER;
  }

  private stickerProcessingOptions(animated: boolean, dto: UploadStickerDto) {
    return {
      animated,
      animatedTrimStart: dto.animatedTrimStart,
      animatedTrimEnd: dto.animatedTrimEnd,
      animatedFrameRate: dto.animatedFrameRate,
      animatedQuality: dto.animatedQuality,
    };
  }

  private async prepareStickerInput(input: Buffer, animated: boolean, dto: UploadStickerDto) {
    if (animated) return input;

    return this.backgroundRemoval.remove(input, {
      mode: dto.backgroundRemovalMode,
      threshold: dto.backgroundRemovalThreshold,
      feather: dto.backgroundRemovalFeather,
      cleanupSpeckles: dto.backgroundRemovalCleanupSpeckles,
      speckleSize: dto.backgroundRemovalSpeckleSize,
    });
  }

  private roleFor(userId: string, pack: AccessPack) {
    if (pack.ownerId === userId) {
      return PackRole.OWNER;
    }
    return pack.members?.find((member) => member.userId === userId)?.role ?? pack.team?.members?.[0]?.role;
  }

  private newInviteCode() {
    return randomBytes(18).toString('base64url');
  }
}
