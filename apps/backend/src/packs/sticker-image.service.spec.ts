import { BadRequestException } from '@nestjs/common';
import sharp = require('sharp');
import { StickerImageService } from './sticker-image.service';

describe(StickerImageService, () => {
  const service = new StickerImageService();

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

  it('rejects images that exceed configured pixel bounds before processing', async () => {
    const guardedService = new StickerImageService({
      get: jest.fn((key: string, fallback: string) => (key === 'UPLOAD_MAX_PIXELS' ? '1000' : fallback)),
    } as never);
    const source = await frameBuffer({ r: 255, g: 0, b: 0, alpha: 1 });

    await expect(guardedService.processSticker(source)).rejects.toBeInstanceOf(BadRequestException);
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
