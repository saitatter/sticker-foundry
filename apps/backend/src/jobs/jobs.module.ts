import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JobQueueService } from './job-queue.service';
import { JobExecutionService } from './job-execution.service';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [ConfigModule],
  controllers: [JobsController],
  providers: [JobQueueService, JobExecutionService, JobsService, PrismaService],
  exports: [JobQueueService, JobExecutionService, JobsService],
})
export class JobsModule {}