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
