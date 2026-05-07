import { Controller, Get } from '@nestjs/common';
import { AdminService } from './admin.service';

@Controller('instance')
export class InstanceController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  settings() {
    return this.adminService.publicSettings();
  }
}
