import { PrismaClient } from '@prisma/client';
import * as mysql from 'mysql2/promise';

const OLD_DB = {
  host: '127.0.0.1',
  user: 'root',
  password: '',
  database: 'mbg_old',
};

const ASSETS_BASE = 'https://assets.mitrabaritogroup.com/uploads/slips/';

const prisma = new PrismaClient();

// Sama dengan ResponseFormatter::toUUID di sistem lama (slug, bukan UUID)
function slugify(s: string): string {
  return s
    .replace(/[^A-Za-z0-9\-_&]/g, ' ')
    .replace(/[./_ ]/g, '-')
    .toUpperCase();
}

async function main() {
  const old = await mysql.createConnection(OLD_DB);
  console.log('✅ Terhubung ke DB lama (mbg_old)');

  // 1. Bangun map slug -> raw NRP dari tabel user
  const users = await prisma.user.findMany({ select: { nrp: true } });
  const rawBySlug = new Map<string, string>();
  for (const u of users) {
    rawBySlug.set(slugify(u.nrp), u.nrp);
  }
  console.log(`👤 User untuk mapping: ${users.length}`);

  // 2. Ambil slip
  const [rows] = await old.query(
    'SELECT nrp, code_file, year, month, original_file FROM slips',
  );
  console.log(`📄 Slips di DB lama: ${(rows as any[]).length}`);

  let mapped = 0;
  let unmapped = 0;
  const data: any[] = [];
  for (const s of rows as any[]) {
    const slug = slugify(s.nrp ?? '');
    const raw = rawBySlug.get(slug);
    if (!raw || !s.year || !s.month) {
      unmapped++;
      continue;
    }
    data.push({
      employeeNrp: raw,
      year: Number(s.year),
      month: Number(s.month),
      codeFile: s.code_file ?? `${raw}-${s.year}-${s.month}`,
      fileUrl: s.original_file ? `${ASSETS_BASE}${s.original_file}` : null,
    });
    mapped++;
  }
  console.log(`🧮 Dipetakan: ${mapped}, dilewati: ${unmapped}`);

  // 3. Insert per batch (skip duplikat)
  const BATCH = 5000;
  for (let i = 0; i < data.length; i += BATCH) {
    const chunk = data.slice(i, i + BATCH);
    await prisma.payslip.createMany({ data: chunk, skipDuplicates: true });
    console.log(`   inserted ${Math.min(i + BATCH, data.length)}/${data.length}`);
  }

  await old.end();

  const count = await prisma.payslip.count();
  console.log(`=== MIGRASI SLIPS SELESAI. Total di payslip: ${count} ===`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
