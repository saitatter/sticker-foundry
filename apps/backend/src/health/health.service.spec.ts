import { HealthService } from './health.service';

describe(HealthService, () => {
  it('reports ok when the database responds', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const service = new HealthService(prisma as never);

    await expect(service.check()).resolves.toEqual(
      expect.objectContaining({
        status: 'ok',
        checks: { database: 'ok' },
      }),
    );
  });

  it('reports degraded when the database check fails', async () => {
    const prisma = { $queryRaw: jest.fn().mockRejectedValue(new Error('offline')) };
    const service = new HealthService(prisma as never);

    await expect(service.check()).resolves.toEqual(
      expect.objectContaining({
        status: 'degraded',
        checks: { database: 'unavailable' },
      }),
    );
  });

  it('reports process metrics', () => {
    const prisma = { $queryRaw: jest.fn() };
    const service = new HealthService(prisma as never);

    expect(service.metrics()).toEqual(
      expect.objectContaining({
        uptimeSeconds: expect.any(Number),
        memory: expect.objectContaining({
          rssBytes: expect.any(Number),
          heapUsedBytes: expect.any(Number),
        }),
        process: expect.objectContaining({
          pid: expect.any(Number),
          nodeVersion: expect.any(String),
        }),
      }),
    );
  });
});
