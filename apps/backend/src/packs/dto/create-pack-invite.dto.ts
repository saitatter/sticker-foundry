import { PackRole } from '@prisma/client';
import { IsEmail, IsEnum, IsISO8601, IsOptional } from 'class-validator';

export class CreatePackInviteDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsEnum(PackRole)
  role!: PackRole;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
