import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard, JwtPayload } from '../auth/jwt-auth.guard';
import { OrganizationService } from './organization.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('organization')
@UseGuards(JwtAuthGuard)
export class OrganizationController {
  constructor(
    private readonly orgService: OrganizationService,
    private readonly prisma: PrismaService,
  ) {}

  private async assertCanManage(req: Request) {
    const userPayload = req['user'] as JwtPayload;
    if (!userPayload?.sub) {
      throw new UnauthorizedException('Identitas user tidak ditemukan');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userPayload.sub },
      select: { id: true, nrp: true, role: true, active: true },
    });

    if (!user || !user.active) {
      throw new UnauthorizedException('Akun tidak aktif');
    }

    // Role 14 & 15 adalah Super User / Super User Utama
    if (user.role >= 14) {
      return user;
    }

    // Cek juga employment status aktif jika ada level 14/15
    const today = new Date();
    const statuses = await this.prisma.employmentStatus.findMany({
      where: {
        userId: user.id,
        startDate: { lte: today },
        OR: [{ endDate: null }, { endDate: { gte: today } }],
      },
      select: { roleLevel: { select: { level: true } } },
    });

    const isSuperByStatus = statuses.some((s) => s.roleLevel.level >= 14);
    if (!isSuperByStatus) {
      throw new ForbiddenException(
        'Hanya Superadmin atau pengguna berotoritas yang dapat mengelola struktur organisasi & grade',
      );
    }

    return user;
  }

  @Get('tree')
  getTree(
    @Query('company') company?: string,
    @Query('department') department?: string,
    @Query('search') search?: string,
  ) {
    return this.orgService.getTree({ company, department, search });
  }

  @Get('positions')
  getPositions(
    @Query('company') company?: string,
    @Query('department') department?: string,
    @Query('search') search?: string,
  ) {
    return this.orgService.getPositions({ company, department, search });
  }

  @Get('grades')
  getGrades() {
    return this.orgService.getGrades();
  }

  @Get('employees-lookup')
  getEmployeesLookup() {
    return this.orgService.getEmployeesLookup();
  }

  @Post('node')
  async createNode(@Req() req: Request, @Body() body: any) {
    await this.assertCanManage(req);
    return this.orgService.createNode(body);
  }

  @Put('node/:id')
  async updateNode(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    await this.assertCanManage(req);
    return this.orgService.updateNode(Number(id), body);
  }

  @Delete('node/:id')
  async deleteNode(@Req() req: Request, @Param('id') id: string) {
    await this.assertCanManage(req);
    return this.orgService.deleteNode(Number(id));
  }

  @Post('node/:id/assign')
  async assignEmployee(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { employeeNrp: string | null; syncUserRole?: boolean },
  ) {
    await this.assertCanManage(req);
    return this.orgService.assignEmployee(
      Number(id),
      body.employeeNrp,
      body.syncUserRole ?? true,
    );
  }
}
