# Aturan Sistem MBG (RULES)

> Dokumen ini adalah **sumber kebenaran (source of truth)** aturan pengembangan MBG.
> Fokus utama: **sistem database**. Disertai aturan coding, API, dan keamanan.
> Setiap developer WAJIB mengikuti aturan ini saat menambah/mengubah fitur.

---

## 1. Prinsip Arsitektur Data (HYBRID)

MBG memakai pendekatan data **hybrid**:

| Jenis | Tabel | Kapan dipakai |
|---|---|---|
| **EAV** (Entity–Attribute–Value) | `entity`, `field`, `value`, `dataSource`, `fieldShow` | Data **master/referensi** yang dinamis (KARYAWAN, JABATAN, AGAMA, PERUSAHAAN, KODE-ABSEN) |
| **Konkret** | `user`, `attendance`, `payslip` | Data **transaksional** yang butuh performa & query rumit (login, absensi, slip) |

### 1.1 Aturan wajib
1. **LARANGAN**: data transaksional TIDAK boleh disimpan EAV murni. Contoh: absensi & slip gaji harus tabel konkret. Alasan: query lambat & sulit (kelemahan fatal sistem lama Laravel).
2. **WAJIB**: data master yang field-nya sering bertambah harus EAV (fleksibel tanpa ubah skema).
3. Setiap record EAV diidentifikasi oleh `recordCode` = **slug dari primary key** (lihat §2).

---

## 2. Kaidah `toUUID` / slugify

> "UUID" di sistem lama SEBENARNYA slug, bukan UUID. WAJIB ikut persis agar kompatibel.

Fungsi (identik PHP `ResponseFormatter::toUUID` dan JS di frontend):

```
slug(s) = s.replace(/[^A-Za-z0-9\-_&]/g, ' ')     // karakter asing + spasi
          .replace(/[./_ ]/g, '-')                  // ., /, _, spasi -> '-'
          .toUpperCase()
```

Backend (`eav.service.ts`) memakai slug lebih ketat:
```
slugify(s) = String(s).replace(/[^a-zA-Z0-9&]/g, '-').toUpperCase()
```

### Contoh
| Input | Slug (ketat) | Slug (toUUID) |
|---|---|---|
| `MBLE-0422003` | `MBLE-0422003` | `MBLE-0422003` |
| `BK/PL-130108` | `BK-PL-130108` | `BK-PL-130108` |
| `PT. MBLE` | `PT--MBLE` | `PT--MBLE` |
| `Tanggal Masuk Kerja (TMK)` | `TANGGAL-MASUK-KERJA--TMK-` | — |

### Pemakaian slug
| Lokasi | Fungsi |
|---|---|
| `entity.code` | code tabel dinamis (mis. `KARYAWAN`) |
| `field.code` | code kolom dinamis (mis. `NAMA-KARYAWAN`) |
| `field.fullCode` | `entity.code + '-' + field.code` |
| `value.recordCode` | PK record = slug nilai field primary |
| `payslip.codeFile` | `NRP-tahun-bulan` (contoh `MBLE-0422003-2026-4`) |
| import XLSX | slug nama field; slug nilai `DARI-TABEL`; slug nilai primary |

---

## 3. Kaidah Penamaan

| Atribut | Aturan |
|---|---|
| `entity.code` | UPPERCASE, tanpa spasi/karakter asing, via slugify. Unik. |
| `entity.name` | Nama deskriptif (dulu `description_table`). |
| `entity.menu` | Nama group menu (pengelompokan). Boleh null. |
| `entity.primaryCode` | `field.code` yang jadi primary key record. |
| `field.code` | UPPERCASE slug dari nama field. Unik per entity (`@@unique([entityId, code])`). |
| `field.fullCode` | `entity.code + '-' + field.code`, WAJIB ikut entity. |
| `field.type` | Salah satu 13 tipe (§4). Default `TEXT`. |
| `field.level` | Rol minimal (1..5) yang boleh melihat field. Default 1. |
| `value.recordCode` | slug primary key. |
| `value.recordUuid` | UUID random (crypto.randomUUID), untuk versi/referensi. |
| `recordUuid` | Konsisten untuk 1 record (dipertahankan saat update). |

