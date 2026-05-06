import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { mkdir, stat, writeFile } from 'fs/promises';
import { dirname } from 'path';
import sharp = require('sharp');
import { WHATSAPP_LIMITS } from './whatsapp-constraints';

export type ProcessedImage = {
  bytes: Buffer;
  sizeBytes: number;
  sha256: string;
};

@Injectable()
export class StickerImageService {
  async processSticker(input: Buffer): Promise<ProcessedImage> {
    return this.processWebp(input, WHATSAPP_LIMITS.stickerPixels, WHATSAPP_LIMITS.maxStaticStickerBytes);
  }

  async processTrayIcon(input: Buffer): Promise<ProcessedImage> {
    return this.processWebp(input, WHATSAPP_LIMITS.trayIconPixels, WHATSAPP_LIMITS.maxTrayIconBytes);
  }

  async writeProcessedImage(filePath: string, image: ProcessedImage) {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, image.bytes);
  }

  async assertFileWithinLimit(filePath: string, maxBytes: number) {
    const file = await stat(filePath);
    if (file.size > maxBytes) {
      throw new BadRequestException(`File exceeds ${maxBytes} bytes`);
    }
  }

  private async processWebp(input: Buffer, pixels: number, maxBytes: number): Promise<ProcessedImage> {
    await this.assertSupportedImageContent(input);
    let last: Buffer | undefined;

    for (const quality of [90, 80, 70, 60, 50, 40, 32, 25]) {
      const output = await sharp(input, { animated: false })
        .rotate()
        .resize(pixels, pixels, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
          withoutEnlargement: false,
        })
        .webp({
          quality,
          effort: 6,
          lossless: false,
          smartSubsample: true,
        })
        .toBuffer();

      last = output;
      if (output.byteLength <= maxBytes) {
        return {
          bytes: output,
          sizeBytes: output.byteLength,
          sha256: createHash('sha256').update(output).digest('hex'),
        };
      }
    }

    throw new BadRequestException(
      `Image cannot be compressed below ${maxBytes} bytes without excessive quality loss. Last size: ${last?.byteLength ?? 0} bytes`,
    );
  }

  private async assertSupportedImageContent(input: Buffer) {
    let format: string | undefined;
    try {
      format = (await sharp(input, { animated: false }).metadata()).format;
    } catch {
      throw new BadRequestException('Upload is not a valid image file');
    }

    if (!format || !['avif', 'gif', 'heif', 'jpeg', 'jpg', 'png', 'tiff', 'webp'].includes(format)) {
      throw new BadRequestException(`Unsupported image format: ${format ?? 'unknown'}`);
    }
  }
}
