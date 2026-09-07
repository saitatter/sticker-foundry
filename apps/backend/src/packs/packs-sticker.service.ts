import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { JobsService } from '../jobs/jobs.service';
import { BackgroundRemovalService } from '../media/background-removal.service';
import { StickerImageService } from '../media/sticker-image.service';
import { PrismaService } from '../prisma.service';
import { PackStorageService } from '../storage/pack-storage.service';
import { CreateStickerCommentDto } from './dto/create-sticker-comment.dto';
import { ReorderStickersDto } from './dto/reorder-stickers.dto';
import { TransferStickersDto } from './dto/transfer-stickers.dto';
import { UpdateStickerDto } from './dto/update-sticker.dto';
import { UploadStickerDto } from './dto/upload-sticker.dto';
import { MediaQueueService } from './media-queue.service';
import { PackAccessService } from './pack-access.service';
import { DEFAULT_STICKER_EMOJIS, WHATSAPP_LIMITS } from './whatsapp-constraints';

@Injectable()
export class PacksStickerService {
  private readonly logger = new Logger(PacksStickerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly imageService: StickerImageService,
    private readonly backgroundRemoval: BackgroundRemovalService,
    private readonly audit: AuditService,
    private readonly mediaQueue: MediaQueueService,
    private readonly storage: PackStorageService,
    private readonly access: PackAccessService,
    private readonly jobs: JobsService,
  ) {}

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
    const accessPack = await this.access.loadPackForAccess(ownerId, packId);
    if (!accessPack) {
      throw new NotFoundException('Pack not found');
    }
    if (!this.access.canEdit(ownerId, accessPack)) {
      throw new ForbiddenException('Only editors can upload stickers');
    }
    if (pack._count.stickers >= WHATSAPP_LIMITS.maxStickersPerPack) {
      throw new BadRequestException(`A pack can contain at most ${WHATSAPP_LIMITS.maxStickersPerPack} stickers`);
    }

