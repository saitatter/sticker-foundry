import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { PackStorageService } from '../storage/pack-storage.service';

@Injectable()
export class StickerMediaReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: PackStorageService,
  ) {}

  readTrayIcon(packId: string) {
    return this.storage.readStream(packId, 'tray_icon.webp');
  }

  async readStickerFile(packId: string, stickerId: string) {
    const sticker = await this.prisma.sticker.findFirst({
      where: { id: stickerId, packId },
    });
    if (!sticker) {
      throw new NotFoundException('Sticker not found');
    }

    return {
      fileName: sticker.fileName,
      stream: await this.storage.readStreamByKey(sticker.storageKey),
    };
  }
}
