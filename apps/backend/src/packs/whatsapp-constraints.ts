export const WHATSAPP_LIMITS = {
  minStickersPerPack: 3,
  maxStickersPerPack: 30,
  stickerPixels: 512,
  trayIconPixels: 96,
  maxStaticStickerBytes: 100 * 1024,
  maxTrayIconBytes: 50 * 1024,
  maxStickerEmojis: 3,
  maxNameLength: 128,
  maxIdentifierLength: 128,
} as const;

export const DEFAULT_STICKER_EMOJIS = ['\uD83D\uDE00'];
