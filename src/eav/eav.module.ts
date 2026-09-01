import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EavController } from './eav.controller';
import { EavService } from './eav.service';

@Module({
  imports: [AuthModule],
  controllers: [EavController],
  providers: [EavService],
})
export class EavModule {}
