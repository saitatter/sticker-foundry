import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { AuditModule } from '../audit/audit.module';
import { ExportsModule } from '../exports/exports.module';
import { JobsModule } from '../jobs/jobs.module';
import { MediaModule } from '../media/media.module';
import { StorageModule } from '../storage/storage.module';
import { PrismaService } from '../prisma.service';
import { PacksController } from './packs.controller';
import { PacksService } from './packs.service';
import { PacksCollaborationService } from './packs-collaboration.service';
import { PackAccessService } from './pack-access.service';
import { PacksStickerService } from './packs-sticker.service';
import { MediaQueueService } from './media-queue.service';
import { PublicPacksController } from './public-packs.controller';
import { StickerMediaReadService } from './sticker-media-read.service';

@Module({
  imports: [
    AuditModule,
    ExportsModule,
    JobsModule,
    MediaModule,
    StorageModule,
    MulterModule.register({
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
    }),
  ],
  controllers: [PacksController, PublicPacksController],
  providers: [
    PacksService,
    PacksCollaborationService,
    PackAccessService,
    PacksStickerService,
    MediaQueueService,
    StickerMediaReadService,
    PrismaService,
  ],
})
export class PacksModule {}
