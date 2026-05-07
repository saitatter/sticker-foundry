import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    await this.assertRegistrationAllowed(dto.inviteCode);
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const isFirstUser = (await this.prisma.user.count()) === 0;
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        displayName: dto.displayName,
        passwordHash,
        isAdmin: isFirstUser,
      },
    });

    return this.authResponse(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.authResponse(user);
  }

  async refresh(dto: RefreshTokenDto) {
    const session = await this.prisma.userSession.findUnique({
      where: { refreshTokenHash: this.refreshTokenHash(dto.refreshToken) },
      include: { user: { select: { id: true, email: true, displayName: true, isAdmin: true } } },
    });
    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }

    return this.authResponse(session.user, session.id);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, displayName: true, isAdmin: true, createdAt: true },
    });
    return user;
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { changed: true };
  }

  async sessions(userId: string) {
    return this.prisma.userSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true, expiresAt: true, revokedAt: true },
    });
  }

  async logout(dto: RefreshTokenDto) {
    await this.prisma.userSession.updateMany({
      where: { refreshTokenHash: this.refreshTokenHash(dto.refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { revoked: true };
  }

  async revokeSession(userId: string, sessionId: string) {
    const result = await this.prisma.userSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException('Active session not found');
    }
    return { revoked: true };
  }

  async revokeAllSessions(userId: string) {
    await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { revoked: true };
  }

  private async authResponse(
    user: { id: string; email: string; displayName: string; isAdmin?: boolean },
    existingSessionId?: string,
  ) {
    const refreshToken = this.newRefreshToken();
    const expiresAt = this.refreshTokenExpiry();
    const refreshTokenHash = this.refreshTokenHash(refreshToken);
    if (existingSessionId) {
      await this.prisma.userSession.update({
        where: { id: existingSessionId },
        data: { refreshTokenHash, expiresAt, revokedAt: null },
      });
    } else {
      await this.prisma.userSession.create({
        data: { userId: user.id, refreshTokenHash, expiresAt },
      });
    }

    return {
      accessToken: this.jwt.sign(
        { sub: user.id, email: user.email },
        { expiresIn: this.accessTokenTtl() },
      ),
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        isAdmin: Boolean(user.isAdmin),
      },
    };
  }

  private newRefreshToken() {
    return randomBytes(48).toString('base64url');
  }

  private refreshTokenHash(refreshToken: string) {
    return createHash('sha256').update(refreshToken).digest('hex');
  }

  private refreshTokenExpiry() {
    const ttlDays = Number.parseInt(this.config.get<string>('REFRESH_TOKEN_TTL_DAYS', '30'), 10);
    return new Date(Date.now() + (Number.isFinite(ttlDays) ? ttlDays : 30) * 24 * 60 * 60 * 1000);
  }

  private accessTokenTtl(): NonNullable<JwtSignOptions['expiresIn']> {
    return this.config.get<string>('ACCESS_TOKEN_TTL', '15m') as NonNullable<JwtSignOptions['expiresIn']>;
  }

  private async assertRegistrationAllowed(inviteCode: string | undefined) {
    const setting = await this.prisma.appSetting.findUnique({ where: { key: 'registrationMode' } });
    const mode = (setting?.value ?? this.config.get<string>('REGISTRATION_MODE', 'open')).toLowerCase();
    if (mode === 'disabled') {
      throw new ForbiddenException('Registration is disabled on this instance');
    }
    if (mode !== 'invite-only') {
      return;
    }

    const inviteSetting = await this.prisma.appSetting.findUnique({ where: { key: 'registrationInviteCode' } });
    const expectedInviteCode = inviteSetting?.value || this.config.get<string>('REGISTRATION_INVITE_CODE');
    if (!expectedInviteCode || inviteCode !== expectedInviteCode) {
      throw new ForbiddenException('A valid invite code is required');
    }
  }
}
