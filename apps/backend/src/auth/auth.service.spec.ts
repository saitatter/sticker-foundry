import { ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';

function createService(mode = 'open', inviteCode = 'let-me-in') {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'demo@example.com',
        displayName: 'Demo',
        passwordHash: '$2b$04$HPxcewj7nFQhvtDcYzW0leCizplvFkhBA4I9vUT91ciNpAqgjwFg2',
      }),
      create: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'demo@example.com',
        displayName: 'Demo',
      }),
      update: jest.fn().mockResolvedValue({ id: 'user-1' }),
    },
  };
  const jwt = { sign: jest.fn().mockReturnValue('jwt-token') };
  const config = {
    get: jest.fn((key: string, fallback?: string) => {
      if (key === 'REGISTRATION_MODE') return mode;
      if (key === 'REGISTRATION_INVITE_CODE') return inviteCode;
      return fallback;
    }),
  };

  return {
    service: new AuthService(prisma as never, jwt as unknown as JwtService, config as never),
    prisma,
  };
}

describe(AuthService, () => {
  it('allows open registration by default', async () => {
    const { service, prisma } = createService();

    await expect(
      service.register({
        email: 'Demo@Example.com',
        displayName: 'Demo',
        password: 'password123',
      }),
    ).resolves.toEqual({
      accessToken: 'jwt-token',
      user: {
        id: 'user-1',
        email: 'demo@example.com',
        displayName: 'Demo',
      },
    });
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: 'demo@example.com' }),
      }),
    );
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
  });
});