---

## 4. Kaidah Tipe Field

### 4.1 Daftar tipe resmi
`TEXT`, `DATE`, `DATETIME`, `COLOR`, `NOMINAL-UANG`, `DARI-TABEL`, `INPUT-AUTOCOMPLITE`, `REFERENCE`, `GABUNGAN`, `HIDDEN`, `FILE`, `FILE-PDF`, `NRP`.

| Tipe | Perilaku | Nilai tersimpan |
|---|---|---|
| `TEXT` | Teks biasa input | string |
| `DATE` | Date picker | `YYYY-MM-DD` |
| `DATETIME` | Date-time | ISO string |
| `COLOR` | Color picker | hex `#RRGGBB` |
| `NOMINAL-UANG` | Number format Rp | angka/string nominal |
| `DARI-TABEL` | Lookup ke tabel lain (dropdown) | **slug** record sumber |
| `INPUT-AUTOCOMPLITE` | Autocomplete dari tabel lain | nilai pilihan |
| `REFERENCE` | Referensi ke tabel lain | code ref |
| `GABUNGAN` | Gabungan beberapa field + separator | **readonly/terhitung** |
| `HIDDEN` | Tersembunyi (mis. primary parent di tabel anak) | `NULL`/tidak terisi |
| `FILE` / `FILE-PDF` | Upload file / PDF | nama/URL file |
| `NRP` | NIP karyawan | NRP |

### 4.2 Field bertipe lookup (`DARI-TABEL`/`INPUT-AUTOCOMPLITE`/`REFERENCE`)
- Wajib simpan `dataSource` (baris `dataSource`): `entitySource` (tabel sumber) + `fieldSource` (field yang diambil).
- `createField`/`updateField`: jika `sourceEntityCode` & `sourceFieldCode` dikirim → buat/upsert `dataSource`.
- Nilai yang disimpan untuk `DARI-TABEL` **di-slug otomatis**.

### 4.3 Field `GABUNGAN`
- Definisinya disimpan di `fieldShow` (daftar `fieldShowCode` + `splitBy` + `sort`).
- `saveGabungan()`: **hapus semua** `fieldShow` entity+field dulu, lalu buat ulang. Jadi update = replace total.
- Saat ini **same-entity** (concat field di tabel sama). Cross-table butuh kolom `tableShowCode` (follow-up).

### 4.4 Tabel anak (Secondary) & field `HIDDEN`
- Tabel anak wajib `parentId` → tabel induk.
- Saat simpan, auto-buat field `HIDDEN` berisi primary parent (relasi parent-child).

---

## 5. Kaidah per Tabel (Prisma — `prisma/schema.prisma`)

### 5.1 `user` (konkret)
- `nrp` **UNIQUE**. `email` UNIQUE nullable.
- `password` = hash **NIK** (login pertama). `pin` = hash **PIN** (null = belum set PIN).
- `role` **Int 1..5** (1 terendah, 5 superadmin).
- `authLogin` = token validasi 8-char (kompatibilitas lama). Di-null-kan setelah set PIN.
- `active` Boolean default true (akun nonaktif ditolak login).

### 5.2 `entity` (EAV)
- `code` **UNIQUE**.
- `parent` self-relasi (`EntityTree`) via `parentId`; `children` = tabel anak.
- `@@index([parentId])`.

### 5.3 `field` (EAV)
- **`@@unique([entityId, code])`** — code unik dalam satu entity.
- `fullCode` WAJIB `entity.code + '-' + code`.
- `onDelete: Cascade` dari entity.
- Relasi 1–1 dengan `dataSource`.

