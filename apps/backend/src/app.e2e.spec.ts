import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import AdmZip = require('adm-zip');
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import request = require('supertest');
import sharp = require('sharp');
import { AppModule } from './app.module';
import { PrismaService } from './prisma.service';

type UserRecord = {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  isAdmin: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type PackRecord = {
  id: string;
  ownerId: string;
  name: string;
  publisher: string;
  description: string | null;
  isPublic: boolean;
  requiresApproval: boolean;
  imageDataVersion: string;
  createdAt: Date;
  updatedAt: Date;
};

type StickerRecord = {
  id: string;
  packId: string;
  fileName: string;
  emojis: string[];
  accessibilityText: string | null;
  sizeBytes: number;
  sha256: string;
  perceptualHash?: string | null;
  position: number;
  reviewStatus: 'PENDING' | 'APPROVED' | 'NEEDS_WORK';
  createdAt: Date;
};

type UserSessionRecord = {
  id: string;
  userId: string;
  refreshTokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
};

type AppSettingRecord = {
  key: string;
  value: string;
  updatedAt: Date;
};

type AuditLogRecord = {
  id: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
};

class InMemoryPrisma {
  users: UserRecord[] = [];
  packs: PackRecord[] = [];
  stickers: StickerRecord[] = [];
  sessions: UserSessionRecord[] = [];
  appSettings: AppSettingRecord[] = [];
  auditLogs: AuditLogRecord[] = [];
  userSeq = 1;
  packSeq = 1;
  stickerSeq = 1;
  sessionSeq = 1;
  auditSeq = 1;

  user = {
    count: jest.fn(async () => this.users.length),
    findUnique: jest.fn(async ({ where }: { where: { email?: string; id?: string } }) =>
      this.users.find((user) => user.email === where.email || user.id === where.id) ?? null,
    ),
    findUniqueOrThrow: jest.fn(async ({ where, select }: { where: { id: string }; select?: Record<string, boolean> }) => {
      const user = this.users.find((item) => item.id === where.id);
      if (!user) throw new Error('User not found');
      if (!select) return user;
      return Object.fromEntries(Object.entries(select).filter(([, enabled]) => enabled).map(([key]) => [key, user[key as keyof UserRecord]]));
    }),
    create: jest.fn(async ({ data }: { data: { email: string; displayName: string; passwordHash: string; isAdmin?: boolean } }) => {
      const now = new Date();
      const user: UserRecord = {
        id: `user-${this.userSeq++}`,
        email: data.email,
        displayName: data.displayName,
        passwordHash: data.passwordHash,
        isAdmin: data.isAdmin ?? false,
        createdAt: now,
        updatedAt: now,
      };
      this.users.push(user);
      return user;
    }),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<UserRecord> }) => {
      const user = this.users.find((item) => item.id === where.id);
      if (!user) throw new Error('User not found');
      Object.assign(user, data, { updatedAt: new Date() });
      return user;
    }),
  };

  appSetting = {
    findUnique: jest.fn(async ({ where }: { where: { key: string } }) => this.appSettings.find((setting) => setting.key === where.key) ?? null),
    findMany: jest.fn(async () => this.appSettings),
    upsert: jest.fn(async ({ where, create, update }: { where: { key: string }; create: { key: string; value: string }; update: { value: string } }) => {
      const now = new Date();
      const existing = this.appSettings.find((setting) => setting.key === where.key);
      if (existing) {
        Object.assign(existing, update, { updatedAt: now });
        return existing;
      }
      const setting = { ...create, updatedAt: now };
      this.appSettings.push(setting);
      return setting;
    }),
  };

  auditLog = {
    create: jest.fn(async ({ data }: { data: Omit<AuditLogRecord, 'id' | 'createdAt'> }) => {
      const log: AuditLogRecord = {
        id: `audit-${this.auditSeq++}`,
        actorId: data.actorId ?? null,
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId ?? null,
        metadata: data.metadata ?? null,
        ipAddress: data.ipAddress ?? null,
        userAgent: data.userAgent ?? null,
        createdAt: new Date(),
      };
      this.auditLogs.push(log);
      return log;
    }),
    findMany: jest.fn(async ({ take }: { take: number }) =>
      [...this.auditLogs]
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
        .slice(0, take)
        .map((log) => ({
          ...log,
          actor: log.actorId ? this.users.find((user) => user.id === log.actorId) ?? null : null,
        })),
    ),
  };

  userSession = {
    create: jest.fn(async ({ data }: { data: { userId: string; refreshTokenHash: string; expiresAt: Date } }) => {
      const session: UserSessionRecord = {
        id: `session-${this.sessionSeq++}`,
        userId: data.userId,
        refreshTokenHash: data.refreshTokenHash,
        createdAt: new Date(),
        expiresAt: data.expiresAt,
        revokedAt: null,
      };
      this.sessions.push(session);
      return session;
    }),
    findUnique: jest.fn(async ({ where, include }: { where: { refreshTokenHash: string }; include?: { user?: unknown } }) => {
      const session = this.sessions.find((item) => item.refreshTokenHash === where.refreshTokenHash);
      if (!session) return null;
      const user = this.users.find((item) => item.id === session.userId);
      return { ...session, ...(include?.user && user ? { user } : {}) };
    }),
    findMany: jest.fn(async ({ where }: { where: { userId: string } }) => this.sessions.filter((session) => session.userId === where.userId)),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<UserSessionRecord> }) => {
      const session = this.sessions.find((item) => item.id === where.id);
      if (!session) throw new Error('Session not found');
      Object.assign(session, data);
      return session;
    }),
    updateMany: jest.fn(async ({ where, data }: { where: Partial<UserSessionRecord>; data: Partial<UserSessionRecord> }) => {
      const matches = this.sessions.filter((session) =>
        Object.entries(where).every(([key, value]) => session[key as keyof UserSessionRecord] === value),
      );
      matches.forEach((session) => Object.assign(session, data));
      return { count: matches.length };
    }),
  };

  pack = {
    create: jest.fn(async ({ data }: { data: Partial<PackRecord> & { stickers?: { create: StickerRecord[] } } }) => {
      const now = new Date();
      const pack: PackRecord = {
        id: `pack-${this.packSeq++}`,
        ownerId: data.ownerId ?? 'user-unknown',
        name: data.name ?? 'Untitled',
        publisher: data.publisher ?? 'StickerFoundry',
        description: data.description ?? null,
        isPublic: data.isPublic ?? false,
        requiresApproval: data.requiresApproval ?? false,
        imageDataVersion: data.imageDataVersion ?? '1',
        createdAt: now,
        updatedAt: now,
      };
      this.packs.push(pack);
      for (const sticker of data.stickers?.create ?? []) {
        this.stickers.push({ ...sticker, id: `sticker-${this.stickerSeq++}`, packId: pack.id, createdAt: now });
      }
      return pack;
    }),
    findMany: jest.fn(async ({ where, orderBy, include }: { where?: { OR?: Array<{ ownerId?: string; isPublic?: boolean }> }; orderBy?: unknown; include?: unknown }) => {
      const visible = this.packs.filter((pack) => {
        if (!where?.OR) return true;
        return where.OR.some((condition) => condition.ownerId === pack.ownerId || condition.isPublic === pack.isPublic);
      });
      const sorted = [...visible].sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime() || left.name.localeCompare(right.name));
      return sorted.map((pack) => this.decoratePack(pack, include));
    }),
    findUnique: jest.fn(async ({ where, include }: { where: { id: string }; include?: unknown }) => {
      const pack = this.packs.find((item) => item.id === where.id);
      return pack ? this.decoratePack(pack, include) : null;
    }),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<PackRecord> }) => {
      const pack = this.packs.find((item) => item.id === where.id);
      if (!pack) throw new Error('Pack not found');
      Object.assign(pack, data, { updatedAt: new Date() });
      return pack;
    }),
    delete: jest.fn(async ({ where }: { where: { id: string } }) => {
      const pack = this.packs.find((item) => item.id === where.id);
      this.packs = this.packs.filter((item) => item.id !== where.id);
      this.stickers = this.stickers.filter((sticker) => sticker.packId !== where.id);
      return pack;
    }),
  };

  sticker = {
    create: jest.fn(async ({ data }: { data: Omit<StickerRecord, 'id' | 'createdAt'> }) => {
      const sticker: StickerRecord = {
        ...data,
        reviewStatus: data.reviewStatus ?? 'PENDING',
        id: `sticker-${this.stickerSeq++}`,
        createdAt: new Date(),
      };
      this.stickers.push(sticker);
      return sticker;
    }),
    aggregate: jest.fn(async ({ where }: { where?: { pack?: { ownerId?: string } } }) => {
      const ownerId = where?.pack?.ownerId;
      const packIds = ownerId ? this.packs.filter((pack) => pack.ownerId === ownerId).map((pack) => pack.id) : this.packs.map((pack) => pack.id);
      const sizeBytes = this.stickers
        .filter((sticker) => packIds.includes(sticker.packId))
        .reduce((total, sticker) => total + sticker.sizeBytes, 0);
      return { _sum: { sizeBytes } };
    }),
    findFirst: jest.fn(
      async ({
        where,
      }: {
        where: { id?: string | { not?: string }; packId?: string; perceptualHash?: string };
      }) =>
        this.stickers.find((sticker) => {
          const idMatches =
            !where.id ||
            (typeof where.id === 'string' ? sticker.id === where.id : sticker.id !== where.id.not);
          return (
            idMatches &&
            (!where.packId || sticker.packId === where.packId) &&
            (!where.perceptualHash || sticker.perceptualHash === where.perceptualHash)
          );
        }) ?? null,
    ),
    findMany: jest.fn(async ({ where }: { where: { packId: string } }) => this.sortedStickers(where.packId)),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<StickerRecord> }) => {
      const sticker = this.stickers.find((item) => item.id === where.id);
      if (!sticker) throw new Error('Sticker not found');
      Object.assign(sticker, data);
      return sticker;
    }),
    delete: jest.fn(async ({ where }: { where: { id: string } }) => {
      const sticker = this.stickers.find((item) => item.id === where.id);
      this.stickers = this.stickers.filter((item) => item.id !== where.id);
      return sticker;
    }),
  };

  $transaction = jest.fn(async (operations: unknown[]) => Promise.all(operations));
  $queryRaw = jest.fn(async () => [{ '?column?': 1 }]);

  private decoratePack(pack: PackRecord, include: unknown) {
    const includeObject = include as { stickers?: unknown; _count?: unknown } | undefined;
    return {
      ...pack,
      ...(includeObject?.stickers ? { stickers: this.sortedStickers(pack.id) } : {}),
      ...(includeObject?._count ? { _count: { stickers: this.stickers.filter((sticker) => sticker.packId === pack.id).length } } : {}),
    };
  }

  private sortedStickers(packId: string) {
    return this.stickers
      .filter((sticker) => sticker.packId === packId)
      .sort((left, right) => left.position - right.position || left.createdAt.getTime() - right.createdAt.getTime());
  }
}

