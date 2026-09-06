import { Controller, Get, Headers, NotFoundException, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { PackExportService } from '../exports/pack-export.service';
import { PacksService } from './packs.service';

@Controller('public/packs')
export class PublicPacksController {
  constructor(
    private readonly packsService: PacksService,
    private readonly exportService: PackExportService,
  ) {}

  @Get()
  packs() {
    return this.packsService.publicPacks();
  }

  @Get(':id')
  pack(@Param('id') id: string) {
    return this.packsService.publicPack(id);
  }

  @Get(':id/cover')
  async cover(
    @Param('id') id: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() response: Response,
  ) {
    const cover = await this.packsService.getPublicCoverFilePath(id);
    const etag = `"${cover.version}"`;
    response.setHeader('Content-Type', 'image/webp');
    response.setHeader('Cache-Control', 'public, max-age=3600, immutable');
    response.setHeader('ETag', etag);
    if (ifNoneMatch === etag) return response.status(304).send();
    return cover.stream.pipe(response);
  }

  @Get(':id/export')
  async exportPack(@Param('id') id: string, @Res() response: Response) {
    const pack = await this.packsService.publicPack(id);
    if (!pack.canExport) {
      throw new NotFoundException('Public pack is not exportable yet');
    }

    const cached = await this.exportService.buildCachedZip(id);
    response.setHeader('Content-Type', 'application/zip');
    response.setHeader('Content-Disposition', `attachment; filename="sticker-pack-${id}.zip"`);
    response.setHeader('ETag', this.exportService.etagForHash(cached.contentHash));
    return response.sendFile(cached.path);
  }
}
