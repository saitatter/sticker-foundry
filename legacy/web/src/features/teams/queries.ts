import { useQuery } from '@tanstack/react-query';
import type { StickerFoundryApi } from '../../api';
import { queryKeys } from '../../lib/query-keys';
import { teamsApi } from './api';

export function useTeamsQuery(api: StickerFoundryApi, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.teams.all,
    queryFn: () => teamsApi.list(api),
    enabled,
  });
}
