import { JobStatus } from '@prisma/client';
import { JobExecutionService } from './job-execution.service';

describe(JobExecutionService, () => {
  it('allows only one concurrent claim for a queued job', async () => {
    const queuedJob = { id: 'job-1', status: JobStatus.QUEUED };
    const prisma = {
      mediaJob: {
        findUnique: jest.fn().mockResolvedValue(queuedJob),
        updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 }),
      },
    };
    const service = new JobExecutionService(prisma as never);

    const results = await Promise.all([service.claim('job-1'), service.claim('job-1')]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(prisma.mediaJob.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.mediaJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'job-1', status: JobStatus.QUEUED } }),
    );
  });

  it('does not complete or fail a job after it has been cancelled', async () => {
    const prisma = {
      mediaJob: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const service = new JobExecutionService(prisma as never);

    await expect(service.complete('job-1')).resolves.toBe(false);
    await expect(service.fail('job-1', 'cancelled', false)).resolves.toEqual({ count: 0 });
    expect(prisma.mediaJob.updateMany).toHaveBeenCalledTimes(2);
  });
});