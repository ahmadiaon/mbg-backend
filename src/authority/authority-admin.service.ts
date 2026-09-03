import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const ACTION_KEYS = [
  'canRead',
  'canWrite',
  'canEdit',
  'canDelete',
  'canImport',
  'canExport',
  'canSubmit',
  'canApprove',
  'canReject',
  'canViewHistory',
  'canRestore',
] as const;

@Injectable()
export class AuthorityAdminService {
  constructor(private readonly prisma: PrismaService) {}

  listRoles() {
    return this.prisma.roleLevel.findMany({ orderBy: { level: 'asc' } });
  }

  listFeatures() {
    return this.prisma.featureDefinition.findMany({
      include: { policies: { include: { roleLevel: true }, orderBy: { roleLevelId: 'asc' } } },
      orderBy: [{ sort: 'asc' }, { code: 'asc' }],
    });
  }

  async createFeature(body: Record<string, unknown>) {
    const rawCode = this.optionalString(body.code);
    const name = this.optionalString(body.name);
    if (!rawCode || !name) throw new BadRequestException('code dan name feature wajib diisi');
    const code = rawCode.replace(/[^a-zA-Z0-9&_-]/g, '-').toUpperCase();
    if (!code) throw new BadRequestException('code feature tidak valid');
    const exists = await this.prisma.featureDefinition.findUnique({ where: { code } });
    if (exists) throw new ConflictException(`Feature '${code}' sudah ada`);
    return this.prisma.featureDefinition.create({
      data: {
        code,
        name,
        description: this.optionalString(body.description),
        route: this.optionalString(body.route),
        icon: this.optionalString(body.icon) ?? 'bi-grid',
        menuGroup: this.optionalString(body.menuGroup),
        sort: this.optionalInt(body.sort) ?? 0,
        isSystem: false,
      },
    });
  }

  listUsers() {
    return this.prisma.user.findMany({
      where: { active: true },
      select: { id: true, nrp: true, name: true, email: true, role: true, active: true },
      orderBy: { nrp: 'asc' },
    });
  }

  listEmploymentStatuses() {
    return this.prisma.employmentStatus.findMany({
      include: {
        user: { select: { id: true, nrp: true, name: true } },
        roleLevel: true,
        company: true,
        project: true,
        department: true,
        division: true,
        position: true,
      },
      orderBy: [{ employeeNrp: 'asc' }, { startDate: 'desc' }],
    });
  }

  async updateFeature(code: string, body: Record<string, unknown>) {
    const feature = await this.prisma.featureDefinition.findUnique({ where: { code } });
    if (!feature) throw new NotFoundException(`Feature '${code}' tidak ditemukan`);
    return this.prisma.featureDefinition.update({
      where: { id: feature.id },
      data: {
        name: this.optionalString(body.name) ?? feature.name,
        description: this.optionalString(body.description),
        route: this.optionalString(body.route),
        icon: this.optionalString(body.icon),
        menuGroup: this.optionalString(body.menuGroup),
        sort: this.optionalInt(body.sort) ?? feature.sort,
        active: this.optionalBoolean(body.active) ?? feature.active,
      },
    });
  }

  async upsertPolicy(featureCode: string, body: Record<string, unknown>) {
    const feature = await this.prisma.featureDefinition.findUnique({ where: { code: featureCode } });
    if (!feature) throw new NotFoundException(`Feature '${featureCode}' tidak ditemukan`);
    const roleLevel = this.number(body.roleLevel, 'roleLevel');
    if (roleLevel < 1 || roleLevel > 15) throw new BadRequestException('roleLevel harus 1 sampai 15');
    const role = await this.prisma.roleLevel.findUnique({ where: { level: roleLevel } });
    if (!role) throw new NotFoundException(`Role level '${roleLevel}' tidak ditemukan`);
    const status = this.optionalString(body.employmentStatusCode) ?? 'ACTIVE';
    const data = Object.fromEntries(
      ACTION_KEYS.map((key) => [key, this.optionalBoolean(body[key]) ?? false]),
    ) as Record<string, boolean>;
    return this.prisma.featureAccessPolicy.upsert({
      where: {
        featureId_roleLevelId_employmentStatusCode: {
          featureId: feature.id,
          roleLevelId: role.id,
          employmentStatusCode: status,
        },
      },
      update: { ...data, scopeType: this.optionalString(body.scopeType) ?? 'SELF', active: this.optionalBoolean(body.active) ?? true },
      create: { featureId: feature.id, roleLevelId: role.id, employmentStatusCode: status, ...data, scopeType: this.optionalString(body.scopeType) ?? 'SELF' },
    });
  }

  async createEmploymentStatus(body: Record<string, unknown>) {
    const userId = this.number(body.userId, 'userId');
    const roleLevel = this.number(body.roleLevel, 'roleLevel');
    if (roleLevel < 1 || roleLevel > 15) throw new BadRequestException('roleLevel harus 1 sampai 15');
    const [user, role] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.roleLevel.findUnique({ where: { level: roleLevel } }),
    ]);
    if (!user) throw new NotFoundException('User tidak ditemukan');
    if (!role) throw new NotFoundException('Role level tidak ditemukan');
    const startDate = this.date(body.startDate, 'startDate');
    const endDate = body.endDate ? this.date(body.endDate, 'endDate') : null;
    if (endDate && endDate < startDate) throw new BadRequestException('endDate tidak boleh sebelum startDate');
    if (roleLevel === 15 && user.nrp !== 'MBLE-0422003') {
      throw new ForbiddenException('Role 15 hanya untuk MBLE-0422003');
    }
    if (roleLevel === 15) {
      const exists = await this.prisma.employmentStatus.count({ where: { roleLevel: { level: 15 }, statusCode: 'ACTIVE' } });
      if (exists > 0) throw new ConflictException('Role 15 hanya boleh dimiliki satu status aktif');
    }
    return this.prisma.employmentStatus.create({
      data: {
        userId,
        employeeNrp: user.nrp,
        statusCode: this.optionalString(body.statusCode) ?? 'ACTIVE',
        roleLevelId: role.id,
        positionId: this.optionalInt(body.positionId),
        companyId: this.optionalInt(body.companyId),
        projectId: this.optionalInt(body.projectId),
        departmentId: this.optionalInt(body.departmentId),
        divisionId: this.optionalInt(body.divisionId),
        startDate,
        endDate,
        isPrimary: this.optionalBoolean(body.isPrimary) ?? false,
      },
    });
  }

  private number(value: unknown, name: string) {
    const n = Number(value);
    if (!Number.isInteger(n)) throw new BadRequestException(`${name} harus berupa angka bulat`);
    return n;
  }

  private date(value: unknown, name: string) {
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) throw new BadRequestException(`${name} tidak valid`);
    return date;
  }

  private optionalString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private optionalInt(value: unknown) {
    if (value === undefined || value === null || value === '') return undefined;
    const n = Number(value);
    return Number.isInteger(n) ? n : undefined;
  }

  private optionalBoolean(value: unknown) {
    return typeof value === 'boolean' ? value : undefined;
  }
}
