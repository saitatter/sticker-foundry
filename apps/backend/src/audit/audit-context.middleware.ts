import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { AuditContextService } from './audit-context.service';

@Injectable()
export class AuditContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  constructor(private readonly context: AuditContextService) {}

  use(request: Request, response: Response, next: NextFunction) {
    const startedAt = Date.now();
    const requestId = this.requestId(request.header('x-request-id'));
    const forwardedFor = request.header('x-forwarded-for')?.split(',')[0]?.trim();
    response.setHeader('X-Request-ID', requestId);
    response.on('finish', () => {
      this.logger.log(
        JSON.stringify({
          event: 'http.request',
          requestId,
          method: request.method,
          path: request.originalUrl,
          statusCode: response.statusCode,
          durationMs: Date.now() - startedAt,
        }),
      );
    });
    this.context.run(
      {
        requestId,
        ipAddress: forwardedFor || request.ip || request.socket.remoteAddress,
        userAgent: request.header('user-agent'),
      },
      next,
    );
  }

  private requestId(value: string | undefined) {
    return value && /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : randomUUID();
  }
}
