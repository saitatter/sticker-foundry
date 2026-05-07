import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

type AuditRecordInput = {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(input: AuditRecordInput) {
    return this.prisma.auditLog.create({
      data: {
        actorId: input.actorId ?? undefined,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? undefined,
        metadata: input.metadata,
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
}
