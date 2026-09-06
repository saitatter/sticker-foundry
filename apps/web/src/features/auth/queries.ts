import { useQuery } from '@tanstack/react-query';
import type { StickerFoundryApi } from '../../api';
import { queryKeys } from '../../lib/query-keys';
import { authApi } from './api';

export function useMeQuery(api: StickerFoundryApi, enabled: boolean) {
  return useQuery({ queryKey: queryKeys.me, queryFn: () => authApi.me(api), enabled });
}
