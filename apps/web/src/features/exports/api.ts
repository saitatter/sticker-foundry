import type { StickerFoundryApi } from '../../api';

export const exportsApi = {
  queue: (api: StickerFoundryApi, packId: string) => api.queueExportPack(packId),
  contents: (api: StickerFoundryApi, packId: string) => api.exportContents(packId),
  download: (api: StickerFoundryApi, packId: string) => api.exportPack(packId),
};
