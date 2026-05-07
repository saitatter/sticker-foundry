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
  perceptualHash: string;
};

type ImageMetadata = Awaited<ReturnType<sharp.Sharp['metadata']>>;

@Injectable()
export class StickerImageService {
  async processSticker(input: Buffer, options: { animated?: boolean } = {}): Promise<ProcessedImage> {
    return options.animated ? this.processAnimatedWebp(input) : this.processStaticWebp(input);
  }

  async processTrayIcon(input: Buffer): Promise<ProcessedImage> {
    return this.processWebp(input, WHATSAPP_LIMITS.trayIconPixels, WHATSAPP_LIMITS.maxTrayIconBytes, false);
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

  private async processStaticWebp(input: Buffer): Promise<ProcessedImage> {
    const metadata = await this.metadataFor(input);
    this.assertSupportedImageContent(metadata);
    if ((metadata.pages ?? 1) > 1) {
      throw new BadRequestException('Animated uploads require an animated pack');
    }
    return this.processWebp(input, WHATSAPP_LIMITS.stickerPixels, WHATSAPP_LIMITS.maxStaticStickerBytes, false);
  }

  private async processAnimatedWebp(input: Buffer): Promise<ProcessedImage> {
    const metadata = await this.metadataFor(input);
    this.assertSupportedImageContent(metadata);
    this.assertAnimatedStickerMetadata(metadata);
    return this.processWebp(input, WHATSAPP_LIMITS.stickerPixels, WHATSAPP_LIMITS.maxAnimatedStickerBytes, true);
  }

  private async processWebp(input: Buffer, pixels: number, maxBytes: number, animated: boolean): Promise<ProcessedImage> {
    let last: Buffer | undefined;

    for (const quality of [90, 80, 70, 60, 50, 40, 32, 25]) {
      const output = await sharp(input, { animated })
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
          perceptualHash: await this.perceptualHash(output),
        };
      }
    }

    throw new BadRequestException(
      `Image cannot be compressed below ${maxBytes} bytes without excessive quality loss. Last size: ${last?.byteLength ?? 0} bytes`,
    );
  }

  private async metadataFor(input: Buffer): Promise<ImageMetadata> {
    try {
      return await sharp(input, { animated: true }).metadata();
    } catch {
      throw new BadRequestException('Upload is not a valid image file');
    }
  }

  private assertSupportedImageContent(metadata: ImageMetadata) {
    const format = metadata.format;
    if (!format || !['avif', 'gif', 'heif', 'jpeg', 'jpg', 'png', 'tiff', 'webp'].includes(format)) {
      throw new BadRequestException(`Unsupported image format: ${format ?? 'unknown'}`);
    }
  }

  private assertAnimatedStickerMetadata(metadata: ImageMetadata) {
    if ((metadata.pages ?? 1) <= 1) {
      throw new BadRequestException('Animated packs require animated sticker uploads');
    }

    const delays = metadata.delay ?? [];
    const totalDuration = delays.reduce((total, delay) => total + delay, 0);
    const tooFastFrame = delays.some((delay) => delay < WHATSAPP_LIMITS.minAnimatedFrameDurationMs);
    if (tooFastFrame) {
      throw new BadRequestException(
        `Animated sticker frames must be at least ${WHATSAPP_LIMITS.minAnimatedFrameDurationMs}ms`,
      );
    }
    if (totalDuration > WHATSAPP_LIMITS.maxAnimatedStickerDurationMs) {
      throw new BadRequestException(
        `Animated sticker duration must be at most ${WHATSAPP_LIMITS.maxAnimatedStickerDurationMs}ms`,
      );
    }
  }

  private async perceptualHash(input: Buffer) {
    const { data } = await sharp(input, { animated: false })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .resize(8, 8, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const grayscale: number[] = [];
    let redTotal = 0;
    let greenTotal = 0;
    let blueTotal = 0;
    for (let index = 0; index < data.length; index += 3) {
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      redTotal += red;
      greenTotal += green;
      blueTotal += blue;
      grayscale.push(Math.round(red * 0.299 + green * 0.587 + blue * 0.114));
    }
    const average = grayscale.reduce((total, value) => total + value, 0) / grayscale.length;
    let binary = '';
    for (const value of grayscale) {
      binary += value >= average ? '1' : '0';
    }
    const shapeHash = binary
      .match(/.{1,4}/g)
      ?.map((chunk) => Number.parseInt(chunk.padEnd(4, '0'), 2).toString(16))
      .join('') ?? '';
    const pixelCount = grayscale.length || 1;
    const colorHash = [redTotal, greenTotal, blueTotal]
      .map((total) => Math.round(total / pixelCount).toString(16).padStart(2, '0'))
      .join('');
    return `${shapeHash}${colorHash}`;
  }
}