### 5.4 `value` (EAV)
- EAV murni: `entityId` + `fieldId` + `recordCode` + `value`.
- `recordUuid` — UUID konsisten per record (untuk versi/histori).
- **Soft-delete / histori**: `dateEnd`.
  - Query aktif: selalu filter `dateEnd: null` (lihat `getRecords`, `storeRecord`, `fetchEntityData`).
  - `dateStart`/`dateEnd` menandai rentang berlaku (histori).
- `@@index([entityId, recordCode])`, `@@index([fieldId])`.
- `onDelete: Cascade` dari entity & field.

### 5.5 `dataSource` (lookup)
- `fieldId` **UNIQUE** (1 field punya 1 dataSource).
- `entitySource` + `fieldSource` = sumber lookup.

### 5.6 `fieldShow` (GABUNGAN)
- Bukan relasi FK langsung; disimpan per `entityCode` + `fieldCode` (string).
- `splitBy` = separator (spasi, `|`, `-`, dll). `sort` = urutan concat.

### 5.7 `userTemplate`
- Template field per `employeeUuid`. `@@index([employeeUuid])`.

### 5.8 `groupForm`
- `uuid` **UNIQUE**, `description`, `active`.

### 5.9 `attendance` (konkret, transaksional)
- **`@@unique([employeeNrp, date])`** — 1 record/hari/orang.
- `employeeNrp` referensi recordCode KARYAWAN di EAV (bukan FK keras, karena EAV).
- `date` `@db.Date`. `@@index([date])`, `@@index([employeeNrp])`.
- Kolom: `shiftCode`, `code` (KODE-ABSEN: A, TC, DS, NS, SP...), `checkIn`, `checkOut`, `note`.

### 5.10 `payslip` (konkret, transaksional)
- `codeFile` **UNIQUE** = `NRP-tahun-bulan`.
- **`@@unique([employeeNrp, year, month])`** — 1 slip/orang/bulan.
- `fileUrl` = URL PDF di server assets (`assets.mitrabaritogroup.com/uploads/slips/`).
- `@@index([year, month])`.

### 5.11 Aturan FK & cascade
- `entity → field → value` & `entity → value`: **`onDelete: Cascade`** (hapus entity = hapus field + value).
- `field → dataSource`: Cascade.

---

## 6. Kaidah Import / Export (XLSX)

### 6.1 Layout file (format SALINAN sistem lama — WAJIB identik)
| Posisi | Isi |
|---|---|
| `A1`/`C1`/`D1` | "KETERANGAN DATA" / "TANGGAL UPDATE" / "No." |
| `A2` | "PENGELOMPOKAN DATA" |
| `A4`/`B4` | "URUTAN" / "FIELD NAME" |
| `E1, F1, ...` | Nama field |
| `E2, F2, ...` | Kode tabel (entity.code) field tsb |
| `E4, F4, ...` | Urutan field |
| `D5+` | "No." — **berhenti membaca saat kosong** |
| `A5+`, `B5+` | legend urutan + nama field (vertikal) |
| `E5+` dst | **Data** (1 baris = 1 parent + tabel anak digabung) |

### 6.2 Konversi saat import (`importRecords`)
- **Kode field** = slug nama field: `replace(/[^a-zA-Z0-9&]/g,'-').toUpperCase()`.
- **`DATE`** → otomatis `YYYY-MM-DD` via `excelDateToYmd()` (mendukung: string, angka serial Excel, Date).
- **`DARI-TABEL`** → nilai **di-slug otomatis**.
- **recordCode** = slug nilai field primary tabel induk.
  - Untuk child: `own = slug(values[entity.primaryCode])`; `recordCode = own || master || entityCode-{i}`.

### 6.3 Kolom data
- Kolom data dimulai kolom **E (index 5)**; berhenti saat nama field (baris 1) kosong.
- Satu record anak bisa bersama parent dalam satu baris (kolom beda).

---

## 7. Kaidah Migrasi (`mbg_old` → `mbg_hr`)

