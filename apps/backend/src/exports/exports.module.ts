import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { StorageModule } from '../storage/storage.module';
import { PackExportService } from './pack-export.service';

@Module({
  imports: [StorageModule],
  providers: [PackExportService, PrismaService],
  exports: [PackExportService],
})
export class ExportsModule {}