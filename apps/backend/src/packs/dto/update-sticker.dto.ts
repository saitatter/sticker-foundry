import { StickerReviewStatus } from '@prisma/client';
import { IsArray, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateStickerDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  emojis?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(125)
  accessibilityText?: string;

  @IsOptional()
  @IsEnum(StickerReviewStatus)
  reviewStatus?: StickerReviewStatus;
}
