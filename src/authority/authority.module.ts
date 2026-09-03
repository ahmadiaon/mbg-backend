import { Module } from '@nestjs/common';
import { AuthorityController } from './authority.controller';
import { EffectiveAccessService } from './effective-access.service';

@Module({
  controllers: [AuthorityController],
  providers: [EffectiveAccessService],
  exports: [EffectiveAccessService],
})
export class AuthorityModule {}
