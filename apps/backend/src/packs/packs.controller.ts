import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { CurrentUser, RequestUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CreatePackInviteDto } from './dto/create-pack-invite.dto';
import { CreatePackDto } from './dto/create-pack.dto';
import { ReorderStickersDto } from './dto/reorder-stickers.dto';
import { TransferStickersDto } from './dto/transfer-stickers.dto';
import { UpdatePackMemberDto } from './dto/update-pack-member.dto';
import { UpdatePackDto } from './dto/update-pack.dto';
import { UpdateStickerDto } from './dto/update-sticker.dto';
import { UploadStickerDto } from './dto/upload-sticker.dto';
import { PackExportService } from './pack-export.service';
import { PacksService } from './packs.service';

const stickerUploadOptions = { limits: { fileSize: 10 * 1024 * 1024 } };
const trayIconUploadOptions = { limits: { fileSize: 5 * 1024 * 1024 } };

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

  @Post(':id/clone')
  clone(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.packsService.clone(user.sub, id);
  }

  @Get(':id/members')
  members(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.packsService.members(user.sub, id);
  }

  @Patch(':id/members/:memberId')
  updateMember(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdatePackMemberDto,
  ) {
    return this.packsService.updateMember(user.sub, id, memberId, dto);
  }

  @Delete(':id/members/:memberId')
  removeMember(@CurrentUser() user: RequestUser, @Param('id') id: string, @Param('memberId') memberId: string) {
    return this.packsService.removeMember(user.sub, id, memberId);
  }

  @Get(':id/invites')
  invites(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.packsService.invites(user.sub, id);
  }

  @Post(':id/invites')
  createInvite(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: CreatePackInviteDto) {
    return this.packsService.createInvite(user.sub, id, dto);
  }

  @Delete(':id/invites/:inviteId')
  revokeInvite(@CurrentUser() user: RequestUser, @Param('id') id: string, @Param('inviteId') inviteId: string) {
    return this.packsService.revokeInvite(user.sub, id, inviteId);
  }

  @Post('invites/:code/accept')
  acceptInvite(@CurrentUser() user: RequestUser, @Param('code') code: string) {
    return this.packsService.acceptInvite(user.sub, code);
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
  @UseInterceptors(FileInterceptor('file', trayIconUploadOptions))
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

  @Put(':id/stickers/:stickerId/file')
  @UseInterceptors(FileInterceptor('file', stickerUploadOptions))
  replaceStickerImage(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('stickerId') stickerId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.packsService.replaceStickerImage(user.sub, id, stickerId, file);
  }

  @Post(':id/stickers')
  @UseInterceptors(FileInterceptor('file', stickerUploadOptions))
  uploadSticker(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadStickerDto,
  ) {
    return this.packsService.uploadSticker(user.sub, id, file, dto);
  }

  @Patch(':id/stickers')
  reorderStickers(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: ReorderStickersDto) {
    return this.packsService.reorderStickers(user.sub, id, dto);
  }

  @Post(':id/stickers/copy')
  copyStickers(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: TransferStickersDto) {
    return this.packsService.copyStickers(user.sub, id, dto);
  }

  @Post(':id/stickers/move')
  moveStickers(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: TransferStickersDto) {
    return this.packsService.moveStickers(user.sub, id, dto);
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

  @Get(':id/contents')
  async contents(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    await this.packsService.assertCanExport(user.sub, id);
    return this.exportService.buildContents(id);
  }

  @Get(':id/manifest')
  async manifest(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() response: Response,
  ) {
    await this.packsService.get(user.sub, id);
    const manifest = await this.exportService.buildManifest(id);
    const etag = this.exportService.etagForHash(manifest.contentHash);

    response.setHeader('ETag', etag);
    response.setHeader('Cache-Control', 'private, max-age=60');
    if (ifNoneMatch === etag) {
      return response.status(HttpStatus.NOT_MODIFIED).send();
    }

    return response.json(manifest);
  }
}
