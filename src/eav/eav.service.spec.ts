import { Test, TestingModule } from '@nestjs/testing';
import { EavService } from './eav.service';
import { PrismaService } from '../prisma/prisma.service';
import { EffectiveAccessService } from '../authority/effective-access.service';
import { SchemaCacheService } from './schema-cache.service';

const schemaCache = {
  get: jest.fn(),
  set: jest.fn(),
  invalidate: jest.fn(),
};

describe('EavService.getRecords (scope filter)', () => {
  let service: EavService;

  const access = {
    resolveScopeContext: jest.fn(),
    resolveVisibleNrps: jest.fn(),
    syncRoleLevelsFromGrades: jest.fn(),
  };

  const prisma = {
    entity: { findUnique: jest.fn() },
    value: { findMany: jest.fn(), findFirst: jest.fn() },
    field: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EavService,
        { provide: PrismaService, useValue: prisma },
        { provide: EffectiveAccessService, useValue: access },
        { provide: SchemaCacheService, useValue: schemaCache },
      ],
    }).compile();
    service = module.get(EavService);
  });

  function mockEntity(fields: { code: string }[]) {
    prisma.entity.findUnique.mockResolvedValue({
      id: 1,
      code: 'KARYAWAN',
      fields: fields.map((field, index) => ({ id: index + 1, ...field })),
    });
  }

  function mockValues(
    rows: Array<{ recordCode: string; values: Record<string, string> }>,
  ) {
    const values: any[] = [];
    for (const row of rows) {
      for (const [code, value] of Object.entries(row.values)) {
        values.push({
          recordCode: row.recordCode,
          recordUuid: `${row.recordCode}-u`,
          field: { code },
          value,
        });
      }
    }
    prisma.value.findMany.mockResolvedValue(values);
  }

  it('mengembalikan semua record saat unrestricted (role 14/15 atau ALL_COMPANIES)', async () => {
    mockEntity([{ code: 'NRP' }]);
    mockValues([
      { recordCode: 'A', values: { NRP: 'A' } },
      { recordCode: 'B', values: { NRP: 'B' } },
    ]);
    access.resolveScopeContext.mockResolvedValue({
      unrestricted: true,
      nrp: 'A',
      scopeType: 'ALL_COMPANIES',
    });

    const result = await service.getRecords('KARYAWAN', 1);
    expect(result.map((r) => r.recordCode).sort()).toEqual(['A', 'B']);
  });

  it('SELF: hanya record milik sendiri', async () => {
    mockEntity([{ code: 'NRP' }]);
    mockValues([
      { recordCode: 'A', values: { NRP: 'A' } },
      { recordCode: 'B', values: { NRP: 'B' } },
    ]);
    access.resolveScopeContext.mockResolvedValue({
      unrestricted: false,
      nrp: 'A',
      scopeType: 'SELF',
    });

    const result = await service.getRecords('KARYAWAN', 1);
    expect(result.map((r) => r.recordCode)).toEqual(['A']);
  });

  it('DIVISION: record dengan DIVISI sesuai scope + record sendiri', async () => {
    mockEntity([{ code: 'NRP' }, { code: 'DIVISI' }]);
    mockValues([
      { recordCode: 'A', values: { NRP: 'A', DIVISI: 'HRGA' } },
      { recordCode: 'B', values: { NRP: 'B', DIVISI: 'MINE' } },
    ]);
    access.resolveScopeContext.mockResolvedValue({
      unrestricted: false,
      nrp: 'A',
      scopeType: 'DIVISION',
      divisions: ['HRGA'],
    });

    const result = await service.getRecords('KARYAWAN', 1);
    expect(result.map((r) => r.recordCode)).toEqual(['A']);
  });

  it('DIVISION tanpa field DIVISI: filter lewat resolveVisibleNrps', async () => {
    mockEntity([{ code: 'NRP' }]);
    mockValues([
      { recordCode: 'A', values: { NRP: 'A' } },
      { recordCode: 'B', values: { NRP: 'B' } },
    ]);
    access.resolveScopeContext.mockResolvedValue({
      unrestricted: false,
      nrp: 'A',
      scopeType: 'DIVISION',
      divisions: ['HRGA'],
    });
    access.resolveVisibleNrps.mockResolvedValue(new Set(['A', 'B']));

    const result = await service.getRecords('KARYAWAN', 1);
    expect(result.map((r) => r.recordCode).sort()).toEqual(['A', 'B']);
  });

  it('master lookup tanpa field scope: tetap dikembalikan semua', async () => {
    mockEntity([{ code: 'AGAMA' }]);
    mockValues([
      { recordCode: 'ISLAM', values: { AGAMA: 'Islam' } },
      { recordCode: 'KRISTEN', values: { AGAMA: 'Kristen' } },
    ]);
    access.resolveScopeContext.mockResolvedValue({
      unrestricted: false,
      nrp: 'A',
      scopeType: 'DIVISION',
    });

    const result = await service.getRecords('DATABASE-AGAMA', 1);
    expect(result.map((r) => r.recordCode).sort()).toEqual([
      'ISLAM',
      'KRISTEN',
    ]);
  });

  it('tanpa userId: tidak ada filter', async () => {
    mockEntity([{ code: 'NRP' }]);
    mockValues([
      { recordCode: 'A', values: { NRP: 'A' } },
      { recordCode: 'B', values: { NRP: 'B' } },
    ]);

    const result = await service.getRecords('KARYAWAN');
    expect(result.map((r) => r.recordCode).sort()).toEqual(['A', 'B']);
    expect(access.resolveScopeContext).not.toHaveBeenCalled();
  });
});

describe('EavService.recordExists', () => {
  let service: EavService;

  const access = {
    resolveScopeContext: jest.fn(),
    resolveVisibleNrps: jest.fn(),
    syncRoleLevelsFromGrades: jest.fn(),
  };

  const prisma = {
    entity: { findUnique: jest.fn() },
    value: { findFirst: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EavService,
        { provide: PrismaService, useValue: prisma },
        { provide: EffectiveAccessService, useValue: access },
        { provide: SchemaCacheService, useValue: schemaCache },
      ],
    }).compile();
    service = module.get(EavService);
  });

  it('mengembalikan true jika record sudah ada', async () => {
    prisma.entity.findUnique.mockResolvedValue({
      id: 1,
      code: 'KARYAWAN',
      fields: [],
    });
    prisma.value.findFirst.mockResolvedValue({ id: 1 });

    await expect(service.recordExists('KARYAWAN', 'A')).resolves.toBe(true);
  });

  it('mengembalikan false jika record belum ada', async () => {
    prisma.entity.findUnique.mockResolvedValue({
      id: 1,
      code: 'KARYAWAN',
      fields: [],
    });
    prisma.value.findFirst.mockResolvedValue(null);

    await expect(service.recordExists('KARYAWAN', 'B')).resolves.toBe(false);
  });
});
