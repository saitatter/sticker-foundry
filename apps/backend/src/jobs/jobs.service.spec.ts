import { BadRequestException, NotFoundException } from '@nestjs/common';
import { JobStatus } from '@prisma/client';
import { JobsService } from './jobs.service';

function createService() {
  const prisma = {
    mediaJob: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const queue = {
    add: jest.fn(),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  const config = {
    get: jest.fn((_key: string, fallback: string) => fallback),
  };
  return {
    service: new JobsService(prisma as never, queue as never, config as never),
    prisma,
    queue,
  };
}

describe(JobsService, () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns only the public job state for its owner', async () => {
    const { service, prisma } = createService();
    prisma.mediaJob.findFirst.mockResolvedValue({
      id: 'job-1',
      userId: 'user-1',
      type: 'media',
      status: JobStatus.PROCESSING,
      progress: 67,
      error: null,
    });

    await expect(service.get('user-1', 'job-1')).resolves.toEqual({
      id: 'job-1',
      status: JobStatus.PROCESSING,
      progress: 67,
    });
    expect(prisma.mediaJob.findFirst).toHaveBeenCalledWith({ where: { id: 'job-1', userId: 'user-1' } });
  });

  it('cancels queued jobs and removes their BullMQ job id', async () => {
    const { service, prisma, queue } = createService();
    prisma.mediaJob.findFirst
      .mockResolvedValueOnce({ id: 'job-1', userId: 'user-1', type: 'media', status: JobStatus.QUEUED, progress: 0 })
      .mockResolvedValueOnce({
        id: 'job-1',
        userId: 'user-1',
        type: 'media',
        status: JobStatus.CANCELLED,
        progress: 0,
      });
    prisma.mediaJob.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.cancel('user-1', 'job-1')).resolves.toEqual({
      id: 'job-1',
      status: JobStatus.CANCELLED,
      progress: 0,
    });
    expect(queue.remove).toHaveBeenCalledWith('media', 'job-1');
    expect(prisma.mediaJob.updateMany).toHaveBeenCalledWith({
      where: { id: 'job-1', userId: 'user-1', status: { in: [JobStatus.QUEUED, JobStatus.PROCESSING] } },
      data: { status: JobStatus.CANCELLED, completedAt: expect.any(Date) },
    });
  });

  it('requeues failed jobs with a reset progress state', async () => {
    const { service, prisma, queue } = createService();
    prisma.mediaJob.findFirst.mockResolvedValue({
      id: 'job-1',
      userId: 'user-1',
      type: 'export',
      status: JobStatus.FAILED,
      progress: 20,
      error: 'temporary failure',
      attempts: 1,
    });
    prisma.mediaJob.update.mockResolvedValue({
      id: 'job-1',
      userId: 'user-1',
      type: 'export',
      status: JobStatus.QUEUED,
      progress: 0,
      error: null,
    });

    await expect(service.retry('user-1', 'job-1')).resolves.toEqual({
      id: 'job-1',
      status: JobStatus.QUEUED,
      progress: 0,
    });
    expect(queue.remove).toHaveBeenCalledWith('export', 'job-1');
    expect(queue.add).toHaveBeenCalledWith('export', 'export', { mediaJobId: 'job-1' }, { jobId: 'job-1' });
  });

  it('hides jobs owned by another user', async () => {
    const { service, prisma } = createService();
    prisma.mediaJob.findFirst.mockResolvedValue(null);

    await expect(service.get('user-2', 'job-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not retry a job that is still queued', async () => {
    const { service, prisma } = createService();
    prisma.mediaJob.findFirst.mockResolvedValue({
      id: 'job-1',
      userId: 'user-1',
      type: 'media',
      status: JobStatus.QUEUED,
      progress: 0,
    });

    await expect(service.retry('user-1', 'job-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.mediaJob.update).not.toHaveBeenCalled();
  });
});