import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PackRole } from '@prisma/client';
import { randomBytes } from 'crypto';
import { cp, mkdir, rm } from 'fs/promises';
import { join, resolve } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import { CreatePackInviteDto } from './dto/create-pack-invite.dto';
import { CreatePackDto } from './dto/create-pack.dto';
import { ReorderStickersDto } from './dto/reorder-stickers.dto';
import { TransferStickersDto } from './dto/transfer-stickers.dto';
import { UpdatePackMemberDto } from './dto/update-pack-member.dto';
import { UpdatePackDto } from './dto/update-pack.dto';
import { UpdateStickerDto } from './dto/update-sticker.dto';
import { UploadStickerDto } from './dto/upload-sticker.dto';
import { PackExportService } from './pack-export.service';
import { StickerImageService } from './sticker-image.service';
import { DEFAULT_STICKER_EMOJIS, WHATSAPP_LIMITS } from './whatsapp-constraints';

type AccessPack = {
  id?: string;
  ownerId: string;
  imageDataVersion?: string;
  isPublic?: boolean;
  _count?: { stickers: number };
  members?: Array<{ userId: string; role: PackRole }>;
};

@Injectable()
export class PacksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exportService: PackExportService,
    private readonly imageService: StickerImageService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async create(ownerId: string, dto: CreatePackDto) {
    const pack = await this.prisma.pack.create({
      data: {
        ownerId,
        name: dto.name,
        publisher: dto.publisher,
        description: dto.description,
        isPublic: dto.isPublic ?? false,
      },
    });
    await this.audit.record({ actorId: ownerId, action: 'pack.create', entityType: 'pack', entityId: pack.id });
    return pack;
  }

  async list(userId: string) {
    const packs = await this.prisma.pack.findMany({
      where: {
        OR: [{ ownerId: userId }, { isPublic: true }, { members: { some: { userId } } }],
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { stickers: true } },
        members: { where: { userId }, select: { userId: true, role: true } },
      },
    });

    return packs.map(({ _count, ...pack }) => ({
      ...pack,
      stickerCount: _count.stickers,
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
      stickerCount: _count.stickers,
      ...this.accessSummary(userId, pack),
    };
  }

  async delete(ownerId: string, id: string) {
    const pack = await this.prisma.pack.findUnique({
      where: { id },
      include: { members: { where: { userId: ownerId }, select: { userId: true, role: true } } },
    });
    if (!pack) {
      throw new NotFoundException('Pack not found');
    }
    if (!this.canManage(ownerId, pack)) {
      throw new ForbiddenException('Only the owner can delete this pack');
    }

    await this.prisma.pack.delete({ where: { id } });
    await rm(this.exportService.packDirectory(id), { recursive: true, force: true });
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
        imageDataVersion: source.imageDataVersion,
        stickers: {
          create: source.stickers.map((sticker) => ({
            fileName: sticker.fileName,
            emojis: sticker.emojis,
            accessibilityText: sticker.accessibilityText,
            sizeBytes: sticker.sizeBytes,
            sha256: sticker.sha256,
            position: sticker.position,
          })),
        },
      },
    });

    try {
      await cp(this.exportService.packDirectory(source.id), this.exportService.packDirectory(cloned.id), {
        recursive: true,
        force: true,
      });
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
      include: { members: { where: { userId: ownerId }, select: { userId: true, role: true } } },
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

    const processed = await this.imageService.processSticker(file.buffer);
    await this.enforceStorageQuota(pack.ownerId, processed.sizeBytes);
    const fileName = `${uuidv4()}.webp`;
    const packDir = this.exportService.packDirectory(packId);
    await this.imageService.writeProcessedImage(join(packDir, fileName), processed);

    if (pack._count.stickers === 0) {
      const tray = await this.imageService.processTrayIcon(file.buffer);
      await this.imageService.writeProcessedImage(join(packDir, 'tray_icon.webp'), tray);
    }

    const emojis = (dto.emojis?.filter(Boolean) ?? DEFAULT_STICKER_EMOJIS).slice(0, WHATSAPP_LIMITS.maxStickerEmojis);
    const sticker = await this.prisma.sticker.create({
      data: {
        packId,
        fileName,
        emojis,
        accessibilityText: dto.accessibilityText,
        sizeBytes: processed.sizeBytes,
        sha256: processed.sha256,
        position: pack._count.stickers,
      },
    });

    await this.prisma.pack.update({
      where: { id: packId },
      data: { imageDataVersion: this.newImageDataVersion(pack.imageDataVersion) },
    });
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

    const tray = await this.imageService.processTrayIcon(file.buffer);
    await this.imageService.writeProcessedImage(join(this.exportService.packDirectory(packId), 'tray_icon.webp'), tray);

    const updated = await this.prisma.pack.update({
      where: { id: packId },
      data: { imageDataVersion: this.newImageDataVersion(pack.imageDataVersion) },
    });
    await this.audit.record({ actorId: ownerId, action: 'pack.trayIcon.replace', entityType: 'pack', entityId: packId });
    return updated;
  }

  async getTrayIconFilePath(userId: string, packId: string) {
    await this.get(userId, packId);
    return resolve(join(this.exportService.packDirectory(packId), 'tray_icon.webp'));
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
      path: resolve(join(this.exportService.packDirectory(packId), sticker.fileName)),
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
    await rm(join(this.exportService.packDirectory(packId), sticker.fileName), { force: true });
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

    const processed = await this.imageService.processSticker(file.buffer);
    const existingSize = typeof sticker.sizeBytes === 'number' ? sticker.sizeBytes : 0;
    await this.enforceStorageQuota(pack.ownerId, Math.max(0, processed.sizeBytes - existingSize));
    await this.imageService.writeProcessedImage(
      join(this.exportService.packDirectory(packId), sticker.fileName),
      processed,
    );

    const updated = await this.prisma.sticker.update({
      where: { id: stickerId },
      data: {
        sizeBytes: processed.sizeBytes,
        sha256: processed.sha256,
      },
    });

    await this.prisma.pack.update({
      where: { id: packId },
      data: { imageDataVersion: this.newImageDataVersion(pack.imageDataVersion) },
    });
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

  async reorderStickers(ownerId: string, packId: string, dto: ReorderStickersDto) {
    const pack = await this.prisma.pack.findUnique({
      where: { id: packId },
      include: {
        stickers: { select: { id: true } },
        members: { where: { userId: ownerId }, select: { userId: true, role: true } },
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
    const { source, target, stickers } = await this.loadTransfer(userId, sourcePackId, dto);
    this.assertTargetCapacity(target, stickers.length);
    await this.enforceStorageQuota(target.ownerId, stickers.reduce((total, sticker) => total + sticker.sizeBytes, 0));

    const copies = stickers.map((sticker, index) => ({
      fileName: `${uuidv4()}.webp`,
      sourceFileName: sticker.fileName,
      position: (target._count?.stickers ?? 0) + index,
      sticker,
    }));

    try {
      await mkdir(this.exportService.packDirectory(dto.targetPackId), { recursive: true });
      await Promise.all(
        copies.map((copy) =>
          cp(
            join(this.exportService.packDirectory(sourcePackId), copy.sourceFileName),
            join(this.exportService.packDirectory(dto.targetPackId), copy.fileName),
          ),
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
              position: copy.position,
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
        copies.map((copy) => rm(join(this.exportService.packDirectory(dto.targetPackId), copy.fileName), { force: true })),
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

    const moves = stickers.map((sticker, index) => ({
      fileName: `${uuidv4()}.webp`,
      position: (target._count?.stickers ?? 0) + index,
      sticker,
    }));

    try {
      await mkdir(this.exportService.packDirectory(dto.targetPackId), { recursive: true });
      await Promise.all(
        moves.map((move) =>
          cp(
            join(this.exportService.packDirectory(sourcePackId), move.sticker.fileName),
            join(this.exportService.packDirectory(dto.targetPackId), move.fileName),
          ),
        ),
      );

      await this.prisma.$transaction([
        ...moves.map((move) =>
          this.prisma.sticker.update({
            where: { id: move.sticker.id },
            data: {
              packId: dto.targetPackId,
              fileName: move.fileName,
              position: move.position,
            },
          }),
        ),
        this.prisma.pack.update({
          where: { id: sourcePackId },
          data: { imageDataVersion: this.newImageDataVersion(source.imageDataVersion ?? '1') },
        }),
        this.prisma.pack.update({
          where: { id: dto.targetPackId },
          data: { imageDataVersion: this.newImageDataVersion(target.imageDataVersion ?? '1') },
        }),
      ]);

      await Promise.all(
        moves.map((move) => rm(join(this.exportService.packDirectory(sourcePackId), move.sticker.fileName), { force: true })),
      );
      await this.compactStickerPositions(sourcePackId);
    } catch (error) {
      await Promise.all(
        moves.map((move) => rm(join(this.exportService.packDirectory(dto.targetPackId), move.fileName), { force: true })),
      );
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

  private newImageDataVersion(previous: string) {
    const numeric = Number.parseInt(previous, 10);
    if (Number.isFinite(numeric)) {
      return String(numeric + 1);
    }
    return String(Date.now());
  }

  private async loadPackForAccess(userId: string, packId: string) {
    return this.prisma.pack.findUnique({
      where: { id: packId },
      include: { members: { where: { userId }, select: { userId: true, role: true } } },
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
          _count: { select: { stickers: true } },
        },
      }),
      this.prisma.pack.findUnique({
        where: { id: dto.targetPackId },
        include: {
          members: { where: { userId }, select: { userId: true, role: true } },
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
    if (incomingBytes <= 0) return;
    const quota = await this.storageQuotaBytes();
    if (!quota) return;

    const usage = await this.prisma.sticker.aggregate({
      where: { pack: { ownerId } },
      _sum: { sizeBytes: true },
    });
    const usedBytes = usage._sum.sizeBytes ?? 0;
    if (usedBytes + incomingBytes > quota) {
      throw new BadRequestException('Storage quota exceeded for this pack owner');
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

  private roleFor(userId: string, pack: AccessPack) {
    if (pack.ownerId === userId) {
      return PackRole.OWNER;
    }
    return pack.members?.find((member) => member.userId === userId)?.role;
  }

  private newInviteCode() {
    return randomBytes(18).toString('base64url');
  }
}
