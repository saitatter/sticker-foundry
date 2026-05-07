import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { AuditModule } from '../audit/audit.module';
import { PrismaService } from '../prisma.service';
import { PackExportService } from './pack-export.service';
import { PacksController } from './packs.controller';
import { PacksService } from './packs.service';
import { MediaQueueService } from './media-queue.service';
import { PublicPacksController } from './public-packs.controller';
import { StickerImageService } from './sticker-image.service';

@Module({
  imports: [
    AuditModule,
    MulterModule.register({
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
    }),
  ],
  controllers: [PacksController, PublicPacksController],
  providers: [PacksService, PackExportService, MediaQueueService, StickerImageService, PrismaService],
})
export class PacksModule {}
