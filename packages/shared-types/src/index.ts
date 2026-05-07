export type StickerDto = {
  id: string;
  fileName: string;
  emojis: string[];
  accessibilityText?: string | null;
  sizeBytes: number;
  sha256: string;
  perceptualHash?: string | null;
  position: number;
  reviewStatus: StickerReviewStatus;
  createdAt: string;
};

export type StickerCommentDto = {
  id: string;
  stickerId: string;
  userId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string;
    displayName: string;
  };
};

export type PackRole = 'VIEWER' | 'EDITOR' | 'OWNER';
export type StickerReviewStatus = 'PENDING' | 'APPROVED' | 'NEEDS_WORK';

export type PackDto = {
  id: string;
  name: string;
  publisher: string;
  description?: string | null;
  isPublic: boolean;
  requiresApproval: boolean;
  teamId?: string | null;
  teamName?: string | null;
  imageDataVersion: string;
  stickerCount: number;
  exportStickerCount?: number;
  canExport?: boolean;
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
  requiresApproval: boolean;
  isOwner: boolean;
  teamId?: string | null;
  teamName?: string | null;
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
  requiresApproval?: boolean;
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

export type TeamDto = {
  id: string;
  name: string;
  description?: string | null;
  role?: PackRole;
  memberCount: number;
  packCount: number;
  canManage: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TeamMemberDto = {
  id: string;
  teamId: string;
  userId: string;
  role: PackRole;
  user: {
    id: string;
    email: string;
    displayName: string;
  };
};

export type AuthResponseDto = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    isAdmin: boolean;
  };
};

export type UserSessionDto = {
  id: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string | null;
};

export type RegistrationMode = 'open' | 'invite-only' | 'disabled';

export type AdminSettingsDto = {
  registrationMode: RegistrationMode;
  registrationInviteCode: string;
  storageQuotaBytes: number | null;
  instanceName: string;
  instanceDescription: string;
};

export type InstanceSettingsDto = {
  instanceName: string;
  instanceDescription: string;
};

export type AuditLogEntryDto = {
  id: string;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
  actor?: {
    id: string;
    email: string;
    displayName: string;
  } | null;
};
