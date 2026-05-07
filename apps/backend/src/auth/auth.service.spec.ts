import { ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';

function createService(mode = 'open', inviteCode = 'let-me-in') {
  const prisma = {
    appSetting: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    user: {
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn().mockResolvedValue(null),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'demo@example.com',
        displayName: 'Demo',
        isAdmin: true,
        passwordHash: '$2b$04$HPxcewj7nFQhvtDcYzW0leCizplvFkhBA4I9vUT91ciNpAqgjwFg2',
      }),
      create: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'demo@example.com',
        displayName: 'Demo',
        isAdmin: true,
      }),
      update: jest.fn().mockResolvedValue({ id: 'user-1' }),
    },
    userSession: {
      create: jest.fn().mockResolvedValue({ id: 'session-1' }),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({ id: 'session-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const jwt = { sign: jest.fn().mockReturnValue('jwt-token') };
  const audit = { record: jest.fn().mockResolvedValue({ id: 'audit-1' }) };
  const config = {
    get: jest.fn((key: string, fallback?: string) => {
      if (key === 'REGISTRATION_MODE') return mode;
      if (key === 'REGISTRATION_INVITE_CODE') return inviteCode;
      if (key === 'ACCESS_TOKEN_TTL') return '15m';
      if (key === 'REFRESH_TOKEN_TTL_DAYS') return '30';
      return fallback;
    }),
  };

  return {
    service: new AuthService(prisma as never, jwt as unknown as JwtService, config as never, audit as never),
    prisma,
    audit,
  };
}

describe(AuthService, () => {
  it('allows open registration by default', async () => {
    const { service, prisma, audit } = createService();

    await expect(
      service.register({
        email: 'Demo@Example.com',
        displayName: 'Demo',
        password: 'password123',
      }),
    ).resolves.toEqual({
      accessToken: 'jwt-token',
      refreshToken: expect.any(String),
      user: {
        id: 'user-1',
        email: 'demo@example.com',
        displayName: 'Demo',
        isAdmin: true,
      },
    });
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: 'demo@example.com', isAdmin: true }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith({
      actorId: 'user-1',
      action: 'auth.register',
      entityType: 'user',
      entityId: 'user-1',
    });
  });

  it('blocks registration when disabled', async () => {
    const { service } = createService('disabled');

    await expect(
      service.register({
        email: 'demo@example.com',
        displayName: 'Demo',
        password: 'password123',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires an invite code in invite-only mode', async () => {
    const { service } = createService('invite-only', 'secret-code');

    await expect(
      service.register({
        email: 'demo@example.com',
        displayName: 'Demo',
        password: 'password123',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.register({
        email: 'demo@example.com',
        displayName: 'Demo',
        password: 'password123',
        inviteCode: 'secret-code',
      }),
    ).resolves.toMatchObject({ accessToken: 'jwt-token' });
  });

  it('changes a password when the current password is valid', async () => {
    const { service, prisma } = createService();

    await expect(
      service.changePassword('user-1', {
        currentPassword: 'password123',
        newPassword: 'new-password123',
      }),
    ).resolves.toEqual({ changed: true });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { passwordHash: expect.any(String) },
    });
    expect(prisma.userSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('rotates a valid refresh token', async () => {
    const { service, prisma } = createService();
    prisma.userSession.findUnique.mockResolvedValue({
      id: 'session-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'user-1', email: 'demo@example.com', displayName: 'Demo', isAdmin: true },
    });

    await expect(service.refresh({ refreshToken: 'refresh-token-that-is-long-enough' })).resolves.toEqual({
      accessToken: 'jwt-token',
      refreshToken: expect.any(String),
      user: {
        id: 'user-1',
        email: 'demo@example.com',
        displayName: 'Demo',
        isAdmin: true,
      },
    });
    expect(prisma.userSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { refreshTokenHash: expect.any(String), expiresAt: expect.any(Date), revokedAt: null },
    });
  });

  it('prefers database registration settings over environment defaults', async () => {
    const { service, prisma } = createService('open');
    prisma.appSetting.findUnique.mockImplementation(async ({ where }: { where: { key: string } }) => {
      if (where.key === 'registrationMode') return { key: where.key, value: 'invite-only' };
      if (where.key === 'registrationInviteCode') return { key: where.key, value: 'db-secret' };
      return null;
    });

    await expect(
      service.register({
        email: 'demo@example.com',
        displayName: 'Demo',
        password: 'password123',
        inviteCode: 'db-secret',
      }),
    ).resolves.toMatchObject({ accessToken: 'jwt-token' });
  });

  it('revokes sessions', async () => {
    const { service, prisma } = createService();

    await expect(service.revokeSession('user-1', 'session-1')).resolves.toEqual({ revoked: true });
    await expect(service.logout({ refreshToken: 'refresh-token-that-is-long-enough' })).resolves.toEqual({ revoked: true });
    expect(prisma.userSession.updateMany).toHaveBeenCalledWith({
      where: { id: 'session-1', userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
