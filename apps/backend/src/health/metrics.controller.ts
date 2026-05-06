import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  metrics() {
    return this.healthService.metrics();
  }
}
