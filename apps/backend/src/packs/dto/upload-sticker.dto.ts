import { Transform } from 'class-transformer';
import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadStickerDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim().startsWith('[')) {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
    return value;
  })
  @IsArray()
  @IsString({ each: true })
  emojis?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(125)
  accessibilityText?: string;
}
