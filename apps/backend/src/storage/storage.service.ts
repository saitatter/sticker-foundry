export type StorageUpload = {
  key: string;
  body: Buffer;
  mimeType: string;
};

export type StoredFile = {
  storageKey: string;
  mimeType: string;
  size: number;
  url: string;
};

export interface StorageService {
  upload(input: StorageUpload): Promise<StoredFile>;
  download(storageKey: string): Promise<Buffer>;
  delete(storageKey: string): Promise<void>;
  exists(storageKey: string): Promise<boolean>;
  getUrl(storageKey: string): Promise<string>;
}

export interface StorageMaintenanceService extends StorageService {
  copy(sourceKey: string, targetKey: string): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;
  copyPrefix(sourcePrefix: string, targetPrefix: string): Promise<void>;
}