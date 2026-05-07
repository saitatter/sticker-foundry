import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaService } from '../prisma.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { InstanceController } from './instance.controller';

@Module({
  imports: [AuditModule],
  controllers: [AdminController, InstanceController],
  providers: [AdminService, PrismaService],
})
export class AdminModule {}
