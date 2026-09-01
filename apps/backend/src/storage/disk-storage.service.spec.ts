import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { DiskStorageService } from './disk-storage.service';

describe(DiskStorageService, () => {
  let dataDir: string;

  afterEach(async () => {
    if (dataDir) {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  function createService() {
    return new DiskStorageService({
      get: jest.fn((key: string, fallback: string) => (key === 'DATA_DIR' ? dataDir : fallback)),
    } as never);
  }

  it('reads only the canonical sticker location', async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'sticker-foundry-storage-'));
    const packDir = join(dataDir, 'packs', 'pack-1');
    await mkdir(join(packDir, 'stickers'), { recursive: true });
    await writeFile(join(packDir, 'sticker.webp'), 'old-location');

    const service = createService();
    await expect(service.download('packs/pack-1/stickers/sticker.webp')).rejects.toMatchObject({ code: 'ENOENT' });

    await writeFile(join(packDir, 'stickers', 'sticker.webp'), 'canonical-location');
    await expect(service.download('packs/pack-1/stickers/sticker.webp')).resolves.toEqual(
      Buffer.from('canonical-location'),
    );
    await expect(readFile(join(packDir, 'sticker.webp'), 'utf8')).resolves.toBe('old-location');
  });
});