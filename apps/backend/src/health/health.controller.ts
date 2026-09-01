import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  check() {
    return this.healthService.check();
  }

  @Get('live')
  live() {
    return this.healthService.live();
  }

  @Get('ready')
  async ready(@Res() response: Response) {
    const result = await this.healthService.ready();
    return response.status(result.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).json(result);
  }
}
