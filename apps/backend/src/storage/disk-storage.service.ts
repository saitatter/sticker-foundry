import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { cp, mkdir, readFile, rename, rm, stat, writeFile } from 'fs/promises';
import { dirname, join, resolve, sep } from 'path';
import { pathToFileURL } from 'url';
import { StorageMaintenanceService, StorageUpload, StoredFile } from './storage.service';

@Injectable()
export class DiskStorageService implements StorageMaintenanceService {
  constructor(private readonly config: ConfigService) {}

  async upload(input: StorageUpload): Promise<StoredFile> {
    const destination = this.pathFor(input.key);
    await mkdir(dirname(destination), { recursive: true });
    const temporaryPath = join(dirname(destination), `.${input.key.split('/').pop() ?? 'upload'}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporaryPath, input.body);
      await rename(temporaryPath, destination);
    } finally {
      await rm(temporaryPath, { force: true });
    }

    return {
      storageKey: input.key,
      mimeType: input.mimeType,
      size: input.body.byteLength,
      url: await this.getUrl(input.key),
    };
  }

  async download(storageKey: string): Promise<Buffer> {
    return readFile(this.pathFor(storageKey));
  }

  async delete(storageKey: string): Promise<void> {
    await rm(this.pathFor(storageKey), { force: true });
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      await stat(this.pathFor(storageKey));
      return true;
    } catch {
      return false;
    }
  }

  async getUrl(storageKey: string): Promise<string> {
    return pathToFileURL(this.pathFor(storageKey)).toString();
  }

  async copy(sourceKey: string, targetKey: string): Promise<void> {
    const source = this.pathFor(sourceKey);
    const target = this.pathFor(targetKey);
    await mkdir(dirname(target), { recursive: true });
    await cp(source, target, { force: true });
  }

  async deletePrefix(prefix: string): Promise<void> {
    await rm(this.pathFor(prefix), { recursive: true, force: true });
  }

  async copyPrefix(sourcePrefix: string, targetPrefix: string): Promise<void> {
    const source = this.pathFor(sourcePrefix);
    const target = this.pathFor(targetPrefix);
    await mkdir(dirname(target), { recursive: true });
    await cp(source, target, { recursive: true, force: true });
  }

  private pathFor(storageKey: string) {
    const root = resolve(this.config.get<string>('DATA_DIR', './data'));
    const normalizedKey = this.normalizeKey(storageKey);
    const destination = resolve(root, normalizedKey);
    const rootWithSeparator = root.endsWith(sep) ? root : `${root}${sep}`;
    if (destination !== root && !destination.startsWith(rootWithSeparator)) {
      throw new Error('Storage key escapes the configured data directory');
    }
    return destination;
  }

  private normalizeKey(storageKey: string) {
    const normalizedKey = storageKey.replaceAll('\\', '/').replace(/^\/+/, '');
    if (!normalizedKey || normalizedKey.split('/').some((part) => part === '..' || part === '.')) {
      throw new Error('Invalid storage key');
    }
    return normalizedKey;
  }

}