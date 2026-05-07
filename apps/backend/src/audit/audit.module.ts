import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditContextMiddleware } from './audit-context.middleware';
import { AuditContextService } from './audit-context.service';
import { AuditService } from './audit.service';

@Module({
  providers: [AuditService, AuditContextMiddleware, AuditContextService, PrismaService],
  exports: [AuditService, AuditContextMiddleware, AuditContextService],
})
export class AuditModule {}
