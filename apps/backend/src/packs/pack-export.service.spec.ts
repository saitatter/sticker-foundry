import { BadRequestException } from '@nestjs/common';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { PackExportService } from './pack-export.service';
import { PackStorageService } from './pack-storage.service';

function createArchive() {
  return {
    append: jest.fn(),
    file: jest.fn(),
  };
}

describe(PackExportService, () => {
  let dataDir: string;

  afterEach(async () => {
    if (dataDir) {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  async function createService(pack: unknown) {
    dataDir = await mkdtemp(join(tmpdir(), 'sticker-foundry-export-'));
    const prisma = {
      pack: {
        findUnique: jest.fn().mockResolvedValue(pack),
      },
    };
    const config = {
      get: jest.fn((_key: string, fallback: string) => dataDir ?? fallback),
    };
    const storage = new PackStorageService(config as never);
    const service = new PackExportService(prisma as never, storage);
    return { service, prisma };
  }

  it('writes WhatsApp contents.json in sticker position order', async () => {
    const pack = {
      id: 'pack-1234567890',
      name: 'Memes',
      publisher: 'Sticker Foundry',
      requiresApproval: false,
      isAnimated: false,
      imageDataVersion: '7',
      stickers: [
        {
          fileName: 'first.webp',
          emojis: ['\uD83D\uDE00'],
          accessibilityText: 'first sticker',
        },
        {
          fileName: 'second.webp',
          emojis: [],
          accessibilityText: null,
        },
        {
          fileName: 'third.webp',
          emojis: ['\uD83D\uDD25', '\u2728'],
          accessibilityText: 'third sticker',
        },
      ],
    };
    const { service, prisma } = await createService(pack);
    const packDir = service.packDirectory(pack.id);
    await mkdir(packDir, { recursive: true });
    await writeFile(join(packDir, 'tray_icon.webp'), 'tray');
    await Promise.all(pack.stickers.map((sticker) => writeFile(join(packDir, sticker.fileName), 'sticker')));

    const archive = createArchive();
    await service.buildZip(pack.id, archive as never);

    expect(prisma.pack.findUnique).toHaveBeenCalledWith({
      where: { id: pack.id },
      include: { stickers: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } },
    });
    expect(archive.append).toHaveBeenNthCalledWith(1, expect.any(String), { name: 'contents.json' });

    const contents = JSON.parse(archive.append.mock.calls[0][0]);
    expect(contents.sticker_packs[0]).toEqual(
      expect.objectContaining({
        identifier: pack.id,
        name: 'Memes',
        publisher: 'Sticker Foundry',
        tray_image_file: 'tray_icon.webp',
        image_data_version: '7',
        animated_sticker_pack: false,
      }),
    );
    expect(contents.sticker_packs[0].stickers).toEqual([
      {
        image_file: 'first.webp',
        emojis: ['\uD83D\uDE00'],
        accessibility_text: 'first sticker',
      },
      {
        image_file: 'second.webp',
        emojis: ['\uD83D\uDE00'],
      },
      {
        image_file: 'third.webp',
        emojis: ['\uD83D\uDD25', '\u2728'],
        accessibility_text: 'third sticker',
      },
    ]);
    expect(archive.append).toHaveBeenNthCalledWith(2, expect.anything(), { name: 'tray_icon.webp' });
    expect(archive.append).toHaveBeenNthCalledWith(3, expect.anything(), { name: 'first.webp' });
    expect(archive.append).toHaveBeenNthCalledWith(4, expect.anything(), { name: 'second.webp' });
    expect(archive.append).toHaveBeenNthCalledWith(5, expect.anything(), { name: 'third.webp' });
  });

  it('rejects exports with fewer than the WhatsApp minimum sticker count', async () => {
    const { service } = await createService({
      id: 'pack-1',
      name: 'Too small',
      publisher: 'Sticker Foundry',
      requiresApproval: false,
      isAnimated: false,
      imageDataVersion: '1',
      stickers: [{ fileName: 'only.webp', emojis: ['\uD83D\uDE00'], accessibilityText: null }],
    });

    await expect(service.buildZip('pack-1', createArchive() as never)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('exports only approved stickers when pack approval is required', async () => {
    const pack = {
      id: 'pack-review',
      name: 'Reviewed',
      publisher: 'Sticker Foundry',
      requiresApproval: true,
      isAnimated: false,
      imageDataVersion: '2',
      stickers: [
        { fileName: 'one.webp', emojis: ['😀'], accessibilityText: null, reviewStatus: 'APPROVED' },
        { fileName: 'two.webp', emojis: ['😀'], accessibilityText: null, reviewStatus: 'NEEDS_WORK' },
        { fileName: 'three.webp', emojis: ['😀'], accessibilityText: null, reviewStatus: 'APPROVED' },
        { fileName: 'four.webp', emojis: ['😀'], accessibilityText: null, reviewStatus: 'PENDING' },
        { fileName: 'five.webp', emojis: ['😀'], accessibilityText: null, reviewStatus: 'APPROVED' },
      ],
    };
    const { service } = await createService(pack);
    const packDir = service.packDirectory(pack.id);
    await mkdir(packDir, { recursive: true });
    await writeFile(join(packDir, 'tray_icon.webp'), 'tray');
    await Promise.all(pack.stickers.map((sticker) => writeFile(join(packDir, sticker.fileName), 'sticker')));

    const archive = createArchive();
    await service.buildZip(pack.id, archive as never);

    const contents = JSON.parse(archive.append.mock.calls[0][0]);
    expect(contents.sticker_packs[0].stickers.map((sticker: { image_file: string }) => sticker.image_file)).toEqual([
      'one.webp',
      'three.webp',
      'five.webp',
    ]);
    expect(archive.append).toHaveBeenCalledTimes(5);
  });

  it('builds a manifest with a stable content hash and export paths', async () => {
    const pack = {
      id: 'pack-manifest',
      name: 'Manifest Pack',
      publisher: 'Sticker Foundry',
      requiresApproval: false,
      isAnimated: true,
      imageDataVersion: '4',
      stickers: [
        {
          fileName: 'one.webp',
          emojis: ['\uD83D\uDE00'],
          accessibilityText: null,
          sha256: 'one-hash',
          sizeBytes: 1234,
        },
        {
          fileName: 'two.webp',
          emojis: [],
          accessibilityText: 'second',
          sha256: 'two-hash',
          sizeBytes: 2345,
        },
        {
          fileName: 'three.webp',
          emojis: ['\u2728'],
          accessibilityText: null,
          sha256: 'three-hash',
          sizeBytes: 3456,
        },
      ],
    };
    const { service } = await createService(pack);
    const packDir = service.packDirectory(pack.id);
    await mkdir(packDir, { recursive: true });
    await writeFile(join(packDir, 'tray_icon.webp'), 'tray');

    const manifest = await service.buildManifest(pack.id);

    expect(manifest).toEqual(
      expect.objectContaining({
        id: pack.id,
        isAnimated: true,
        stickerCount: 3,
        canExport: true,
        exportPath: `/packs/${pack.id}/export`,
        trayIconPath: `/packs/${pack.id}/tray-icon`,
      }),
    );
    expect(manifest.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(service.etagForHash(manifest.contentHash)).toBe(`"${manifest.contentHash}"`);
    expect(manifest.stickers[1]).toEqual({
      fileName: 'two.webp',
      emojis: ['\uD83D\uDE00'],
      accessibilityText: 'second',
      sha256: 'two-hash',
      sizeBytes: 2345,
    });
  });
});
