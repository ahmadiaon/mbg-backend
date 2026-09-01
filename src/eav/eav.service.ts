import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEntityDto } from './dto/create-entity.dto';
import { UpdateEntityDto } from './dto/update-entity.dto';
import { CreateFieldDto, GabunganFieldDto } from './dto/create-field.dto';
import { UpdateFieldDto } from './dto/update-field.dto';
import { StoreRecordDto } from './dto/store-record.dto';
import * as ExcelJS from 'exceljs';

// slug sesuai JS toUUID (frontend): semua non-alfanumerik (kecuali &) -> '-', uppercase
function slugify(s: unknown): string {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[^a-zA-Z0-9&]/g, '-').toUpperCase();
}

// 1-based -> huruf kolom Excel (1=A, 26=Z, 27=AA)
function colLetter(n: number): string {
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// konversi nilai cell Excel (Date/angka serial/string) -> YYYY-MM-DD
function excelDateToYmd(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(
      value.getDate(),
    ).padStart(2, '0')}`;
  }
  if (typeof value === 'number') {
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
      d.getUTCDate(),
    ).padStart(2, '0')}`;
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

@Injectable()
export class EavService {
  constructor(private readonly prisma: PrismaService) {}

  // ===================== ENTITY =====================
  async getEntities() {
    return this.prisma.entity.findMany({ orderBy: { code: 'asc' } });
  }

  async getEntityByCode(code: string) {
    const entity = await this.prisma.entity.findUnique({
      where: { code },
      include: {
        fields: { orderBy: { sort: 'asc' }, include: { dataSource: true } },
      },
    });
    if (!entity) throw new NotFoundException(`Entity '${code}' tidak ditemukan`);
    return entity;
  }

  async createEntity(dto: CreateEntityDto) {
    const exists = await this.prisma.entity.findUnique({
      where: { code: dto.code },
    });
    if (exists) throw new ConflictException(`Entity '${dto.code}' sudah ada`);

    return this.prisma.entity.create({
      data: {
        code: dto.code,
        name: dto.name,
        menu: dto.menu,
        primaryCode: dto.primaryCode,
        parentId: dto.parentCode ? await this.resolveEntityId(dto.parentCode) : null,
      },
    });
  }

  async updateEntity(code: string, dto: UpdateEntityDto) {
    await this.getEntityByCode(code);
    return this.prisma.entity.update({
      where: { code },
      data: {
        name: dto.name,
        menu: dto.menu,
        primaryCode: dto.primaryCode,
        parentId: dto.parentCode ? await this.resolveEntityId(dto.parentCode) : undefined,
        active: dto.active,
      },
    });
  }

  async deleteEntity(code: string) {
    await this.getEntityByCode(code);
    await this.prisma.entity.delete({ where: { code } });
    return { message: `Entity '${code}' dihapus` };
  }

  private async resolveEntityId(code: string): Promise<number> {
    const entity = await this.prisma.entity.findUnique({ where: { code } });
    if (!entity) throw new NotFoundException(`Entity parent '${code}' tidak ditemukan`);
    return entity.id;
  }

  // ===================== FIELD =====================
  async createField(entityCode: string, dto: CreateFieldDto) {
    const entity = await this.getEntityByCode(entityCode);

    const exists = await this.prisma.field.findUnique({
      where: { entityId_code: { entityId: entity.id, code: dto.code } },
    });
    if (exists) throw new ConflictException(`Field '${dto.code}' sudah ada`);

    const field = await this.prisma.field.create({
      data: {
        entityId: entity.id,
        code: dto.code,
        name: dto.name,
        fullCode: `${entity.code}-${dto.code}`,
        type: dto.type ?? 'TEXT',
        level: dto.level ?? 1,
        sort: dto.sort ?? 0,
        visibility: dto.visibility,
      },
    });

    if (dto.sourceEntityCode && dto.sourceFieldCode) {
      await this.prisma.dataSource.create({
        data: {
          fieldId: field.id,
          entitySource: dto.sourceEntityCode,
          fieldSource: dto.sourceFieldCode,
        },
      });
    }

    await this.saveGabungan(entity.code, field.code, dto.gabungan);

    return this.prisma.field.findUnique({
      where: { id: field.id },
      include: { dataSource: true },
    });
  }

  async updateField(entityCode: string, fieldCode: string, dto: UpdateFieldDto) {
    const entity = await this.getEntityByCode(entityCode);
    const field = await this.prisma.field.findUnique({
      where: { entityId_code: { entityId: entity.id, code: fieldCode } },
    });
    if (!field) throw new NotFoundException(`Field '${fieldCode}' tidak ditemukan`);

    const updated = await this.prisma.field.update({
      where: { id: field.id },
      data: {
        name: dto.name,
        type: dto.type,
        level: dto.level,
        sort: dto.sort,
        visibility: dto.visibility,
      },
    });

    if (dto.sourceEntityCode && dto.sourceFieldCode) {
      await this.prisma.dataSource.upsert({
        where: { fieldId: field.id },
        update: {
          entitySource: dto.sourceEntityCode,
          fieldSource: dto.sourceFieldCode,
        },
        create: {
          fieldId: field.id,
          entitySource: dto.sourceEntityCode,
          fieldSource: dto.sourceFieldCode,
        },
      });
    }

    await this.saveGabungan(entity.code, fieldCode, dto.gabungan);

    return updated;
  }

  private async saveGabungan(
    entityCode: string,
    fieldCode: string,
    gabungan?: GabunganFieldDto[],
  ) {
    if (gabungan === undefined) return;
    await this.prisma.fieldShow.deleteMany({ where: { entityCode, fieldCode } });
    for (const g of gabungan) {
      await this.prisma.fieldShow.create({
        data: {
          entityCode,
          fieldCode,
          fieldShowCode: g.fieldShowCode,
          splitBy: g.splitBy ?? '',
          sort: g.sort ?? 0,
        },
      });
    }
  }

  async deleteField(entityCode: string, fieldCode: string) {
    const entity = await this.getEntityByCode(entityCode);
    const field = await this.prisma.field.findUnique({
      where: { entityId_code: { entityId: entity.id, code: fieldCode } },
    });
    if (!field) throw new NotFoundException(`Field '${fieldCode}' tidak ditemukan`);

    await this.prisma.field.delete({ where: { id: field.id } });
    return { message: `Field '${fieldCode}' dihapus` };
  }

  // ===================== RECORD / DATA =====================
  async getRecords(entityCode: string) {
    const entity = await this.getEntityByCode(entityCode);
    const values = await this.prisma.value.findMany({
      where: { entityId: entity.id, dateEnd: null },
      include: { field: true },
      orderBy: { recordCode: 'asc' },
    });

    const records: Record<string, any> = {};
    for (const v of values) {
      if (!records[v.recordCode]) {
        records[v.recordCode] = {
          recordCode: v.recordCode,
          recordUuid: v.recordUuid,
          values: {},
        };
      }
      records[v.recordCode].values[v.field.code] = v.value;
    }
    return Object.values(records);
  }

  async storeRecord(entityCode: string, dto: StoreRecordDto) {
    const entity = await this.getEntityByCode(entityCode);
    const fields = await this.prisma.field.findMany({
      where: { entityId: entity.id },
    });
    const fieldByCode = new Map(fields.map((f) => [f.code, f]));

    const existingRecord = await this.prisma.value.findFirst({
      where: { entityId: entity.id, recordCode: dto.recordCode, dateEnd: null },
    });
    const recordUuid = dto.recordUuid ?? existingRecord?.recordUuid ?? randomUUID();

    const saved: Record<string, string> = {};
    for (const [fieldCode, value] of Object.entries(dto.values)) {
      const field = fieldByCode.get(fieldCode);
      if (!field) continue;

      const existing = await this.prisma.value.findFirst({
        where: {
          entityId: entity.id,
          fieldId: field.id,
          recordCode: dto.recordCode,
          dateEnd: null,
        },
      });

      const result = existing
        ? await this.prisma.value.update({
            where: { id: existing.id },
            data: { value },
          })
        : await this.prisma.value.create({
            data: {
              entityId: entity.id,
              fieldId: field.id,
              recordCode: dto.recordCode,
              recordUuid,
              value,
            },
          });

      saved[fieldCode] = result.value;
    }

    return {
      entityCode,
      recordCode: dto.recordCode,
      recordUuid,
      saved,
    };
  }

  async deleteRecord(entityCode: string, recordCode: string) {
    const entity = await this.getEntityByCode(entityCode);
    await this.prisma.value.deleteMany({
      where: { entityId: entity.id, recordCode },
    });
    return { message: `Record '${recordCode}' dihapus` };
  }

  // ===================== IMPORT / EXPORT (XLSX — format lama) =====================
  async exportRecords(entityCode: string) {
    const entity = await this.prisma.entity.findUnique({
      where: { code: entityCode },
      include: {
        fields: { orderBy: { sort: 'asc' }, include: { dataSource: true } },
        children: {
          include: {
            fields: { orderBy: { sort: 'asc' }, include: { dataSource: true } },
          },
        },
      },
    });
    if (!entity) throw new NotFoundException(`Entity '${entityCode}' tidak ditemukan`);

    const entities = [entity, ...entity.children];
    const columns: { entityCode: string; field: any }[] = [];
    for (const ent of entities) {
      for (const f of ent.fields) {
        if (ent.code !== entity.code && f.code === entity.primaryCode) continue;
        columns.push({ entityCode: ent.code, field: f });
      }
    }

    // kumpulkan value per recordCode (flat key = entityCode\u0000fieldCode)
    const rows = new Map<string, Record<string, string>>();
    for (const ent of entities) {
      const recs = await this.getRecords(ent.code);
      for (const r of recs) {
        if (!rows.has(r.recordCode)) rows.set(r.recordCode, {});
        const row = rows.get(r.recordCode)!;
        for (const [fc, v] of Object.entries(r.values)) {
          row[`${ent.code}\u0000${fc}`] = String(v ?? '');
        }
      }
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Data');
    ws.getCell('A1').value = 'KETERANGAN DATA';
    ws.getCell('C1').value = 'TANGGAL UPDATE';
    ws.getCell('D1').value = 'No.';
    ws.getCell('A2').value = 'PENGELOMPOKAN DATA';
    ws.getCell('A4').value = 'URUTAN';
    ws.getCell('B4').value = 'FIELD NAME';

    columns.forEach((col, i) => {
      const L = colLetter(i + 5);
      ws.getCell(`${L}1`).value = col.field.name;
      ws.getCell(`${L}2`).value = col.entityCode;
      ws.getCell(`${L}4`).value = i + 1;
      ws.getCell(`A${5 + i}`).value = i + 1;
      ws.getCell(`B${5 + i}`).value = col.field.name;
    });

    let ri = 5;
    let num = 1;
    for (const [, row] of rows) {
      ws.getCell(`D${ri}`).value = num;
      columns.forEach((col, i) => {
        ws.getCell(`${colLetter(i + 5)}${ri}`).value =
          row[`${col.entityCode}\u0000${col.field.code}`] ?? '';
      });
      num++;
      ri++;
    }

    ws.views = [{ state: 'frozen', ySplit: 4 }];
    const buffer = await wb.xlsx.writeBuffer();
    return { filename: `${entityCode}.xlsx`, buffer: Buffer.from(buffer) };
  }

  async importRecords(fileBuffer: Buffer) {
    const wb = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(fileBuffer as any);
    const ws = wb.worksheets[0];
    if (!ws) return { imported: 0 };

    const entities = await this.prisma.entity.findMany({
      include: { fields: { include: { dataSource: true } } },
    });
    const entityByCode = new Map(entities.map((e) => [e.code, e]));

    // kolom data mulai E (kolom 5): baris 1 = nama field, baris 2 = kode tabel
    const columns: {
      entityCode: string;
      fieldCode: string;
      col: number;
      field?: any;
      entity?: any;
    }[] = [];
    for (let c = 5; ; c++) {
      const name = ws.getRow(1).getCell(c).value;
      if (name === null || name === undefined || String(name).trim() === '') break;
      const entityCode = String(ws.getRow(2).getCell(c).value ?? '').trim();
      const fieldCode = slugify(name);
      const entity = entityByCode.get(entityCode);
      const field = entity?.fields.find((f) => f.code === fieldCode);
      columns.push({ entityCode, fieldCode, col: c, field, entity });
    }

    const parentEntity = columns.map((c) => c.entity).find((e) => e && e.parentId === null);
    const parentCode = parentEntity?.code ?? '';
    const parentPrimary = parentEntity?.primaryCode ?? '';

    const rows: Record<string, Record<string, string>>[] = [];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber < 5) return;
      const no = row.getCell(4).value;
      if (no === null || no === undefined || String(no).trim() === '') return;
      const byEntity: Record<string, Record<string, string>> = {};
      for (const col of columns) {
        const raw = row.getCell(col.col).value;
        if (raw === null || raw === undefined) continue;
        let value = col.field?.type === 'DATE' ? excelDateToYmd(raw) : String(raw);
        if (col.field?.dataSource) value = slugify(value);
        (byEntity[col.entityCode] ??= {})[col.fieldCode] = value;
      }
      rows.push(byEntity);
    });

    let imported = 0;
    for (const byEntity of rows) {
      const parentValues = byEntity[parentCode] ?? {};
      const master = slugify(parentValues[parentPrimary] ?? '');
      for (const [entityCode, values] of Object.entries(byEntity)) {
        const entity = entityByCode.get(entityCode);
        if (!entity || Object.keys(values).length === 0) continue;
        const own = slugify(values[entity.primaryCode ?? ''] ?? '');
        const recordCode = own || master || `${entityCode}-${imported}`;
        await this.storeRecord(entityCode, { recordCode, values });
        imported++;
      }
    }
    return { imported };
  }

  // ===================== BUILDER / SESSION =====================
  // Selective fetch (seperti createJsonFileDB / masterCacheGet lama):
  // - tanpa param            -> metadata (entitas + field, TANPA data)
  // - ?table=X               -> satu tabel + semua record (untuk option/dropdown)
  // - ?table=X&record=Y      -> satu record (parent + child digabung)
  async buildSession(table?: string, record?: string) {
    if (!table) {
      return this.buildMetadata();
    }

    const entity = await this.getEntityByCode(table);
    const fieldsMap: Record<string, any> = {};
    for (const f of entity.fields) {
      fieldsMap[f.code] = { ...f, data_source: f.dataSource ?? null };
    }
    const entityMap = {
      id: entity.id,
      code: entity.code,
      name: entity.name,
      menu: entity.menu,
      parentId: entity.parentId,
      primaryCode: entity.primaryCode,
      active: entity.active,
      fields: fieldsMap,
    };

    const data = await this.fetchEntityData(table, record);

    if (record) {
      return { table, record, entity: entityMap, data: data[record] ?? {} };
    }
    return { table, entity: entityMap, data };
  }

  private async buildMetadata() {
    const [entities, dataSources, fieldShows, userTemplates, groupForms] =
      await Promise.all([
        this.prisma.entity.findMany({
          include: {
            fields: { orderBy: { sort: 'asc' }, include: { dataSource: true } },
          },
        }),
        this.prisma.dataSource.findMany({ include: { field: true } }),
        this.prisma.fieldShow.findMany(),
        this.prisma.userTemplate.findMany(),
        this.prisma.groupForm.findMany(),
      ]);

    const dataSourceMap: Record<string, any> = {};
    for (const ds of dataSources) {
      if (ds.field) dataSourceMap[ds.field.fullCode] = ds;
    }

    const entitiesMap: Record<string, any> = {};
    const menus: Record<string, string[]> = {};
    const children: Record<number, string[]> = {};

    for (const e of entities) {
      const fields: Record<string, any> = {};
      for (const f of e.fields) {
        fields[f.code] = {
          ...f,
          data_source: f.dataSource ?? dataSourceMap[f.fullCode] ?? null,
        };
      }
      entitiesMap[e.code] = {
        id: e.id,
        code: e.code,
        name: e.name,
        menu: e.menu,
        parentId: e.parentId,
        primaryCode: e.primaryCode,
        active: e.active,
        fields,
      };
      if (e.menu) {
        if (!menus[e.menu]) menus[e.menu] = [];
        menus[e.menu].push(e.code);
      }
      if (e.parentId) {
        if (!children[e.parentId]) children[e.parentId] = [];
        children[e.parentId].push(e.code);
      }
    }

    return {
      entities: entitiesMap,
      menus,
      children,
      dataSources: dataSourceMap,
      fieldShows,
      userTemplates,
      groupForms,
    };
  }

  // Ambil data (parent + child) untuk sebuah entitas, opsional satu record.
  private async fetchEntityData(entityCode: string, recordCode?: string) {
    const entity = await this.prisma.entity.findUnique({
      where: { code: entityCode },
      include: { children: true },
    });
    if (!entity) {
      throw new NotFoundException(`Entity '${entityCode}' tidak ditemukan`);
    }

    const ids = [entity.id, ...entity.children.map((c) => c.id)];
    const values = await this.prisma.value.findMany({
      where: {
        entityId: { in: ids },
        dateEnd: null,
        ...(recordCode ? { recordCode } : {}),
      },
      include: { field: true },
    });

    const data: Record<string, Record<string, any>> = {};
    for (const v of values) {
      if (!data[v.recordCode]) data[v.recordCode] = {};
      data[v.recordCode][v.field.code] = {
        value_data: v.value,
        uuid_data: v.recordUuid,
        code_data: v.recordCode,
      };
    }
    return data;
  }
}
