import { Module } from '@nestjs/common';
import { AuthorityController } from './authority.controller';
import { EffectiveAccessService } from './effective-access.service';
import { AuthorityAdminService } from './authority-admin.service';
import { AuthorityAdminGuard } from './authority-admin.guard';

@Module({
  controllers: [AuthorityController],
  providers: [EffectiveAccessService, AuthorityAdminService, AuthorityAdminGuard],
  exports: [EffectiveAccessService, AuthorityAdminService, AuthorityAdminGuard],
})
export class AuthorityModule {}
