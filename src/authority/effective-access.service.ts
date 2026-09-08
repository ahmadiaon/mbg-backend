import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const ACCESS_ACTIONS = [
  'read',
  'write',
  'edit',
  'delete',
  'import',
  'export',
  'submit',
  'approve',
  'reject',
  'history',
  'restore',
] as const;

export type AccessAction = (typeof ACCESS_ACTIONS)[number];

type EffectiveFeature = {
  code: string;
  name: string;
  route: string | null;
  icon: string | null;
  menuGroup: string | null;
  sort: number;
  read: boolean;
  write: boolean;
  edit: boolean;
  delete: boolean;
  import: boolean;
  export: boolean;
  submit: boolean;
  approve: boolean;
  reject: boolean;
  history: boolean;
  restore: boolean;
  scopes: string[];
};

const actionField: Record<AccessAction, keyof EffectiveFeature> = {
  read: 'read',
  write: 'write',
  edit: 'edit',
  delete: 'delete',
  import: 'import',
  export: 'export',
  submit: 'submit',
  approve: 'approve',
  reject: 'reject',
  history: 'history',
  restore: 'restore',
};

@Injectable()
export class EffectiveAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveActiveStatuses(userId: number) {
    const today = new Date();
    return this.prisma.employmentStatus.findMany({
      where: {
        userId,
        statusCode: 'ACTIVE',
        startDate: { lte: today },
        OR: [{ endDate: null }, { endDate: { gte: today } }],
      },
      include: {
        roleLevel: true,
        company: true,
        project: true,
        department: true,
        division: true,
        position: true,
      },
      orderBy: [{ isPrimary: 'desc' }, { startDate: 'desc' }],
    });
  }

  async syncRoleLevelsFromGrades() {
    const entity = await this.prisma.entity.findUnique({
      where: { code: 'GRADE' },
    });
    if (!entity) return;
    const fields = await this.prisma.field.findMany({
      where: {
        entityId: entity.id,
        code: { in: ['GRADE', 'DESKRIPSI-LEVEL-GRADE'] },
      },
    });
    const gradeField = fields.find((field) => field.code === 'GRADE');
    const descField = fields.find(
      (field) => field.code === 'DESKRIPSI-LEVEL-GRADE',
    );
    if (!gradeField) return;
    const values = await this.prisma.value.findMany({
      where: {
        entityId: entity.id,
        fieldId: { in: [gradeField.id, ...(descField ? [descField.id] : [])] },
        dateEnd: null,
      },
    });
    const rows = new Map<string, { grade?: string; desc?: string }>();
    for (const value of values) {
      const row = rows.get(value.recordCode) ?? {};
      if (value.fieldId === gradeField.id) row.grade = value.value;
      else if (descField && value.fieldId === descField.id)
        row.desc = value.value;
      rows.set(value.recordCode, row);
    }
    for (const [recordCode, row] of rows) {
      const level = Number(row.grade ?? recordCode);
      if (!Number.isInteger(level) || level < 1 || level > 15) continue;
      await this.prisma.roleLevel.upsert({
        where: { level },
        update: {
          code: recordCode,
          name: row.desc || row.grade || recordCode,
          description: row.desc || null,
          active: true,
        },
        create: {
          level,
          code: recordCode,
          name: row.desc || row.grade || recordCode,
          description: row.desc || null,
        },
      });
    }
  }

  async resolveScopeContext(userId: number) {
    const { user, levels } = await this.resolveRoleLevels(userId);
    const nrp = user.nrp;
    if (levels.includes(14) || levels.includes(15)) {
      return {
        unrestricted: true,
        nrp,
        scopeType: 'ALL_COMPANIES',
        companies: [],
        projects: [],
        departments: [],
        divisions: [],
      };
    }
    const access = await this.resolveEffectiveAccess(userId);
    const scopes = access.features['DATABASE']?.scopes ?? [];
    const scopeType = this.widestScope(scopes);
    if (scopeType === 'ALL_COMPANIES') {
      return {
        unrestricted: true,
        nrp,
        scopeType,
        companies: [],
        projects: [],
        departments: [],
        divisions: [],
      };
    }
    const org = await this.resolveUserOrgUnits(nrp);
    return { unrestricted: false, nrp, scopeType, ...org };
  }

  async resolveUserOrgUnits(nrp: string) {
    const entity = await this.prisma.entity.findUnique({
      where: { code: 'STATUS-KERJA-KARYAWAN' },
    });
    const empty = {
      companies: [],
      projects: [],
      departments: [],
      divisions: [],
    };
    if (!entity) return empty;
    const fields = await this.prisma.field.findMany({
      where: {
        entityId: entity.id,
        code: {
          in: [
            'NRP',
            'STATUS',
            'PERUSAHAAN',
            'PROJECT',
            'DEPARTEMEN',
            'DIVISI',
          ],
        },
      },
    });
    const nrpField = fields.find((field) => field.code === 'NRP');
    const statusField = fields.find((field) => field.code === 'STATUS');
    const companyField = fields.find((field) => field.code === 'PERUSAHAAN');
    const projectField = fields.find((field) => field.code === 'PROJECT');
    const departmentField = fields.find((field) => field.code === 'DEPARTEMEN');
    const divisionField = fields.find((field) => field.code === 'DIVISI');
    if (!nrpField) return empty;
    const values = await this.prisma.value.findMany({
      where: {
        entityId: entity.id,
        fieldId: {
          in: [
            nrpField.id,
            ...(statusField ? [statusField.id] : []),
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
    for (const value of values) {
      const row = rows.get(value.recordCode) ?? {};
      row[value.fieldId] = value.value;
      rows.set(value.recordCode, row);
    }
    const companies = new Set<string>();
    const projects = new Set<string>();
    const departments = new Set<string>();
    const divisions = new Set<string>();
    for (const row of rows.values()) {
      if (row[nrpField.id] !== nrp) continue;
      if (
        statusField &&
        row[statusField.id] &&
        !['ACTIVE', 'AKTIF'].includes(row[statusField.id]!.toUpperCase())
      )
        continue;
      if (companyField && row[companyField.id])
        companies.add(row[companyField.id]!);
      if (projectField && row[projectField.id])
        projects.add(row[projectField.id]!);
      if (departmentField && row[departmentField.id])
        departments.add(row[departmentField.id]!);
      if (divisionField && row[divisionField.id])
        divisions.add(row[divisionField.id]!);
    }
    return {
      companies: [...companies],
      projects: [...projects],
      departments: [...departments],
      divisions: [...divisions],
    };
  }

  async resolveVisibleNrps(
    scopeType: string,
    org: {
      companies: string[];
      projects: string[];
      departments: string[];
      divisions: string[];
    },
  ) {
    const dimension = this.scopeDimension(scopeType);
    if (!dimension) return null;
    const codes = org[dimension.key];
    if (!codes.length) return new Set<string>();
    const entity = await this.prisma.entity.findUnique({
      where: { code: 'STATUS-KERJA-KARYAWAN' },
    });
    if (!entity) return new Set<string>();
    const fields = await this.prisma.field.findMany({
      where: { entityId: entity.id, code: { in: ['NRP', dimension.field] } },
    });
    const nrpField = fields.find((field) => field.code === 'NRP');
    const dimField = fields.find((field) => field.code === dimension.field);
    if (!nrpField || !dimField) return new Set<string>();
    const values = await this.prisma.value.findMany({
      where: {
        entityId: entity.id,
        fieldId: { in: [nrpField.id, dimField.id] },
        dateEnd: null,
      },
    });
    const rows = new Map<string, Record<number, string | null>>();
    for (const value of values) {
      const row = rows.get(value.recordCode) ?? {};
      row[value.fieldId] = value.value;
      rows.set(value.recordCode, row);
    }
    const nrps = new Set<string>();
    for (const row of rows.values()) {
      if (
        row[nrpField.id] &&
        row[dimField.id] &&
        codes.includes(row[dimField.id]!)
      ) {
        nrps.add(row[nrpField.id]!);
      }
    }
    return nrps;
  }

  private scopeDimension(scopeType: string) {
    switch (scopeType) {
      case 'COMPANY':
        return { key: 'companies', field: 'PERUSAHAAN' } as const;
      case 'PROJECT':
        return { key: 'projects', field: 'PROJECT' } as const;
      case 'DEPARTMENT':
        return { key: 'departments', field: 'DEPARTEMEN' } as const;
      case 'DIVISION':
        return { key: 'divisions', field: 'DIVISI' } as const;
      default:
        return null;
    }
  }

  private widestScope(scopes: string[]) {
    const rank: Record<string, number> = {
      SELF: 0,
      DIVISION: 1,
      DEPARTMENT: 2,
      PROJECT: 3,
      COMPANY: 4,
      ALL_COMPANIES: 5,
    };
    let best = 'SELF';
    let bestRank = -1;
    for (const scope of scopes) {
      const r = rank[scope] ?? -1;
      if (r > bestRank) {
        best = scope;
        bestRank = r;
      }
    }
    return best;
  }

  async resolveRoleLevels(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.active)
      throw new NotFoundException('User tidak ditemukan atau nonaktif');

    const statuses = await this.resolveActiveStatuses(userId);
    const levels = new Set(statuses.map((status) => status.roleLevel.level));
    if (levels.size === 0) {
      const grades = await this.resolveGradesFromEav(user.nrp);
      for (const grade of grades) levels.add(grade);
    }
    return {
      user: {
        id: user.id,
        nrp: user.nrp,
        name: user.name,
        email: user.email,
        role: user.role,
        active: user.active,
      },
      statuses,
      levels: [...levels].sort((a, b) => a - b),
    };
  }

  private async resolveGradesFromEav(nrp: string): Promise<number[]> {
    const statusEntity = await this.prisma.entity.findUnique({
      where: { code: 'STATUS-KERJA-KARYAWAN' },
    });
    const position = await this.prisma.entity.findUnique({
      where: { code: 'JABATAN' },
    });
    if (!statusEntity || !position) return [];
    const [statusFields, positionFields] = await Promise.all([
      this.prisma.field.findMany({
        where: {
          entityId: statusEntity.id,
          code: { in: ['NRP', 'JABATAN', 'STATUS'] },
        },
      }),
      this.prisma.field.findMany({
        where: { entityId: position.id, code: { in: ['JABATAN', 'GRADE'] } },
      }),
    ]);
    const statusNrp = statusFields.find((field) => field.code === 'NRP');
    const statusPosition = statusFields.find(
      (field) => field.code === 'JABATAN',
    );
    const statusState = statusFields.find((field) => field.code === 'STATUS');
    const positionKey = positionFields.find(
      (field) => field.code === 'JABATAN',
    );
    const positionGrade = positionFields.find(
      (field) => field.code === 'GRADE',
    );
    if (!statusNrp || !statusPosition || !positionKey || !positionGrade)
      return [];
    const statusValues = await this.prisma.value.findMany({
      where: {
        entityId: statusEntity.id,
        fieldId: {
          in: [
            statusNrp.id,
            statusPosition.id,
            ...(statusState ? [statusState.id] : []),
          ],
        },
        dateEnd: null,
      },
    });
    const positions = new Set<string>();
    const rows = new Map<string, Record<number, string | null>>();
    for (const value of statusValues) {
      const row = rows.get(value.recordCode) ?? {};
      row[value.fieldId] = value.value;
      rows.set(value.recordCode, row);
    }
    for (const row of rows.values()) {
      if (row[statusNrp.id] !== nrp) continue;
      if (
        statusState &&
        row[statusState.id] &&
        !['ACTIVE', 'AKTIF'].includes(row[statusState.id]!.toUpperCase())
      )
        continue;
      if (row[statusPosition.id]) positions.add(row[statusPosition.id]!);
    }
    if (!positions.size) return [];
    const gradeValues = await this.prisma.value.findMany({
      where: {
        entityId: position.id,
        fieldId: positionGrade.id,
        recordCode: { in: [...positions] },
        dateEnd: null,
      },
    });
    return gradeValues
      .map((value) => Number(value.value))
      .filter((level) => Number.isInteger(level) && level >= 1 && level <= 15);
  }

  async resolveEffectiveAccess(userId: number) {
    const { user, statuses, levels } = await this.resolveRoleLevels(userId);
    const features = await this.prisma.featureDefinition.findMany({
      where: { active: true },
      include: {
        policies: {
          where: { active: true, employmentStatusCode: 'ACTIVE' },
          include: { roleLevel: true },
        },
        overrides: {
          where: {
            userId,
            active: true,
            OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
          },
        },
      },
      orderBy: [{ sort: 'asc' }, { code: 'asc' }],
    });

    const result: Record<string, EffectiveFeature> = {};
    for (const feature of features) {
      const item = this.emptyFeature(feature);
      for (const policy of feature.policies) {
        if (!levels.includes(policy.roleLevel.level)) continue;
        this.mergePolicy(item, policy);
      }

      for (const override of feature.overrides) {
        this.mergeOverride(item, override);
      }

      // Role 13 selalu read-only walaupun memiliki scope luas.
      if (
        levels.includes(13) &&
        !levels.some((level) => level !== 13 && level < 13)
      ) {
        this.setReadOnly(item);
      }

      if (levels.includes(14) || levels.includes(15)) {
        item.read = true;
        item.history = true;
      }
      if (levels.includes(15)) {
        item.write = true;
        item.edit = true;
        item.delete = true;
        item.import = true;
        item.export = true;
        item.submit = true;
        item.restore = true;
      }

      if (
        item.read ||
        item.write ||
        item.edit ||
        item.approve ||
        item.history
      ) {
        result[feature.code] = item;
      }
    }

    return {
      user: {
        id: user.id,
        nrp: user.nrp,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      roleLevels: levels,
      statuses: statuses.map((status) => ({
        id: status.id,
        statusCode: status.statusCode,
        roleLevel: status.roleLevel.level,
        position: status.position?.code ?? null,
        company: status.company?.code ?? null,
        project: status.project?.code ?? null,
        department: status.department?.code ?? null,
        division: status.division?.code ?? null,
        startDate: status.startDate,
        endDate: status.endDate,
      })),
      features: result,
    };
  }

  async canPerform(userId: number, featureCode: string, action: AccessAction) {
    const access = await this.resolveEffectiveAccess(userId);
    return Boolean(access.features[featureCode]?.[actionField[action]]);
  }

  async assertAccess(
    userId: number,
    featureCode: string,
    action: AccessAction,
  ) {
    if (!(await this.canPerform(userId, featureCode, action))) {
      throw new ForbiddenException(
        `Akses '${action}' untuk feature '${featureCode}' ditolak`,
      );
    }
  }

  private emptyFeature(feature: {
    code: string;
    name: string;
    route: string | null;
    icon: string | null;
    menuGroup: string | null;
    sort: number;
  }): EffectiveFeature {
    return {
      code: feature.code,
      name: feature.name,
      route: feature.route,
      icon: feature.icon,
      menuGroup: feature.menuGroup,
      sort: feature.sort,
      read: false,
      write: false,
      edit: false,
      delete: false,
      import: false,
      export: false,
      submit: false,
      approve: false,
      reject: false,
      history: false,
      restore: false,
      scopes: [],
    };
  }

  private mergePolicy(item: EffectiveFeature, policy: Record<string, unknown>) {
    for (const action of ACCESS_ACTIONS) {
      const key = `can${action[0].toUpperCase()}${action.slice(1)}`;
      if (policy[key] === true) this.setAction(item, action, true);
    }
    if (
      typeof policy.scopeType === 'string' &&
      !item.scopes.includes(policy.scopeType)
    ) {
      item.scopes.push(policy.scopeType);
    }
  }

  private mergeOverride(
    item: EffectiveFeature,
    override: Record<string, unknown>,
  ) {
    const deny = override.effect === 'DENY';
    for (const action of [
      'read',
      'write',
      'edit',
      'delete',
      'approve',
      'history',
    ] as const) {
      const key = `can${action[0].toUpperCase()}${action.slice(1)}`;
      if (override[key] === true) this.setAction(item, action, !deny);
      if (override[key] === false) this.setAction(item, action, deny);
    }
    if (
      !deny &&
      typeof override.scopeType === 'string' &&
      !item.scopes.includes(override.scopeType)
    ) {
      item.scopes.push(override.scopeType);
    }
  }

  private setReadOnly(item: EffectiveFeature) {
    item.write = false;
    item.edit = false;
    item.delete = false;
    item.import = false;
    item.export = false;
    item.submit = false;
    item.approve = false;
    item.reject = false;
    item.restore = false;
  }

  private setAction(
    item: EffectiveFeature,
    action: AccessAction,
    value: boolean,
  ) {
    (item as unknown as Record<string, boolean>)[
      actionField[action] as string
    ] = value;
  }
}
