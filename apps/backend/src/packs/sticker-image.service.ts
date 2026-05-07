import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

export type StickerProcessingOptions = {
  animated?: boolean;
  animatedTrimStart?: number;
  animatedTrimEnd?: number;
  animatedFrameRate?: number;
  animatedQuality?: number;
};

type ImageMetadata = Awaited<ReturnType<sharp.Sharp['metadata']>>;

@Injectable()
export class StickerImageService {
  constructor(@Optional() private readonly config?: ConfigService) {}

  async processSticker(input: Buffer, options: StickerProcessingOptions = {}): Promise<ProcessedImage> {
    return options.animated ? this.processAnimatedWebp(input, options) : this.processStaticWebp(input);
  }

  async processTrayIcon(input: Buffer): Promise<ProcessedImage> {
    const metadata = await this.metadataFor(input);
    this.assertSupportedImageContent(metadata);
    this.assertInputBounds(metadata);
    if ((metadata.pages ?? 1) > 1) {
      throw new BadRequestException('Tray icons must be static images');
    }
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
    this.assertInputBounds(metadata);
    if ((metadata.pages ?? 1) > 1) {
      throw new BadRequestException('Animated uploads require an animated pack');
    }
    return this.processWebp(input, WHATSAPP_LIMITS.stickerPixels, WHATSAPP_LIMITS.maxStaticStickerBytes, false);
  }

  private async processAnimatedWebp(input: Buffer, options: StickerProcessingOptions): Promise<ProcessedImage> {
    const metadata = await this.metadataFor(input);
    this.assertSupportedImageContent(metadata);
    this.assertInputBounds(metadata);
    this.assertAnimatedImage(metadata);
    const editedInput = this.hasAnimatedFrameEdits(options) ? await this.rebuildAnimatedInput(input, metadata, options) : input;
    this.assertAnimatedStickerMetadata(editedInput === input ? metadata : await this.metadataFor(editedInput));
    return this.processWebp(
      editedInput,
      WHATSAPP_LIMITS.stickerPixels,
      WHATSAPP_LIMITS.maxAnimatedStickerBytes,
      true,
      options.animatedQuality,
    );
  }

