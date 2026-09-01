import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, JobsOptions, Queue } from 'bullmq';
import { ALL_QUEUE_NAMES, QueueName } from './queue.constants';

export type QueuePayload = Record<string, unknown>;

export type RedisConnection = {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  tls?: Record<string, never>;
};

@Injectable()
export class JobQueueService implements OnModuleDestroy {
  private readonly queues = new Map<QueueName, Queue<QueuePayload>>();
  private readonly connection: RedisConnection;

  constructor(private readonly config: ConfigService) {
    this.connection = redisConnectionFromConfig(config);
  }

  async add<T extends QueuePayload>(queueName: QueueName, jobName: string, data: T, options: JobsOptions = {}) {
    return this.queue(queueName).add(jobName, data, {
      attempts: this.configInt('QUEUE_ATTEMPTS', 3),
      backoff: { type: 'exponential', delay: this.configInt('QUEUE_BACKOFF_MS', 1_000) },
      removeOnComplete: this.configInt('QUEUE_REMOVE_ON_COMPLETE', 100),
      removeOnFail: this.configInt('QUEUE_REMOVE_ON_FAIL', 1_000),
      ...options,
    });
  }

  async remove(queueName: QueueName, jobId: string) {
    await this.queue(queueName).remove(jobId);
  }

  getQueue(queueName: QueueName) {
    return this.queue(queueName);
  }

  async readiness() {
    try {
      const queues = await Promise.all(
        ALL_QUEUE_NAMES.map(async (name) => {
          const queue = this.queue(name);
          const [counts, workers] = await Promise.all([
            queue.getJobCounts('waiting', 'active', 'delayed', 'failed'),
            queue.getWorkersCount(),
          ]);
          return { name, workers, ...counts };
        }),
      );
      return { status: queues.every((queue) => queue.workers > 0) ? ('ok' as const) : ('unavailable' as const), queues };
    } catch {
      return { status: 'unavailable' as const, queues: [] };
    }
  }

  async onModuleDestroy() {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
  }

  private queue(queueName: QueueName) {
    const existing = this.queues.get(queueName);
    if (existing) return existing;

    const queue = new Queue<QueuePayload>(queueName, {
      connection: this.connection,
      prefix: queuePrefixFromConfig(this.config),
    });
    this.queues.set(queueName, queue);
    return queue;
  }

  private configInt(key: string, fallback: number) {
    const parsed = Number.parseInt(this.config.get<string>(key, String(fallback)), 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }
}

export function redisConnectionFromConfig(config: ConfigService): RedisConnection {
  const redisUrl = new URL(config.get<string>('REDIS_URL', 'redis://localhost:6379'));
  const database = redisUrl.pathname.replace(/^\//, '');
  return {
    host: redisUrl.hostname,
    port: Number(redisUrl.port) || 6379,
    ...(redisUrl.username ? { username: decodeURIComponent(redisUrl.username) } : {}),
    ...(redisUrl.password ? { password: decodeURIComponent(redisUrl.password) } : {}),
    ...(database ? { db: Number.parseInt(database, 10) || 0 } : {}),
    ...(redisUrl.protocol === 'rediss:' ? { tls: {} as Record<string, never> } : {}),
  };
}

export const queuePrefixFromConfig = (config: ConfigService) => config.get<string>('QUEUE_PREFIX', 'sticker-foundry');

export type QueueJob = Job<QueuePayload>;