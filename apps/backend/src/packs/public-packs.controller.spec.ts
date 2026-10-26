import { NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { PublicPacksController } from './public-packs.controller';
import { PacksService } from './packs.service';
import { PackExportService } from '../exports/pack-export.service';

describe('Public sticker previews', () => {
  const packs = { publicPack: jest.fn(), getStickerFilePath: jest.fn() };
  const controller = new PublicPacksController(packs as unknown as PacksService, {} as PackExportService);
  beforeEach(() => jest.resetAllMocks());
  it('does not read a private pack file', async () => {
    packs.publicPack.mockRejectedValue(new NotFoundException());
    await expect(controller.stickerFile('private', 'sticker', {} as Response)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(packs.getStickerFilePath).not.toHaveBeenCalled();
  });
  it('checks public visibility before streaming the requested sticker', async () => {
    packs.publicPack.mockResolvedValue({ id: 'public' });
    const pipe = jest.fn();
    packs.getStickerFilePath.mockResolvedValue({ stream: { pipe } });
    const response = { setHeader: jest.fn() } as unknown as Response;
    await controller.stickerFile('public', 'sticker', response);
    expect(packs.getStickerFilePath).toHaveBeenCalledWith('', 'public', 'sticker');
    expect(pipe).toHaveBeenCalledWith(response);
  });
  it('does not expose an unapproved sticker from a moderated public pack', async () => {
    packs.publicPack.mockResolvedValue({
      requiresApproval: true,
      stickers: [{ id: 'pending', reviewStatus: 'PENDING' }],
    });
    await expect(controller.stickerFile('public', 'pending', {} as Response)).rejects.toBeInstanceOf(NotFoundException);
    expect(packs.getStickerFilePath).not.toHaveBeenCalled();
  });
});
