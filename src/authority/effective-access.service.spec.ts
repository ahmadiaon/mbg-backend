import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { EffectiveAccessService } from './effective-access.service';
import { PrismaService } from '../prisma/prisma.service';

describe('EffectiveAccessService', () => {
  let service: EffectiveAccessService;

  const prisma = {
    user: { findUnique: jest.fn() },
    entity: { findUnique: jest.fn() },
    field: { findMany: jest.fn() },
    value: { findMany: jest.fn() },
    employmentStatus: { findMany: jest.fn() },
    featureDefinition: { findMany: jest.fn() },
    roleLevel: { upsert: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EffectiveAccessService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(EffectiveAccessService);
  });

  describe('resolveRoleLevels (sumber role dari GRADE/status kerja)', () => {
    it('mengambil grade dari status kerja aktif multi-jabatan', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        nrp: 'X-001',
        name: 'A',
        email: 'a@x',
        role: 5,
        active: true,
      });
      prisma.employmentStatus.findMany.mockResolvedValue([
        { roleLevel: { level: 3 } },
        { roleLevel: { level: 8 } },
      ]);

      const result = await service.resolveRoleLevels(1);
      expect(result.levels).toEqual([3, 8]);
    });

    it('fallback ke GRADE EAV saat tidak ada status kerja aktif', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        nrp: 'X-001',
        name: 'A',
        email: 'a@x',
        role: 5,
        active: true,
      });
      prisma.employmentStatus.findMany.mockResolvedValue([]);

      const statusEntity = { id: 10, code: 'STATUS-KERJA-KARYAWAN' };
      const positionEntity = { id: 20, code: 'JABATAN' };
      prisma.entity.findUnique.mockImplementation(({ where }) =>
        where.code === 'STATUS-KERJA-KARYAWAN' ? statusEntity : positionEntity,
      );

      const nrpField = { id: 101, code: 'NRP' };
      const posField = { id: 102, code: 'JABATAN' };
      const stateField = { id: 103, code: 'STATUS' };
      const posKey = { id: 201, code: 'JABATAN' };
      const posGrade = { id: 202, code: 'GRADE' };
      prisma.field.findMany.mockImplementation(({ where }) =>
        where.entityId === 10
          ? [nrpField, posField, stateField]
          : [posKey, posGrade],
      );

      prisma.value.findMany.mockImplementation(({ where }) => {
        if (where.entityId === 10) {
          return [
            { fieldId: 101, recordCode: 'st-1', value: 'X-001' },
            { fieldId: 102, recordCode: 'st-1', value: 'POS-A' },
            { fieldId: 103, recordCode: 'st-1', value: 'AKTIF' },
            { fieldId: 101, recordCode: 'st-2', value: 'X-001' },
            { fieldId: 102, recordCode: 'st-2', value: 'POS-B' },
            { fieldId: 103, recordCode: 'st-2', value: 'AKTIF' },
          ];
        }
        return [{ value: '4' }, { value: '9' }];
      });

      const result = await service.resolveRoleLevels(1);
      expect(result.levels).toEqual([4, 9]);
    });

    it('mengabaikan status kerja non-aktif (bukan ACTIVE/AKTIF)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        nrp: 'X-001',
        name: 'A',
        email: 'a@x',
        role: 5,
        active: true,
      });
      prisma.employmentStatus.findMany.mockResolvedValue([]);

      prisma.entity.findUnique.mockImplementation(({ where }) =>
        where.code === 'STATUS-KERJA-KARYAWAN' ? { id: 10 } : { id: 20 },
      );
      const nrpField = { id: 101, code: 'NRP' };
      const posField = { id: 102, code: 'JABATAN' };
      const stateField = { id: 103, code: 'STATUS' };
      prisma.field.findMany.mockImplementation(({ where }) =>
        where.entityId === 10
          ? [nrpField, posField, stateField]
          : [
              { id: 201, code: 'JABATAN' },
              { id: 202, code: 'GRADE' },
            ],
      );
      prisma.value.findMany.mockImplementation(({ where }) => {
        if (where.entityId === 10) {
          return [
            { fieldId: 101, recordCode: 'st-1', value: 'X-001' },
            { fieldId: 102, recordCode: 'st-1', value: 'POS-A' },
            { fieldId: 103, recordCode: 'st-1', value: 'BERHENTI' },
          ];
        }
        return [];
      });

      const result = await service.resolveRoleLevels(1);
      expect(result.levels).toEqual([]);
    });

    it('tidak memakai user.role sebagai sumber role', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        nrp: 'X-001',
        name: 'A',
        email: 'a@x',
        role: 15,
        active: true,
      });
      prisma.employmentStatus.findMany.mockResolvedValue([]);
      prisma.entity.findUnique.mockImplementation(({ where }) =>
        where.code === 'STATUS-KERJA-KARYAWAN' ? { id: 10 } : { id: 20 },
      );
      prisma.field.findMany.mockImplementation(({ where }) =>
        where.entityId === 10
          ? [
              { id: 101, code: 'NRP' },
              { id: 102, code: 'JABATAN' },
              { id: 103, code: 'STATUS' },
            ]
          : [
              { id: 201, code: 'JABATAN' },
              { id: 202, code: 'GRADE' },
            ],
      );
      prisma.value.findMany.mockResolvedValue([]);

      const result = await service.resolveRoleLevels(1);
      expect(result.levels).toEqual([]);
    });

    it('melempar NotFound untuk user nonaktif', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1, active: false });
      await expect(service.resolveRoleLevels(1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('resolveUserOrgUnits', () => {
    it('mengumpulkan unit organisasi user dari STATUS-KERJA-KARYAWAN aktif', async () => {
      prisma.entity.findUnique.mockResolvedValue({
        id: 30,
        code: 'STATUS-KERJA-KARYAWAN',
      });
      const nrp = { id: 301, code: 'NRP' };
      const status = { id: 302, code: 'STATUS' };
      const company = { id: 303, code: 'PERUSAHAAN' };
      const project = { id: 304, code: 'PROJECT' };
      const department = { id: 305, code: 'DEPARTEMEN' };
      const division = { id: 306, code: 'DIVISI' };
      prisma.field.findMany.mockResolvedValue([
        nrp,
        status,
        company,
        project,
        department,
        division,
      ]);
      prisma.value.findMany.mockResolvedValue([
        { fieldId: 301, recordCode: 's1', value: 'X-001' },
        { fieldId: 302, recordCode: 's1', value: 'AKTIF' },
        { fieldId: 303, recordCode: 's1', value: 'PT--MBLE' },
        { fieldId: 304, recordCode: 's1', value: 'MBG' },
        { fieldId: 305, recordCode: 's1', value: 'HRGA' },
        { fieldId: 306, recordCode: 's1', value: 'HRGA' },
        { fieldId: 301, recordCode: 's2', value: 'X-001' },
        { fieldId: 302, recordCode: 's2', value: 'AKTIF' },
        { fieldId: 304, recordCode: 's2', value: 'PENDANG' },
      ]);

      const result = await service.resolveUserOrgUnits('X-001');
      expect(result.companies).toEqual(['PT--MBLE']);
      expect(result.projects.sort()).toEqual(['MBG', 'PENDANG']);
      expect(result.departments).toEqual(['HRGA']);
      expect(result.divisions).toEqual(['HRGA']);
    });
  });

  describe('resolveVisibleNrps', () => {
    it('mengembalikan NRP yang berada di unit organisasi scope', async () => {
      prisma.entity.findUnique.mockResolvedValue({
        id: 30,
        code: 'STATUS-KERJA-KARYAWAN',
      });
      prisma.field.findMany.mockResolvedValue([
        { id: 301, code: 'NRP' },
        { id: 306, code: 'DIVISI' },
      ]);
      prisma.value.findMany.mockResolvedValue([
        { fieldId: 301, recordCode: 'r1', value: 'X-001' },
        { fieldId: 306, recordCode: 'r1', value: 'HRGA' },
        { fieldId: 301, recordCode: 'r2', value: 'X-002' },
        { fieldId: 306, recordCode: 'r2', value: 'HRGA' },
        { fieldId: 301, recordCode: 'r3', value: 'X-003' },
        { fieldId: 306, recordCode: 'r3', value: 'MINE' },
      ]);

      const result = await service.resolveVisibleNrps('DIVISION', {
        companies: [],
        projects: [],
        departments: [],
        divisions: ['HRGA'],
      });
      expect([...result!].sort()).toEqual(['X-001', 'X-002']);
    });

    it('mengembalikan null untuk scope SELF/ALL', async () => {
      const result = await service.resolveVisibleNrps('SELF', {
        companies: [],
        projects: [],
        departments: [],
        divisions: [],
      });
      expect(result).toBeNull();
    });
  });

  describe('syncRoleLevelsFromGrades', () => {
    it('menyinkronkan RoleLevel dari GRADE EAV', async () => {
      prisma.entity.findUnique.mockResolvedValue({ id: 1, code: 'GRADE' });
      const gradeField = { id: 11, code: 'GRADE' };
      const descField = { id: 12, code: 'DESKRIPSI-LEVEL-GRADE' };
      prisma.field.findMany.mockResolvedValue([gradeField, descField]);
      prisma.value.findMany.mockResolvedValue([
        { fieldId: 11, recordCode: '4', value: '4' },
        { fieldId: 12, recordCode: '4', value: 'Koordinator Area' },
        { fieldId: 11, recordCode: '8', value: '8' },
        { fieldId: 12, recordCode: '8', value: 'Kepala Project' },
      ]);

      await service.syncRoleLevelsFromGrades();

      expect(prisma.roleLevel.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.roleLevel.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { level: 4 },
          update: expect.objectContaining({ name: 'Koordinator Area' }),
        }),
      );
    });

    it('tidak melakukan apa pun jika entity GRADE tidak ada', async () => {
      prisma.entity.findUnique.mockResolvedValue(null);
      await service.syncRoleLevelsFromGrades();
      expect(prisma.roleLevel.upsert).not.toHaveBeenCalled();
    });
  });
});