describe('StickerFoundry API e2e', () => {
  let app: INestApplication;
  let dataDir: string;

  beforeEach(async () => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.REGISTRATION_MODE = 'open';
    dataDir = await mkdtemp(join(tmpdir(), 'sticker-foundry-e2e-'));
    process.env.DATA_DIR = dataDir;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(new InMemoryPrisma())
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  it('registers, creates a pack, uploads stickers, exports a WhatsApp ZIP, and handles manifest ETags', async () => {
    const server = app.getHttpServer();
    const auth = await request(server)
      .post('/api/auth/register')
      .set('User-Agent', 'StickerFoundryE2E/1.0')
      .send({
        email: 'maker@example.com',
        displayName: 'Maker',
        password: 'password123',
      })
      .expect(201);
    const token = auth.body.accessToken as string;
    expect(auth.body.refreshToken).toEqual(expect.any(String));
    expect(auth.body.user.isAdmin).toBe(true);

    await request(server)
      .patch('/api/admin/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        registrationMode: 'invite-only',
        registrationInviteCode: 'team-code',
        storageQuotaBytes: 10_485_760,
        instanceName: 'Team Stickers',
        instanceDescription: 'Private sticker ops',
      })
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual(
          expect.objectContaining({
            registrationMode: 'invite-only',
            registrationInviteCode: 'team-code',
            storageQuotaBytes: 10_485_760,
            instanceName: 'Team Stickers',
            instanceDescription: 'Private sticker ops',
          }),
        );
      });

    await request(server)
      .get('/api/instance')
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual(
          expect.objectContaining({
            instanceName: 'Team Stickers',
            instanceDescription: 'Private sticker ops',
          }),
        );
      });

    await request(server)
      .patch('/api/admin/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ registrationMode: 'open', registrationInviteCode: null, storageQuotaBytes: null })
      .expect(200);

    await request(server)
      .get('/api/admin/audit-log?limit=5')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.map((entry: { action: string }) => entry.action)).toContain('admin.settings.update');
        expect(response.body.map((entry: { action: string }) => entry.action)).toContain('auth.register');
        expect(response.body.find((entry: { action: string }) => entry.action === 'auth.register')).toEqual(
          expect.objectContaining({ userAgent: 'StickerFoundryE2E/1.0' }),
        );
      });

    await request(server)
      .get('/api/admin/audit-log/export?limit=5')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect('Content-Type', /text\/csv/)
      .expect((response) => {
        expect(response.text).toContain('"createdAt","actorEmail","action"');
        expect(response.text).toContain('"auth.register"');
      });

    const refreshed = await request(server)
      .post('/api/auth/refresh')
      .send({ refreshToken: auth.body.refreshToken })
      .expect(201);
    expect(refreshed.body.accessToken).toEqual(expect.any(String));
    expect(refreshed.body.refreshToken).toEqual(expect.any(String));

    const createdPack = await request(server)
      .post('/api/packs')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'E2E Pack', publisher: 'StickerFoundry', isPublic: true })
      .expect(201);
    const packId = createdPack.body.id as string;

    for (const color of ['#ff0000', '#00ff00', '#0000ff']) {
      await request(server)
        .post(`/api/packs/${packId}/stickers`)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', await imageBuffer(color), { filename: `${color}.png`, contentType: 'image/png' })
        .field('emojis', '😀,✨')
        .expect(201);
    }

    const manifest = await request(server)
      .get(`/api/packs/${packId}/manifest`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(manifest.headers.etag).toMatch(/^"[a-f0-9]{64}"$/);
    expect(manifest.body).toEqual(
      expect.objectContaining({
        id: packId,
        stickerCount: 3,
        canExport: true,
        contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );

    await request(server)
      .get(`/api/packs/${packId}/manifest`)
      .set('Authorization', `Bearer ${token}`)
      .set('If-None-Match', manifest.headers.etag)
      .expect(304);

    const exported = await request(server)
      .get(`/api/packs/${packId}/export`)
      .set('Authorization', `Bearer ${token}`)
      .buffer()
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);

    const zip = new AdmZip(exported.body as Buffer);
    const entries = zip.getEntries().map((entry) => entry.entryName);
    expect(entries).toContain('contents.json');
    expect(entries).toContain('tray_icon.webp');
    expect(entries.filter((entry) => entry.endsWith('.webp'))).toHaveLength(4);

    const contents = JSON.parse(zip.readAsText('contents.json'));
    expect(contents.sticker_packs[0]).toEqual(
      expect.objectContaining({
        identifier: packId,
        name: 'E2E Pack',
        publisher: 'StickerFoundry',
        tray_image_file: 'tray_icon.webp',
        image_data_version: expect.any(String),
        animated_sticker_pack: false,
      }),
    );
    expect(contents.sticker_packs[0].stickers).toHaveLength(3);
  });
});

async function imageBuffer(color: string) {
  return sharp({
    create: {
      width: 256,
      height: 256,
      channels: 4,
      background: color,
    },
  })
    .png()
    .toBuffer();
}
