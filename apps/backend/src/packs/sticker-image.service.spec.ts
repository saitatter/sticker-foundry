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
    await expect(sharp(processed.bytes).metadata()).resolves.toEqual(
      expect.objectContaining({
        format: 'webp',
        width: 512,
        height: 512,
      }),
    );
  });
});
