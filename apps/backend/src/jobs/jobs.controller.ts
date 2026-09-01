import { Controller, Get, MessageEvent, Param, Post, Sse, UseGuards } from '@nestjs/common';
import { Observable } from 'rxjs';
import { CurrentUser, RequestUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JobsService } from './jobs.service';

@Controller('jobs')
@UseGuards(JwtAuthGuard)
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.jobs.get(user.sub, id);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.jobs.cancel(user.sub, id);
  }

  @Post(':id/retry')
  retry(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.jobs.retry(user.sub, id);
  }

  @Sse(':id/events')
  events(@CurrentUser() user: RequestUser, @Param('id') id: string): Observable<MessageEvent> {
    return this.jobs.events(user.sub, id);
  }
}