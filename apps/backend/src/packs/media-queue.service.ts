import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type QueueItem<T> = {
  task: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

export class MediaQueueFullException extends ServiceUnavailableException {
  constructor(readonly retryAfterSeconds: number) {
    super('Media processing queue is full. Try again shortly.');
  }
}

@Injectable()
export class MediaQueueService {
  private readonly queue: QueueItem<unknown>[] = [];
  private active = 0;

  constructor(private readonly config: ConfigService) {}

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    if (this.queue.length >= this.maxWaiting()) {
      throw new MediaQueueFullException(this.retryAfterSeconds());
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push({ task, resolve: resolve as (value: unknown) => void, reject });
      this.drain();
    });
  }

  private drain() {
    while (this.active < this.concurrency() && this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) return;
      this.active += 1;
      void item
        .task()
        .then(item.resolve)
        .catch(item.reject)
        .finally(() => {
          this.active -= 1;
          this.drain();
        });
    }
  }

  private concurrency() {
    return this.configInt('MEDIA_QUEUE_CONCURRENCY', 1);
  }

  private maxWaiting() {
    return this.configInt('MEDIA_QUEUE_MAX_WAITING', 50);
  }

  private retryAfterSeconds() {
    return this.configInt('MEDIA_QUEUE_RETRY_AFTER_SECONDS', 5);
  }

  private configInt(key: string, fallback: number) {
    const parsed = Number.parseInt(this.config.get<string>(key, String(fallback)), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
