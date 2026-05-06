import { PackRole } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdatePackMemberDto {
  @IsEnum(PackRole)
  role!: PackRole;
}
