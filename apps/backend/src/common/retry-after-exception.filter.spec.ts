import { ArgumentsHost } from '@nestjs/common';
import { RetryAfterExceptionFilter } from './retry-after-exception.filter';
import { MediaQueueFullException } from '../packs/media-queue.service';

describe(RetryAfterExceptionFilter, () => {
  it('sets Retry-After for media queue backoff responses', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const setHeader = jest.fn();
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ setHeader, status }),
      }),
    } as unknown as ArgumentsHost;

    new RetryAfterExceptionFilter().catch(new MediaQueueFullException(9), host);

    expect(setHeader).toHaveBeenCalledWith('Retry-After', '9');
    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Media processing queue is full. Try again shortly.',
      }),
    );
  });
});
