import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import { Readable } from 'stream';
import { ProcessedImage } from '../media/sticker-image.service';
import { STORAGE_SERVICE } from './storage.token';
import { DiskStorageService } from './disk-storage.service';
import { StorageMaintenanceService } from './storage.service';

@Injectable()
export class PackStorageService {
  private readonly storage: StorageMaintenanceService;
  private readonly config: ConfigService;

  constructor(
    @Inject(STORAGE_SERVICE) storageOrConfig: StorageMaintenanceService | ConfigService,
    @Optional() config?: ConfigService,
  ) {
    if (this.isStorageService(storageOrConfig)) {
      this.storage = storageOrConfig;
      this.config = config as ConfigService;
      return;
    }

    this.config = storageOrConfig;
    this.storage = new DiskStorageService(storageOrConfig);
  }

  packDirectory(packId: string) {
    const dataDir = this.config.get<string>('DATA_DIR', './data');
    return join(dataDir, 'packs', packId);
  }

  async writeImage(packId: string, fileName: string, image: ProcessedImage) {
    await this.writeBuffer(packId, fileName, image.bytes);
  }

  async replaceImage(packId: string, fileName: string, image: ProcessedImage) {
    await this.writeBuffer(packId, fileName, image.bytes);
  }

  async writeBuffer(packId: string, fileName: string, bytes: Buffer) {
    await this.storage.upload({
      key: this.storageKey(packId, fileName),
      body: bytes,
      mimeType: this.mimeTypeFor(fileName),
    });
  }

  async writeJobInput(jobKey: string, bytes: Buffer, mimeType: string) {
    const storageKey = `${this.prefix()}/jobs/${jobKey}/input`;
    await this.storage.upload({ key: storageKey, body: bytes, mimeType });
    return storageKey;
  }

  async deleteStorageKey(storageKey: string) {
    await this.storage.delete(storageKey);
  }

  storageKeyFor(packId: string, fileName: string) {
    return this.storageKey(packId, fileName);
  }

  async readBuffer(packId: string, fileName: string) {
    return this.storage.download(this.storageKey(packId, fileName));
  }

  async readBufferByKey(storageKey: string) {
    return this.storage.download(storageKey);
  }

  async readStream(packId: string, fileName: string): Promise<Readable> {
    return this.readStreamByKey(this.storageKey(packId, fileName));
  }

  async readStreamByKey(storageKey: string): Promise<Readable> {
    return Readable.from([await this.storage.download(storageKey)]);
  }

  async deletePack(packId: string) {
    await this.storage.deletePrefix(this.packPrefix(packId));
  }

  async deleteFile(packId: string, fileName: string) {
    await this.storage.delete(this.storageKey(packId, fileName));
  }

  async copyPack(sourcePackId: string, targetPackId: string) {
    await this.storage.copyPrefix(this.packPrefix(sourcePackId), this.packPrefix(targetPackId));
  }

  async copyFile(sourcePackId: string, sourceFileName: string, targetPackId: string, targetFileName: string) {
    await this.storage.copy(
      this.storageKey(sourcePackId, sourceFileName),
      this.storageKey(targetPackId, targetFileName),
    );
  }

  private storageKey(packId: string, fileName: string) {
    return fileName === 'tray_icon.webp'
      ? `${this.packPrefix(packId)}cover.webp`
      : `${this.packPrefix(packId)}stickers/${fileName}`;
  }

  private packPrefix(packId: string) {
    return `${this.prefix()}/${packId}/`;
  }

  private prefix() {
    const configuredPrefix = this.config.get<string>('S3_PREFIX', 'packs');
    return this.isSafePrefix(configuredPrefix) ? configuredPrefix.replace(/^\/+|\/+$/g, '') : 'packs';
  }

  private mimeTypeFor(fileName: string) {
    return fileName.toLowerCase().endsWith('.webp') ? 'image/webp' : 'application/octet-stream';
  }

  private isStorageService(value: StorageMaintenanceService | ConfigService): value is StorageMaintenanceService {
    return typeof (value as StorageMaintenanceService).upload === 'function';
  }

  private isSafePrefix(prefix: string | undefined) {
    return Boolean(prefix && !prefix.includes('\\') && !prefix.startsWith('/') && !/^[a-zA-Z]:/.test(prefix) && !prefix.split('/').includes('..'));
  }
}