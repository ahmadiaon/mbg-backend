import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard, JwtPayload } from '../auth/jwt-auth.guard';
import { ACCESS_ACTIONS, AccessAction, EffectiveAccessService } from './effective-access.service';

@Controller('access')
@UseGuards(JwtAuthGuard)
export class AuthorityController {
  constructor(private readonly access: EffectiveAccessService) {}

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

}
