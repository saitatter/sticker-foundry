import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export type ProcessMetrics = ReturnType<HealthService['metrics']>;

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

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

  metrics() {
    const memory = process.memoryUsage();
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
    };
  }

  prometheusMetrics(metrics: ProcessMetrics = this.metrics()) {
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
