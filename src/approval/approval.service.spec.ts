import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ApprovalService } from './approval.service';
import { PrismaService } from '../prisma/prisma.service';
import { SchemaCacheService } from '../eav/schema-cache.service';

describe('ApprovalService', () => {
  let service: ApprovalService;

  const prisma = {
    entity: { findUnique: jest.fn() },
    field: { findMany: jest.fn() },
    value: { findMany: jest.fn(), findFirst: jest.fn() },
    databasePersetujuan: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    databaseDataPersetujuan: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const schemaCache = {
    get: jest.fn(),
    set: jest.fn(),
    invalidate: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApprovalService,
        { provide: PrismaService, useValue: prisma },
        { provide: SchemaCacheService, useValue: schemaCache },
      ],
    }).compile();
    service = module.get(ApprovalService);
  });

  describe('getApprovalConfig', () => {
    it('membaca config dari tabel database_persetujuans dan mengurutkan by level', async () => {
      prisma.databasePersetujuan.findMany.mockResolvedValue([
        {
          formCode: 'KEHADIRAN',
          level: 'LEVEL-1',
          grade: 'NRP',
          description: 'DIAJUKAN-OLEH-',
          reference: 'NRP',
        },
        {
          formCode: 'KEHADIRAN',
          level: 'LEVEL-2',
          grade: 'ATASAN-LANGSUNG',
          description: 'DISETUJUI-OLEH-',
          reference: 'NRP',
        },
      ]);

      const result = await service.getApprovalConfig('KEHADIRAN');
      expect(result).toHaveLength(2);
      expect(result[0].level).toBe('LEVEL-1');
      expect(result[0].group).toBe('NRP');
      expect(result[1].level).toBe('LEVEL-2');
      expect(result[1].description).toBe('DISETUJUI-OLEH-');
    });

    it('mengembalikan array kosong jika tidak ada config', async () => {
      prisma.databasePersetujuan.findMany.mockResolvedValue([]);

      await expect(service.getApprovalConfig('KEHADIRAN')).resolves.toEqual([]);
    });
  });

  describe('resolveApprover', () => {
    it('NRP mengembalikan requester itu sendiri', async () => {
      await expect(service.resolveApprover('NRP', 'X-001')).resolves.toEqual([
        'X-001',
      ]);
    });

    it('group tidak dikenal mengembalikan array kosong', async () => {
      await expect(service.resolveApprover('RANDOM', 'X-001')).resolves.toEqual(
        [],
      );
    });
  });

  describe('initApprovalData', () => {
    it('menolak jika belum ada config', async () => {
      jest.spyOn(service, 'getApprovalConfig').mockResolvedValue([]);
      await expect(
        service.initApprovalData('KEHADIRAN', 'rec-1', 'X-001'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('menolak jika approval sudah ada', async () => {
      jest.spyOn(service, 'getApprovalConfig').mockResolvedValue([
        {
          tabel: 'KEHADIRAN',
          level: 'LEVEL-1',
          group: 'NRP',
          description: 'DIAJUKAN-OLEH-',
          reference: 'NRP',
        },
      ]);
      prisma.databaseDataPersetujuan.findFirst.mockResolvedValue({ id: 1 });
      await expect(
        service.initApprovalData('KEHADIRAN', 'rec-1', 'X-001'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('membuat data approval per level', async () => {
      jest.spyOn(service, 'getApprovalConfig').mockResolvedValue([
        {
          tabel: 'KEHADIRAN',
          level: 'LEVEL-1',
          group: 'NRP',
          description: 'DIAJUKAN-OLEH-',
          reference: 'NRP',
        },
      ]);
      prisma.databaseDataPersetujuan.findFirst.mockResolvedValue(null);
      prisma.databaseDataPersetujuan.create.mockResolvedValue({ id: 1 });
      prisma.databaseDataPersetujuan.findMany.mockResolvedValue([
        { id: 1, level: 'LEVEL-1' },
      ]);

      await service.initApprovalData('KEHADIRAN', 'rec-1', 'X-001');

      expect(prisma.databaseDataPersetujuan.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          codeForm: 'KEHADIRAN',
          codeData: 'rec-1',
          level: 'LEVEL-1',
          nrp: 'X-001',
        }),
      });
    });
  });

  describe('approve', () => {
    it('menolak jika data sudah diproses', async () => {
      prisma.databaseDataPersetujuan.findUnique.mockResolvedValue({
        id: 1,
        status: 'ACC',
      });
      await expect(service.approve(1, 'ACC')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('menolak jika data tidak ditemukan', async () => {
      prisma.databaseDataPersetujuan.findUnique.mockResolvedValue(null);
      await expect(service.approve(999, 'ACC')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
