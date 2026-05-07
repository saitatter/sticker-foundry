import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class TransferStickersDto {
  @IsUUID()
  targetPackId!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  stickerIds!: string[];
}
