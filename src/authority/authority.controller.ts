import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard, JwtPayload } from '../auth/jwt-auth.guard';
import {
  ACCESS_ACTIONS,
  AccessAction,
  EffectiveAccessService,
} from './effective-access.service';
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
      allowed:
        validAction &&
        (await this.access.canPerform(
          user.sub,
          feature,
          action as AccessAction,
        )),
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

  @Post('admin/features')
  @UseGuards(AuthorityAdminGuard)
  createFeature(@Body() body: Record<string, unknown>) {
    return this.admin.createFeature(body);
  }

  @Get('admin/users')
  @UseGuards(AuthorityAdminGuard)
  users() {
    return this.admin.listUsers();
  }

  @Get('admin/users/management')
  @UseGuards(AuthorityAdminGuard)
  usersManagement() {
    return this.admin.listUsersManagement();
  }

  @Get('admin/users/unregistered')
  @UseGuards(AuthorityAdminGuard)
  unregisteredEmployees() {
    return this.admin.listUnregisteredEmployees();
  }

  @Post('admin/users/:id/reset-pin')
  @UseGuards(AuthorityAdminGuard)
  resetUserPin(
    @Param('id') id: string,
    @Body() body: { nik?: string },
  ) {
    return this.admin.resetUserPinToKtp(Number(id), body?.nik);
  }

  @Post('admin/users/:id/set-pin')
  @UseGuards(AuthorityAdminGuard)
  setUserPin(
    @Param('id') id: string,
    @Body() body: { pin: string },
  ) {
    return this.admin.setUserPinManual(Number(id), body.pin);
  }

  @Post('admin/users/register-employee')
  @UseGuards(AuthorityAdminGuard)
  registerEmployee(
    @Body() body: { nrp: string; role?: number; nik?: string },
  ) {
    return this.admin.registerEmployeeUser(body.nrp, body.role, body.nik);
  }

  @Put('admin/users/:id/management')
  @UseGuards(AuthorityAdminGuard)
  updateUserManagement(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.admin.updateUserManagement(Number(id), body);
  }

  @Get('admin/employment-statuses')
  @UseGuards(AuthorityAdminGuard)
  employmentStatuses() {
    return this.admin.listEmploymentStatuses();
  }

  @Put('admin/features/:code')
  @UseGuards(AuthorityAdminGuard)
  updateFeature(
    @Param('code') code: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.admin.updateFeature(code, body);
  }

  @Put('admin/features/:code/policy')
  @UseGuards(AuthorityAdminGuard)
  policy(@Param('code') code: string, @Body() body: Record<string, unknown>) {
    return this.admin.upsertPolicy(code, body);
  }

  @Put('admin/policies/batch')
  @UseGuards(AuthorityAdminGuard)
  batchPolicies(@Body() body: { policies: Array<Record<string, unknown>> }) {
    return this.admin.upsertBatchPolicies(body.policies);
  }

  @Post('admin/employment-statuses')
  @UseGuards(AuthorityAdminGuard)
  employmentStatus(@Body() body: Record<string, unknown>) {
    return this.admin.createEmploymentStatus(body);
  }

  @Get('admin/user-features')
  @UseGuards(AuthorityAdminGuard)
  userFeatures(@Req() req: Request) {
    const featureCode = req.query.featureCode as string | undefined;
    return this.admin.listUserFeatures(featureCode);
  }

  @Post('admin/user-features')
  @UseGuards(AuthorityAdminGuard)
  createUserFeature(
    @Req() req: Request,
    @Body() body: Record<string, unknown>,
  ) {
    const user = req['user'] as JwtPayload;
    return this.admin.createUserFeature(body, user?.sub);
  }

  @Put('admin/user-features/:id')
  @UseGuards(AuthorityAdminGuard)
  updateUserFeature(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.admin.updateUserFeature(Number(id), body);
  }

  @Delete('admin/user-features/:id')
  @UseGuards(AuthorityAdminGuard)
  deleteUserFeature(@Param('id') id: string) {
    return this.admin.deleteUserFeature(Number(id));
  }
}
