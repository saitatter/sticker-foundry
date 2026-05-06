import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
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
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('THROTTLE_TTL_MS', 60_000),
          limit: config.get<number>('THROTTLE_LIMIT', 300),
        },
      ],
    }),
    AuthModule,
    HealthModule,
    PacksModule,
    SyncModule,
  ],
  providers: [
    PrismaService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
