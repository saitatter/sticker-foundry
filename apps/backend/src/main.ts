import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { RetryAfterExceptionFilter } from './common/filters/retry-after-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const environment = config.get<string>('NODE_ENV', 'development');
  const corsOrigin = config.get<string>('CORS_ORIGIN');
  if (environment === 'production' && (!corsOrigin || corsOrigin.trim() === '*')) {
    throw new Error('CORS_ORIGIN must be an explicit allowlist in production');
  }
  const allowedOrigins = (corsOrigin ?? '*')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          connectSrc: ["'self'", ...allowedOrigins.filter((origin) => origin !== '*')],
          imgSrc: ["'self'", 'data:', 'blob:'],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
        },
      },
    }),
  );

  app.enableCors({
    origin: allowedOrigins.includes('*') ? true : allowedOrigins,
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new RetryAfterExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const openApiConfig = new DocumentBuilder()
    .setTitle('Sticker Foundry API')
    .setDescription('Self-hosted collaborative WhatsApp sticker pack management API.')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, openApiConfig);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
  });

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
}

void bootstrap();
