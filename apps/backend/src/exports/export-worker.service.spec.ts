import { ExportWorkerService } from './export-worker.service';

function createWorker() {
  const execution = {
    claim: jest.fn(),
    progress: jest.fn().mockResolvedValue({ count: 1 }),
    complete: jest.fn().mockResolvedValue(true),
    fail: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const exportService = {
    buildCachedZip: jest.fn().mockResolvedValue({ contentHash: 'hash-1' }),
  };
  const config = {
    get: jest.fn((_key: string, fallback?: string) => fallback),
  };
  const service = new ExportWorkerService(config as never, exportService as never, execution as never);
  return { service, execution, exportService };
}

function queueJob(overrides: Record<string, unknown> = {}) {
  return {
    attemptsMade: 0,
    opts: { attempts: 3 },
    data: { mediaJobId: 'job-1', packId: 'pack-1', ...overrides },
  };
}

describe(ExportWorkerService, () => {
  it('completes a claimed export and stores its result', async () => {
    const { service, execution, exportService } = createWorker();
    execution.claim.mockResolvedValue({ id: 'job-1', packId: 'pack-1' });

    await (service as unknown as { process: (job: unknown) => Promise<unknown> }).process(queueJob());

    expect(exportService.buildCachedZip).toHaveBeenCalledWith('pack-1');
    expect(execution.complete).toHaveBeenCalledWith('job-1', {
      packId: 'pack-1',
      contentHash: 'hash-1',
      downloadPath: '/packs/pack-1/export',
    });
  });

  it('marks an invalid claimed payload for retry instead of leaving it processing', async () => {
    const { service, execution, exportService } = createWorker();
    execution.claim.mockResolvedValue({ id: 'job-1', packId: null });

    await expect(
      (service as unknown as { process: (job: unknown) => Promise<unknown> }).process(
        queueJob({ packId: undefined }),
      ),
    ).rejects.toThrow('Export job is missing packId');

    expect(exportService.buildCachedZip).not.toHaveBeenCalled();
    expect(execution.fail).toHaveBeenCalledWith('job-1', 'Export job is missing packId', true);
  });

  it('marks a terminal export failure after the final queue attempt', async () => {
    const { service, execution, exportService } = createWorker();
    execution.claim.mockResolvedValue({ id: 'job-1', packId: 'pack-1' });
    exportService.buildCachedZip.mockRejectedValue(new Error('zip failed'));

    await expect(
      (service as unknown as { process: (job: unknown) => Promise<unknown> }).process({
        ...queueJob(),
        attemptsMade: 2,
      }),
    ).rejects.toThrow('zip failed');

    expect(execution.fail).toHaveBeenCalledWith('job-1', 'zip failed', false);
  });
});