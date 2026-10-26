import type { StickerFoundryApi } from '../../api';

export const adminApi = {
  settings: (api: StickerFoundryApi) => api.adminSettings(),
  updateSettings: (api: StickerFoundryApi, input: Parameters<StickerFoundryApi['updateAdminSettings']>[0]) =>
    api.updateAdminSettings(input),
  audit: (api: StickerFoundryApi, limit?: number) => api.adminAuditLog(limit),
  cleanupAudit: (api: StickerFoundryApi) => api.cleanupAuditLog(),
};
