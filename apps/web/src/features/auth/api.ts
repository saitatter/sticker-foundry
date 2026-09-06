import type { StickerFoundryApi } from '../../api';

export const authApi = {
  login: (api: StickerFoundryApi, email: string, password: string) => api.login(email, password),
  register: (api: StickerFoundryApi, email: string, displayName: string, password: string, inviteCode?: string) =>
    api.register(email, displayName, password, inviteCode),
  me: (api: StickerFoundryApi) => api.me(),
  refresh: (api: StickerFoundryApi) => api.refreshSession(),
  logout: (api: StickerFoundryApi) => api.logout(),
};
