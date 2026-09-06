import { useQuery } from '@tanstack/react-query';
import type { StickerFoundryApi } from '../../api';
import { packsApi } from './api';
import { queryKeys } from '../../lib/query-keys';

export function usePacksQuery(api: StickerFoundryApi, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.packs.list,
    queryFn: () => packsApi.list(api),
    enabled,
  });
}

export function usePackQuery(api: StickerFoundryApi, packId: string | null) {
  return useQuery({
    queryKey: packId ? queryKeys.packs.detail(packId) : ['packs', 'detail', 'none'],
    queryFn: () => packsApi.detail(api, packId as string),
    enabled: Boolean(packId),
  });
}
