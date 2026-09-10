import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
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

  async listUsersManagement() {
    const [users, nikValues, namaValues, jabatanValues, perusahaanValues, statusValues] =
      await Promise.all([
        this.prisma.user.findMany({
          select: {
            id: true,
            nrp: true,
            name: true,
            email: true,
            role: true,
            pin: true,
            password: true,
            active: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { nrp: 'asc' },
        }),
        this.prisma.value.findMany({
          where: {
            field: { entity: { code: 'IDENTITAS-KARYAWAN' }, code: 'NIK-KTP' },
          },
          select: { recordCode: true, value: true },
        }),
        this.prisma.value.findMany({
          where: {
            field: {
              entity: { code: 'IDENTITAS-KARYAWAN' },
              code: 'NAMA-KARYAWAN',
            },
          },
          select: { recordCode: true, value: true },
        }),
        this.prisma.value.findMany({
          where: {
            field: { entity: { code: 'STATUS-KERJA-KARYAWAN' }, code: 'JABATAN' },
          },
          select: { recordCode: true, value: true },
        }),
        this.prisma.value.findMany({
          where: {
            field: {
              entity: { code: 'STATUS-KERJA-KARYAWAN' },
              code: 'PERUSAHAAN',
            },
          },
          select: { recordCode: true, value: true },
        }),
        this.prisma.value.findMany({
          where: {
            field: { entity: { code: 'STATUS-KERJA-KARYAWAN' }, code: 'STATUS' },
          },
          select: { recordCode: true, value: true },
        }),
      ]);

    const norm = (s: string) =>
      (s || '').replace(/[\/\-_]/g, '').trim().toUpperCase();

    const nikMap = new Map<string, string>();
    for (const v of nikValues) {
      if (!v.value) continue;
      nikMap.set(v.recordCode, v.value);
      nikMap.set(norm(v.recordCode), v.value);
    }

    const namaMap = new Map<string, string>();
    for (const v of namaValues) {
      if (!v.value) continue;
      namaMap.set(v.recordCode, v.value);
      namaMap.set(norm(v.recordCode), v.value);
    }

    const jabatanMap = new Map<string, string>();
    for (const v of jabatanValues) {
      if (!v.value) continue;
      jabatanMap.set(v.recordCode, v.value);
      jabatanMap.set(norm(v.recordCode), v.value);
    }

    const perusahaanMap = new Map<string, string>();
    for (const v of perusahaanValues) {
      if (!v.value) continue;
      perusahaanMap.set(v.recordCode, v.value);
      perusahaanMap.set(norm(v.recordCode), v.value);
    }

    const statusMap = new Map<string, string>();
    for (const v of statusValues) {
      if (!v.value) continue;
      statusMap.set(v.recordCode, v.value);
      statusMap.set(norm(v.recordCode), v.value);
    }

    return users.map((u) => {
      const cleanName =
        namaMap.get(u.nrp) || namaMap.get(norm(u.nrp)) || u.name;
      const nikKtp = nikMap.get(u.nrp) || nikMap.get(norm(u.nrp)) || null;
      const jabatan =
        jabatanMap.get(u.nrp) || jabatanMap.get(norm(u.nrp)) || null;
      const perusahaan =
        perusahaanMap.get(u.nrp) || perusahaanMap.get(norm(u.nrp)) || null;
      const statusKerja =
        statusMap.get(u.nrp) || statusMap.get(norm(u.nrp)) || null;

      return {
        id: u.id,
        nrp: u.nrp,
        name: cleanName,
        email: u.email,
        role: u.role,
        active: u.active,
        hasPin: Boolean(u.pin),
        hasPassword: Boolean(u.password),
        nikKtp,
        jabatan,
        perusahaan,
        statusKerja,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      };
    });
  }

  async listUnregisteredEmployees() {
    const norm = (s: string) =>
      (s || '').replace(/[\/\-_]/g, '').trim().toUpperCase();

    const [users, namaRecords, nikRecords, jabatanRecords, perusahaanRecords] =
      await Promise.all([
        this.prisma.user.findMany({ select: { nrp: true } }),
        this.prisma.value.findMany({
          where: {
            field: {
              entity: { code: 'IDENTITAS-KARYAWAN' },
              code: 'NAMA-KARYAWAN',
            },
          },
          select: { recordCode: true, value: true },
        }),
        this.prisma.value.findMany({
          where: {
            field: { entity: { code: 'IDENTITAS-KARYAWAN' }, code: 'NIK-KTP' },
          },
          select: { recordCode: true, value: true },
        }),
        this.prisma.value.findMany({
          where: {
            field: { entity: { code: 'STATUS-KERJA-KARYAWAN' }, code: 'JABATAN' },
          },
          select: { recordCode: true, value: true },
        }),
        this.prisma.value.findMany({
          where: {
            field: {
              entity: { code: 'STATUS-KERJA-KARYAWAN' },
              code: 'PERUSAHAAN',
            },
          },
          select: { recordCode: true, value: true },
        }),
      ]);

    const userNrpSet = new Set<string>();
    for (const u of users) {
      userNrpSet.add(u.nrp);
      userNrpSet.add(norm(u.nrp));
    }

    const nikMap = new Map<string, string>();
    for (const n of nikRecords) {
      if (!n.value) continue;
      nikMap.set(n.recordCode, n.value);
      nikMap.set(norm(n.recordCode), n.value);
    }

    const jabatanMap = new Map<string, string>();
    for (const j of jabatanRecords) {
      if (!j.value) continue;
      jabatanMap.set(j.recordCode, j.value);
      jabatanMap.set(norm(j.recordCode), j.value);
    }

    const perusahaanMap = new Map<string, string>();
    for (const p of perusahaanRecords) {
      if (!p.value) continue;
      perusahaanMap.set(p.recordCode, p.value);
      perusahaanMap.set(norm(p.recordCode), p.value);
    }

    const unregistered: Array<{
      nrp: string;
      nama: string;
      nikKtp: string | null;
      jabatan: string | null;
      perusahaan: string | null;
    }> = [];

    const seenNrp = new Set<string>();
    for (const k of namaRecords) {
      const nrp = k.recordCode;
      const normalized = norm(nrp);
      if (seenNrp.has(normalized)) continue;
      seenNrp.add(normalized);

      if (!userNrpSet.has(nrp) && !userNrpSet.has(normalized)) {
        unregistered.push({
          nrp,
          nama: k.value || nrp,
          nikKtp: nikMap.get(nrp) || nikMap.get(normalized) || null,
          jabatan: jabatanMap.get(nrp) || jabatanMap.get(normalized) || null,
          perusahaan:
            perusahaanMap.get(nrp) || perusahaanMap.get(normalized) || null,
        });
      }
    }

    return unregistered;
  }

  async resetUserPinToKtp(userId: number, customNik?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException(`User ID ${userId} tidak ditemukan`);

    let nik = customNik?.trim();
    if (!nik) {
      const nikRecord = await this.prisma.value.findFirst({
        where: {
          field: { entity: { code: 'IDENTITAS-KARYAWAN' }, code: 'NIK-KTP' },
          OR: [
            { recordCode: user.nrp },
            { recordCode: user.nrp.replace(/\//g, '-') },
            { recordCode: user.nrp.replace(/-/g, '/') },
          ],
        },
      });
      nik = nikRecord?.value?.trim();
    }

    if (!nik) {
      throw new BadRequestException(
        `Nomor NIK KTP untuk karyawan ${user.nrp} tidak ditemukan di master data. Silakan masukkan nomor NIK KTP secara manual.`,
      );
    }

    const hashedPassword = await bcrypt.hash(nik, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        pin: null, // Reset PIN sehingga user login menggunakan NIK
        password: hashedPassword, // Simpan password ter-enkripsi NIK
        authLogin: null, // Hapus token verifikasi sementara
      },
    });

    return {
      success: true,
      message: `PIN berhasil direset. Password login karyawan dikembalikan ke NIK KTP (${nik}). Karyawan dapat langsung login kembali menggunakan NIK KTP.`,
      nikKtp: nik,
    };
  }

  async setUserPinManual(userId: number, pin: string) {
    const cleanPin = pin?.trim();
    if (!cleanPin || cleanPin.length < 4 || cleanPin.length > 8) {
      throw new BadRequestException(
        'PIN harus terdiri dari 4 sampai 8 digit angka',
      );
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException(`User ID ${userId} tidak ditemukan`);

    const hashedPin = await bcrypt.hash(cleanPin, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        pin: hashedPin,
        authLogin: null,
      },
    });

    return {
      success: true,
      message: `PIN baru berhasil disetel untuk karyawan ${user.nrp}.`,
    };
  }

  async updateUserManagement(userId: number, body: Record<string, unknown>) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException(`User ID ${userId} tidak ditemukan`);

    const data: Record<string, unknown> = {};
    if (body.role !== undefined) data.role = this.optionalInt(body.role);
    if (body.active !== undefined) data.active = Boolean(body.active);
    if (typeof body.name === 'string' && body.name.trim())
      data.name = body.name.trim();
    if (typeof body.email === 'string') data.email = body.email.trim() || null;

    return this.prisma.user.update({
      where: { id: userId },
      data,
    });
  }

  async registerEmployeeUser(nrp: string, role = 1, customNik?: string) {
    const cleanNrp = nrp.trim();
    const existing = await this.prisma.user.findUnique({
      where: { nrp: cleanNrp },
    });
    if (existing) {
      throw new ConflictException(
        `User dengan NRP '${cleanNrp}' sudah terdaftar`,
      );
    }

    const [namaVal, nikVal] = await Promise.all([
      this.prisma.value.findFirst({
        where: {
          field: {
            entity: { code: 'IDENTITAS-KARYAWAN' },
            code: 'NAMA-KARYAWAN',
          },
          OR: [
            { recordCode: cleanNrp },
            { recordCode: cleanNrp.replace(/\//g, '-') },
            { recordCode: cleanNrp.replace(/-/g, '/') },
          ],
        },
      }),
      this.prisma.value.findFirst({
        where: {
          field: { entity: { code: 'IDENTITAS-KARYAWAN' }, code: 'NIK-KTP' },
          OR: [
            { recordCode: cleanNrp },
            { recordCode: cleanNrp.replace(/\//g, '-') },
            { recordCode: cleanNrp.replace(/-/g, '/') },
          ],
        },
      }),
    ]);

    const nik = customNik?.trim() || nikVal?.value?.trim();
    if (!nik) {
      throw new BadRequestException(
        'NIK KTP belum terisi di master data. Mohon masukkan NIK secara manual.',
      );
    }

    const hashedPassword = await bcrypt.hash(nik, 10);
    const name = namaVal?.value?.trim() || cleanNrp;

    return this.prisma.user.create({
      data: {
        nrp: cleanNrp,
        name,
        password: hashedPassword,
        pin: null,
        role: role || 1,
        active: true,
      },
    });
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
