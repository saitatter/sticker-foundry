import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateStickerDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  emojis?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(125)
  accessibilityText?: string;
}
