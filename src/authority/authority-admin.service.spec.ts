import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AuthorityAdminService } from './authority-admin.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthorityAdminService', () => {
  let service: AuthorityAdminService;

  const prisma = {
    user: { findUnique: jest.fn() },
    roleLevel: { findUnique: jest.fn(), findMany: jest.fn() },
    entity: { findUnique: jest.fn() },
    field: { findFirst: jest.fn() },
    value: { findFirst: jest.fn() },
    employmentStatus: {
      count: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
    },
    featureDefinition: { findUnique: jest.fn(), findMany: jest.fn() },
    featureAccessPolicy: { upsert: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthorityAdminService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(AuthorityAdminService);
  });

  describe('createEmploymentStatus', () => {
    it('menghitung role dari positionCode (JABATAN.GRADE)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        nrp: 'X-001',
        name: 'A',
      });
      prisma.entity.findUnique.mockResolvedValue({ id: 20, code: 'JABATAN' });
      prisma.field.findFirst.mockResolvedValue({ id: 202, code: 'GRADE' });
      prisma.value.findFirst.mockResolvedValue({ value: '8' });
      prisma.roleLevel.findUnique.mockResolvedValue({
        id: 8,
        level: 8,
        code: '8',
      });
      prisma.employmentStatus.count.mockResolvedValue(0);
      prisma.employmentStatus.create.mockResolvedValue({ id: 1 });

      await service.createEmploymentStatus({
        userId: 1,
        positionCode: 'POS-A',
        startDate: '2026-01-01',
      });

      expect(prisma.employmentStatus.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ roleLevelId: 8 }),
        }),
      );
    });

    it('menolak jika jabatan belum punya GRADE', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        nrp: 'X-001',
        name: 'A',
      });
      prisma.entity.findUnique.mockResolvedValue({ id: 20, code: 'JABATAN' });
      prisma.field.findFirst.mockResolvedValue({ id: 202, code: 'GRADE' });
      prisma.value.findFirst.mockResolvedValue(null);

      await expect(
        service.createEmploymentStatus({
          userId: 1,
          positionCode: 'POS-A',
          startDate: '2026-01-01',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('menolak roleLevel di luar 1-15 saat fallback manual', async () => {
      await expect(
        service.createEmploymentStatus({
          userId: 1,
          roleLevel: 20,
          startDate: '2026-01-01',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('hanya boleh satu status aktif grade 15', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 2,
        nrp: 'X-002',
        name: 'B',
      });
      prisma.entity.findUnique.mockResolvedValue({ id: 20, code: 'JABATAN' });
      prisma.field.findFirst.mockResolvedValue({ id: 202, code: 'GRADE' });
      prisma.value.findFirst.mockResolvedValue({ value: '15' });
      prisma.roleLevel.findUnique.mockResolvedValue({
        id: 15,
        level: 15,
        code: '15',
      });
      prisma.employmentStatus.count.mockResolvedValue(1);

      await expect(
        service.createEmploymentStatus({
          userId: 2,
          positionCode: 'POS-X',
          startDate: '2026-01-01',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('menolak jika user tidak ditemukan', async () => {
      prisma.entity.findUnique.mockResolvedValue({ id: 20, code: 'JABATAN' });
      prisma.field.findFirst.mockResolvedValue({ id: 202, code: 'GRADE' });
      prisma.value.findFirst.mockResolvedValue({ value: '8' });
      prisma.roleLevel.findUnique.mockResolvedValue({
        id: 8,
        level: 8,
        code: '8',
      });
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.createEmploymentStatus({
          userId: 999,
          positionCode: 'POS-A',
          startDate: '2026-01-01',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
