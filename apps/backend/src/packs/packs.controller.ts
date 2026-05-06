import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { CurrentUser, RequestUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CreatePackDto } from './dto/create-pack.dto';
import { UpdatePackDto } from './dto/update-pack.dto';
import { UpdateStickerDto } from './dto/update-sticker.dto';
import { UploadStickerDto } from './dto/upload-sticker.dto';
import { PackExportService } from './pack-export.service';
import { PacksService } from './packs.service';

@Controller('packs')
@UseGuards(JwtAuthGuard)
export class PacksController {
  constructor(
    private readonly packsService: PacksService,
    private readonly exportService: PackExportService,
  ) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.packsService.list(user.sub);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreatePackDto) {
    return this.packsService.create(user.sub, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.packsService.get(user.sub, id);
  }

  @Delete(':id')
  delete(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.packsService.delete(user.sub, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdatePackDto) {
    return this.packsService.update(user.sub, id, dto);
  }

  @Get(':id/tray-icon')
  async trayIcon(@CurrentUser() user: RequestUser, @Param('id') id: string, @Res() response: Response) {
    const filePath = await this.packsService.getTrayIconFilePath(user.sub, id);
    response.setHeader('Content-Type', 'image/webp');
    response.setHeader('Cache-Control', 'private, max-age=300');
    return response.sendFile(filePath);
  }

  @Post(':id/tray-icon')
  @UseInterceptors(FileInterceptor('file'))
  uploadTrayIcon(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.packsService.uploadTrayIcon(user.sub, id, file);
  }

  @Get(':id/stickers/:stickerId/file')
  async stickerFile(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('stickerId') stickerId: string,
    @Res() response: Response,
  ) {
    const file = await this.packsService.getStickerFilePath(user.sub, id, stickerId);
    response.setHeader('Content-Type', 'image/webp');
    response.setHeader('Cache-Control', 'private, max-age=300');
    return response.sendFile(file.path);
  }

  @Post(':id/stickers')
  @UseInterceptors(FileInterceptor('file'))
  uploadSticker(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadStickerDto,
  ) {
    return this.packsService.uploadSticker(user.sub, id, file, dto);
  }

  @Delete(':id/stickers/:stickerId')
  deleteSticker(@CurrentUser() user: RequestUser, @Param('id') id: string, @Param('stickerId') stickerId: string) {
    return this.packsService.deleteSticker(user.sub, id, stickerId);
  }

  @Patch(':id/stickers/:stickerId')
  updateSticker(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('stickerId') stickerId: string,
    @Body() dto: UpdateStickerDto,
  ) {
    return this.packsService.updateSticker(user.sub, id, stickerId, dto);
  }

  @Get(':id/export')
  async exportPack(@CurrentUser() user: RequestUser, @Param('id') id: string, @Res() response: Response) {
    await this.packsService.assertCanExport(user.sub, id);

    const archive = this.exportService.createArchive();
    response.setHeader('Content-Type', 'application/zip');
    response.setHeader('Content-Disposition', `attachment; filename="sticker-pack-${id}.zip"`);

    archive.on('error', (error) => {
      response.destroy(error);
    });
    archive.pipe(response);
    await this.exportService.buildZip(id, archive);
    await archive.finalize();
  }
}
