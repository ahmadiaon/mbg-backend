import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard, JwtPayload } from '../auth/jwt-auth.guard';
import { ACCESS_ACTIONS, AccessAction, EffectiveAccessService } from './effective-access.service';
import { AuthorityAdminGuard } from './authority-admin.guard';
import { AuthorityAdminService } from './authority-admin.service';

@Controller('access')
@UseGuards(JwtAuthGuard)
export class AuthorityController {
  constructor(
    private readonly access: EffectiveAccessService,
    private readonly admin: AuthorityAdminService,
  ) {}

  @Get('bootstrap')
  bootstrap(@Req() req: Request) {
    const user = req['user'] as JwtPayload;
    return this.access.resolveEffectiveAccess(user.sub);
  }

  @Get('me')
  me(@Req() req: Request) {
    const user = req['user'] as JwtPayload;
    return this.access.resolveRoleLevels(user.sub);
  }

  @Post('check/:feature/:action')
  async check(
    @Req() req: Request,
    @Param('feature') feature: string,
    @Param('action') action: string,
  ) {
    const user = req['user'] as JwtPayload;
    const validAction = ACCESS_ACTIONS.includes(action as AccessAction);
    return {
      feature,
      action,
      allowed: validAction && (await this.access.canPerform(user.sub, feature, action as AccessAction)),
    };
  }

  @Get('admin/roles')
  @UseGuards(AuthorityAdminGuard)
  roles() {
    return this.admin.listRoles();
  }

  @Get('admin/features')
  @UseGuards(AuthorityAdminGuard)
  features() {
    return this.admin.listFeatures();
  }

  @Get('admin/users')
  @UseGuards(AuthorityAdminGuard)
  users() {
    return this.admin.listUsers();
  }

  @Get('admin/employment-statuses')
  @UseGuards(AuthorityAdminGuard)
  employmentStatuses() {
    return this.admin.listEmploymentStatuses();
  }

  @Put('admin/features/:code')
  @UseGuards(AuthorityAdminGuard)
  updateFeature(@Param('code') code: string, @Body() body: Record<string, unknown>) {
    return this.admin.updateFeature(code, body);
  }

  @Put('admin/features/:code/policy')
  @UseGuards(AuthorityAdminGuard)
  policy(@Param('code') code: string, @Body() body: Record<string, unknown>) {
    return this.admin.upsertPolicy(code, body);
  }

  @Post('admin/employment-statuses')
  @UseGuards(AuthorityAdminGuard)
  employmentStatus(@Body() body: Record<string, unknown>) {
    return this.admin.createEmploymentStatus(body);
  }

}
