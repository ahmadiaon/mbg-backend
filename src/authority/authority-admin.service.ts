import {
  BadRequestException,
  ConflictException,
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
      include: {
        policies: {
          include: { roleLevel: true },
          orderBy: { roleLevelId: 'asc' },
        },
      },
      orderBy: [{ sort: 'asc' }, { code: 'asc' }],
    });
  }

  async createFeature(body: Record<string, unknown>) {
    const rawCode = this.optionalString(body.code);
    const name = this.optionalString(body.name);
    if (!rawCode || !name)
      throw new BadRequestException('code dan name feature wajib diisi');
    const code = rawCode.replace(/[^a-zA-Z0-9&_-]/g, '-').toUpperCase();
    if (!code) throw new BadRequestException('code feature tidak valid');
    const exists = await this.prisma.featureDefinition.findUnique({
      where: { code },
    });
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
      select: {
        id: true,
        nrp: true,
        name: true,
        email: true,
        role: true,
        active: true,
      },
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
    const feature = await this.prisma.featureDefinition.findUnique({
      where: { code },
    });
    if (!feature)
      throw new NotFoundException(`Feature '${code}' tidak ditemukan`);
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
    const feature = await this.prisma.featureDefinition.findUnique({
      where: { code: featureCode },
    });
    if (!feature)
      throw new NotFoundException(`Feature '${featureCode}' tidak ditemukan`);
    const roleLevel = this.number(body.roleLevel, 'roleLevel');
    if (roleLevel < 1 || roleLevel > 15)
      throw new BadRequestException('roleLevel harus 1 sampai 15');
    const role = await this.prisma.roleLevel.findUnique({
      where: { level: roleLevel },
    });
    if (!role)
      throw new NotFoundException(`Role level '${roleLevel}' tidak ditemukan`);
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
      update: {
        ...data,
        scopeType: this.optionalString(body.scopeType) ?? 'SELF',
        active: this.optionalBoolean(body.active) ?? true,
      },
      create: {
        featureId: feature.id,
        roleLevelId: role.id,
        employmentStatusCode: status,
        ...data,
        scopeType: this.optionalString(body.scopeType) ?? 'SELF',
      },
    });
  }

  async upsertBatchPolicies(policies: Array<Record<string, unknown>>) {
    if (!Array.isArray(policies)) {
      throw new BadRequestException('policies harus berupa array');
    }
    const results = [];
    for (const item of policies) {
      const featureCode = this.optionalString(item.featureCode);
      if (!featureCode) continue;
      const res = await this.upsertPolicy(featureCode, item);
      results.push(res);
    }
    return results;
  }

  async createEmploymentStatus(body: Record<string, unknown>) {
    const userId = this.number(body.userId, 'userId');
    const positionCode = this.optionalString(body.positionCode);
    const requestedRole =
      body.roleLevel === undefined
        ? undefined
        : this.number(body.roleLevel, 'roleLevel');
    const roleLevel = positionCode
      ? await this.resolveRoleLevelFromPosition(positionCode)
      : requestedRole;
    if (roleLevel === undefined)
      throw new BadRequestException(
        'positionCode wajib untuk menghitung grade jabatan',
      );
    if (roleLevel < 1 || roleLevel > 15)
      throw new BadRequestException('roleLevel harus 1 sampai 15');
    const [user, role] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.roleLevel.findUnique({ where: { level: roleLevel } }),
    ]);
    if (!user) throw new NotFoundException('User tidak ditemukan');
    if (!role) throw new NotFoundException('Role level tidak ditemukan');
    const startDate = this.date(body.startDate, 'startDate');
    const endDate = body.endDate ? this.date(body.endDate, 'endDate') : null;
    if (endDate && endDate < startDate)
      throw new BadRequestException('endDate tidak boleh sebelum startDate');
    if (roleLevel === 15) {
      const exists = await this.prisma.employmentStatus.count({
        where: {
          roleLevel: { level: 15 },
          statusCode: 'ACTIVE',
          NOT: { userId },
        },
      });
      if (exists > 0)
        throw new ConflictException(
          'Role 15 hanya boleh dimiliki satu status aktif',
        );
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

  private async resolveRoleLevelFromPosition(positionCode: string) {
    const entity = await this.prisma.entity.findUnique({
      where: { code: 'JABATAN' },
    });
    if (!entity) throw new NotFoundException('Entity JABATAN tidak ditemukan');
    const gradeField = await this.prisma.field.findFirst({
      where: { entityId: entity.id, code: 'GRADE' },
    });
    if (!gradeField)
      throw new NotFoundException('Field JABATAN.GRADE tidak ditemukan');
    const value = await this.prisma.value.findFirst({
      where: {
        entityId: entity.id,
        fieldId: gradeField.id,
        recordCode: positionCode,
        dateEnd: null,
      },
    });
    const level = Number(value?.value);
    if (!Number.isInteger(level) || level < 1 || level > 15)
      throw new BadRequestException('Jabatan belum memiliki GRADE valid');
    return level;
  }

  listUserFeatures(featureCode?: string) {
    return this.prisma.userFeatureAccess.findMany({
      where: {
        active: true,
        ...(featureCode ? { feature: { code: featureCode } } : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            nrp: true,
            name: true,
            role: true,
            active: true,
          },
        },
        feature: true,
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
  }

  async createUserFeature(
    body: Record<string, unknown>,
    createdByUserId?: number,
  ) {
    const userId = this.number(body.userId, 'userId');
    const featureCode = this.optionalString(body.featureCode);
    let featureId = this.optionalInt(body.featureId);

    if (!featureId && featureCode) {
      const feat = await this.prisma.featureDefinition.findUnique({
        where: { code: featureCode },
      });
      if (!feat)
        throw new NotFoundException(`Feature '${featureCode}' tidak ditemukan`);
      featureId = feat.id;
    }
    if (!featureId)
      throw new BadRequestException('featureId atau featureCode wajib diisi');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User tidak ditemukan');

    const reason = this.optionalString(body.reason) || 'Akses khusus personil';
    const expiresAt = body.expiresAt
      ? this.date(body.expiresAt, 'expiresAt')
      : null;

    return this.prisma.userFeatureAccess.create({
      data: {
        userId,
        featureId,
        effect: this.optionalString(body.effect) ?? 'ALLOW',
        canRead: this.optionalBoolean(body.canRead) ?? true,
        canWrite: this.optionalBoolean(body.canWrite) ?? false,
        canEdit: this.optionalBoolean(body.canEdit) ?? false,
        canDelete: this.optionalBoolean(body.canDelete) ?? false,
        canApprove: this.optionalBoolean(body.canApprove) ?? false,
        canViewHistory: this.optionalBoolean(body.canViewHistory) ?? false,
        scopeType: this.optionalString(body.scopeType) ?? 'SELF',
        reason,
        expiresAt,
        createdBy: createdByUserId,
        active: true,
      },
      include: {
        user: {
          select: { id: true, nrp: true, name: true, role: true, active: true },
        },
        feature: true,
      },
    });
  }

  async updateUserFeature(id: number, body: Record<string, unknown>) {
    const existing = await this.prisma.userFeatureAccess.findUnique({
      where: { id },
    });
    if (!existing)
      throw new NotFoundException(
        `Data akses khusus ID '${id}' tidak ditemukan`,
      );

    const expiresAt =
      body.expiresAt !== undefined
        ? body.expiresAt
          ? this.date(body.expiresAt, 'expiresAt')
          : null
        : existing.expiresAt;

    return this.prisma.userFeatureAccess.update({
      where: { id },
      data: {
        canRead: this.optionalBoolean(body.canRead) ?? existing.canRead,
        canWrite: this.optionalBoolean(body.canWrite) ?? existing.canWrite,
        canEdit: this.optionalBoolean(body.canEdit) ?? existing.canEdit,
        canDelete: this.optionalBoolean(body.canDelete) ?? existing.canDelete,
        canApprove:
          this.optionalBoolean(body.canApprove) ?? existing.canApprove,
        canViewHistory:
          this.optionalBoolean(body.canViewHistory) ?? existing.canViewHistory,
        scopeType: this.optionalString(body.scopeType) ?? existing.scopeType,
        reason: this.optionalString(body.reason) ?? existing.reason,
        expiresAt,
        active: this.optionalBoolean(body.active) ?? existing.active,
      },
      include: {
        user: {
          select: { id: true, nrp: true, name: true, role: true, active: true },
        },
        feature: true,
      },
    });
  }

  async deleteUserFeature(id: number) {
    const existing = await this.prisma.userFeatureAccess.findUnique({
      where: { id },
    });
    if (!existing)
      throw new NotFoundException(
        `Data akses khusus ID '${id}' tidak ditemukan`,
      );
    await this.prisma.userFeatureAccess.delete({ where: { id } });
    return {
      success: true,
      message: 'Hak akses khusus personil berhasil dicabut',
    };
  }

  private number(value: unknown, name: string) {
    const n = Number(value);
    if (!Number.isInteger(n))
      throw new BadRequestException(`${name} harus berupa angka bulat`);
    return n;
  }

  private date(value: unknown, name: string) {
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime()))
      throw new BadRequestException(`${name} tidak valid`);
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
