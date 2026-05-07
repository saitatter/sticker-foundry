import { PackRole } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateTeamMemberDto {
  @IsEnum(PackRole)
  role!: PackRole;
}
