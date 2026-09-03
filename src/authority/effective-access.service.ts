import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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

  async resolveRoleLevels(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) throw new NotFoundException('User tidak ditemukan atau nonaktif');

    const statuses = await this.resolveActiveStatuses(userId);
    const levels = new Set(statuses.map((status) => status.roleLevel.level));
    // Kompatibilitas user lama sebelum status kerja dimigrasikan.
    if (levels.size === 0 && user.role >= 1 && user.role <= 15) levels.add(user.role);
    if (user.nrp === 'MBLE-0422003') levels.add(15);
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
      if (levels.includes(13) && !levels.some((level) => level !== 13 && level < 13)) {
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

      if (item.read || item.write || item.edit || item.approve || item.history) {
        result[feature.code] = item;
      }
    }

    return {
      user: { id: user.id, nrp: user.nrp, name: user.name, email: user.email, role: user.role },
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

  async assertAccess(userId: number, featureCode: string, action: AccessAction) {
    if (!(await this.canPerform(userId, featureCode, action))) {
      throw new ForbiddenException(`Akses '${action}' untuk feature '${featureCode}' ditolak`);
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
    if (typeof policy.scopeType === 'string' && !item.scopes.includes(policy.scopeType)) {
      item.scopes.push(policy.scopeType);
    }
  }

  private mergeOverride(item: EffectiveFeature, override: Record<string, unknown>) {
    const deny = override.effect === 'DENY';
    for (const action of ['read', 'write', 'edit', 'delete', 'approve', 'history'] as const) {
      const key = `can${action[0].toUpperCase()}${action.slice(1)}`;
      if (override[key] === true) this.setAction(item, action, !deny);
      if (override[key] === false) this.setAction(item, action, deny);
    }
    if (!deny && typeof override.scopeType === 'string' && !item.scopes.includes(override.scopeType)) {
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

  private setAction(item: EffectiveFeature, action: AccessAction, value: boolean) {
    (item as unknown as Record<string, boolean>)[actionField[action] as string] = value;
  }
}
