import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ALL_QUEUE_NAMES } from '../jobs/queue.constants';
import { JobQueueService } from '../jobs/job-queue.service';

export type ProcessMetrics = Awaited<ReturnType<HealthService['metrics']>>;
type PrometheusMetrics = Omit<ProcessMetrics, 'queue'> & { queue?: Partial<ProcessMetrics['queue']> };

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly queue?: JobQueueService,
  ) {}

  async check() {
    const database = await this.databaseStatus();
    return {
      status: database === 'ok' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      checks: {
        database,
      },
    };
  }

  live() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  async ready() {
    const database = await this.databaseStatus();
    const queue = this.queue ? await this.queue.readiness() : { status: 'not_configured' as const, queues: [] };
    const status = database === 'ok' && (queue.status === 'ok' || queue.status === 'not_configured') ? 'ok' : 'degraded';
    return {
      status,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      checks: {
        database,
        queue: queue.status,
      },
      queues: queue.queues,
    };
  }

  async metrics() {
    const memory = process.memoryUsage();
    const readiness = this.queue ? await this.queue.readiness() : undefined;
    return {
      uptimeSeconds: Math.round(process.uptime()),
      memory: {
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        heapTotalBytes: memory.heapTotal,
        externalBytes: memory.external,
      },
      process: {
        pid: process.pid,
        nodeVersion: process.version,
      },
      queue: {
        configured: Boolean(this.queue),
        names: ALL_QUEUE_NAMES,
        workerExpected: Boolean(this.queue),
        workerAvailable: readiness?.status === 'ok',
        workers: ALL_QUEUE_NAMES.map((name) => ({
          name,
          workers: readiness?.queues.find((queue) => queue.name === name)?.workers ?? 0,
        })),
      },
    };
  }

  prometheusMetrics(metrics: PrometheusMetrics) {
    const queue = metrics.queue ?? {
      configured: false,
      names: ALL_QUEUE_NAMES,
      workerExpected: false,
      workerAvailable: false,
      workers: ALL_QUEUE_NAMES.map((name) => ({ name, workers: 0 })),
    };
    const workers = queue.workers ?? ALL_QUEUE_NAMES.map((name) => ({ name, workers: 0 }));
    return [
      '# HELP stickerfoundry_uptime_seconds Process uptime in seconds.',
      '# TYPE stickerfoundry_uptime_seconds gauge',
      `stickerfoundry_uptime_seconds ${metrics.uptimeSeconds}`,
      '# HELP stickerfoundry_memory_bytes Process memory usage by type.',
      '# TYPE stickerfoundry_memory_bytes gauge',
      `stickerfoundry_memory_bytes{type="rss"} ${metrics.memory.rssBytes}`,
      `stickerfoundry_memory_bytes{type="heap_used"} ${metrics.memory.heapUsedBytes}`,
      `stickerfoundry_memory_bytes{type="heap_total"} ${metrics.memory.heapTotalBytes}`,
      `stickerfoundry_memory_bytes{type="external"} ${metrics.memory.externalBytes}`,
      '# HELP stickerfoundry_process_info Process metadata.',
      '# TYPE stickerfoundry_process_info gauge',
      `stickerfoundry_process_info{pid="${metrics.process.pid}",node_version="${escapePrometheusLabel(metrics.process.nodeVersion)}"} 1`,
      '# HELP stickerfoundry_queue_configured Whether Redis-backed queues are configured.',
      '# TYPE stickerfoundry_queue_configured gauge',
      `stickerfoundry_queue_configured ${queue.configured ? 1 : 0}`,
      '# HELP stickerfoundry_worker_expected Whether a worker process is expected for queued jobs.',
      '# TYPE stickerfoundry_worker_expected gauge',
      `stickerfoundry_worker_expected ${queue.workerExpected ? 1 : 0}`,
      '# HELP stickerfoundry_worker_available Whether all configured queue workers are currently reachable.',
      '# TYPE stickerfoundry_worker_available gauge',
      `stickerfoundry_worker_available ${queue.workerAvailable ? 1 : 0}`,
      '# HELP stickerfoundry_queue_workers Number of active workers by queue.',
      '# TYPE stickerfoundry_queue_workers gauge',
      ...workers.map(({ name, workers: count }) => `stickerfoundry_queue_workers{queue="${name}"} ${count}`),
      '',
    ].join('\n');
  }

  private async databaseStatus() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'ok';
    } catch {
      return 'unavailable';
    }
  }
}

function escapePrometheusLabel(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}
