import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api');
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const assetsPath = join(process.cwd(), 'assets');
  app.useStaticAssets(assetsPath, {
    prefix: '/assets/',
  });

  await app.listen(process.env.PORT ?? 3000);
  console.log(
    `🚀 Server berjalan di http://localhost:${process.env.PORT ?? 3000}/api`,
  );
  console.log(`📁 Static assets disajikan dari: ${assetsPath}`);
}
bootstrap();
