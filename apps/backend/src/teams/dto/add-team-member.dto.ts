import { PackRole } from '@prisma/client';
import { IsEmail, IsEnum } from 'class-validator';

export class AddTeamMemberDto {
  @IsEmail()
  email!: string;

  @IsEnum(PackRole)
  role!: PackRole;
}
