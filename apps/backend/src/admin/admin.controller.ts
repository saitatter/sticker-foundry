import { Body, Controller, Get, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser, RequestUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
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

  @Get('audit-log/export')
  async auditLogExport(@CurrentUser() user: RequestUser, @Query('limit') limit: string | undefined, @Res() response: Response) {
    const csv = await this.adminService.auditLogCsv(user.sub, limit ? Number.parseInt(limit, 10) : undefined);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename="stickerfoundry-audit-log.csv"');
    return response.send(csv);
  }

  @Post('audit-log/cleanup')
  cleanupAuditLog(@CurrentUser() user: RequestUser) {
    return this.adminService.cleanupAuditLog(user.sub);
  }
}
