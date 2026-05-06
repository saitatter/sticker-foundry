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

export type PackRole = 'VIEWER' | 'EDITOR' | 'OWNER';

export type PackDto = {
  id: string;
  name: string;
  publisher: string;
  description?: string | null;
  isPublic: boolean;
  imageDataVersion: string;
  stickerCount: number;
  role?: PackRole;
  canEdit?: boolean;
  canManage?: boolean;
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
  role?: PackRole;
  canEdit?: boolean;
  canManage?: boolean;
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

export type PackMemberDto = {
  id: string;
  packId: string;
  userId: string;
  role: PackRole;
  user: {
    id: string;
    email: string;
    displayName: string;
  };
};

export type PackInviteDto = {
  id: string;
  packId: string;
  email?: string | null;
  role: PackRole;
  code: string;
  expiresAt?: string | null;
  acceptedAt?: string | null;
  createdAt: string;
  createdBy?: {
    id: string;
    email: string;
    displayName: string;
  };
  acceptedBy?: {
    id: string;
    email: string;
    displayName: string;
  } | null;
};

export type AuthResponseDto = {
  accessToken: string;
  user: {
    id: string;
    email: string;
    displayName: string;
  };
};
