import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaService } from '../prisma.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [AuditModule],
  controllers: [AdminController],
  providers: [AdminService, PrismaService],
})
export class AdminModule {}
