import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { StickerFoundryApi } from '../../api';
import { packsApi } from './api';
import { queryKeys } from '../../lib/query-keys';

export function usePacksQuery(api: StickerFoundryApi, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.packs.list,
    queryFn: () => packsApi.list(api),
    enabled,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function usePackQuery(api: StickerFoundryApi, packId: string | null, revision?: string) {
  return useQuery({
    queryKey: packId ? queryKeys.packs.detail(packId, revision) : ['packs', 'detail', 'none'],
    queryFn: () => packsApi.detail(api, packId as string),
    enabled: Boolean(packId),
    placeholderData: keepPreviousData,
  });
}
