import { useQuery } from '@tanstack/react-query';
import type { StickerFoundryApi } from '../../api';
import { queryKeys } from '../../lib/query-keys';
import { adminApi } from './api';

export function useAdminSettingsQuery(api: StickerFoundryApi, enabled: boolean) {
  return useQuery({ queryKey: queryKeys.admin.settings, queryFn: () => adminApi.settings(api), enabled });
}
