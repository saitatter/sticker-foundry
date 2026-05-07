import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, RequestUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { AdminService } from './admin.service';
import { UpdateAdminSettingsDto } from './dto/update-admin-settings.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('settings')
  settings(@CurrentUser() user: RequestUser) {
    return this.adminService.settings(user.sub);
  }

  @Patch('settings')
  updateSettings(@CurrentUser() user: RequestUser, @Body() dto: UpdateAdminSettingsDto) {
    return this.adminService.updateSettings(user.sub, dto);
  }

  @Get('audit-log')
  auditLog(@CurrentUser() user: RequestUser, @Query('limit') limit?: string) {
    return this.adminService.auditLog(user.sub, limit ? Number.parseInt(limit, 10) : undefined);
  }
}
