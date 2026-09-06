import { useQuery } from '@tanstack/react-query';
import type { StickerFoundryApi } from '../../api';
import { queryKeys } from '../../lib/query-keys';

const terminalStatuses = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);

export function useJobQuery(api: StickerFoundryApi, jobId: string | null) {
  return useQuery({
    queryKey: jobId ? queryKeys.jobs.detail(jobId) : ['jobs', 'detail', 'none'],
    queryFn: () => api.job(jobId as string),
    enabled: Boolean(jobId),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && terminalStatuses.has(status) ? false : 1_000;
    },
    refetchIntervalInBackground: false,
  });
}
