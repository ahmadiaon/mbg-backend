import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
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

  // GRADE adalah sumber kebenaran level otoritas dan dapat diedit dari Database/Data.
  const gradeEntity = await prisma.entity.upsert({
    where: { code: 'GRADE' },
    update: { name: 'Grade', primaryCode: 'GRADE', active: true },
    create: { code: 'GRADE', name: 'Grade', menu: 'DATABASE', primaryCode: 'GRADE' },
  });
  const gradeField = await prisma.field.upsert({
    where: { entityId_code: { entityId: gradeEntity.id, code: 'GRADE' } },
    update: { name: 'Grade', type: 'TEXT', sort: 1 },
    create: { entityId: gradeEntity.id, code: 'GRADE', name: 'Grade', fullCode: 'GRADE-GRADE', type: 'TEXT', sort: 1 },
  });
  const gradeDescriptionField = await prisma.field.upsert({
    where: { entityId_code: { entityId: gradeEntity.id, code: 'DESKRIPSI-LEVEL-GRADE' } },
    update: { name: 'Deskripsi Level Grade', type: 'TEXT', sort: 2 },
    create: { entityId: gradeEntity.id, code: 'DESKRIPSI-LEVEL-GRADE', name: 'Deskripsi Level Grade', fullCode: 'GRADE-DESKRIPSI-LEVEL-GRADE', type: 'TEXT', sort: 2 },
  });
  const initialGrades: Array<[string, string]> = [
    ['1', 'Karyawan'], ['2', 'Group Leader'], ['3', 'Admin Divisi'], ['4', 'Koordinator Divisi'],
    ['5', 'Admin Departemen'], ['6', 'Kepala Departemen'], ['7', 'Admin Project'], ['8', 'Kepala Project'],
    ['9', 'Admin/Staf Perusahaan'], ['10', 'Kepala Perusahaan'], ['11', 'Staf HO'],
    ['12', 'Kepala/General Manager'], ['13', 'Owner'], ['14', 'Super User'], ['15', 'Super User Utama'],
  ];
  for (const [gradeCode, description] of initialGrades) {
    for (const [fieldId, value] of [[gradeField.id, gradeCode], [gradeDescriptionField.id, description]] as const) {
      const existing = await prisma.value.findFirst({ where: { entityId: gradeEntity.id, fieldId, recordCode: gradeCode, dateEnd: null } });
      if (existing) await prisma.value.update({ where: { id: existing.id }, data: { value } });
      else await prisma.value.create({ data: { entityId: gradeEntity.id, fieldId, recordCode: gradeCode, recordUuid: `grade-${gradeCode}`, value } });
    }
  }

  const gradeValues = await prisma.value.findMany({
    where: { entityId: gradeEntity.id, fieldId: gradeField.id, dateEnd: null },
  });
  for (const grade of gradeValues) {
    const level = Number(grade.value ?? grade.recordCode);
    if (!Number.isInteger(level) || level < 1 || level > 15) continue;
    const description = (await prisma.value.findFirst({
      where: { entityId: gradeEntity.id, fieldId: gradeDescriptionField.id, recordCode: grade.recordCode, dateEnd: null },
    }))?.value;
    await prisma.roleLevel.upsert({
      where: { level },
      update: { code: grade.recordCode, name: description || grade.value || grade.recordCode, description: description || null, active: true },
      create: { level, code: grade.recordCode, name: description || grade.value || grade.recordCode, description: description || null },
    });
  }

  const primarySuperUser = await prisma.roleLevel.findUnique({ where: { level: 15 } });
  if (primarySuperUser) {
    const existingOwnerStatus = await prisma.employmentStatus.findFirst({
      where: { userId: user.id, roleLevelId: primarySuperUser.id, statusCode: 'ACTIVE' },
    });
    if (!existingOwnerStatus) {
      await prisma.employmentStatus.create({
        data: {
          userId: user.id,
          employeeNrp: user.nrp,
          roleLevelId: primarySuperUser.id,
          statusCode: 'ACTIVE',
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          isPrimary: true,
        },
      });
    }
  }

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

  const legacyFeatureRules: Record<string, { minLevel: number; scopeType: string }> = {
    ATTENDANCE: { minLevel: 2, scopeType: 'DIVISION' },
    PAYROLL: { minLevel: 2, scopeType: 'DIVISION' },
    RECRUITMENT: { minLevel: 2, scopeType: 'DIVISION' },
    'FILE-MANAGER': { minLevel: 2, scopeType: 'DIVISION' },
    'WATER-LEVEL': { minLevel: 1, scopeType: 'DIVISION' },
    ORGANIZATION: { minLevel: 1, scopeType: 'DIVISION' },
  };

  for (const [featureCode, rule] of Object.entries(legacyFeatureRules)) {
    const feature = featureByCode.get(featureCode);
    if (!feature) continue;
    for (let level = rule.minLevel; level <= 13; level++) {
      const roleLevel = roleByLevel.get(level);
      if (!roleLevel) continue;
      await prisma.featureAccessPolicy.upsert({
        where: {
          featureId_roleLevelId_employmentStatusCode: {
            featureId: feature.id,
            roleLevelId: roleLevel.id,
            employmentStatusCode: 'ACTIVE',
          },
        },
        update: {
          canRead: true,
          canWrite: level !== 13,
          canEdit: level !== 13,
          canViewHistory: level >= 3,
          scopeType: level >= 11 ? 'ALL_COMPANIES' : rule.scopeType,
        },
        create: {
          featureId: feature.id,
          roleLevelId: roleLevel.id,
          employmentStatusCode: 'ACTIVE',
          canRead: true,
          canWrite: level !== 13,
          canEdit: level !== 13,
          canViewHistory: level >= 3,
          scopeType: level >= 11 ? 'ALL_COMPANIES' : rule.scopeType,
        },
      });
    }
  }

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

  // Master jenis perubahan tetap EAV agar dapat dikelola dari Database/Data.
  const changeEntity = await prisma.entity.upsert({
    where: { code: 'PERUBAHAN-STATUS' },
    update: { primaryCode: 'KODE', active: true },
    create: { code: 'PERUBAHAN-STATUS', name: 'Perubahan Status', menu: 'DATABASE', primaryCode: 'KODE' },
  });
  const changeFields = [
    ['TABEL', 'Tabel', 'TEXT', 1],
    ['JENIS-PERUBAHAN', 'Jenis Perubahan', 'TEXT', 2],
    ['DESKRIPSI', 'Deskripsi', 'TEXT', 3],
    ['KODE', 'Kode', 'TEXT', 4],
  ] as const;
  const changeFieldIds = new Map<string, number>();
  for (const [code, name, type, sort] of changeFields) {
    const field = await prisma.field.upsert({
      where: { entityId_code: { entityId: changeEntity.id, code } },
      update: { name, type, sort },
      create: { entityId: changeEntity.id, code, name, fullCode: `PERUBAHAN-STATUS-${code}`, type, sort },
    });
    changeFieldIds.set(code, field.id);
  }
  const changeTypes = [
    ['KARYAWAN-MUTASI', 'KARYAWAN', 'MUTASI', 'Perpindahan karyawan'],
    ['KARYAWAN-PROMOSI', 'KARYAWAN', 'PROMOSI', 'Perubahan jabatan ke level lebih tinggi'],
    ['KARYAWAN-PERPANJANGAN', 'KARYAWAN', 'PERPANJANGAN', 'Perpanjangan masa kerja'],
    ['UNIT-MUTASI', 'UNIT', 'MUTASI', 'Perpindahan unit'],
    ['UNIT-PENGGANTIAN', 'UNIT', 'PENGGANTIAN', 'Penggantian unit'],
  ] as const;
  for (const [code, table, type, description] of changeTypes) {
    for (const [fieldCode, value] of [['TABEL', table], ['JENIS-PERUBAHAN', type], ['DESKRIPSI', description], ['KODE', code]] as const) {
      const existing = await prisma.value.findFirst({ where: { entityId: changeEntity.id, fieldId: changeFieldIds.get(fieldCode), recordCode: code, dateEnd: null } });
      if (existing) await prisma.value.update({ where: { id: existing.id }, data: { value } });
      else await prisma.value.create({ data: { entityId: changeEntity.id, fieldId: changeFieldIds.get(fieldCode)!, recordCode: code, recordUuid: `change-${code}`, value } });
    }
  }

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
