import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface OrgNodeWithDetails {
  id: number;
  code: string;
  title: string;
  department: string | null;
  division: string | null;
  company: string | null;
  grade: number;
  gradeName: string;
  parentId: number | null;
  parentTitle: string | null;
  employeeNrp: string | null;
  employeeName: string | null;
  sortOrder: number;
  active: boolean;
  children?: OrgNodeWithDetails[];
}

@Injectable()
export class OrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Mengambil daftar master Grade (Role Level 1 - 15)
   */
  async getGrades() {
    return this.prisma.roleLevel.findMany({
      where: { active: true },
      orderBy: { level: 'asc' },
      select: {
        id: true,
        level: true,
        code: true,
        name: true,
        description: true,
      },
    });
  }

  /**
   * Mengambil seluruh posisi / node dengan detail terlampir
   */
  async getPositions(filter?: { company?: string; department?: string; search?: string }) {
    const where: Record<string, unknown> = { active: true };

    if (filter?.company && filter.company !== 'ALL') {
      where.company = { in: [filter.company, 'ALL'] };
    }
    if (filter?.department && filter.department !== 'ALL') {
      where.department = filter.department;
    }
    if (filter?.search) {
      where.OR = [
        { title: { contains: filter.search } },
        { department: { contains: filter.search } },
        { employeeNrp: { contains: filter.search } },
      ];
    }

    const [nodes, roleLevels, users] = await Promise.all([
      this.prisma.orgStructure.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { grade: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.roleLevel.findMany({ select: { level: true, name: true } }),
      this.prisma.user.findMany({ select: { nrp: true, name: true, role: true } }),
    ]);

    const gradeMap = new Map<number, string>();
    roleLevels.forEach((r) => gradeMap.set(r.level, r.name));

    const userMap = new Map<string, { name: string; role: number }>();
    users.forEach((u) => userMap.set(u.nrp, { name: u.name, role: u.role }));

    const nodeTitleMap = new Map<number, string>();
    nodes.forEach((n) => nodeTitleMap.set(n.id, n.title));

    const result: OrgNodeWithDetails[] = nodes.map((n) => {
      const userInfo = n.employeeNrp ? userMap.get(n.employeeNrp) : undefined;
      return {
        id: n.id,
        code: n.code,
        title: n.title,
        department: n.department,
        division: n.division,
        company: n.company,
        grade: n.grade,
        gradeName: gradeMap.get(n.grade) || `Grade ${n.grade}`,
        parentId: n.parentId,
        parentTitle: n.parentId ? (nodeTitleMap.get(n.parentId) || null) : null,
        employeeNrp: n.employeeNrp,
        employeeName: userInfo?.name || null,
        sortOrder: n.sortOrder,
        active: n.active,
      };
    });

    return result;
  }

  /**
   * Mengambil struktur pohon (hierarchical tree)
   */
  async getTree(filter?: { company?: string; department?: string; search?: string }) {
    const flatList = await this.getPositions(filter);

    // Build hierarchical tree
    const map = new Map<number, OrgNodeWithDetails>();
    const roots: OrgNodeWithDetails[] = [];

    flatList.forEach((item) => {
      map.set(item.id, { ...item, children: [] });
    });

    flatList.forEach((item) => {
      const node = map.get(item.id)!;
      if (item.parentId && map.has(item.parentId)) {
        map.get(item.parentId)!.children!.push(node);
      } else {
        roots.push(node);
      }
    });

    return {
      roots,
      totalPositions: flatList.length,
      flatList,
    };
  }

  /**
   * Tambah node / jabatan baru
   */
  async createNode(data: {
    code?: string;
    title: string;
    department?: string;
    division?: string;
    company?: string;
    grade: number;
    parentId?: number | null;
    employeeNrp?: string | null;
    sortOrder?: number;
    syncUserRole?: boolean;
  }) {
    const code =
      data.code ||
      'POS-' +
        (data.department ? data.department.substring(0, 4).toUpperCase() + '-' : '') +
        Date.now().toString(36).toUpperCase();

    const created = await this.prisma.orgStructure.create({
      data: {
        code,
        title: data.title,
        department: data.department || null,
        division: data.division || null,
        company: data.company || 'ALL',
        grade: Number(data.grade) || 1,
        parentId: data.parentId ? Number(data.parentId) : null,
        employeeNrp: data.employeeNrp || null,
        sortOrder: Number(data.sortOrder) || 0,
        active: true,
      },
    });

    // Jika diminta sinkronisasi role akun user:
    if (data.syncUserRole && data.employeeNrp) {
      await this.syncEmployeeRole(data.employeeNrp, Number(data.grade));
    }

    return created;
  }

  /**
   * Update node / posisi (termasuk Grade dan Pejabat)
   */
  async updateNode(
    id: number,
    data: {
      title?: string;
      department?: string;
      division?: string;
      company?: string;
      grade?: number;
      parentId?: number | null;
      employeeNrp?: string | null;
      sortOrder?: number;
      syncUserRole?: boolean;
    },
  ) {
    const existing = await this.prisma.orgStructure.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Posisi dengan ID ${id} tidak ditemukan`);
    }

    const updated = await this.prisma.orgStructure.update({
      where: { id },
      data: {
        title: data.title ?? existing.title,
        department: data.department !== undefined ? data.department : existing.department,
        division: data.division !== undefined ? data.division : existing.division,
        company: data.company !== undefined ? data.company : existing.company,
        grade: data.grade !== undefined ? Number(data.grade) : existing.grade,
        parentId: data.parentId !== undefined ? (data.parentId ? Number(data.parentId) : null) : existing.parentId,
        employeeNrp: data.employeeNrp !== undefined ? data.employeeNrp : existing.employeeNrp,
        sortOrder: data.sortOrder !== undefined ? Number(data.sortOrder) : existing.sortOrder,
      },
    });

    // Sinkronisasi User Role jika opsi aktif
    const targetNrp = data.employeeNrp !== undefined ? data.employeeNrp : existing.employeeNrp;
    const targetGrade = data.grade !== undefined ? Number(data.grade) : existing.grade;
    if (data.syncUserRole && targetNrp) {
      await this.syncEmployeeRole(targetNrp, targetGrade);
    }

    return updated;
  }

  /**
   * Hapus node posisi (hubungkan anak ke parent dari node yang dihapus agar hierarki tidak putus)
   */
  async deleteNode(id: number) {
    const existing = await this.prisma.orgStructure.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Posisi dengan ID ${id} tidak ditemukan`);
    }

    // Sambungkan bawahan ke parent dari node ini
    await this.prisma.orgStructure.updateMany({
      where: { parentId: id },
      data: { parentId: existing.parentId },
    });

    // Hapus node
    return this.prisma.orgStructure.delete({ where: { id } });
  }

  /**
   * Penugasan karyawan (Assign)
   */
  async assignEmployee(id: number, employeeNrp: string | null, syncUserRole = true) {
    const node = await this.prisma.orgStructure.findUnique({ where: { id } });
    if (!node) {
      throw new NotFoundException(`Posisi dengan ID ${id} tidak ditemukan`);
    }

    const updated = await this.prisma.orgStructure.update({
      where: { id },
      data: { employeeNrp },
    });

    if (syncUserRole && employeeNrp) {
      await this.syncEmployeeRole(employeeNrp, node.grade);
    }

    return updated;
  }

  /**
   * Sinkronisasi User Role di tabel User
   */
  private async syncEmployeeRole(nrp: string, grade: number) {
    try {
      const user = await this.prisma.user.findFirst({ where: { nrp } });
      if (user) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { role: grade },
        });
      }
    } catch (e) {
      console.warn(`Gagal sinkronisasi role untuk NRP ${nrp}:`, e);
    }
  }

  /**
   * Lookup daftar karyawan untuk dipilih di dropdown autocomplete
   */
  async getEmployeesLookup() {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        nrp: true,
        name: true,
        role: true,
      },
      orderBy: { name: 'asc' },
    });

    return users.map((u) => ({
      nrp: u.nrp,
      name: u.name,
      currentRole: u.role,
    }));
  }
}