    const preparedInput = await this.mediaQueue.enqueue(() => this.prepareStickerInput(file.buffer, pack.isAnimated, dto));
    const processed = await this.mediaQueue.enqueue(() =>
      this.imageService.processSticker(preparedInput, this.stickerProcessingOptions(pack.isAnimated, dto)),
    );
    await this.access.assertCanInsertSticker(packId, pack.ownerId, processed.sizeBytes, processed.perceptualHash);
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
          const freshPack = await this.access.assertCanInsertSticker(
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
              storageKey: this.storageKeyFor(packId, fileName),
              mimeType: processed.mimeType,
              width: processed.width,
              height: processed.height,
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
            data: { imageDataVersion: this.access.newImageDataVersion(freshPack.imageDataVersion) },
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

  async queueStickerUpload(ownerId: string, packId: string, file: Express.Multer.File | undefined, dto: UploadStickerDto) {
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
    const accessPack = await this.access.loadPackForAccess(ownerId, packId);
    if (!accessPack) {
      throw new NotFoundException('Pack not found');
    }
    if (!this.access.canEdit(ownerId, accessPack)) {
      throw new ForbiddenException('Only editors can upload stickers');
    }
    if (pack._count.stickers >= WHATSAPP_LIMITS.maxStickersPerPack) {
      throw new BadRequestException(`A pack can contain at most ${WHATSAPP_LIMITS.maxStickersPerPack} stickers`);
    }

    const fileName = `${randomUUID()}.webp`;
    const inputKey = await this.storage.writeJobInput(randomUUID(), file.buffer, file.mimetype);
    try {
      const emojis = (dto.emojis?.filter(Boolean) ?? DEFAULT_STICKER_EMOJIS).slice(0, WHATSAPP_LIMITS.maxStickerEmojis);
      return await this.jobs.enqueue({
        type: 'media',
        name: 'process-sticker',
        userId: ownerId,
        packId,
        data: {
          kind: 'sticker-upload',
          inputKey,
          outputKey: this.storage.storageKeyFor(packId, fileName),
          mimeType: 'image/webp',
          animated: pack.isAnimated,
          fileName,
          emojis,
          accessibilityText: dto.accessibilityText,
          createTrayIcon: pack._count.stickers === 0,
          backgroundRemoval: {
            mode: dto.backgroundRemovalMode,
            threshold: dto.backgroundRemovalThreshold,
            feather: dto.backgroundRemovalFeather,
            cleanupSpeckles: dto.backgroundRemovalCleanupSpeckles,
            speckleSize: dto.backgroundRemovalSpeckleSize,
          },
          processing: this.stickerProcessingOptions(pack.isAnimated, dto),
        },
      });
    } catch (error) {
      await this.storage.deleteStorageKey(inputKey).catch(() => undefined);
      throw error;
    }
  }

  async uploadTrayIcon(ownerId: string, packId: string, file: Express.Multer.File | undefined) {
    if (!file) {
      throw new BadRequestException('A multipart file field named "file" is required');
    }

    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Only image uploads are accepted');
    }

    const pack = await this.access.loadPackForAccess(ownerId, packId);
    if (!pack) {
      throw new NotFoundException('Pack not found');
    }
    if (!this.access.canEdit(ownerId, pack)) {
      throw new ForbiddenException('Only editors can update the tray icon');
    }

    const tray = await this.mediaQueue.enqueue(() => this.imageService.processTrayIcon(file.buffer));
    await this.storage.writeImage(packId, 'tray_icon.webp', tray);

    const updated = await this.prisma.pack.update({
      where: { id: packId },
      data: { imageDataVersion: this.access.newImageDataVersion(pack.imageDataVersion) },
    });
    await this.audit.record({
      actorId: ownerId,
      action: 'pack.trayIcon.replace',
      entityType: 'pack',
      entityId: packId,
      metadata: {
        before: { imageDataVersion: pack.imageDataVersion },
        after: { imageDataVersion: updated.imageDataVersion },
      },
    });
    return updated;
  }

