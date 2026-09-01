import { Module } from '@nestjs/common';
import { BackgroundRemovalService } from './background-removal.service';
import { StickerImageService } from './sticker-image.service';

@Module({
  providers: [StickerImageService, BackgroundRemovalService],
  exports: [StickerImageService, BackgroundRemovalService],
})
export class MediaModule {}