import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import archiver from 'archiver';
import { createReadStream } from 'fs';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../prisma.service';
import { DEFAULT_STICKER_EMOJIS, WHATSAPP_LIMITS } from './whatsapp-constraints';

type Archive = archiver.Archiver;
type ExportPack = {
  id: string;
  name: string;
  publisher: string;
  imageDataVersion: string;
  stickers: Array<{
    fileName: string;
    emojis: string[];
    accessibilityText: string | null;
  }>;
};

@Injectable()
export class PackExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async buildZip(packId: string, archive: Archive) {
    const pack = await this.loadValidExportPack(packId);

    const packDir = this.packDirectory(pack.id);
    await mkdir(packDir, { recursive: true });

    archive.append(JSON.stringify(this.contentsForPack(pack), null, 2), { name: 'contents.json' });
    archive.file(join(packDir, 'tray_icon.webp'), { name: 'tray_icon.webp' });

    for (const sticker of pack.stickers) {
      archive.append(createReadStream(join(packDir, sticker.fileName)), { name: sticker.fileName });
    }
  }

  async buildContents(packId: string) {
    return this.contentsForPack(await this.loadValidExportPack(packId));
  }

  createArchive(): Archive {
    return archiver('zip', { zlib: { level: 9 } });
  }

  packDirectory(packId: string) {
    const dataDir = this.config.get<string>('DATA_DIR', './data');
    return join(dataDir, 'packs', packId);
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
          animated_sticker_pack: false,
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

    if (pack.stickers.length < WHATSAPP_LIMITS.minStickersPerPack) {
      throw new BadRequestException(`A WhatsApp pack needs at least ${WHATSAPP_LIMITS.minStickersPerPack} stickers`);
    }

    if (pack.stickers.length > WHATSAPP_LIMITS.maxStickersPerPack) {
      throw new BadRequestException(`A WhatsApp pack cannot exceed ${WHATSAPP_LIMITS.maxStickersPerPack} stickers`);
    }

    return pack;
  }

  private loadExportPack(packId: string) {
    return this.prisma.pack.findUnique({
      where: { id: packId },
      include: { stickers: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } },
    });
  }

  private cleanEmojis(emojis: string[]) {
    const cleaned = emojis.filter(Boolean).slice(0, WHATSAPP_LIMITS.maxStickerEmojis);
    return cleaned.length > 0 ? cleaned : DEFAULT_STICKER_EMOJIS;
  }
}
