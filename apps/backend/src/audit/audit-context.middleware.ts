import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { AuditContextService } from './audit-context.service';

@Injectable()
export class AuditContextMiddleware implements NestMiddleware {
  constructor(private readonly context: AuditContextService) {}

  use(request: Request, _response: Response, next: NextFunction) {
    const forwardedFor = request.header('x-forwarded-for')?.split(',')[0]?.trim();
    this.context.run(
      {
        ipAddress: forwardedFor || request.ip || request.socket.remoteAddress,
        userAgent: request.header('user-agent'),
      },
      next,
    );
  }
}
