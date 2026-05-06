import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';
import { WHATSAPP_LIMITS } from '../whatsapp-constraints';

export class ReorderStickersDto {
  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(WHATSAPP_LIMITS.maxStickersPerPack)
  @IsString({ each: true })
  stickerIds!: string[];
}
