import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

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

  @IsOptional()
  @IsIn(['none', 'threshold', 'ai'])
  backgroundRemovalMode?: 'none' | 'threshold' | 'ai';

  @IsOptional()
  @Transform(({ value }) => numberFromMultipart(value))
  @IsNumber()
  @Min(180)
  @Max(255)
  backgroundRemovalThreshold?: number;

  @IsOptional()
  @Transform(({ value }) => numberFromMultipart(value))
  @IsNumber()
  @Min(0)
  @Max(48)
  backgroundRemovalFeather?: number;

  @IsOptional()
  @Transform(({ value }) => booleanFromMultipart(value))
  @IsBoolean()
  backgroundRemovalCleanupSpeckles?: boolean;

  @IsOptional()
  @Transform(({ value }) => numberFromMultipart(value))
  @IsNumber()
  @Min(4)
  @Max(180)
  backgroundRemovalSpeckleSize?: number;

  @IsOptional()
  @Transform(({ value }) => numberFromMultipart(value))
  @IsNumber()
  @Min(0)
  @Max(10)
  animatedTrimStart?: number;

  @IsOptional()
  @Transform(({ value }) => numberFromMultipart(value))
  @IsNumber()
  @Min(0.1)
  @Max(10)
  animatedTrimEnd?: number;

  @IsOptional()
  @Transform(({ value }) => numberFromMultipart(value))
  @IsNumber()
  @Min(1)
  @Max(30)
  animatedFrameRate?: number;

  @IsOptional()
  @Transform(({ value }) => numberFromMultipart(value))
  @IsNumber()
  @Min(35)
  @Max(95)
  animatedQuality?: number;
}

function numberFromMultipart(value: unknown) {
  if (value === '' || value === undefined || value === null) return undefined;
  return Number(value);
}

function booleanFromMultipart(value: unknown) {
  if (value === '' || value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  return value === 'true' || value === '1';
}
