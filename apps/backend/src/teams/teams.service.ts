import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PackRole } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import { AddTeamMemberDto } from './dto/add-team-member.dto';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamMemberDto } from './dto/update-team-member.dto';

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(userId: string) {
    const teams = await this.prisma.team.findMany({
      where: {
        OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { members: true, packs: true } },
        members: { where: { userId }, select: { role: true } },
      },
    });

    return teams.map(({ _count, members, ...team }) => ({
      ...team,
      role: team.ownerId === userId ? PackRole.OWNER : members[0]?.role,
      memberCount: _count.members,
      packCount: _count.packs,
      canManage: team.ownerId === userId || members[0]?.role === PackRole.OWNER,
    }));
  }

  async create(ownerId: string, dto: CreateTeamDto) {
    const team = await this.prisma.team.create({
      data: {
        ownerId,
        name: dto.name,
        description: dto.description,
        members: {
          create: { userId: ownerId, role: PackRole.OWNER },
        },
      },
      include: { _count: { select: { members: true, packs: true } } },
    });
    await this.audit.record({ actorId: ownerId, action: 'team.create', entityType: 'team', entityId: team.id });
    return { ...team, role: PackRole.OWNER, memberCount: team._count.members, packCount: team._count.packs, canManage: true };
  }

  async members(userId: string, teamId: string) {
    await this.requireManage(userId, teamId);
    return this.prisma.teamMember.findMany({
      where: { teamId },
      orderBy: [{ role: 'desc' }, { createdAt: 'asc' }],
      include: { user: { select: { id: true, email: true, displayName: true } } },
    });
  }

  async addMember(userId: string, teamId: string, dto: AddTeamMemberDto) {
    await this.requireManage(userId, teamId);
    if (dto.role === PackRole.OWNER) {
      throw new BadRequestException('Owner role cannot be assigned to team members');
    }
    const target = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!target) {
      throw new NotFoundException('User not found');
    }
    const member = await this.prisma.teamMember.upsert({
      where: { teamId_userId: { teamId, userId: target.id } },
      create: { teamId, userId: target.id, role: dto.role },
      update: { role: dto.role },
      include: { user: { select: { id: true, email: true, displayName: true } } },
    });
    await this.audit.record({
      actorId: userId,
      action: 'team.member.upsert',
      entityType: 'teamMember',
      entityId: member.id,
      metadata: { teamId, role: dto.role },
    });
    return member;
  }

  async updateMember(userId: string, teamId: string, memberId: string, dto: UpdateTeamMemberDto) {
    await this.requireManage(userId, teamId);
    if (dto.role === PackRole.OWNER) {
      throw new BadRequestException('Owner role cannot be assigned to team members');
    }
    const member = await this.prisma.teamMember.findFirst({ where: { id: memberId, teamId } });
    if (!member) {
      throw new NotFoundException('Team member not found');
    }
    const updated = await this.prisma.teamMember.update({
      where: { id: memberId },
      data: { role: dto.role },
      include: { user: { select: { id: true, email: true, displayName: true } } },
    });
    await this.audit.record({
      actorId: userId,
      action: 'team.member.update',
      entityType: 'teamMember',
      entityId: memberId,
      metadata: { teamId, role: dto.role },
    });
    return updated;
  }

  async removeMember(userId: string, teamId: string, memberId: string) {
    await this.requireManage(userId, teamId);
    const member = await this.prisma.teamMember.findFirst({ where: { id: memberId, teamId } });
    if (!member) {
      throw new NotFoundException('Team member not found');
    }
    if (member.userId === userId) {
      throw new BadRequestException('You cannot remove yourself from your own team');
    }
    await this.prisma.teamMember.delete({ where: { id: memberId } });
    await this.audit.record({
      actorId: userId,
      action: 'team.member.remove',
      entityType: 'teamMember',
      entityId: memberId,
      metadata: { teamId, removedUserId: member.userId },
    });
    return { deleted: true };
  }

  private async requireManage(userId: string, teamId: string) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: { members: { where: { userId }, select: { role: true } } },
    });
    if (!team) {
      throw new NotFoundException('Team not found');
    }
    if (team.ownerId !== userId && team.members[0]?.role !== PackRole.OWNER) {
      throw new ForbiddenException('Only team owners can manage this team');
    }
    return team;
  }
}
