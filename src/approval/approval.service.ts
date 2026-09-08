import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SchemaCacheService } from '../eav/schema-cache.service';

// Jenis group persetujuan (master EAV DATABASE-GROUP-PERSETUJUAN)
export const APPROVER_GROUPS = [
  'NRP',
  'ATASAN-LANGSUNG',
  'HR',
  'MANAGER',
] as const;

type ConfigStep = {
  tabel: string;
  level: string;
  group: string;
  description: string;
  reference: string;
};

@Injectable()
export class ApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schemaCache: SchemaCacheService,
  ) {}

  // ===================== CONFIG (Tabel database_persetujuans) =====================
  async getApprovalConfig(entityCode: string): Promise<ConfigStep[]> {
    const rows = await this.prisma.databasePersetujuan.findMany({
      where: { formCode: entityCode },
      orderBy: { level: 'asc' },
    });
    return rows.map((r) => ({
      tabel: r.formCode ?? entityCode,
      level: r.level ?? '',
      group: r.grade ?? '',
      description: r.description ?? '',
      reference: r.reference ?? 'NRP',
    }));
  }

  async getAllApprovalConfigs(): Promise<Record<string, Record<string, ConfigStep>>> {
    const rows = await this.prisma.databasePersetujuan.findMany({
      orderBy: [{ formCode: 'asc' }, { level: 'asc' }],
    });
    const map: Record<string, Record<string, ConfigStep>> = {};
    for (const r of rows) {
      if (!r.formCode || !r.level) continue;
      if (!map[r.formCode]) map[r.formCode] = {};
      map[r.formCode][r.level] = {
        tabel: r.formCode,
        level: r.level,
        group: r.grade ?? '',
        description: r.description ?? '',
        reference: r.reference ?? 'NRP',
      };
    }
    return map;
  }

  async saveApprovalConfig(
    entityCode: string,
    steps: Array<{
      level: string;
      grade?: string;
      group?: string;
      description?: string;
      reference?: string;
    }>,
  ) {
    await this.prisma.databasePersetujuan.deleteMany({
      where: { formCode: entityCode },
    });
    if (!steps || !steps.length) return [];
    const data = steps.map((s) => ({
      formCode: entityCode,
      level: s.level,
      grade: s.grade || s.group || 'NRP',
      description: s.description || '',
      reference: s.reference || 'NRP',
    }));
    await this.prisma.databasePersetujuan.createMany({
      data,
    });
    this.schemaCache.invalidate();
    return this.getApprovalConfig(entityCode);
  }

  // ===================== RESOLVE APPROVER (EAV KARYAWAN) =====================
  async resolveApprover(
    group: string,
    requesterNrp: string,
  ): Promise<string[]> {
    switch (group.toUpperCase()) {
      case 'NRP':
        return [requesterNrp];
      case 'ATASAN-LANGSUNG':
        return this.resolveDirectSupervisor(requesterNrp);
      case 'HR':
        return this.resolveHr(requesterNrp);
      case 'MANAGER':
        return this.resolveManager(requesterNrp);
      default:
        return [];
    }
  }

  private async resolveDirectSupervisor(nrp: string): Promise<string[]> {
    const profile = await this.getEmployeeProfile(nrp);
    if (!profile) return [];
    const all = await this.getAllEmployees();
    const grade = profile.grade;
    let candidates = all.filter(
      (emp) =>
        emp.company === profile.company &&
        emp.project === profile.project &&
        emp.grade > grade,
    );
    if (grade <= 5) {
      candidates = candidates.filter(
        (emp) => emp.department === profile.department,
      );
      if (grade <= 2) {
        candidates = candidates.filter(
          (emp) => emp.division === profile.division,
        );
      }
    }
    candidates.sort((a, b) => a.grade - b.grade);
    return candidates.map((emp) => emp.nrp);
  }

  private async resolveHr(nrp: string): Promise<string[]> {
    const profile = await this.getEmployeeProfile(nrp);
    if (!profile) return [];
    const all = await this.getAllEmployees();
    return all
      .filter(
        (emp) => emp.project === profile.project && emp.department === 'HRGA',
      )
      .map((emp) => emp.nrp);
  }

  private async resolveManager(nrp: string): Promise<string[]> {
    const profile = await this.getEmployeeProfile(nrp);
    if (!profile) return [];
    const all = await this.getAllEmployees();
    let candidates = all.filter((emp) => emp.grade > profile.grade);
    if (profile.grade <= 7) {
      candidates = candidates.filter(
        (emp) =>
          emp.company === profile.company && emp.project === profile.project,
      );
    }
    candidates.sort((a, b) => a.grade - b.grade);
    return candidates.map((emp) => emp.nrp);
  }

  private async getEmployeeProfile(nrp: string) {
    const statusEntity = await this.prisma.entity.findUnique({
      where: { code: 'STATUS-KERJA-KARYAWAN' },
    });
    const positionEntity = await this.prisma.entity.findUnique({
      where: { code: 'JABATAN' },
    });
    if (!statusEntity || !positionEntity) return null;
    const [statusFields, positionFields] = await Promise.all([
      this.prisma.field.findMany({
        where: {
          entityId: statusEntity.id,
          code: {
            in: [
              'NRP',
              'JABATAN',
              'STATUS',
              'PERUSAHAAN',
              'PROJECT',
              'DEPARTEMEN',
              'DIVISI',
            ],
          },
        },
      }),
      this.prisma.field.findMany({
        where: {
          entityId: positionEntity.id,
          code: { in: ['JABATAN', 'GRADE'] },
        },
      }),
    ]);
    const statusNrp = statusFields.find((field) => field.code === 'NRP');
    const statusPosition = statusFields.find(
      (field) => field.code === 'JABATAN',
    );
    const statusState = statusFields.find((field) => field.code === 'STATUS');
    const companyField = statusFields.find(
      (field) => field.code === 'PERUSAHAAN',
    );
    const projectField = statusFields.find((field) => field.code === 'PROJECT');
    const departmentField = statusFields.find(
      (field) => field.code === 'DEPARTEMEN',
    );
    const divisionField = statusFields.find((field) => field.code === 'DIVISI');
    const positionGrade = positionFields.find(
      (field) => field.code === 'GRADE',
    );
    if (!statusNrp || !statusPosition || !positionGrade) return null;

    const statusValues = await this.prisma.value.findMany({
      where: {
        entityId: statusEntity.id,
        fieldId: {
          in: [
            statusNrp.id,
            statusPosition.id,
            ...(statusState ? [statusState.id] : []),
            ...(companyField ? [companyField.id] : []),
            ...(projectField ? [projectField.id] : []),
            ...(departmentField ? [departmentField.id] : []),
            ...(divisionField ? [divisionField.id] : []),
          ],
        },
        dateEnd: null,
      },
    });
    const rows = new Map<string, Record<number, string | null>>();
    for (const value of statusValues) {
      const row = rows.get(value.recordCode) ?? {};
      row[value.fieldId] = value.value;
      rows.set(value.recordCode, row);
    }
    let positionCode: string | null = null;
    let profile: {
      company: string;
      project: string;
      department: string;
      division: string;
    } | null = null;
    for (const row of rows.values()) {
      if (row[statusNrp.id] !== nrp) continue;
      if (
        statusState &&
        row[statusState.id] &&
        !['ACTIVE', 'AKTIF'].includes(row[statusState.id]!.toUpperCase())
      )
        continue;
      positionCode = row[statusPosition.id];
      profile = {
        company: (companyField && row[companyField.id]) || '',
        project: (projectField && row[projectField.id]) || '',
        department: (departmentField && row[departmentField.id]) || '',
        division: (divisionField && row[divisionField.id]) || '',
      };
      break;
    }
    if (!positionCode || !profile) return null;
    const gradeValue = await this.prisma.value.findFirst({
      where: {
        entityId: positionEntity.id,
        fieldId: positionGrade.id,
        recordCode: positionCode,
        dateEnd: null,
      },
    });
    const grade = Number(gradeValue?.value);
    if (!Number.isInteger(grade)) return null;
    return { ...profile, grade };
  }

  private async getAllEmployees() {
    const statusEntity = await this.prisma.entity.findUnique({
      where: { code: 'STATUS-KERJA-KARYAWAN' },
    });
    const positionEntity = await this.prisma.entity.findUnique({
      where: { code: 'JABATAN' },
    });
    if (!statusEntity || !positionEntity) return [];
    const [statusFields, positionFields] = await Promise.all([
      this.prisma.field.findMany({
        where: {
          entityId: statusEntity.id,
          code: {
            in: [
              'NRP',
              'JABATAN',
              'STATUS',
              'PERUSAHAAN',
              'PROJECT',
              'DEPARTEMEN',
              'DIVISI',
            ],
          },
        },
      }),
      this.prisma.field.findMany({
        where: {
          entityId: positionEntity.id,
          code: { in: ['JABATAN', 'GRADE'] },
        },
      }),
    ]);
    const statusNrp = statusFields.find((field) => field.code === 'NRP');
    const statusPosition = statusFields.find(
      (field) => field.code === 'JABATAN',
    );
    const statusState = statusFields.find((field) => field.code === 'STATUS');
    const companyField = statusFields.find(
      (field) => field.code === 'PERUSAHAAN',
    );
    const projectField = statusFields.find((field) => field.code === 'PROJECT');
    const departmentField = statusFields.find(
      (field) => field.code === 'DEPARTEMEN',
    );
    const divisionField = statusFields.find((field) => field.code === 'DIVISI');
    const positionGrade = positionFields.find(
      (field) => field.code === 'GRADE',
    );
    if (!statusNrp || !statusPosition || !positionGrade) return [];

    const [statusValues, gradeValues] = await Promise.all([
      this.prisma.value.findMany({
        where: { entityId: statusEntity.id, dateEnd: null },
      }),
      this.prisma.value.findMany({
        where: {
          entityId: positionEntity.id,
          fieldId: positionGrade.id,
          dateEnd: null,
        },
      }),
    ]);
    const gradeByPosition = new Map(
      gradeValues.map((value) => [value.recordCode, Number(value.value)]),
    );

    const rows = new Map<string, Record<number, string | null>>();
    for (const value of statusValues) {
      const row = rows.get(value.recordCode) ?? {};
      row[value.fieldId] = value.value;
      rows.set(value.recordCode, row);
    }
    const employees: {
      nrp: string;
      grade: number;
      company: string;
      project: string;
      department: string;
      division: string;
    }[] = [];
    for (const row of rows.values()) {
      const nrp = row[statusNrp.id];
      if (!nrp) continue;
      if (
        statusState &&
        row[statusState.id] &&
        !['ACTIVE', 'AKTIF'].includes(row[statusState.id]!.toUpperCase())
      )
        continue;
      const positionCode = row[statusPosition.id];
      const grade = positionCode
        ? gradeByPosition.get(positionCode)
        : undefined;
      if (!grade || !Number.isInteger(grade)) continue;
      employees.push({
        nrp,
        grade,
        company: (companyField && row[companyField.id]) || '',
        project: (projectField && row[projectField.id]) || '',
        department: (departmentField && row[departmentField.id]) || '',
        division: (divisionField && row[divisionField.id]) || '',
      });
    }
    return employees;
  }

  // ===================== DATA PERSETUJUAN (concrete) =====================
  async initApprovalData(
    entityCode: string,
    recordCode: string,
    requesterNrp: string,
  ) {
    const config = await this.getApprovalConfig(entityCode);
    if (!config.length) {
      throw new NotFoundException(
        `Belum ada konfigurasi approval untuk '${entityCode}'`,
      );
    }
    const existing = await this.prisma.databaseDataPersetujuan.findFirst({
      where: { codeForm: entityCode, codeData: recordCode },
    });
    if (existing) {
      throw new ConflictException('Approval untuk record ini sudah ada');
    }

    for (const step of config) {
      const approvers = await this.resolveApprover(step.group, requesterNrp);
      if (!approvers.length) continue;
      for (const nrp of approvers) {
        const isRequester = (step.level === 'LEVEL-1' || step.group === 'NRP') && nrp === requesterNrp;
        await this.prisma.databaseDataPersetujuan.create({
          data: {
            codeForm: entityCode,
            codeData: recordCode,
            level: step.level,
            nrp,
            status: isRequester ? 'ACC' : null,
            dateChange: isRequester ? new Date() : null,
          },
        });
      }
    }
    return this.listApprovalData(entityCode, recordCode);
  }

  async listApprovalData(entityCode: string, recordCode: string) {
    return this.prisma.databaseDataPersetujuan.findMany({
      where: { codeForm: entityCode, codeData: recordCode },
      orderBy: [{ level: 'asc' }, { nrp: 'asc' }],
    });
  }

  async pendingApprovals(nrp: string) {
    return this.prisma.databaseDataPersetujuan.findMany({
      where: { nrp, status: null },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async approve(id: number, action: 'ACC' | 'DECLINE') {
    const row = await this.prisma.databaseDataPersetujuan.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException('Data persetujuan tidak ditemukan');
    if (row.status !== null) throw new ConflictException('Data sudah diproses');
    await this.prisma.databaseDataPersetujuan.update({
      where: { id },
      data: { status: action, dateChange: new Date() },
    });
    return this.prisma.databaseDataPersetujuan.findUnique({ where: { id } });
  }
}
