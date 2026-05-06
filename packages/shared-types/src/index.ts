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

export type AuthResponseDto = {
  accessToken: string;
  user: {
    id: string;
    email: string;
    displayName: string;
  };
};
