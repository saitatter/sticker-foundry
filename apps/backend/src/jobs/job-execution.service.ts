import { Injectable } from '@nestjs/common';
import { JobStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class JobExecutionService {
  constructor(private readonly prisma: PrismaService) {}

  async claim(jobId: string) {
    const job = await this.prisma.mediaJob.findUnique({ where: { id: jobId } });
    if (!job || job.status === JobStatus.CANCELLED || job.status === JobStatus.COMPLETED) {
      return null;
    }

    const claimed = await this.prisma.mediaJob.updateMany({
      where: { id: jobId, status: JobStatus.QUEUED },
      data: {
        status: JobStatus.PROCESSING,
        progress: 5,
        attempts: { increment: 1 },
        startedAt: new Date(),
        error: null,
      },
    });
    if (claimed.count === 0) return null;
    return this.prisma.mediaJob.findUnique({ where: { id: jobId } });
  }

  progress(jobId: string, progress: number) {
    return this.prisma.mediaJob.updateMany({
      where: { id: jobId, status: JobStatus.PROCESSING },
      data: { progress },
    });
  }

  async complete(jobId: string, result?: Prisma.InputJsonValue) {
    const updated = await this.prisma.mediaJob.updateMany({
      where: { id: jobId, status: JobStatus.PROCESSING },
      data: {
        status: JobStatus.COMPLETED,
        progress: 100,
        completedAt: new Date(),
        error: null,
        ...(result === undefined ? {} : { result }),
      },
    });
    return updated.count > 0;
  }

  fail(jobId: string, error: string, willRetry: boolean) {
    return this.prisma.mediaJob.updateMany({
      where: { id: jobId, status: JobStatus.PROCESSING },
      data: {
        status: willRetry ? JobStatus.QUEUED : JobStatus.FAILED,
        error,
        ...(willRetry ? {} : { completedAt: new Date() }),
      },
    });
  }
}