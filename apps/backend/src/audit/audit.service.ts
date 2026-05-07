import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { AuditContextService } from './audit-context.service';

type AuditRecordInput = {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
};

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: AuditContextService,
  ) {}

  record(input: AuditRecordInput) {
    const requestContext = this.context.current();
    return this.prisma.auditLog.create({
      data: {
        actorId: input.actorId ?? undefined,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? undefined,
        metadata: input.metadata,
        ipAddress: requestContext?.ipAddress,
        userAgent: requestContext?.userAgent,
      },
    });
  }

  list(limit = 50) {
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
      include: { actor: { select: { id: true, email: true, displayName: true } } },
    });
  }

  async csv(limit = 1000) {
    const entries = await this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 5000),
      include: { actor: { select: { email: true } } },
    });
    const rows = [
      ['createdAt', 'actorEmail', 'action', 'entityType', 'entityId', 'ipAddress', 'userAgent', 'metadata'],
      ...entries.map((entry) => [
        entry.createdAt.toISOString(),
        entry.actor?.email ?? '',
        entry.action,
        entry.entityType,
        entry.entityId ?? '',
        entry.ipAddress ?? '',
        entry.userAgent ?? '',
        entry.metadata ? JSON.stringify(entry.metadata) : '',
      ]),
    ];
    return rows.map((row) => row.map((value) => this.csvCell(value)).join(',')).join('\n');
  }

  cleanup(retentionDays: number | null) {
    if (!retentionDays) {
      return Promise.resolve({ deleted: 0, cutoff: null });
    }

    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    return this.prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    }).then((result) => ({ deleted: result.count, cutoff: cutoff.toISOString() }));
  }

  private csvCell(value: string) {
    return `"${value.replace(/"/g, '""')}"`;
  }
}