  async deleteSticker(ownerId: string, packId: string, stickerId: string) {
    const pack = await this.access.loadPackForAccess(ownerId, packId);
    if (!pack) {
      throw new NotFoundException('Pack not found');
    }
    if (!this.access.canEdit(ownerId, pack)) {
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
      data: { imageDataVersion: this.access.newImageDataVersion(pack.imageDataVersion) },
    });
    await this.audit.record({
      actorId: ownerId,
      action: 'sticker.delete',
      entityType: 'sticker',
      entityId: stickerId,
      metadata: {
        packId,
        before: {
          fileName: sticker.fileName,
          emojis: sticker.emojis,
          accessibilityText: sticker.accessibilityText,
          reviewStatus: sticker.reviewStatus,
          sizeBytes: sticker.sizeBytes,
        },
        after: null,
      },
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

    const pack = await this.access.loadPackForAccess(ownerId, packId);
    if (!pack) {
      throw new NotFoundException('Pack not found');
    }
    if (!this.access.canEdit(ownerId, pack)) {
      throw new ForbiddenException('Only editors can replace sticker images');
    }

    const sticker = await this.prisma.sticker.findFirst({
      where: { id: stickerId, packId },
    });
    if (!sticker) {
      throw new NotFoundException('Sticker not found');
    }

    const preparedInput = await this.mediaQueue.enqueue(() => this.prepareStickerInput(file.buffer, pack.isAnimated, dto));
    const processed = await this.mediaQueue.enqueue(() =>
      this.imageService.processSticker(preparedInput, this.stickerProcessingOptions(pack.isAnimated, dto)),
    );
    await this.access.rejectDuplicateSticker(packId, processed.perceptualHash, stickerId);
    const existingSize = sticker.sizeBytes;
    await this.access.enforceStorageQuota(pack.ownerId, Math.max(0, processed.sizeBytes - existingSize));
    const previousBytes = await this.storage.readBufferByKey(sticker.storageKey).catch(() => null);
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

          await this.access.rejectDuplicateSticker(packId, processed.perceptualHash, stickerId, tx);
          const freshExistingSize = freshSticker.sizeBytes;
          await this.access.enforceStorageQuota(
            freshPack.ownerId,
            Math.max(0, processed.sizeBytes - freshExistingSize),
            tx,
          );

          const stickerData = {
            storageKey: this.storageKeyFor(packId, freshSticker.fileName),
            mimeType: processed.mimeType,
            width: processed.width,
            height: processed.height,
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
            data: { imageDataVersion: this.access.newImageDataVersion(freshPack.imageDataVersion) },
          });
          return nextSticker;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (previousBytes) {
        await Promise.resolve(this.storage.writeBuffer(packId, sticker.fileName, previousBytes)).catch((restoreError: unknown) => {
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
      metadata: {
        packId,
        sizeBytes: updated.sizeBytes,
        before: {
          mimeType: sticker.mimeType,
          width: sticker.width,
          height: sticker.height,
          sizeBytes: sticker.sizeBytes,
          sha256: sticker.sha256,
        },
        after: {
          mimeType: updated.mimeType,
          width: updated.width,
          height: updated.height,
          sizeBytes: updated.sizeBytes,
          sha256: updated.sha256,
        },
      },
    });

    return updated;
  }

  async updateSticker(ownerId: string, packId: string, stickerId: string, dto: UpdateStickerDto) {
    const pack = await this.access.loadPackForAccess(ownerId, packId);
    if (!pack) {
      throw new NotFoundException('Pack not found');
    }
    if (!this.access.canEdit(ownerId, pack)) {
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
      data: { imageDataVersion: this.access.newImageDataVersion(pack.imageDataVersion) },
    });
    await this.audit.record({
      actorId: ownerId,
      action: 'sticker.update',
      entityType: 'sticker',
      entityId: stickerId,
      metadata: {
        packId,
        before: {
          emojis: sticker.emojis,
          accessibilityText: sticker.accessibilityText,
          reviewStatus: sticker.reviewStatus,
        },
        after: {
          emojis: updated.emojis,
          accessibilityText: updated.accessibilityText,
          reviewStatus: updated.reviewStatus,
        },
      },
    });

    return updated;
  }

