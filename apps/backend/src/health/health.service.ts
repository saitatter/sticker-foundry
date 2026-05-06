import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check() {
    const database = await this.databaseStatus();
    return {
      status: database === 'ok' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      checks: {
        database,
      },
    };
  }

  private async databaseStatus() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'ok';
    } catch {
      return 'unavailable';
    }
  }
}
