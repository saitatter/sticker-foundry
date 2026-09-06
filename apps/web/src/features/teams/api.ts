import type { StickerFoundryApi } from '../../api';

export const teamsApi = {
  list(api: StickerFoundryApi) {
    return api.teams();
  },
  create(api: StickerFoundryApi, name: string, description?: string) {
    return api.createTeam(name, description);
  },
};
