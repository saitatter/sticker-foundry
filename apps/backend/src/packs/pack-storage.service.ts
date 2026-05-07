import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { createReadStream } from 'fs';
import { cp, mkdir, readFile, rename, rm, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { Readable } from 'stream';
import { ProcessedImage } from './sticker-image.service';

@Injectable()
export class PackStorageService {
  private client: S3Client | null = null;

  constructor(private readonly config: ConfigService) {}

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
    if (this.isS3()) {
      await this.s3().send(
        new PutObjectCommand({
          Bucket: this.bucket(),
          Key: this.key(packId, fileName),
          Body: bytes,
          ContentType: 'image/webp',
        }),
      );
      return;
    }

    const path = join(this.packDirectory(packId), fileName);
    await mkdir(dirname(path), { recursive: true });
    const tempPath = join(dirname(path), `.${fileName}.${randomUUID()}.tmp`);
    try {
      await writeFile(tempPath, bytes);
      await rename(tempPath, path);
    } finally {
      await rm(tempPath, { force: true });
    }
  }

  async readBuffer(packId: string, fileName: string) {
    if (this.isS3()) {
      const response = await this.s3().send(new GetObjectCommand({ Bucket: this.bucket(), Key: this.key(packId, fileName) }));
      return this.bodyToBuffer(response.Body);
    }
    return readFile(join(this.packDirectory(packId), fileName));
  }

  async readStream(packId: string, fileName: string): Promise<Readable> {
    if (this.isS3()) {
      const response = await this.s3().send(new GetObjectCommand({ Bucket: this.bucket(), Key: this.key(packId, fileName) }));
      return this.bodyToStream(response.Body);
    }
    return createReadStream(join(this.packDirectory(packId), fileName));
  }

  async deletePack(packId: string) {
    if (this.isS3()) {
      await this.deletePrefix(this.key(packId, ''));
      return;
    }
    await rm(this.packDirectory(packId), { recursive: true, force: true });
  }

  async deleteFile(packId: string, fileName: string) {
    if (this.isS3()) {
      await this.s3().send(
        new DeleteObjectsCommand({
          Bucket: this.bucket(),
          Delete: { Objects: [{ Key: this.key(packId, fileName) }], Quiet: true },
        }),
      );
      return;
    }
    await rm(join(this.packDirectory(packId), fileName), { force: true });
  }

  async copyPack(sourcePackId: string, targetPackId: string) {
    if (this.isS3()) {
      await this.copyPrefix(this.key(sourcePackId, ''), this.key(targetPackId, ''));
      return;
    }
    await cp(this.packDirectory(sourcePackId), this.packDirectory(targetPackId), { recursive: true, force: true });
  }

  async copyFile(sourcePackId: string, sourceFileName: string, targetPackId: string, targetFileName: string) {
    if (this.isS3()) {
      await this.s3().send(
        new CopyObjectCommand({
          Bucket: this.bucket(),
          CopySource: `${this.bucket()}/${this.key(sourcePackId, sourceFileName)}`,
          Key: this.key(targetPackId, targetFileName),
        }),
      );
      return;
    }
    await mkdir(this.packDirectory(targetPackId), { recursive: true });
    await cp(join(this.packDirectory(sourcePackId), sourceFileName), join(this.packDirectory(targetPackId), targetFileName));
  }

  private async copyPrefix(sourcePrefix: string, targetPrefix: string) {
    for await (const key of this.listKeys(sourcePrefix)) {
      await this.s3().send(
        new CopyObjectCommand({
          Bucket: this.bucket(),
          CopySource: `${this.bucket()}/${key}`,
          Key: `${targetPrefix}${key.slice(sourcePrefix.length)}`,
        }),
      );
    }
  }

  private async deletePrefix(prefix: string) {
    let batch: Array<{ Key: string }> = [];
    for await (const key of this.listKeys(prefix)) {
      batch.push({ Key: key });
      if (batch.length === 1000) {
        await this.deleteBatch(batch);
        batch = [];
      }
    }
    if (batch.length > 0) {
      await this.deleteBatch(batch);
    }
  }

  private deleteBatch(objects: Array<{ Key: string }>) {
    return this.s3().send(new DeleteObjectsCommand({ Bucket: this.bucket(), Delete: { Objects: objects, Quiet: true } }));
  }

  private async *listKeys(prefix: string) {
    let ContinuationToken: string | undefined;
    do {
      const response = await this.s3().send(new ListObjectsV2Command({ Bucket: this.bucket(), Prefix: prefix, ContinuationToken }));
      for (const object of response.Contents ?? []) {
        if (object.Key) yield object.Key;
      }
      ContinuationToken = response.NextContinuationToken;
    } while (ContinuationToken);
  }

  private async bodyToBuffer(body: unknown) {
    const stream = this.bodyToStream(body);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  private bodyToStream(body: unknown): Readable {
    if (body instanceof Readable) return body;
    if (body && typeof (body as { transformToWebStream?: unknown }).transformToWebStream === 'function') {
      return Readable.fromWeb((body as { transformToWebStream: () => ReadableStream }).transformToWebStream() as never);
    }
    throw new Error('S3 object body is not readable');
  }

  private isS3() {
    return this.config.get<string>('STORAGE_DRIVER', 'disk').toLowerCase() === 's3';
  }

  private key(packId: string, fileName: string) {
    const prefix = this.config.get<string>('S3_PREFIX', 'packs').replace(/^\/|\/$/g, '');
    return `${prefix}/${packId}/${fileName}`;
  }

  private bucket() {
    return this.config.getOrThrow<string>('S3_BUCKET');
  }

  private s3() {
    if (this.client) return this.client;
    this.client = new S3Client({
      region: this.config.get<string>('S3_REGION', 'us-east-1'),
      endpoint: this.config.get<string>('S3_ENDPOINT') || undefined,
      forcePathStyle: this.config.get<string>('S3_FORCE_PATH_STYLE', 'true').toLowerCase() !== 'false',
      credentials: this.config.get<string>('S3_ACCESS_KEY_ID')
        ? {
            accessKeyId: this.config.getOrThrow<string>('S3_ACCESS_KEY_ID'),
            secretAccessKey: this.config.getOrThrow<string>('S3_SECRET_ACCESS_KEY'),
          }
        : undefined,
    });
    return this.client;
  }
}