  async stickerComments(userId: string, packId: string, stickerId: string) {
    await this.access.requireStickerView(userId, packId, stickerId);
    return this.prisma.stickerComment.findMany({
      where: { stickerId },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, email: true, displayName: true } } },
    });
  }

  async createStickerComment(userId: string, packId: string, stickerId: string, dto: CreateStickerCommentDto) {
    await this.access.requireStickerView(userId, packId, stickerId);
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
    const pack = await this.access.requireStickerView(userId, packId, stickerId);
    const comment = await this.prisma.stickerComment.findFirst({ where: { id: commentId, stickerId } });
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }
    if (comment.userId !== userId && !this.access.canManage(userId, pack)) {
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
        stickers: { select: { id: true, position: true }, orderBy: { position: 'asc' } },
        members: { where: { userId: ownerId }, select: { userId: true, role: true } },
        team: { include: { members: { where: { userId: ownerId }, select: { userId: true, role: true } } } },
      },
    });
    if (!pack) {
      throw new NotFoundException('Pack not found');
    }
    if (!this.access.canEdit(ownerId, pack)) {
      throw new ForbiddenException('Only editors can reorder stickers');
    }

    const existingIds = pack.stickers.map((sticker) => sticker.id).sort();
    const requestedIds = [...dto.stickerIds].sort();
    if (existingIds.length !== requestedIds.length || existingIds.some((id, index) => id !== requestedIds[index])) {
      throw new BadRequestException('Reorder request must include every sticker in this pack exactly once');
    }

    const before = pack.stickers.map((sticker, index) => ({ id: sticker.id, position: sticker.position ?? index }));
    const after = dto.stickerIds.map((id, position) => ({ id, position }));

    await this.prisma.$transaction([
      ...dto.stickerIds.map((id, position) =>
        this.prisma.sticker.update({
          where: { id },
          data: { position },
        }),
      ),
      this.prisma.pack.update({
        where: { id: packId },
        data: { imageDataVersion: this.access.newImageDataVersion(pack.imageDataVersion) },
      }),
    ]);
    await this.audit.record({
      actorId: ownerId,
      action: 'sticker.reorder',
      entityType: 'pack',
      entityId: packId,
      metadata: { stickerCount: dto.stickerIds.length, before: { stickerOrder: before }, after: { stickerOrder: after } },
    });
  }

  async copyStickers(userId: string, sourcePackId: string, dto: TransferStickersDto) {
    const { target, stickers } = await this.loadTransfer(userId, sourcePackId, dto);
    this.access.assertTargetCapacity(target, stickers.length);
    await this.access.enforceStorageQuota(target.ownerId, stickers.reduce((total, sticker) => total + sticker.sizeBytes, 0));

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
              storageKey: this.storageKeyFor(dto.targetPackId, copy.fileName),
              mimeType: copy.sticker.mimeType,
              width: copy.sticker.width,
              height: copy.sticker.height,
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
          data: { imageDataVersion: this.access.newImageDataVersion(target.imageDataVersion) },
        }),
      ]);
    } catch (error) {
      await Promise.all(copies.map((copy) => this.storage.deleteFile(dto.targetPackId, copy.fileName)));
      throw error;
    }

    await this.audit.record({
      actorId: userId,
      action: 'sticker.copy',
      entityType: 'pack',
      entityId: dto.targetPackId,
      metadata: { sourcePackId, stickerCount: stickers.length },
    });
  }

  async moveStickers(userId: string, sourcePackId: string, dto: TransferStickersDto) {
    if (sourcePackId === dto.targetPackId) {
      throw new BadRequestException('Source and target packs must be different when moving stickers');
    }

    const { source, target, stickers } = await this.loadTransfer(userId, sourcePackId, dto);
    this.access.assertTargetCapacity(target, stickers.length);
    if (source.ownerId !== target.ownerId) {
      await this.access.enforceStorageQuota(target.ownerId, stickers.reduce((total, sticker) => total + sticker.sizeBytes, 0));
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

          this.access.assertTargetCapacity(freshTarget, freshStickers.length);
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
                storageKey: this.storageKeyFor(dto.targetPackId, move.fileName),
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
            data: { imageDataVersion: this.access.newImageDataVersion(freshSource.imageDataVersion) },
          });
          await tx.pack.update({
            where: { id: dto.targetPackId },
            data: { imageDataVersion: this.access.newImageDataVersion(freshTarget.imageDataVersion) },
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
    await this.audit
      .record({
        actorId: context.actorId,
        action: context.action,
        entityType: 'pack',
        entityId: packId,
        metadata: {
          targetPackId: context.targetPackId ?? null,
          fileNames: pending,
        },
      })
      .catch((error: unknown) => {
        this.logger.warn(`Failed to record storage cleanup audit entry: ${error instanceof Error ? error.message : String(error)}`);
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
    if (!this.access.canEdit(userId, source)) {
      throw new ForbiddenException('Only editors can copy or move stickers from this pack');
    }
    if (!this.access.canEdit(userId, target)) {
      throw new ForbiddenException('Only editors can copy or move stickers into the target pack');
    }
    if (stickers.length !== stickerIds.length) {
      throw new BadRequestException('Transfer request must include stickers from the source pack only');
    }

    return { source, target, stickers };
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

  private storageKeyFor(packId: string, fileName: string) {
    return this.storage.storageKeyFor(packId, fileName);
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
}
