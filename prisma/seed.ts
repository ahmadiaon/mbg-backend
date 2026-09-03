import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const roleDescriptions: Record<number, [string, string]> = {
    1: ['EMPLOYEE', 'Karyawan; akses data sendiri'],
    2: ['GROUP_LEADER', 'Group Leader; operasional berdasarkan status kerja'],
    3: ['DIVISION_ADMIN', 'Admin Divisi; input dan pengelolaan data divisi'],
    4: ['DIVISION_COORDINATOR', 'Koordinator Divisi; persetujuan level divisi'],
    5: ['DEPARTMENT_ADMIN', 'Admin Departemen; input dan pengelolaan data departemen'],
    6: ['DEPARTMENT_HEAD', 'Kepala Departemen; persetujuan level departemen'],
    7: ['PROJECT_ADMIN', 'Admin Project; input dan pengelolaan data project'],
    8: ['PROJECT_HEAD', 'Kepala Project; persetujuan level project'],
    9: ['COMPANY_ADMIN', 'Admin atau staf perusahaan; input dan pengelolaan data perusahaan'],
    10: ['COMPANY_HEAD', 'Kepala Perusahaan; persetujuan level perusahaan'],
    11: ['HEAD_OFFICE_STAFF', 'Staf HO; akses lintas perusahaan sesuai policy'],
    12: ['GENERAL_MANAGER', 'Kepala atau General Manager; otoritas lintas perusahaan'],
    13: ['OWNER', 'Owner; melihat data bisnis tanpa mengubah data'],
    14: ['SUPER_USER', 'Super User; mengelola konfigurasi dan role 1 sampai 14'],
    15: ['PRIMARY_SUPER_USER', 'Super User Utama; otoritas sistem tertinggi'],
  };

  for (const [levelText, [code, description]] of Object.entries(roleDescriptions)) {
    const level = Number(levelText);
    await prisma.roleLevel.upsert({
      where: { level },
      update: { code, name: code.replaceAll('_', ' '), description, active: true },
      create: { level, code, name: code.replaceAll('_', ' '), description },
    });
  }

  // 1. User auth (NRP + NIK saat login pertama)
  const nik = '3273012345678901';
  const password = await bcrypt.hash(nik, 10);

  const user = await prisma.user.upsert({
    where: { nrp: 'MBLE-0422003' },
    update: {},
    create: {
      nrp: 'MBLE-0422003',
      name: 'Ahmadi (Test)',
      email: 'test@mitrabarito.com',
      password,
      role: 5,
    },
  });

  // Role 15 hanya satu: pemilik sistem dengan NRP tetap.
  await prisma.user.updateMany({
    where: { role: 15, NOT: { nrp: 'MBLE-0422003' } },
    data: { role: 14 },
  });
  await prisma.user.update({
    where: { nrp: 'MBLE-0422003' },
    data: { role: 15 },
  });

  // Feature dasar yang dapat dipakai sebagai seed policy berikutnya.
  const features = [
    ['DATABASE', 'Database', '/database/data', 'bi-database'],
    ['ATTENDANCE', 'Absensi', '/manage/absensi', 'bi-calendar-check'],
    ['PAYROLL', 'Payroll', '/payroll/slip', 'bi-journal-bookmark'],
    ['RECRUITMENT', 'Recruitment', '/manage/recruitment', 'bi-person-plus'],
    ['FILE-MANAGER', 'File Manager', '/manage/file-manager', 'bi-folder'],
    ['WATER-LEVEL', 'Water Level', '/feature/water-level', 'bi-water'],
    ['HISTORICAL-DATA', 'Historical Data', '/database/data', 'bi-clock-history'],
    ['ORGANIZATION', 'Organisasi', '/struktur-organisasi', 'bi-diagram-3'],
  ] as const;
  for (const [code, name, route, icon] of features) {
    await prisma.featureDefinition.upsert({
      where: { code },
      update: { name, route, icon, active: true },
      create: { code, name, route, icon },
    });
  }

  const featureRows = await prisma.featureDefinition.findMany({
    where: { code: { in: features.map(([code]) => code) } },
  });
  const featureByCode = new Map(featureRows.map((feature) => [feature.code, feature]));
  const roleByLevel = new Map(
    (await prisma.roleLevel.findMany({ where: { level: { gte: 1, lte: 15 } } })).map((role) => [role.level, role]),
  );
  const approvalLevels = new Set([4, 6, 8, 10, 12]);

  for (const level of Array.from({ length: 13 }, (_, i) => i + 1)) {
    const roleLevel = roleByLevel.get(level);
    if (!roleLevel) continue;
    const database = featureByCode.get('DATABASE');
    const historical = featureByCode.get('HISTORICAL-DATA');
    if (database) {
      await prisma.featureAccessPolicy.upsert({
        where: {
          featureId_roleLevelId_employmentStatusCode: {
            featureId: database.id,
            roleLevelId: roleLevel.id,
            employmentStatusCode: 'ACTIVE',
          },
        },
        update: { canRead: true, canWrite: level >= 2 && level !== 13, canEdit: level >= 2 && level !== 13, canViewHistory: level >= 3, scopeType: level === 1 ? 'SELF' : 'DIVISION' },
        create: {
          featureId: database.id,
          roleLevelId: roleLevel.id,
          employmentStatusCode: 'ACTIVE',
          canRead: true,
          canWrite: level >= 2 && level !== 13,
          canEdit: level >= 2 && level !== 13,
          canViewHistory: level >= 3,
          scopeType: level === 1 ? 'SELF' : 'DIVISION',
        },
      });
    }
    if (historical) {
      await prisma.featureAccessPolicy.upsert({
        where: {
          featureId_roleLevelId_employmentStatusCode: {
            featureId: historical.id,
            roleLevelId: roleLevel.id,
            employmentStatusCode: 'ACTIVE',
          },
        },
        update: {
          canRead: true,
          canWrite: level >= 2 && level !== 13,
          canEdit: level >= 2 && level !== 13,
          canSubmit: level >= 2 && level !== 13,
          canApprove: approvalLevels.has(level),
          canReject: approvalLevels.has(level),
          canViewHistory: true,
          scopeType: level === 1 ? 'SELF' : level >= 11 ? 'ALL_COMPANIES' : 'DIVISION',
        },
        create: {
          featureId: historical.id,
          roleLevelId: roleLevel.id,
          employmentStatusCode: 'ACTIVE',
          canRead: true,
          canWrite: level >= 2 && level !== 13,
          canEdit: level >= 2 && level !== 13,
          canSubmit: level >= 2 && level !== 13,
          canApprove: approvalLevels.has(level),
          canReject: approvalLevels.has(level),
          canViewHistory: true,
          scopeType: level === 1 ? 'SELF' : level >= 11 ? 'ALL_COMPANIES' : 'DIVISION',
        },
      });
    }
  }

  // 2. Demo EAV: entitas KARYAWAN (dinamis — field bisa ditambah kapan saja)
  const entity = await prisma.entity.upsert({
    where: { code: 'KARYAWAN' },
    update: {},
    create: {
      code: 'KARYAWAN',
      name: 'Karyawan',
      menu: 'HR',
      primaryCode: 'NRP',
    },
  });

  const fieldNrp = await prisma.field.upsert({
    where: { entityId_code: { entityId: entity.id, code: 'NRP' } },
    update: {},
    create: {
      entityId: entity.id,
      code: 'NRP',
      name: 'NRP',
      fullCode: 'KARYAWAN-NRP',
      type: 'TEXT',
      sort: 1,
    },
  });

  const fieldNama = await prisma.field.upsert({
    where: { entityId_code: { entityId: entity.id, code: 'NAMA-KARYAWAN' } },
    update: {},
    create: {
      entityId: entity.id,
      code: 'NAMA-KARYAWAN',
      name: 'Nama Karyawan',
      fullCode: 'KARYAWAN-NAMA-KARYAWAN',
      type: 'TEXT',
      sort: 2,
    },
  });

  // 3. Data karyawan (EAV) — satu record = recordCode 'MBLE-0422003'
  const existingNrp = await prisma.value.findFirst({
    where: { entityId: entity.id, fieldId: fieldNrp.id, recordCode: 'MBLE-0422003' },
  });
  if (!existingNrp) {
    await prisma.value.create({
      data: {
        entityId: entity.id,
        fieldId: fieldNrp.id,
        recordCode: 'MBLE-0422003',
        recordUuid: 'demo-uuid-1',
        value: 'MBLE-0422003',
      },
    });
  }

  const existingNama = await prisma.value.findFirst({
    where: { entityId: entity.id, fieldId: fieldNama.id, recordCode: 'MBLE-0422003' },
  });
  if (!existingNama) {
    await prisma.value.create({
      data: {
        entityId: entity.id,
        fieldId: fieldNama.id,
        recordCode: 'MBLE-0422003',
        recordUuid: 'demo-uuid-1',
        value: 'Ahmadi',
      },
    });
  }

  console.log('✅ User:', user.nrp, '(NIK =', nik + ')');
  console.log('✅ EAV demo: entitas', entity.code, 'dengan field NRP & NAMA-KARYAWAN + 1 record');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
