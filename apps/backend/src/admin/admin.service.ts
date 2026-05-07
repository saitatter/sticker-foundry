import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import { UpdateAdminSettingsDto } from './dto/update-admin-settings.dto';

const SETTING_KEYS = {
  registrationMode: 'registrationMode',
  registrationInviteCode: 'registrationInviteCode',
  storageQuotaBytes: 'storageQuotaBytes',
  auditRetentionDays: 'auditRetentionDays',
  instanceName: 'instanceName',
  instanceDescription: 'instanceDescription',
} as const;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async settings(userId: string) {
    await this.assertAdmin(userId);
    const settings = await this.settingMap();
    return {
      registrationMode:
        settings.get(SETTING_KEYS.registrationMode) ?? this.config.get<string>('REGISTRATION_MODE', 'open'),
      registrationInviteCode:
        settings.get(SETTING_KEYS.registrationInviteCode) ?? this.config.get<string>('REGISTRATION_INVITE_CODE', ''),
      storageQuotaBytes: this.parseQuota(
        settings.get(SETTING_KEYS.storageQuotaBytes) ?? this.config.get<string>('STORAGE_QUOTA_BYTES', ''),
      ),
      auditRetentionDays: this.parsePositiveInt(
        settings.get(SETTING_KEYS.auditRetentionDays) ?? this.config.get<string>('AUDIT_RETENTION_DAYS', ''),
      ),
      backgroundRemoval: this.backgroundRemovalStatus(),
      ...(await this.publicSettings(settings)),
    };
  }

  async publicSettings(existingSettings?: Map<string, string>) {
    const settings = existingSettings ?? (await this.settingMap());
    return {
      instanceName: settings.get(SETTING_KEYS.instanceName) ?? this.config.get<string>('INSTANCE_NAME', 'StickerFoundry'),
      instanceDescription:
        settings.get(SETTING_KEYS.instanceDescription) ??
        this.config.get<string>('INSTANCE_DESCRIPTION', 'Self-hosted sticker pack management'),
    };
  }

  async updateSettings(userId: string, dto: UpdateAdminSettingsDto) {
    await this.assertAdmin(userId);
    const writes: Array<Promise<unknown>> = [];

    if (dto.registrationMode !== undefined) {
      writes.push(this.upsert(SETTING_KEYS.registrationMode, dto.registrationMode));
    }
    if (dto.registrationInviteCode !== undefined) {
      writes.push(this.upsert(SETTING_KEYS.registrationInviteCode, dto.registrationInviteCode ?? ''));
    }
    if (dto.storageQuotaBytes !== undefined) {
      writes.push(this.upsert(SETTING_KEYS.storageQuotaBytes, dto.storageQuotaBytes?.toString() ?? ''));
    }
    if (dto.auditRetentionDays !== undefined) {
      writes.push(this.upsert(SETTING_KEYS.auditRetentionDays, dto.auditRetentionDays?.toString() ?? ''));
    }
    if (dto.instanceName !== undefined) {
      writes.push(this.upsert(SETTING_KEYS.instanceName, dto.instanceName));
    }
    if (dto.instanceDescription !== undefined) {
      writes.push(this.upsert(SETTING_KEYS.instanceDescription, dto.instanceDescription));
    }

    await Promise.all(writes);
    await this.audit.record({
      actorId: userId,
      action: 'admin.settings.update',
      entityType: 'appSetting',
      metadata: {
        changedFields: Object.keys(dto),
        registrationMode: dto.registrationMode ?? null,
        registrationInviteCodeChanged: dto.registrationInviteCode !== undefined,
        storageQuotaBytes: dto.storageQuotaBytes ?? null,
        auditRetentionDays: dto.auditRetentionDays ?? null,
        instanceName: dto.instanceName ?? null,
      },
    });
    return this.settings(userId);
  }

  async auditLog(userId: string, limit: number | undefined) {
    await this.assertAdmin(userId);
    return this.audit.list(limit);
  }

  async auditLogCsv(userId: string, limit: number | undefined) {
    await this.assertAdmin(userId);
    return this.audit.csv(limit);
  }

  async cleanupAuditLog(userId: string) {
    await this.assertAdmin(userId);
    const settings = await this.settingMap();
    const retentionDays = this.parsePositiveInt(
      settings.get(SETTING_KEYS.auditRetentionDays) ?? this.config.get<string>('AUDIT_RETENTION_DAYS', ''),
    );
    const result = await this.audit.cleanup(retentionDays);
    await this.audit.record({
      actorId: userId,
      action: 'admin.audit.cleanup',
      entityType: 'auditLog',
      metadata: { retentionDays, deleted: result.deleted, cutoff: result.cutoff },
    });
    return result;
  }

  private async assertAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } });
    if (!user?.isAdmin) {
      throw new ForbiddenException('Admin access is required');
    }
  }

  private async settingMap() {
    const settings = await this.prisma.appSetting.findMany();
    return new Map(settings.map((setting) => [setting.key, setting.value]));
  }

  private upsert(key: string, value: string) {
    return this.prisma.appSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }

  private parseQuota(value: string | undefined) {
    return this.parsePositiveInt(value);
  }

  private parsePositiveInt(value: string | undefined) {
    if (!value) return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private backgroundRemovalStatus() {
    const command = this.config.get<string>('BACKGROUND_REMOVAL_COMMAND', '').trim();
    return {
      thresholdAvailable: true,
      aiCommandConfigured: command.length > 0,
      aiMode: command ? 'command' : null,
      fallbackMode: 'threshold',
    };
  }
}
