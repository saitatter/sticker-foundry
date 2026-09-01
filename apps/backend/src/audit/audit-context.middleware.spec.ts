import { AuditContextMiddleware } from './audit-context.middleware';
import { AuditContextService } from './audit-context.service';

function createRequest(requestId?: string) {
  return {
    method: 'GET',
    originalUrl: '/api/health',
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.2' },
    header: jest.fn((name: string) => {
      if (name === 'x-request-id') return requestId;
      if (name === 'x-forwarded-for') return undefined;
      if (name === 'user-agent') return 'audit-test/1.0';
      return undefined;
    }),
  };
}

function createResponse() {
  return {
    statusCode: 200,
    setHeader: jest.fn(),
    on: jest.fn(),
  };
}

describe(AuditContextMiddleware, () => {
  it('accepts a valid request ID, returns it, and exposes it in context', () => {
    const context = new AuditContextService();
    const middleware = new AuditContextMiddleware(context);
    const response = createResponse();
    let observedContext;
    const next = jest.fn(() => {
      observedContext = context.current();
    });

    middleware.use(createRequest('client-request-1') as never, response as never, next);

    expect(response.setHeader).toHaveBeenCalledWith('X-Request-ID', 'client-request-1');
    expect(next).toHaveBeenCalled();
    expect(observedContext).toEqual({
      requestId: 'client-request-1',
      ipAddress: '127.0.0.1',
      userAgent: 'audit-test/1.0',
    });
  });

  it('replaces invalid request IDs with a generated UUID', () => {
    const context = new AuditContextService();
    const middleware = new AuditContextMiddleware(context);
    const response = createResponse();
    let observedRequestId;

    middleware.use(
      createRequest('bad request id') as never,
      response as never,
      jest.fn(() => {
        observedRequestId = context.current()?.requestId;
      }),
    );

    const requestId = response.setHeader.mock.calls[0][1] as string;
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(observedRequestId).toBe(requestId);
  });
});