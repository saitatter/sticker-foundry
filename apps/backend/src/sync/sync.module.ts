import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  controllers: [SyncController],
  providers: [PrismaService, SyncService],
})
export class SyncModule {}
