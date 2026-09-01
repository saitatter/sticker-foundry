import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PackRole } from '@prisma/client';
import { randomBytes } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import { CreatePackInviteDto } from './dto/create-pack-invite.dto';
import { UpdatePackMemberDto } from './dto/update-pack-member.dto';
import { PackAccessService } from './pack-access.service';

@Injectable()
export class PacksCollaborationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: PackAccessService,
  ) {}

  async members(ownerId: string, packId: string) {
    await this.access.requireManage(ownerId, packId);
    return this.prisma.packMember.findMany({
      where: { packId },
      orderBy: [{ role: 'desc' }, { createdAt: 'asc' }],
      include: { user: { select: { id: true, email: true, displayName: true } } },
    });
  }

  async updateMember(ownerId: string, packId: string, memberId: string, dto: UpdatePackMemberDto) {
    await this.access.requireManage(ownerId, packId);
    if (dto.role === PackRole.OWNER) {
      throw new BadRequestException('Owner role cannot be assigned to members');
    }

    const member = await this.prisma.packMember.findFirst({ where: { id: memberId, packId } });
    if (!member) {
      throw new NotFoundException('Member not found');
    }

    const updated = await this.prisma.packMember.update({
      where: { id: memberId },
      data: { role: dto.role },
      include: { user: { select: { id: true, email: true, displayName: true } } },
    });
    await this.audit.record({
      actorId: ownerId,
      action: 'pack.member.update',
      entityType: 'packMember',
      entityId: memberId,
      metadata: { packId, role: dto.role },
    });
    return updated;
  }

  async removeMember(ownerId: string, packId: string, memberId: string) {
    await this.access.requireManage(ownerId, packId);
    const member = await this.prisma.packMember.findFirst({ where: { id: memberId, packId } });
    if (!member) {
      throw new NotFoundException('Member not found');
    }

    await this.prisma.packMember.delete({ where: { id: memberId } });
    await this.audit.record({
      actorId: ownerId,
      action: 'pack.member.remove',
      entityType: 'packMember',
      entityId: memberId,
      metadata: { packId, userId: member.userId },
    });
    return { deleted: true };
  }

  async invites(ownerId: string, packId: string) {
    await this.access.requireManage(ownerId, packId);
    return this.prisma.packInvite.findMany({
      where: { packId },
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, email: true, displayName: true } },
        acceptedBy: { select: { id: true, email: true, displayName: true } },
      },
    });
  }

  async activity(userId: string, packId: string) {
    const pack = await this.access.loadPackForAccess(userId, packId);
    if (!pack) {
      throw new NotFoundException('Pack not found');
    }
    if (!this.access.canView(userId, pack)) {
      throw new ForbiddenException('You do not have access to this pack');
    }

    return this.prisma.auditLog.findMany({
      where: {
        OR: [
          { entityType: 'pack', entityId: packId },
          { metadata: { path: ['packId'], equals: packId } },
          { metadata: { path: ['sourcePackId'], equals: packId } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: { actor: { select: { id: true, email: true, displayName: true } } },
    });
  }

  async createInvite(ownerId: string, packId: string, dto: CreatePackInviteDto) {
    await this.access.requireManage(ownerId, packId);
    if (dto.role === PackRole.OWNER) {
      throw new BadRequestException('Owner invites are not supported yet');
    }
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : undefined;
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Invite expiration must be in the future');
    }

    const invite = await this.prisma.packInvite.create({
      data: {
        packId,
        email: dto.email?.toLowerCase(),
        role: dto.role,
        code: this.newInviteCode(),
        expiresAt,
        createdById: ownerId,
      },
    });
    await this.audit.record({
      actorId: ownerId,
      action: 'pack.invite.create',
      entityType: 'packInvite',
      entityId: invite.id,
      metadata: { packId, role: invite.role, email: invite.email ?? null, expiresAt: invite.expiresAt?.toISOString() ?? null },
    });
    return invite;
  }

  async revokeInvite(ownerId: string, packId: string, inviteId: string) {
    await this.access.requireManage(ownerId, packId);
    const result = await this.prisma.packInvite.deleteMany({ where: { id: inviteId, packId, acceptedAt: null } });
    if (result.count === 0) {
      throw new NotFoundException('Pending invite not found');
    }

    await this.audit.record({
      actorId: ownerId,
      action: 'pack.invite.revoke',
      entityType: 'packInvite',
      entityId: inviteId,
      metadata: { packId },
    });
    return { deleted: true };
  }

  async acceptInvite(userId: string, code: string) {
    const invite = await this.prisma.packInvite.findUnique({ where: { code }, include: { pack: true } });
    if (!invite) {
      throw new NotFoundException('Invite not found');
    }
    if (invite.acceptedAt) {
      throw new BadRequestException('Invite has already been accepted');
    }
    if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Invite has expired');
    }
    if (invite.email) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
      if (user?.email.toLowerCase() !== invite.email.toLowerCase()) {
        throw new ForbiddenException('This invite is assigned to a different email address');
      }
    }

    await this.prisma.$transaction([
      this.prisma.packMember.upsert({
        where: { packId_userId: { packId: invite.packId, userId } },
        create: { packId: invite.packId, userId, role: invite.role },
        update: { role: invite.role },
      }),
      this.prisma.packInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date(), acceptedById: userId },
      }),
    ]);
    await this.audit.record({
      actorId: userId,
      action: 'pack.invite.accept',
      entityType: 'packInvite',
      entityId: invite.id,
      metadata: { packId: invite.packId, role: invite.role },
    });

    return invite.packId;
  }

  private newInviteCode() {
    return randomBytes(18).toString('base64url');
  }
}
