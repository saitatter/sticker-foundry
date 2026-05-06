import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { MetricsController } from './metrics.controller';

@Module({
  controllers: [HealthController, MetricsController],
  providers: [HealthService, PrismaService],
})
export class HealthModule {}
