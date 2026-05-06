export type StickerDto = {
  id: string;
  fileName: string;
  emojis: string[];
  accessibilityText?: string | null;
  sizeBytes: number;
  sha256: string;
  position: number;
  createdAt: string;
};

export type PackDto = {
  id: string;
  name: string;
  publisher: string;
  description?: string | null;
  isPublic: boolean;
  imageDataVersion: string;
  stickerCount: number;
  updatedAt: string;
  stickers?: StickerDto[];
};

export type SyncPackDto = {
  id: string;
  name: string;
  publisher: string;
  description?: string | null;
  isPublic: boolean;
  isOwner: boolean;
  imageDataVersion: string;
  stickerCount: number;
  canExport: boolean;
  updatedAt: string;
  contentHash: string;
  syncHash: string;
  exportPath: string;
  trayIconPath: string;
};

export type SyncPacksResponseDto = {
  serverTime: string;
  packs: SyncPackDto[];
};

export type PackManifestStickerDto = {
  fileName: string;
  emojis: string[];
  accessibilityText?: string | null;
  sha256: string;
  sizeBytes: number;
};

export type PackManifestDto = {
  id: string;
  name: string;
  publisher: string;
  imageDataVersion: string;
  stickerCount: number;
  canExport: boolean;
  contentHash: string;
  exportPath: string;
  trayIconPath: string;
  stickers: PackManifestStickerDto[];
};

export type AuthResponseDto = {
  accessToken: string;
  user: {
    id: string;
    email: string;
    displayName: string;
  };
};
