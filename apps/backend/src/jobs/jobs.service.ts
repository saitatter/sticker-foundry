import { BadRequestException, Injectable, MessageEvent, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobStatus, MediaJob, Prisma } from '@prisma/client';
import { Observable } from 'rxjs';
import { PrismaService } from '../prisma.service';
import { ALL_QUEUE_NAMES, QueueName } from './queue.constants';
import { JobQueueService } from './job-queue.service';

export type JobResponse = {
  id: string;
  status: JobStatus;
  progress: number;
  error?: string;
  result?: Record<string, unknown>;
};

export type EnqueueJobInput = {
  type: QueueName;
  name: string;
  userId?: string;
  packId?: string;
  stickerId?: string;
  data?: Record<string, unknown>;
};

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: JobQueueService,
    private readonly config: ConfigService,
  ) {}

  async enqueue(input: EnqueueJobInput) {
    const queueName = this.queueNameFor(input.type);
    const job = await this.prisma.mediaJob.create({
      data: {
        type: input.type,
        payload: input.data ? (input.data as Prisma.InputJsonValue) : undefined,
        userId: input.userId,
        packId: input.packId,
        stickerId: input.stickerId,
      },
    });

    try {
      await this.queue.add(queueName, input.name, {
        mediaJobId: job.id,
        ...input.data,
      }, { jobId: job.id });
    } catch (error) {
      await this.prisma.mediaJob.update({
        where: { id: job.id },
        data: { status: JobStatus.FAILED, error: this.errorMessage(error), completedAt: new Date() },
      });
      throw error;
    }

    return this.toResponse(job);
  }

  async get(userId: string, id: string) {
    return this.toResponse(await this.loadOwnedJob(userId, id));
  }

  async cancel(userId: string, id: string) {
    const job = await this.loadOwnedJob(userId, id);
    if (job.status === JobStatus.COMPLETED || job.status === JobStatus.FAILED || job.status === JobStatus.CANCELLED) {
      throw new BadRequestException('Job cannot be cancelled in its current state');
    }

    await this.removeFromQueue(job);
    const updated = await this.prisma.mediaJob.updateMany({
      where: { id, userId, status: { in: [JobStatus.QUEUED, JobStatus.PROCESSING] } },
      data: { status: JobStatus.CANCELLED, completedAt: new Date() },
    });
    if (updated.count === 0) {
      throw new BadRequestException('Job cannot be cancelled in its current state');
    }
    return this.get(userId, id);
  }

  async retry(userId: string, id: string) {
    const job = await this.loadOwnedJob(userId, id);
    if (job.status !== JobStatus.FAILED && job.status !== JobStatus.CANCELLED) {
      throw new BadRequestException('Only failed or cancelled jobs can be retried');
    }

    const queueName = this.queueNameFor(job.type);
    await this.removeFromQueue(job);
    const updated = await this.prisma.mediaJob.update({
      where: { id },
      data: {
        status: JobStatus.QUEUED,
        progress: 0,
        error: null,
        result: Prisma.DbNull,
        startedAt: null,
        completedAt: null,
      },
    });
    try {
      await this.queue.add(queueName, job.type, { mediaJobId: id, ...this.payloadFor(job.payload) }, { jobId: id });
    } catch (error) {
      await this.prisma.mediaJob.update({
        where: { id },
        data: { status: JobStatus.FAILED, error: this.errorMessage(error), completedAt: new Date() },
      });
      throw error;
    }
    return this.toResponse(updated);
  }

  events(userId: string, id: string): Observable<MessageEvent> {
    const pollMs = this.configInt('JOB_EVENTS_POLL_MS', 1_000);
    return new Observable<MessageEvent>((subscriber) => {
      let lastState: string | undefined;

      const publish = async () => {
        try {
          const job = await this.loadOwnedJob(userId, id);
          const response = this.toResponse(job);
          const state = JSON.stringify(response);
          if (state !== lastState) {
            lastState = state;
            subscriber.next({ type: job.status.toLowerCase(), data: response });
          }
          if (this.isTerminal(job.status)) {
            subscriber.complete();
            clearInterval(timer);
          }
        } catch (error) {
          subscriber.error(error);
          clearInterval(timer);
        }
      };

      const timer = setInterval(() => void publish(), pollMs);
      void publish();
      return () => {
        if (timer) clearInterval(timer);
      };
    });
  }

  private async loadOwnedJob(userId: string, id: string) {
    const job = await this.prisma.mediaJob.findFirst({ where: { id, userId } });
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    return job;
  }

  private async removeFromQueue(job: MediaJob) {
    const queueName = this.queueNameFor(job.type);
    await this.queue.remove(queueName, job.id).catch(() => undefined);
  }

  private queueNameFor(type: string): QueueName {
    if (ALL_QUEUE_NAMES.includes(type as QueueName)) return type as QueueName;
    throw new BadRequestException(`Unsupported job type: ${type}`);
  }

  private toResponse(job: MediaJob): JobResponse {
    return {
      id: job.id,
      status: job.status,
      progress: job.progress,
      ...(job.error ? { error: job.error } : {}),
      ...(job.result && typeof job.result === 'object' && !Array.isArray(job.result)
        ? { result: job.result as Record<string, unknown> }
        : {}),
    };
  }

  private isTerminal(status: JobStatus) {
    return status === JobStatus.COMPLETED || status === JobStatus.FAILED || status === JobStatus.CANCELLED;
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }

  private payloadFor(payload: Prisma.JsonValue | null) {
    return payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  }

  private configInt(key: string, fallback: number) {
    const parsed = Number.parseInt(this.config.get<string>(key, String(fallback)), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}