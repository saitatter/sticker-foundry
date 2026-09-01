import { EmailWorkerService } from './email-worker.service';

function createWorker() {
  const execution = {
    claim: jest.fn(),
    progress: jest.fn().mockResolvedValue({ count: 1 }),
    complete: jest.fn().mockResolvedValue(true),
    fail: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const mailer = {
    sendPasswordReset: jest.fn().mockResolvedValue(undefined),
  };
  const config = {
    get: jest.fn((_key: string, fallback?: string) => fallback),
  };
  const service = new EmailWorkerService(config as never, mailer as never, execution as never);
  return { service, execution, mailer };
}

function queueJob(data: Record<string, unknown> = {}) {
  return {
    attemptsMade: 0,
    opts: { attempts: 3 },
    data: {
      mediaJobId: 'job-1',
      email: 'demo@example.com',
      displayName: 'Demo',
      resetUrl: 'https://example.com/reset?token=token',
      expiresAt: '2026-09-02T00:00:00.000Z',
      ...data,
    },
  };
}

describe(EmailWorkerService, () => {
  it('sends a valid password reset job and completes it', async () => {
    const { service, execution, mailer } = createWorker();
    execution.claim.mockResolvedValue({ id: 'job-1' });

    await (service as unknown as { process: (job: unknown) => Promise<unknown> }).process(queueJob());

    expect(mailer.sendPasswordReset).toHaveBeenCalledWith(
      'demo@example.com',
      'Demo',
      'https://example.com/reset?token=token',
      new Date('2026-09-02T00:00:00.000Z'),
    );
    expect(execution.complete).toHaveBeenCalledWith('job-1');
  });

  it('marks an invalid payload for retry after it has been claimed', async () => {
    const { service, execution, mailer } = createWorker();
    execution.claim.mockResolvedValue({ id: 'job-1' });

    await expect(
      (service as unknown as { process: (job: unknown) => Promise<unknown> }).process(queueJob({ resetUrl: undefined })),
    ).rejects.toThrow('Password reset email job is missing required fields');

    expect(mailer.sendPasswordReset).not.toHaveBeenCalled();
    expect(execution.fail).toHaveBeenCalledWith(
      'job-1',
      'Password reset email job is missing required fields',
      true,
    );
  });

  it('marks a terminal mailer failure after the final queue attempt', async () => {
    const { service, execution, mailer } = createWorker();
    execution.claim.mockResolvedValue({ id: 'job-1' });
    mailer.sendPasswordReset.mockRejectedValue(new Error('smtp unavailable'));

    await expect(
      (service as unknown as { process: (job: unknown) => Promise<unknown> }).process({
        ...queueJob(),
        attemptsMade: 2,
      }),
    ).rejects.toThrow('smtp unavailable');

    expect(execution.fail).toHaveBeenCalledWith('job-1', 'smtp unavailable', false);
  });
});