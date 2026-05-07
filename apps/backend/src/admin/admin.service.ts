import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma.service';
import { UpdateAdminSettingsDto } from './dto/update-admin-settings.dto';

const SETTING_KEYS = {
  registrationMode: 'registrationMode',
  registrationInviteCode: 'registrationInviteCode',
  storageQuotaBytes: 'storageQuotaBytes',
} as const;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
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

    await Promise.all(writes);
    return this.settings(userId);
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
    if (!value) return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
}
