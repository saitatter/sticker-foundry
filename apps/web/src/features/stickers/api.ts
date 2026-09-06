import type { StickerFoundryApi } from '../../api';

export const stickersApi = {
  upload: (api: StickerFoundryApi, ...args: Parameters<StickerFoundryApi['uploadSticker']>) => api.uploadSticker(...args),
  queueUpload: (api: StickerFoundryApi, ...args: Parameters<StickerFoundryApi['queueStickerUpload']>) => api.queueStickerUpload(...args),
  update: (api: StickerFoundryApi, ...args: Parameters<StickerFoundryApi['updateSticker']>) => api.updateSticker(...args),
  remove: (api: StickerFoundryApi, packId: string, stickerId: string) => api.deleteSticker(packId, stickerId),
  reorder: (api: StickerFoundryApi, packId: string, stickerIds: string[]) => api.reorderStickers(packId, stickerIds),
  comments: (api: StickerFoundryApi, packId: string, stickerId: string) => api.stickerComments(packId, stickerId),
};
