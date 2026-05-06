import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { PacksModule } from './packs/packs.module';
import { PrismaService } from './prisma.service';
import { SyncModule } from './sync/sync.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthModule,
    HealthModule,
    PacksModule,
    SyncModule,
  ],
  providers: [PrismaService],
})
export class AppModule {}
