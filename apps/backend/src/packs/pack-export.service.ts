import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import archiver = require('archiver');
import { createHash } from 'crypto';
import { createWriteStream } from 'fs';
import { mkdir, rename, stat } from 'fs/promises';
import { join } from 'path';
import { StickerReviewStatus } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { PackStorageService } from './pack-storage.service';
import { DEFAULT_STICKER_EMOJIS, WHATSAPP_LIMITS } from './whatsapp-constraints';

type Archive = archiver.Archiver;
type ExportPack = {
  id: string;
  name: string;
  publisher: string;
  requiresApproval: boolean;
  isAnimated: boolean;
  imageDataVersion: string;
  stickers: Array<{
    fileName: string;
    emojis: string[];
    accessibilityText: string | null;
    reviewStatus?: StickerReviewStatus;
  }>;
};

@Injectable()
export class PackExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly storage: PackStorageService,
  ) {}

  async buildZip(packId: string, archive: Archive) {
    const pack = await this.loadValidExportPack(packId);
    await this.appendPackToArchive(pack, archive);
  }

  async buildCachedZip(packId: string) {
    const pack = await this.loadValidExportPack(packId);
    const cachePath = this.cachePath(pack);
    if (await this.exists(cachePath)) {
      return { path: cachePath, contentHash: await this.contentHash(pack) };
    }

    await mkdir(this.cacheDirectory(), { recursive: true });
    const tempPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
    const archive = this.createArchive();
    const output = createWriteStream(tempPath);
    const done = new Promise<void>((resolve, reject) => {
      output.on('close', resolve);
      output.on('error', reject);
      archive.on('error', reject);
    });
    archive.pipe(output);
    await this.appendPackToArchive(pack, archive);
    await archive.finalize();
    await done;
    await rename(tempPath, cachePath);
    return { path: cachePath, contentHash: await this.contentHash(pack) };
  }

  private async appendPackToArchive(pack: ExportPack, archive: Archive) {
    archive.append(JSON.stringify(this.contentsForPack(pack), null, 2), { name: 'contents.json' });
    archive.append(await this.storage.readStream(pack.id, 'tray_icon.webp'), { name: 'tray_icon.webp' });

    for (const sticker of pack.stickers) {
      archive.append(await this.storage.readStream(pack.id, sticker.fileName), { name: sticker.fileName });
    }
  }

  async buildContents(packId: string) {
    return this.contentsForPack(await this.loadValidExportPack(packId));
  }

  async buildManifest(packId: string) {
    const pack = await this.loadExportPack(packId);
    if (!pack) {
      throw new NotFoundException('Pack not found');
    }

    const exportPack = this.exportablePack(pack);
    const stickerCount = exportPack.stickers.length;
    const canExport =
      stickerCount >= WHATSAPP_LIMITS.minStickersPerPack && stickerCount <= WHATSAPP_LIMITS.maxStickersPerPack;
    const contentHash = await this.contentHash(exportPack);

    return {
      id: pack.id,
      name: pack.name,
      publisher: pack.publisher,
      requiresApproval: pack.requiresApproval,
      isAnimated: pack.isAnimated,
      imageDataVersion: pack.imageDataVersion,
      stickerCount,
      canExport,
      contentHash,
      exportPath: `/packs/${pack.id}/export`,
      trayIconPath: `/packs/${pack.id}/tray-icon`,
      stickers: exportPack.stickers.map((sticker) => ({
        fileName: sticker.fileName,
        emojis: this.cleanEmojis(sticker.emojis),
        accessibilityText: sticker.accessibilityText,
        sha256: sticker.sha256,
        sizeBytes: sticker.sizeBytes,
      })),
    };
  }

  etagForHash(contentHash: string) {
    return `"${contentHash}"`;
  }

  createArchive(): Archive {
    return archiver('zip', { zlib: { level: 9 } });
  }

  packDirectory(packId: string) {
    return this.storage.packDirectory(packId);
  }

  cacheDirectory() {
    return this.config.get<string>('EXPORT_CACHE_DIR') || join(this.config.get<string>('DATA_DIR', './data'), 'export-cache');
  }

  private contentsForPack(pack: ExportPack) {
    return {
      android_play_store_link: '',
      ios_app_store_link: '',
      sticker_packs: [
        {
          identifier: pack.id.slice(0, WHATSAPP_LIMITS.maxIdentifierLength),
          name: pack.name,
          publisher: pack.publisher,
          tray_image_file: 'tray_icon.webp',
          image_data_version: pack.imageDataVersion,
          avoid_cache: false,
          animated_sticker_pack: pack.isAnimated,
          publisher_email: '',
          publisher_website: '',
          privacy_policy_website: '',
          license_agreement_website: '',
          stickers: pack.stickers.map((sticker) => ({
            image_file: sticker.fileName,
            emojis: this.cleanEmojis(sticker.emojis),
            accessibility_text: sticker.accessibilityText ?? undefined,
          })),
        },
      ],
    };
  }

  private async loadValidExportPack(packId: string) {
    const pack = await this.loadExportPack(packId);
    if (!pack) {
      throw new NotFoundException('Pack not found');
    }

    const exportPack = this.exportablePack(pack);
    if (exportPack.stickers.length < WHATSAPP_LIMITS.minStickersPerPack) {
      throw new BadRequestException(`A WhatsApp pack needs at least ${WHATSAPP_LIMITS.minStickersPerPack} stickers`);
    }

    if (exportPack.stickers.length > WHATSAPP_LIMITS.maxStickersPerPack) {
      throw new BadRequestException(`A WhatsApp pack cannot exceed ${WHATSAPP_LIMITS.maxStickersPerPack} stickers`);
    }

    return exportPack;
  }

  private loadExportPack(packId: string) {
    return this.prisma.pack.findUnique({
      where: { id: packId },
      include: { stickers: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } },
    });
  }

  private exportablePack<T extends ExportPack>(pack: T): T {
    if (!pack.requiresApproval) return pack;
    return {
      ...pack,
      stickers: pack.stickers.filter((sticker) => sticker.reviewStatus === StickerReviewStatus.APPROVED),
    };
  }

  private async contentHash(pack: ExportPack & { stickers: Array<ExportPack['stickers'][number] & { sha256?: string }> }) {
    const hash = createHash('sha256');
    hash.update(`${pack.id}:${pack.imageDataVersion}:${pack.isAnimated}`);

    try {
      const trayIcon = await this.storage.readBuffer(pack.id, 'tray_icon.webp');
      hash.update(trayIcon);
    } catch {
      hash.update('missing-tray-icon');
    }

    for (const sticker of pack.stickers) {
      hash.update(`${sticker.fileName}:${sticker.sha256 ?? ''}`);
    }

    return hash.digest('hex');
  }

  private cachePath(pack: ExportPack) {
    const slug = [pack.id, pack.imageDataVersion, pack.requiresApproval ? 'approved' : 'all', pack.isAnimated ? 'animated' : 'static']
      .join('-')
      .replace(/[^a-zA-Z0-9._-]/g, '_');
    return join(this.cacheDirectory(), `${slug}.zip`);
  }

  private async exists(path: string) {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }

  private cleanEmojis(emojis: string[]) {
    const cleaned = emojis.filter(Boolean).slice(0, WHATSAPP_LIMITS.maxStickerEmojis);
    return cleaned.length > 0 ? cleaned : DEFAULT_STICKER_EMOJIS;
  }
}
