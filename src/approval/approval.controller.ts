import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard, JwtPayload } from '../auth/jwt-auth.guard';
import { ApprovalService } from './approval.service';

@Controller('approval')
@UseGuards(JwtAuthGuard)
export class ApprovalController {
  constructor(private readonly approval: ApprovalService) {}

  @Get('configs')
  allConfigs() {
    return this.approval.getAllApprovalConfigs();
  }

  @Get('config/:entityCode')
  config(@Param('entityCode') entityCode: string) {
    return this.approval.getApprovalConfig(entityCode);
  }

  @Post('config/:entityCode')
  saveConfig(
    @Param('entityCode') entityCode: string,
    @Body() body: { steps: Array<{ level: string; grade?: string; group?: string; description?: string; reference?: string }> },
  ) {
    return this.approval.saveApprovalConfig(entityCode, body.steps);
  }

  @Post('init')
  init(
    @Body()
    body: { entityCode: string; recordCode: string; requesterNrp: string },
    @Req() req: Request,
  ) {
    void req['user'] as JwtPayload;
    return this.approval.initApprovalData(
      body.entityCode,
      body.recordCode,
      body.requesterNrp,
    );
  }

  @Get('data/:entityCode/:recordCode')
  data(
    @Param('entityCode') entityCode: string,
    @Param('recordCode') recordCode: string,
  ) {
    return this.approval.listApprovalData(entityCode, recordCode);
  }

  @Get('pending')
  pending(@Req() req: Request) {
    const user = req['user'] as JwtPayload;
    return this.approval.pendingApprovals(user.nrp);
  }

  @Post(':id/:action')
  act(@Param('id') id: string, @Param('action') action: string) {
    const normalized = action.toUpperCase();
    if (normalized !== 'ACC' && normalized !== 'DECLINE') {
      return this.approval.approve(Number(id), 'ACC');
    }
    return this.approval.approve(Number(id), normalized);
  }
}
