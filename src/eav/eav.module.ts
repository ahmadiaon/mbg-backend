import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AssetsModule } from '../assets/assets.module';
import { EavController } from './eav.controller';
import { EavService } from './eav.service';

@Module({
  imports: [AuthModule, AssetsModule],
  controllers: [EavController],
  providers: [EavService],
})
export class EavModule {}
