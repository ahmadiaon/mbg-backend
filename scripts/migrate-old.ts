import { PrismaClient } from '@prisma/client';
import * as mysql from 'mysql2/promise';

const OLD_DB = {
  host: '127.0.0.1',
  port: 3306,
  user: 'root',
  password: '',
  database: 'mbg_old',
};

const prisma = new PrismaClient();

function toInt(v: unknown, fallback = 0): number {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isNaN(n) ? fallback : n;
}

function toDate(v: unknown): Date | null {
  if (v == null || v === '' || v === '0000-00-00' || v === '0000-00-00 00:00:00') return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

// PHP bcrypt memakai prefix $2y$; bcryptjs memakai $2b$ (identik secara algoritma).
function normBcrypt(h: unknown): string | null {
  const s = String(h ?? '');
  if (!s) return null;
  return s.startsWith('$2y$') ? '$2b$' + s.slice(4) : s;
}

async function main() {
  const old = await mysql.createConnection(OLD_DB);
  console.log('✅ Terhubung ke DB lama (mbg_old)');

  // ===== 0. BERSIHKAN data EAV baru (agar idempoten) =====
  await prisma.value.deleteMany();
  await prisma.dataSource.deleteMany();
  await prisma.field.deleteMany();
  await prisma.entity.deleteMany();
  await prisma.fieldShow.deleteMany();
  await prisma.userTemplate.deleteMany();
  await prisma.groupForm.deleteMany();
  console.log('🧹 Data EAV baru dibersihkan');

  // ===== 1. ENTITIES (database_tables) =====
  const [oldEntities] = await old.query('SELECT * FROM database_tables');
  const entityIdByCode = new Map<string, number>();
  for (const e of oldEntities as any[]) {
    if (!e.code_table) continue;
    const created = await prisma.entity.upsert({
      where: { code: e.code_table },
      update: {},
      create: {
        code: e.code_table,
        name: e.description_table ?? e.code_table,
        menu: e.menu_table ?? null,
        primaryCode: e.primary_table ?? null,
      },
    });
    entityIdByCode.set(e.code_table, created.id);
  }
  console.log(`📦 Entitas: ${entityIdByCode.size}`);

  // parent (second pass)
  for (const e of oldEntities as any[]) {
    if (e.parent_table && entityIdByCode.has(e.parent_table)) {
      await prisma.entity.update({
        where: { code: e.code_table },
        data: { parentId: entityIdByCode.get(e.parent_table) },
      });
    }
  }

  // ===== 2. FIELDS (database_fields) =====
  const [oldFields] = await old.query('SELECT * FROM database_fields');
  const fieldIdByKey = new Map<string, number>();
  for (const f of oldFields as any[]) {
    const entityId = entityIdByCode.get(f.code_table_field);
    if (!entityId || !f.code_field) continue;
    const created = await prisma.field.upsert({
      where: { entityId_code: { entityId, code: f.code_field } },
      update: {},
      create: {
        entityId,
        code: f.code_field,
        name: f.description_field ?? f.code_field,
        fullCode: f.full_code_field ?? `${f.code_table_field}-${f.code_field}`,
        type: f.type_data_field ?? 'TEXT',
        level: toInt(f.level_data_field, 1),
        sort: toInt(f.sort_field, 0),
        visibility: f.visibility_data_field ?? null,
      },
    });
    fieldIdByKey.set(`${f.code_table_field}:${f.code_field}`, created.id);
  }
  console.log(`📦 Fields: ${fieldIdByKey.size}`);

  // ===== 3. VALUES (database_data) =====
  const [oldValues] = await old.query('SELECT * FROM database_data');
  const valueRows: any[] = [];
  let skipped = 0;
  for (const v of oldValues as any[]) {
    const entityId = entityIdByCode.get(v.code_table_data);
    if (!entityId) { skipped++; continue; }
    const fieldId = fieldIdByKey.get(`${v.code_table_data}:${v.code_field_data}`);
    if (!fieldId) { skipped++; continue; }
    valueRows.push({
      entityId,
      fieldId,
      recordCode: v.code_data ?? '',
      recordUuid: v.uuid_data ?? null,
      value: v.value_data ?? null,
      dateStart: toDate(v.date_start),
      dateEnd: toDate(v.date_end),
    });
  }
  console.log(`📦 Values: ${valueRows.length} (dilewati ${skipped})`);
  const BATCH = 5000;
  for (let i = 0; i < valueRows.length; i += BATCH) {
    await prisma.value.createMany({ data: valueRows.slice(i, i + BATCH) });
    console.log(`   values ${Math.min(i + BATCH, valueRows.length)}/${valueRows.length}`);
  }

  // ===== 4. DATA SOURCES =====
  const [oldSources] = await old.query('SELECT * FROM database_data_sources');
  let dsCount = 0;
  for (const s of oldSources as any[]) {
    const field = await prisma.field.findFirst({ where: { fullCode: s.code_data_source } });
    if (!field) continue;
    await prisma.dataSource.upsert({
      where: { fieldId: field.id },
      update: {},
      create: {
        fieldId: field.id,
        entitySource: s.table_data_source ?? null,
        fieldSource: s.field_get_data_source ?? null,
      },
    });
    dsCount++;
  }
  console.log(`📦 DataSources: ${dsCount}`);

  // ===== 5. FIELD SHOWS =====
  const [oldFieldShows] = await old.query('SELECT * FROM database_field_shows');
  const fsData = (oldFieldShows as any[]).map((f) => ({
    entityCode: f.table_code ?? '',
    fieldCode: f.field_code ?? '',
    fieldShowCode: f.field_show_code ?? '',
    splitBy: f.split_by ?? null,
    sort: toInt(f.sort_field, 0),
  }));
  if (fsData.length) await prisma.fieldShow.createMany({ data: fsData });
  console.log(`📦 FieldShows: ${fsData.length}`);

  // ===== 6. USER TEMPLATES =====
  const [oldTemplates] = await old.query('SELECT * FROM user_templates');
  const utData = (oldTemplates as any[]).map((t) => ({
    employeeUuid: t.employee_uuid ?? '',
    entityGet: t.code_table_get ?? null,
    entityCode: t.code_table ?? null,
    fieldCode: t.code_field ?? null,
  }));
  if (utData.length) await prisma.userTemplate.createMany({ data: utData });
  console.log(`📦 UserTemplates: ${utData.length}`);

  // ===== 7. GROUP FORMS =====
  const [oldGroups] = await old.query('SELECT * FROM group_forms');
  for (const g of oldGroups as any[]) {
    if (!g.uuid) continue;
    await prisma.groupForm.upsert({
      where: { uuid: g.uuid },
      update: {},
      create: { uuid: g.uuid, description: g.description ?? null },
    });
  }
  console.log(`📦 GroupForms: ${(oldGroups as any[]).length}`);

  // ===== 8. USERS =====
  const [oldUsers] = await old.query('SELECT * FROM users');
  let userCount = 0;
  for (const u of oldUsers as any[]) {
    if (!u.nrp) continue;
    const data = {
      name: u.nrp,
      password: normBcrypt(u.password),
      pin: normBcrypt(u.pin),
      role: toInt(u.role, 1),
      authLogin: u.auth_login ?? null,
      active: true,
    };
    await prisma.user.upsert({
      where: { nrp: u.nrp },
      update: data,
      create: { nrp: u.nrp, ...data },
    });
    userCount++;
  }
  console.log(`👤 Users: ${userCount}`);

  await old.end();
  console.log('=== MIGRASI SELESAI ===');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
