import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Put,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { CurrentUser, RequestUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CreatePackInviteDto } from './dto/create-pack-invite.dto';
import { CreatePackDto } from './dto/create-pack.dto';
import { CreateStickerCommentDto } from './dto/create-sticker-comment.dto';
import { ReorderStickersDto } from './dto/reorder-stickers.dto';
import { TransferStickersDto } from './dto/transfer-stickers.dto';
import { UpdatePackMemberDto } from './dto/update-pack-member.dto';
import { UpdatePackDto } from './dto/update-pack.dto';
import { UpdateStickerDto } from './dto/update-sticker.dto';
import { UploadStickerDto } from './dto/upload-sticker.dto';
import { PackExportService } from '../exports/pack-export.service';
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

  @Get(':id/activity')
  activity(@CurrentUser() user: RequestUser, @Param('id') id: string, @Query('limit') limit?: string) {
    const parsedLimit = limit === undefined ? undefined : Number.parseInt(limit, 10);
    return this.packsService.activity(user.sub, id, Number.isFinite(parsedLimit) ? parsedLimit : undefined);
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
    const cover = await this.packsService.getCoverFilePath(user.sub, id);
    response.setHeader('Content-Type', 'image/webp');
    response.setHeader('Cache-Control', 'private, max-age=3600');
    response.setHeader('ETag', `"${cover.version}"`);
    return cover.stream.pipe(response);
  }

  @Get(':id/cover')
  async cover(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() response: Response,
  ) {
    const cover = await this.packsService.getCoverFilePath(user.sub, id);
    const etag = `"${cover.version}"`;
    response.setHeader('Content-Type', 'image/webp');
    response.setHeader('Cache-Control', 'private, max-age=3600, immutable');
    response.setHeader('ETag', etag);
    if (ifNoneMatch === etag) return response.status(HttpStatus.NOT_MODIFIED).send();
    return cover.stream.pipe(response);
  }

  @Post(':id/tray-icon')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', trayIconUploadOptions))
  async uploadTrayIcon(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @UploadedFile() file: Express.Multer.File,
  ) {
    await this.packsService.assertPackVersion(user.sub, id, ifMatch);
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
    return file.stream.pipe(response);
  }

  @Put(':id/stickers/:stickerId/file')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', stickerUploadOptions))
  async replaceStickerImage(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('stickerId') stickerId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadStickerDto,
  ) {
    await this.packsService.assertPackVersion(user.sub, id, ifMatch);
    return this.packsService.replaceStickerImage(user.sub, id, stickerId, file, dto);
  }

  @Post(':id/stickers')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', stickerUploadOptions))
  async uploadSticker(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadStickerDto,
  ) {
    await this.packsService.assertPackVersion(user.sub, id, ifMatch);
    return this.packsService.uploadSticker(user.sub, id, file, dto);
  }

  @Post(':id/stickers/jobs')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(FileInterceptor('file', stickerUploadOptions))
  queueStickerUpload(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadStickerDto,
  ) {
    return this.packsService
      .assertPackVersion(user.sub, id, ifMatch)
      .then(() => this.packsService.queueStickerUpload(user.sub, id, file, dto));
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

  @Get(':id/stickers/:stickerId/comments')
  stickerComments(@CurrentUser() user: RequestUser, @Param('id') id: string, @Param('stickerId') stickerId: string) {
    return this.packsService.stickerComments(user.sub, id, stickerId);
  }

  @Post(':id/stickers/:stickerId/comments')
  createStickerComment(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('stickerId') stickerId: string,
    @Body() dto: CreateStickerCommentDto,
  ) {
    return this.packsService.createStickerComment(user.sub, id, stickerId, dto);
  }

  @Delete(':id/stickers/:stickerId/comments/:commentId')
  deleteStickerComment(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('stickerId') stickerId: string,
    @Param('commentId') commentId: string,
  ) {
    return this.packsService.deleteStickerComment(user.sub, id, stickerId, commentId);
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

    const cached = await this.exportService.buildCachedZip(id);
    response.setHeader('Content-Type', 'application/zip');
    response.setHeader('Content-Disposition', `attachment; filename="sticker-pack-${id}.zip"`);
    response.setHeader('ETag', this.exportService.etagForHash(cached.contentHash));
    return response.sendFile(cached.path);
  }

  @Post(':id/export/jobs')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.ACCEPTED)
  queueExport(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.packsService.queueExport(user.sub, id);
  }

  @Get(':id/export/live')
  async exportPackLive(@CurrentUser() user: RequestUser, @Param('id') id: string, @Res() response: Response) {
    await this.packsService.assertCanExport(user.sub, id);

    const archive = this.exportService.createArchive();
    response.setHeader('Content-Type', 'application/zip');
    response.setHeader('Content-Disposition', `attachment; filename="sticker-pack-${id}.zip"`);
    archive.on('error', (error) => response.destroy(error));
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
