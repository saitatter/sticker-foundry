import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { rm } from 'fs/promises';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma.service';
import { CreatePackDto } from './dto/create-pack.dto';
import { UploadStickerDto } from './dto/upload-sticker.dto';
import { PackExportService } from './pack-export.service';
import { StickerImageService } from './sticker-image.service';
import { DEFAULT_STICKER_EMOJIS, WHATSAPP_LIMITS } from './whatsapp-constraints';

@Injectable()
export class PacksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exportService: PackExportService,
    private readonly imageService: StickerImageService,
  ) {}

  async create(ownerId: string, dto: CreatePackDto) {
    return this.prisma.pack.create({
      data: {
        ownerId,
        name: dto.name,
        publisher: dto.publisher,
        description: dto.description,
        isPublic: dto.isPublic ?? false,
      },
    });
  }

  async list(userId: string) {
    const packs = await this.prisma.pack.findMany({
      where: {
        OR: [{ ownerId: userId }, { isPublic: true }],
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { stickers: true } },
      },
    });

    return packs.map(({ _count, ...pack }) => ({
      ...pack,
      stickerCount: _count.stickers,
    }));
  }

  async get(userId: string, id: string) {
    const pack = await this.prisma.pack.findUnique({
      where: { id },
      include: {
        stickers: { orderBy: { createdAt: 'asc' } },
        _count: { select: { stickers: true } },
      },
    });
    if (!pack) {
      throw new NotFoundException('Pack not found');
    }
    if (!pack.isPublic && pack.ownerId !== userId) {
      throw new ForbiddenException('You do not have access to this pack');
    }

    const { _count, ...rest } = pack;
    return {
      ...rest,
      stickerCount: _count.stickers,
    };
  }

  async delete(ownerId: string, id: string) {
    const pack = await this.prisma.pack.findUnique({ where: { id } });
    if (!pack) {
      throw new NotFoundException('Pack not found');
    }
    if (pack.ownerId !== ownerId) {
      throw new ForbiddenException('Only the owner can delete this pack');
    }

    await this.prisma.pack.delete({ where: { id } });
    await rm(this.exportService.packDirectory(id), { recursive: true, force: true });

    return { deleted: true };
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
    if (pack.ownerId !== ownerId) {
      throw new ForbiddenException('Only the owner can upload stickers');
    }
    if (pack._count.stickers >= WHATSAPP_LIMITS.maxStickersPerPack) {
      throw new BadRequestException(`A pack can contain at most ${WHATSAPP_LIMITS.maxStickersPerPack} stickers`);
    }

    const processed = await this.imageService.processSticker(file.buffer);
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
      },
    });

    await this.prisma.pack.update({
      where: { id: packId },
      data: { imageDataVersion: this.newImageDataVersion(pack.imageDataVersion) },
    });

    return sticker;
  }

  async assertCanExport(userId: string, packId: string) {
    await this.get(userId, packId);
  }

  private newImageDataVersion(previous: string) {
    const numeric = Number.parseInt(previous, 10);
    if (Number.isFinite(numeric)) {
      return String(numeric + 1);
    }
    return String(Date.now());
  }
}
