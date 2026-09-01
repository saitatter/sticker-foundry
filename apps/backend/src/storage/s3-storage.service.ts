import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { StorageMaintenanceService, StorageUpload, StoredFile } from './storage.service';

@Injectable()
export class S3StorageService implements StorageMaintenanceService {
  private client: S3Client | null = null;

  constructor(private readonly config: ConfigService) {}

  async upload(input: StorageUpload): Promise<StoredFile> {
    await this.s3().send(
      new PutObjectCommand({
        Bucket: this.bucket(),
        Key: input.key,
        Body: input.body,
        ContentType: input.mimeType,
        ContentLength: input.body.byteLength,
      }),
    );
    return {
      storageKey: input.key,
      mimeType: input.mimeType,
      size: input.body.byteLength,
      url: await this.getUrl(input.key),
    };
  }

  async download(storageKey: string): Promise<Buffer> {
    const response = await this.s3().send(new GetObjectCommand({ Bucket: this.bucket(), Key: storageKey }));
    return this.bodyToBuffer(response.Body);
  }

  async delete(storageKey: string): Promise<void> {
    await this.s3().send(
      new DeleteObjectsCommand({
        Bucket: this.bucket(),
        Delete: { Objects: [{ Key: storageKey }], Quiet: true },
      }),
    );
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      await this.s3().send(new HeadObjectCommand({ Bucket: this.bucket(), Key: storageKey }));
      return true;
    } catch {
      return false;
    }
  }

  async getUrl(storageKey: string): Promise<string> {
    const endpoint = this.config.get<string>('S3_PUBLIC_ENDPOINT') || this.config.get<string>('S3_ENDPOINT');
    if (endpoint) {
      const base = endpoint.replace(/\/$/, '');
      const forcePathStyle = this.config.get<string>('S3_FORCE_PATH_STYLE', 'true').toLowerCase() !== 'false';
      return forcePathStyle
        ? `${base}/${encodeURIComponent(this.bucket())}/${this.encodeKey(storageKey)}`
        : `${base.replace(/^https?:\/\//, `https://${this.bucket()}.`)} /${this.encodeKey(storageKey)}`.replace(' ', '');
    }

    const region = this.config.get<string>('S3_REGION', 'us-east-1');
    return `https://${this.bucket()}.s3.${region}.amazonaws.com/${this.encodeKey(storageKey)}`;
  }

  async copy(sourceKey: string, targetKey: string): Promise<void> {
    await this.s3().send(
      new CopyObjectCommand({
        Bucket: this.bucket(),
        CopySource: `${this.bucket()}/${sourceKey}`,
        Key: targetKey,
      }),
    );
  }

  async deletePrefix(prefix: string): Promise<void> {
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

  async copyPrefix(sourcePrefix: string, targetPrefix: string): Promise<void> {
    for await (const key of this.listKeys(sourcePrefix)) {
      await this.copy(key, `${targetPrefix}${key.slice(sourcePrefix.length)}`);
    }
  }

  private async *listKeys(prefix: string) {
    let continuationToken: string | undefined;
    do {
      const response = await this.s3().send(
        new ListObjectsV2Command({ Bucket: this.bucket(), Prefix: prefix, ContinuationToken: continuationToken }),
      );
      for (const object of response.Contents ?? []) {
        if (object.Key) yield object.Key;
      }
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);
  }

  private deleteBatch(objects: Array<{ Key: string }>) {
    return this.s3().send(new DeleteObjectsCommand({ Bucket: this.bucket(), Delete: { Objects: objects, Quiet: true } }));
  }

  private async bodyToBuffer(body: unknown): Promise<Buffer> {
    if (body && typeof (body as { transformToByteArray?: unknown }).transformToByteArray === 'function') {
      const bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
      return Buffer.from(bytes);
    }
    if (body && typeof (body as { transformToWebStream?: unknown }).transformToWebStream === 'function') {
      const reader = (body as { transformToWebStream: () => ReadableStream }).transformToWebStream().getReader();
      const chunks: Uint8Array[] = [];
      for (;;) {
        const result = await reader.read();
        if (result.done) break;
        chunks.push(result.value);
      }
      return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
    }
    throw new Error('S3 object body is not readable');
  }

  private encodeKey(storageKey: string) {
    return storageKey.split('/').map((part) => encodeURIComponent(part)).join('/');
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