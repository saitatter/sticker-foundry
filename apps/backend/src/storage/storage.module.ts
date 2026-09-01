import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DiskStorageService } from './disk-storage.service';
import { PackStorageService } from './pack-storage.service';
import { S3StorageService } from './s3-storage.service';
import { StorageMaintenanceService } from './storage.service';
import { STORAGE_SERVICE } from './storage.token';

@Module({
  imports: [ConfigModule],
  providers: [
    DiskStorageService,
    S3StorageService,
    PackStorageService,
    {
      provide: STORAGE_SERVICE,
      inject: [ConfigService, DiskStorageService, S3StorageService],
      useFactory: (
        config: ConfigService,
        diskStorage: DiskStorageService,
        s3Storage: S3StorageService,
      ): StorageMaintenanceService => {
        const driver = config.get<string>('STORAGE_DRIVER', 'disk').toLowerCase();
        if (driver === 'disk') return diskStorage;
        if (driver === 's3') return s3Storage;
        throw new Error(`Unsupported storage driver: ${driver}`);
      },
    },
  ],
  exports: [STORAGE_SERVICE, PackStorageService],
})
export class StorageModule {}