import type { StickerFoundryApi } from '../../api';

export const jobsApi = {
  get: (api: StickerFoundryApi, jobId: string) => api.job(jobId),
  cancel: (api: StickerFoundryApi, jobId: string) => api.cancelJob(jobId),
  retry: (api: StickerFoundryApi, jobId: string) => api.retryJob(jobId),
};
