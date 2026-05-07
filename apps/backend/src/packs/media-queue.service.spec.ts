import { ServiceUnavailableException } from '@nestjs/common';
import { MediaQueueService } from './media-queue.service';

function createQueue(overrides: Record<string, string> = {}) {
  return new MediaQueueService({
    get: jest.fn((key: string, fallback: string) => overrides[key] ?? fallback),
  } as never);
}

describe(MediaQueueService, () => {
  it('limits concurrent media jobs', async () => {
    const queue = createQueue({ MEDIA_QUEUE_CONCURRENCY: '1' });
    const order: string[] = [];
    let releaseFirst: (() => void) | undefined;

    const first = queue.enqueue(
      () =>
        new Promise<string>((resolve) => {
          order.push('first-start');
          releaseFirst = () => resolve('first');
        }),
    );
    const second = queue.enqueue(async () => {
      order.push('second-start');
      return 'second';
    });

    await Promise.resolve();
    expect(order).toEqual(['first-start']);
    releaseFirst?.();
    await expect(first).resolves.toBe('first');
    await expect(second).resolves.toBe('second');
    expect(order).toEqual(['first-start', 'second-start']);
  });

  it('rejects new jobs when the waiting queue is full', () => {
    const queue = createQueue({ MEDIA_QUEUE_CONCURRENCY: '1', MEDIA_QUEUE_MAX_WAITING: '1' });
    void queue.enqueue(() => new Promise(() => undefined));
    void queue.enqueue(async () => 'second');

    expect(() => queue.enqueue(async () => 'third')).toThrow(ServiceUnavailableException);
  });
});
