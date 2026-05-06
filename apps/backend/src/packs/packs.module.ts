import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { PrismaService } from '../prisma.service';
import { PackExportService } from './pack-export.service';
import { PacksController } from './packs.controller';
import { PacksService } from './packs.service';
import { StickerImageService } from './sticker-image.service';

@Module({
  imports: [
    MulterModule.register({
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
    }),
  ],
  controllers: [PacksController],
  providers: [PacksService, PackExportService, StickerImageService, PrismaService],
})
export class PacksModule {}
