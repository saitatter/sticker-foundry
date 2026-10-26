import { useQuery } from '@tanstack/react-query';
import type { StickerFoundryApi } from '../../api';
import { queryKeys } from '../../lib/query-keys';

export function useInstanceQuery(api: StickerFoundryApi) {
  return useQuery({ queryKey: queryKeys.instance, queryFn: () => api.instanceSettings(), staleTime: 60_000 });
}
