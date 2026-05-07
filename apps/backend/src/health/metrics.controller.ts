import { Controller, Get, Headers, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { HealthService } from './health.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  metrics(
    @Query('format') format: string | undefined,
    @Headers('accept') accept: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const metrics = this.healthService.metrics();
    if (format === 'prometheus' || accept?.includes('text/plain')) {
      response.type('text/plain; version=0.0.4; charset=utf-8');
      return this.healthService.prometheusMetrics(metrics);
    }
    return metrics;
  }
}
