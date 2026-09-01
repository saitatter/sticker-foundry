import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ExportsModule } from './exports/exports.module';
import { JobsModule } from './jobs/jobs.module';
import { EmailWorkerService } from './auth/email-worker.service';
import { MailerService } from './auth/mailer.service';
import { ExportWorkerService } from './exports/export-worker.service';
import { MediaWorkerService } from './media/media-worker.service';
import { MediaModule } from './media/media.module';
import { PrismaService } from './prisma.service';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    ExportsModule,
    JobsModule,
    MediaModule,
    StorageModule,
  ],
  providers: [EmailWorkerService, ExportWorkerService, MailerService, MediaWorkerService, PrismaService],
})
export class WorkerModule {}