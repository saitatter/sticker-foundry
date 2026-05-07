import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateAdminSettingsDto {
  @IsOptional()
  @IsIn(['open', 'invite-only', 'disabled'])
  registrationMode?: string;

  @IsOptional()
  @IsString()
  registrationInviteCode?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_995_116_277_760)
  storageQuotaBytes?: number | null;
}
