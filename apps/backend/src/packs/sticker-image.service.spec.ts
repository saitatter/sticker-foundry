import { BadRequestException } from '@nestjs/common';
import sharp = require('sharp');
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { StickerImageService } from '../media/sticker-image.service';
import { UploadStickerDto } from './dto/upload-sticker.dto';

describe(StickerImageService, () => {
  const service = new StickerImageService();

  it('honors static optimizer quality and validates multipart quality bounds', async () => {
    const pixels = Buffer.alloc(128 * 128 * 3);
    for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 71 + Math.floor(i / 391) * 23) % 256;
    const source = await sharp(pixels, { raw: { width: 128, height: 128, channels: 3 } }).png().toBuffer();
    const normal = await service.processSticker(source, { staticQuality: 95 });
    const compact = await service.processSticker(source, { staticQuality: 35 });
    expect(compact.sizeBytes).toBeLessThan(normal.sizeBytes);
    expect(await validate(plainToInstance(UploadStickerDto, { staticQuality: '65' }))).toHaveLength(0);
    for (const staticQuality of ['0', '96', 'invalid']) {
      expect(await validate(plainToInstance(UploadStickerDto, { staticQuality }))).toEqual(
        expect.arrayContaining([expect.objectContaining({ property: 'staticQuality' })]),
      );
    }
  });

  it('rejects uploads that are not valid image content', async () => {
    await expect(service.processSticker(Buffer.from('not-an-image'))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts valid image content and normalizes it to webp', async () => {
    const source = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const processed = await service.processSticker(source);

    expect(processed.sizeBytes).toBeLessThanOrEqual(100 * 1024);
    expect(processed.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(processed.perceptualHash).toMatch(/^[a-f0-9]{22}$/);
    await expect(sharp(processed.bytes).metadata()).resolves.toEqual(
      expect.objectContaining({
        format: 'webp',
        width: 512,
        height: 512,
      }),
    );
  });

  it('uses the animated pipeline only for animated packs', async () => {
    const frames = await Promise.all([
      frameBuffer({ r: 255, g: 0, b: 0, alpha: 1 }),
      frameBuffer({ r: 0, g: 0, b: 255, alpha: 1 }),
    ]);
    const animated = await sharp(frames, { join: { animated: true } }).webp({ delay: [100, 100] }).toBuffer();

    await expect(service.processSticker(animated)).rejects.toBeInstanceOf(BadRequestException);

    const processed = await service.processSticker(animated, { animated: true });
    expect(processed.sizeBytes).toBeLessThanOrEqual(500 * 1024);
    await expect(sharp(processed.bytes, { animated: true }).metadata()).resolves.toEqual(
      expect.objectContaining({
        format: 'webp',
        pages: 2,
        width: 512,
      }),
    );
  });

  it('generates a static tray icon from an animated sticker while rejecting animated tray uploads', async () => {
    const frames = await Promise.all([
      frameBuffer({ r: 255, g: 0, b: 0, alpha: 1 }),
      frameBuffer({ r: 0, g: 0, b: 255, alpha: 1 }),
    ]);
    const animated = await sharp(frames, { join: { animated: true } }).webp({ delay: [100, 100] }).toBuffer();
    await expect(service.processTrayIcon(animated)).rejects.toBeInstanceOf(BadRequestException);
    const tray = await service.processTrayIcon(animated, true);
    const metadata = await sharp(tray.bytes).metadata();
    expect(metadata).toEqual(expect.objectContaining({ format: 'webp', width: 96, height: 96 }));
    expect(metadata.pages ?? 1).toBe(1);
  });

  it('trims and resamples animated stickers before enforcing WhatsApp duration', async () => {
    const frames = await Promise.all([
      frameBuffer({ r: 255, g: 0, b: 0, alpha: 1 }),
      frameBuffer({ r: 0, g: 255, b: 0, alpha: 1 }),
      frameBuffer({ r: 0, g: 0, b: 255, alpha: 1 }),
      frameBuffer({ r: 255, g: 255, b: 0, alpha: 1 }),
    ]);
    const animated = await sharp(frames, { join: { animated: true } }).webp({ delay: [1000, 1000, 1000, 1000] }).toBuffer();

    const processed = await service.processSticker(animated, {
      animated: true,
      animatedTrimStart: 1,
      animatedTrimEnd: 2.5,
      animatedFrameRate: 2,
      animatedQuality: 75,
    });

    expect(processed.sizeBytes).toBeLessThanOrEqual(500 * 1024);
    await expect(sharp(processed.bytes, { animated: true }).metadata()).resolves.toEqual(
      expect.objectContaining({
        format: 'webp',
        pages: 2,
        width: 512,
      }),
    );
  });

  it('allows trimming long animated uploads down to the WhatsApp duration limit', async () => {
    const frames = await Promise.all(
      Array.from({ length: 11 }, (_, index) => frameBuffer({ r: index * 20, g: 80, b: 180, alpha: 1 })),
    );
    const animated = await sharp(frames, { join: { animated: true } }).webp({ delay: Array.from({ length: 11 }, () => 1000) }).toBuffer();

    await expect(service.processSticker(animated, { animated: true })).rejects.toBeInstanceOf(BadRequestException);

    const processed = await service.processSticker(animated, {
      animated: true,
      animatedTrimStart: 0,
      animatedTrimEnd: 5,
      animatedFrameRate: 5,
    });

    expect(processed.sizeBytes).toBeLessThanOrEqual(500 * 1024);
  });

  it('rejects images that exceed configured pixel bounds before processing', async () => {
    const guardedService = new StickerImageService({
      get: jest.fn((key: string, fallback: string) => (key === 'UPLOAD_MAX_PIXELS' ? '1000' : fallback)),
    } as never);
    const source = await frameBuffer({ r: 255, g: 0, b: 0, alpha: 1 });

    await expect(guardedService.processSticker(source)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects animated frame edits that exceed the editable pixel budget', async () => {
    const guardedService = new StickerImageService({
      get: jest.fn((key: string, fallback: string) => (key === 'UPLOAD_MAX_ANIMATED_EDIT_PIXELS' ? '1000' : fallback)),
    } as never);
    const frames = await Promise.all([
      frameBuffer({ r: 255, g: 0, b: 0, alpha: 1 }),
      frameBuffer({ r: 0, g: 0, b: 255, alpha: 1 }),
    ]);
    const animated = await sharp(frames, { join: { animated: true } }).webp({ delay: [100, 100] }).toBuffer();

    await expect(
      guardedService.processSticker(animated, {
        animated: true,
        animatedTrimStart: 0,
        animatedTrimEnd: 0.2,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

function frameBuffer(background: sharp.Color) {
  return sharp({
    create: {
      width: 64,
      height: 64,
      channels: 4,
      background,
    },
  })
    .png()
    .toBuffer();
}
