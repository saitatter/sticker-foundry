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

  it('reports liveness without checking dependencies', () => {
    const service = new HealthService({ $queryRaw: jest.fn() } as never);

    expect(service.live()).toEqual(
      expect.objectContaining({
        status: 'ok',
        uptimeSeconds: expect.any(Number),
      }),
    );
  });

  it('requires database and active queue workers for readiness', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const queue = { readiness: jest.fn().mockResolvedValue({ status: 'unavailable', queues: [] }) };
    const service = new HealthService(prisma as never, queue as never);

    await expect(service.ready()).resolves.toEqual(
      expect.objectContaining({
        status: 'degraded',
        checks: { database: 'ok', queue: 'unavailable' },
      }),
    );
  });

  it('reports process metrics', async () => {
    const prisma = { $queryRaw: jest.fn() };
    const service = new HealthService(prisma as never);

    await expect(service.metrics()).resolves.toEqual(
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

  it('reports active workers per queue in process metrics', async () => {
    const prisma = { $queryRaw: jest.fn() };
    const queue = {
      readiness: jest.fn().mockResolvedValue({
        status: 'ok',
        queues: [
          { name: 'media', workers: 1 },
          { name: 'export', workers: 2 },
          { name: 'email', workers: 1 },
        ],
      }),
    };
    const service = new HealthService(prisma as never, queue as never);

    await expect(service.metrics()).resolves.toEqual(
      expect.objectContaining({
        queue: expect.objectContaining({
          workerAvailable: true,
          workers: [
            { name: 'media', workers: 1 },
            { name: 'export', workers: 2 },
            { name: 'email', workers: 1 },
          ],
        }),
      }),
    );
  });

  it('formats metrics for Prometheus', () => {
    const prisma = { $queryRaw: jest.fn() };
    const service = new HealthService(prisma as never);

    expect(
      service.prometheusMetrics({
        uptimeSeconds: 12,
        memory: {
          rssBytes: 100,
          heapUsedBytes: 50,
          heapTotalBytes: 80,
          externalBytes: 10,
        },
        process: {
          pid: 123,
          nodeVersion: 'v20.0.0',
        },
      }),
    ).toContain('stickerfoundry_uptime_seconds 12');
    expect(
      service.prometheusMetrics({
        uptimeSeconds: 12,
        memory: { rssBytes: 100, heapUsedBytes: 50, heapTotalBytes: 80, externalBytes: 10 },
        process: { pid: 123, nodeVersion: 'v20.0.0' },
        queue: {
          configured: true,
          names: ['media', 'export', 'email'],
          workerExpected: true,
          workerAvailable: true,
          workers: [
            { name: 'media', workers: 1 },
            { name: 'export', workers: 2 },
            { name: 'email', workers: 1 },
          ],
        },
      }),
    ).toContain('stickerfoundry_queue_workers{queue="export"} 2');
  });
});
