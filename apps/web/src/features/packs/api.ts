import type { Pack, StickerFoundryApi } from '../../api';

export const packsApi = {
  list(api: StickerFoundryApi) {
    return api.packs();
  },
  detail(api: StickerFoundryApi, packId: string) {
    return api.pack(packId);
  },
  create(api: StickerFoundryApi, input: Parameters<StickerFoundryApi['createPack']>[0]) {
    return api.createPack(input);
  },
  update(api: StickerFoundryApi, packId: string, input: Parameters<StickerFoundryApi['updatePack']>[1]) {
    return api.updatePack(packId, input);
  },
  remove(api: StickerFoundryApi, packId: string) {
    return api.deletePack(packId);
  },
  clone(api: StickerFoundryApi, packId: string) {
    return api.clonePack(packId);
  },
};

export type PackList = Awaited<ReturnType<typeof packsApi.list>>;
export type PackDetail = Awaited<ReturnType<typeof packsApi.detail>>;
export type PackSummary = Pick<Pack, 'id' | 'name' | 'publisher' | 'stickerCount' | 'updatedAt'>;