| Lama | Baru | Jumlah |
|---|---|---|
| `database_tables` | `entity` | 51 |
| `database_fields` | `field` | 141 |
| `database_data` | `value` | 66.802 |
| `users` | `user` | 969 |
| `slips` | `payslip` | 15.084 |

Aturan:
- `slips.nrp` sistem lama memakai **slug**; dipetakan ke `user.nrp` (raw) lewat helper slugify.
- Jalankan: `npm run migrate:old` (entity/field/value + users), `npm run migrate:slips` (slips → payslip).
- Jangan ubah DB `mbg_old` (referensi/dump).

---

## 8. Kaidah Coding (Backend NestJS)

1. Bahasa komentar & pesan error: **Bahasa Indonesia**.
2. Struktur modul: `controller` / `service` / `dto` / `module` per fitur (`src/auth/`, `src/eav/`, `src/payslip/`, `src/docs/`, `src/prisma/`).
3. Layering:
   - Controller: parsing request/response, guard, no logika bisnis.
   - Service: semua logika bisnis + akses Prisma.
   - DTO: validasi `class-validator` + `class-transformer`.
4. Guard JWT di controller yang butuh auth (`@UseGuards(JwtAuthGuard)`); payload di `req['user']`.
5. Naming method: camelCase (JS/TS konvensi).
6. Error: pakai `NotFoundException` / `ConflictException` / `UnauthorizedException` / `BadGatewayException` dari `@nestjs/common` — jangan `throw new Error` (kecuali internal).
7. Hapus data master → cascade otomatis; jangan hapus data histori (`dateEnd`) terhadap value yang masih dipakai.
8. Jangan simpan password/pin/kunci dalam bentuk plaintext.

---

## 9. Kaidah API

1. Global prefix: **`/api`** (`app.setGlobalPrefix('api')`).
2. Auth: header `Authorization: Bearer <JWT>` untuk semua endpoint kecuali `auth/check`, `auth/login`, `auth/validation/:token`, `auth/set-pin`, `docs/*`.
3. Response JSON polos (tanpa bungkus `success` kecuali di `docs`).
4. Kode error:
   | Status | Arti |
   |---|---|
   | 400 | Validasi / format salah (ValidationPipe) |
   | 401 | Token/credential tidak valid |
   | 404 | Data tidak ditemukan |
   | 409 | Konflik (duplikat) |
   | 502 | Gagal ambil file dari server assets |
5. Daftar endpoint lengkap: lihat `docs/API.md`.

---

## 10. Kaidah Keamanan

1. **Hash**: `password` (NIK) & `pin` → **bcrypt** (`bcryptjs`, salt rounds 10).
2. **JWT**: di-sign `JwtService`; substansi payload `{ sub, nrp, role }`; expire via `JWT_EXPIRES_IN` (default `7d`).
3. **Token validasi 8-char** (login pertama) = `sha256(nrp) hex` potong 8, uppercase. Deterministik. Disimpan `user.authLogin`.
4. **Role 1–5**: superadmin = 5. Guard boleh cek role bila perlu.
5. **JANGAN commit secret**: `.env` masuk `.gitignore`; sediakan `.env.example`.
6. Env wajib: `DATABASE_URL`, `PORT`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `ASSETS_API_TOKEN`.
7. CORS: `app.enableCors()`.
8. Akses file dari server assets memakai header `X-API-Token` (`ASSETS_API_TOKEN`).

---

## Lampiran: Hukum Kunci (ringkas)
- Data master → **EAV**. Data transaksional → **konkret**. Jangan dibalik.
- `recordCode` = **slug**. `fullCode` = `entity.code-field.code`. `codeFile` = `NRP-tahun-bulan`.
- Query value aktif selalu `dateEnd: null`.
- `value.recordUuid` konsisten per record.
- `field` unique per entity; `dataSource` unique per field.
- Import: kode field = slug nama field; DATE → `YYYY-MM-DD`; DARI-TABEL → slug.
- PIN/NIK di-hash bcrypt; JWT; jangan commit secret.
