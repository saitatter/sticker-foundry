import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Response } from 'express';
import { MediaQueueFullException } from '../../packs/media-queue.service';

@Catch(MediaQueueFullException)
export class RetryAfterExceptionFilter implements ExceptionFilter {
	catch(exception: MediaQueueFullException, host: ArgumentsHost) {
		const response = host.switchToHttp().getResponse<Response>();
		response.setHeader('Retry-After', String(exception.retryAfterSeconds));
		response.status(exception.getStatus()).json(exception.getResponse());
	}
}