  private async processWebp(
    input: Buffer,
    pixels: number,
    maxBytes: number,
    animated: boolean,
    preferredQuality?: number,
  ): Promise<ProcessedImage> {
    let last: Buffer | undefined;

    for (const quality of this.qualityCandidates(preferredQuality)) {
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

  private assertInputBounds(metadata: ImageMetadata) {
    const width = metadata.width ?? 0;
    const frameHeight = metadata.pageHeight ?? metadata.height ?? 0;
    const pages = metadata.pages ?? 1;
    if (width <= 0 || frameHeight <= 0) {
      throw new BadRequestException('Image dimensions could not be read');
    }

    const framePixels = width * frameHeight;
    const totalPixels = framePixels * pages;
    const maxFramePixels = this.configInt('UPLOAD_MAX_PIXELS', 25_000_000);
    const maxTotalPixels = this.configInt('UPLOAD_MAX_TOTAL_PIXELS', 80_000_000);
    const maxFrames = this.configInt('UPLOAD_MAX_ANIMATED_FRAMES', 300);

    if (framePixels > maxFramePixels) {
      throw new BadRequestException(`Image is too large: ${width}x${frameHeight} exceeds ${maxFramePixels} pixels`);
    }
    if (pages > maxFrames) {
      throw new BadRequestException(`Animated image has too many frames: ${pages} exceeds ${maxFrames}`);
    }
    if (totalPixels > maxTotalPixels) {
      throw new BadRequestException(`Image has too many total pixels across frames: ${totalPixels} exceeds ${maxTotalPixels}`);
    }
  }

  private assertAnimatedImage(metadata: ImageMetadata) {
    if ((metadata.pages ?? 1) <= 1) {
      throw new BadRequestException('Animated packs require animated sticker uploads');
    }
  }

  private hasAnimatedFrameEdits(options: StickerProcessingOptions) {
    return (
      options.animatedTrimStart !== undefined ||
      options.animatedTrimEnd !== undefined ||
      options.animatedFrameRate !== undefined
    );
  }

  private async rebuildAnimatedInput(input: Buffer, metadata: ImageMetadata, options: StickerProcessingOptions) {
    const pages = metadata.pages ?? 1;
    const width = metadata.width ?? 0;
    const pageHeight = metadata.pageHeight ?? Math.floor((metadata.height ?? 0) / pages);
    const totalPixels = width * pageHeight * pages;
    const maxEditableAnimatedPixels = this.configInt('UPLOAD_MAX_ANIMATED_EDIT_PIXELS', 20_000_000);
    if (totalPixels > maxEditableAnimatedPixels) {
      throw new BadRequestException(
        `Animated frame editing is limited to ${maxEditableAnimatedPixels} total pixels to avoid excessive memory usage`,
      );
    }

    const delays = this.normalizedDelays(metadata);
    const totalDuration = delays.reduce((total, delay) => total + delay, 0);
    const startMs = clampMs((options.animatedTrimStart ?? 0) * 1000, 0, Math.max(0, totalDuration - 1));
    const endMs = clampMs((options.animatedTrimEnd ?? totalDuration / 1000) * 1000, startMs + 1, totalDuration);
    const frameRate = clampMs(options.animatedFrameRate ?? this.estimatedFrameRate(delays), 1, 30);
    const frameDuration = Math.max(WHATSAPP_LIMITS.minAnimatedFrameDurationMs, Math.round(1000 / frameRate));

    if (endMs <= startMs) {
      throw new BadRequestException('Animated trim end must be after trim start');
    }
    if (endMs - startMs > WHATSAPP_LIMITS.maxAnimatedStickerDurationMs) {
      throw new BadRequestException(`Animated sticker duration must be at most ${WHATSAPP_LIMITS.maxAnimatedStickerDurationMs}ms`);
    }

    const frameIndexes = this.sampleFrameIndexes(delays, startMs, endMs, frameDuration);
    if (frameIndexes.length < 2) {
      throw new BadRequestException('Animated edit must keep at least two frames');
    }

    const decoded = await sharp(input, { animated: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const channels = decoded.info.channels;
    const frameByteLength = width * pageHeight * channels;
    const frames: Buffer[] = [];
    for (const frameIndex of frameIndexes) {
      const start = frameIndex * frameByteLength;
      const frame = decoded.data.subarray(start, start + frameByteLength);
      frames.push(await sharp(Buffer.from(frame), { raw: { width, height: pageHeight, channels } }).png().toBuffer());
    }

    return sharp(frames, { join: { animated: true } })
      .webp({
        delay: frameIndexes.map(() => frameDuration),
        effort: 6,
        quality: clampMs(options.animatedQuality ?? 82, 35, 95),
        smartSubsample: true,
      })
      .toBuffer();
  }

  private normalizedDelays(metadata: ImageMetadata) {
    const pages = metadata.pages ?? 1;
    const delays = metadata.delay?.length ? metadata.delay : [];
    return Array.from({ length: pages }, (_, index) => Math.max(WHATSAPP_LIMITS.minAnimatedFrameDurationMs, delays[index] ?? 100));
  }

  private estimatedFrameRate(delays: number[]) {
    const averageDelay = delays.reduce((total, delay) => total + delay, 0) / delays.length;
    return Math.round(1000 / Math.max(WHATSAPP_LIMITS.minAnimatedFrameDurationMs, averageDelay));
  }

  private sampleFrameIndexes(delays: number[], startMs: number, endMs: number, frameDuration: number) {
    const frameStarts: number[] = [];
    delays.reduce((elapsed, delay) => {
      frameStarts.push(elapsed);
      return elapsed + delay;
    }, 0);

    const indexes: number[] = [];
    for (let time = startMs; time < endMs; time += frameDuration) {
      let index = 0;
      for (let frameIndex = 0; frameIndex < frameStarts.length; frameIndex += 1) {
        if (frameStarts[frameIndex] > time) break;
        index = frameIndex;
      }
      indexes.push(Math.max(0, Math.min(delays.length - 1, index)));
    }

    return indexes.filter((index, position) => position === 0 || index !== indexes[position - 1]);
  }

  private qualityCandidates(preferredQuality?: number) {
    const defaults = [90, 80, 70, 60, 50, 40, 32, 25];
    if (preferredQuality === undefined) return defaults;

    const preferred = clampMs(Math.round(preferredQuality), 35, 95);
    const lowered = Array.from({ length: 7 }, (_, index) => Math.max(25, preferred - index * 10));
    return [...new Set([...lowered, ...defaults])].sort((left, right) => right - left);
  }

  private assertAnimatedStickerMetadata(metadata: ImageMetadata) {
    this.assertAnimatedImage(metadata);

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

  private configInt(key: string, fallback: number) {
    const parsed = Number.parseInt(this.config?.get<string>(key, String(fallback)) ?? String(fallback), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}

function clampMs(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
