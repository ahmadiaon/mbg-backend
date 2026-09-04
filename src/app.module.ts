import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { EavModule } from './eav/eav.module';
import { PayslipModule } from './payslip/payslip.module';
import { DocsModule } from './docs/docs.module';
import { AuthorityModule } from './authority/authority.module';
import { AssetsModule } from './assets/assets.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    EavModule,
    PayslipModule,
    DocsModule,
    AuthorityModule,
    AssetsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
