import sharp = require('sharp');
import { BackgroundRemovalService } from './background-removal.service';

describe(BackgroundRemovalService, () => {
  it('removes simple light backgrounds while preserving subject pixels', async () => {
    const service = new BackgroundRemovalService();
    const input = await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 4,
              height: 4,
              channels: 4,
              background: { r: 220, g: 0, b: 0, alpha: 1 },
            },
          })
            .png()
            .toBuffer(),
          left: 2,
          top: 2,
        },
      ])
      .png()
      .toBuffer();

    const output = await service.remove(input, { mode: 'threshold', threshold: 238, feather: 0, cleanupSpeckles: false });
    const { data, info } = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alphaAt = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3];

    expect(alphaAt(0, 0)).toBe(0);
    expect(alphaAt(3, 3)).toBe(255);
  });

  it('falls back to threshold removal when the AI command is not configured', async () => {
    const service = new BackgroundRemovalService({ get: jest.fn(() => '') } as never);
    const input = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const output = await service.remove(input, { mode: 'ai', threshold: 238, feather: 0 });
    const { data } = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    expect(data[3]).toBe(0);
  });
});
