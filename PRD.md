# PRD — Mitra Barito Group (MBG) ERP

> **Status: DETAIL** — dokumen lengkap kebutuhan produk + spesifikasi function-level backend.
> Aturan sistem database & coding wajib ada di **`docs/RULES.md`** (sumber kebenaran).

---

## 1. Latar Belakang

MBG (Mitra Barito Group) adalah perusahaan pertambangan yang sebelumnya memakai aplikasi
internal berbasis **Laravel** (`mbg-online`). Masalah sistem lama:

- Semua data disimpan EAV **murni** → query lambat & sulit.
- Data master sangat dinamis (field sering bertambah) tapi sulit dikelola.
- Kode sulit di-maintain & tidak terdokumentasi.

Proyek ini = **migrasi + modernisasi** ke stack baru (Node.js + React) sambil mempertahankan
alur bisnis & format data lama (terutama import/export Excel & slug `toUUID`).

## 2. Tujuan Produk

ERP internal yang:

1. **Fleksibel** — admin/HR menambah tabel & kolom tanpa ubah kode (form builder EAV).
2. **Cepat** — data transaksional pakai tabel konkret (bukan EAV murni).
3. **Aman** — autentikasi berlapis (NRP + NIK → verifikasi WhatsApp → PIN).
4. **Terpelihara** — kode modular, terdokumentasi.
5. **Kompatibel** — format import/export Excel & slug identik sistem lama.

## 3. Target Pengguna

| Peran | Kebutuhan |
|---|---|
| **Karyawan** | Lihat slip gaji sendiri, login pakai PIN. |
| **HR / Admin** | Kelola data karyawan, buat form, import/export data, verifikasi login. |
| **Superadmin (role 5)** | Kelola struktur tabel dinamis (form builder), menu, akses. |
| **Developer** | Maintain & lanjutkan fitur (dibantu RULES.md & PRD ini). |

## 4. Ruang Lingkup

### Dalam lingkup
- Autentikasi (NRP + NIK → verifikasi WhatsApp → PIN → JWT).
- Engine EAV + form builder + input data + impor/ekspor Excel.
- Slip gaji (list, render PDF, unduh).
- Dokumentasi markdown (dibaca lewat MBG-Link).
- Migrasi data lama (tabel, field, data, users, slips).

### Di luar lingkup (sementara)
- Payroll lengkap (perhitungan gaji) — hanya menampilkan slip.
- Absensi penuh (lihat roadmap).
- Aplikasi mobile native (web responsif cukup).

---

## 5. Arsitektur

- **Frontend**: React 19 + Vite + TypeScript + React Router, template deskapp.
- **Backend**: NestJS 10 + TypeScript + Prisma 6 + MySQL, JWT, class-validator.
- **Database**: `mbg_hr` (baru) + `mbg_old` (dump lama untuk migrasi).
- **Server assets**: `assets.mitrabaritogroup.com` (PDF slip).

```
Frontend (React+Vite, deskapp) ──HTTP/JSON (JWT)──▶ Backend (NestJS)
                                                     │ Prisma + MySQL
                                                     │   mbg_hr + mbg_old
                                   server assets: assets.mitrabaritogroup.com/uploads/slips/
```

Datastore hybrid: **EAV** (master dinamis) + **konkret** (transaksional). Detail: `docs/RULES.md §1`.

---

## 6. Kebutuhan Fungsional

### 6.1 Autentikasi
- Login pertama: NRP + NIK (KTP) → status `need_verification` → verifikasi WhatsApp → buat PIN 6 digit.
- Login berikutnya: NRP + PIN → JWT.
- Token validasi 8 karakter **deterministik** = `sha256(nrp)` hex → slice 8 → uppercase (identik sistem lama).
- Role user 1–5; superadmin = 5.
- Cek NRP: balikkan `found` + `isPin` (apakah sudah set PIN).

### 6.2 Data Dinamis (EAV + Form Builder)
- Buat Entity ("tabel") & Field ("kolom") lewat UI tanpa ubah kode.
- 13 tipe field: `TEXT, DATE, DATETIME, COLOR, NOMINAL-UANG, DARI-TABEL, INPUT-AUTOCOMPLITE, REFERENCE, GABUNGAN, HIDDEN, FILE, FILE-PDF, NRP`.
- Relasi parent-child (tabel induk → tabel anak).
- Filter cascading, search, export/import Excel.

### 6.3 Slip Gaji
- Karyawan lihat slip sendiri (filter tahun/bulan).
- Render PDF jadi gambar (kompatibel Android) + zoom + unduh dengan nama rapi.

### 6.4 Dokumentasi
- Dokumen markdown disajikan lewat MBG-Link → Dokumentasi.

---

## 7. Spesifikasi Function-level (Backend)

> Semua fungsi service/layer. Parameter & return tipe data; alur & error.
> Lokasi file: `src/auth/auth.service.ts`, `src/eav/eav.service.ts`, `src/payslip/payslip.service.ts`, `src/docs/docs.controller.ts`, `src/auth/jwt-auth.guard.ts`.

### 7.1 Auth (`src/auth/auth.service.ts`)

#### `checkNrp(nrp: string)`
- **Input**: NRP string.
- **Return**: `{ found: boolean, isPin: boolean, name: string }`.
- **Alur**: cari user by `nrp`. Jika tidak ada / `active=false` → `{ found:false, isPin:false, name:'' }`. Jika ada → `found:true`, `isPin = !!user.pin`, `name`.

#### `login(dto: LoginDto)`
- **Input**: `LoginDto { nrp, credential }` (credential = NIK pertama / PIN setelah).
- **Alur**:
  1. Cari user by `nrp`. Jika tidak ada / nonaktif → `UnauthorizedException('NRP tidak ditemukan atau akun nonaktif')`.
  2. Jika `user.pin` ada → `bcrypt.compare(credential, pin)`. Gagal → `UnauthorizedException('PIN salah')`. Sukses → sign JWT `{ sub, nrp, role }`, return `{ status:'success', token, user }`.
  3. Jika belum ada PIN: cek `password` (hash NIK). Tidak ada → `UnauthorizedException('Akun belum memiliki password')`. `bcrypt.compare(credential, password)` gagal → `UnauthorizedException('NIK salah')`.
  4. Buat `validationToken = sha256(nrp).hex.slice(0,8).toUpperCase()`, simpan ke `user.authLogin`.
  5. Return `{ status:'need_verification', nrp, name, validationToken, waNumber }` (waNumber dari `WA_ADMIN_NUMBER`, default `6281255897044`).

#### `validateToken(token: string)`
- **Input**: token validasi 8-char.
- **Return**: `{ found, nrp, name }` (cari user by `authLogin`).

#### `setPin(dto: SetPinDto)`
- **Input**: `SetPinDto { token, pin }` (pin 6 digit via validator).
- **Alur**: cari user by `authLogin = token`. Tidak ada → `UnauthorizedException('Token tidak valid atau sudah digunakan')`. Hash pin (bcrypt 10), simpan `pin`, null-kan `authLogin`. Return `{ message:'PIN berhasil dibuat' }`.

### 7.2 EAV (`src/eav/eav.service.ts`)

#### Helper (fungsi murni)
- **`slugify(s: unknown): string`** — `String(s).replace(/[^a-zA-Z0-9&]/g,'-').toUpperCase()`. null/undefined → `''`.
- **`colLetter(n: number): string`** — 1-based → huruf Excel (1=A, 26=Z, 27=AA).
- **`excelDateToYmd(value: unknown): string`** — konversi Date/angka serial/string → `YYYY-MM-DD`. Angka serial: `(value - 25569) * 86400 * 1000`.

#### ENTITY
- **`getEntities()`** — semua entity urut `code` asc.
- **`getEntityByCode(code)`** — entity + `fields` (urut `sort`) + `dataSource`. Tidak ada → `NotFoundException`.
- **`createEntity(dto: CreateEntityDto)`** — `{ code, name, menu?, parentCode?, primaryCode? }`. Duplikat code → `ConflictException`. `parentCode` → resolve ke `parentId`.
- **`updateEntity(code, dto: UpdateEntityDto)`** — update name/menu/primaryCode/active/parentId. Validasi entity ada.
- **`deleteEntity(code)`** — hapus entity (cascade field+value). Validasi ada.
- **`resolveEntityId(code)`** (private) — cari entity by code → id. `NotFoundException` jika parent tidak ada.

#### FIELD
- **`createField(entityCode, dto: CreateFieldDto)`** — buat field + set `fullCode = entity.code-code`. Duplikat `(entityId, code)` → `ConflictException`. Jika `sourceEntityCode`+`sourceFieldCode` → buat `dataSource`. Jika `gabungan` → `saveGabungan()`. Return field + dataSource.
- **`updateField(entityCode, fieldCode, dto: UpdateFieldDto)`** — update name/type/level/sort/visibility. `sourceEntityCode`+`sourceFieldCode` → upsert `dataSource`. `gabungan` → `saveGabungan()`.
- **`saveGabungan(entityCode, fieldCode, gabungan?)`** (private) — jika undefined, return. Hapus semua `fieldShow` entity+field, lalu buat ulang.
- **`deleteField(entityCode, fieldCode)`** — hapus field (cascade values). Validasi ada.

#### RECORD / DATA
- **`getRecords(entityCode)`** — semua value aktif (`dateEnd: null`) untuk entity; dikelompokkan jadi `[{ recordCode, recordUuid, values:{ [field.code]: value } }]` urut recordCode asc.
- **`storeRecord(entityCode, dto: StoreRecordDto)`** — `{ recordCode, recordUuid?, values: { [fieldCode]: value } }`.
  - `recordUuid` = dto.recordUuid **atau** recordUuid record aktif yang sudah ada **atau** `randomUUID()` (konsisten per record).
  - Loop values: field tidak ada → skip. Value aktif per (field, recordCode) → **update**; jika tidak → **create**.
  - Return `{ entityCode, recordCode, recordUuid, saved: { [fieldCode]: value } }`.
- **`deleteRecord(entityCode, recordCode)`** — `deleteMany` semua value entity+recordCode.

#### IMPORT / EXPORT (XLSX, format lama)
- **`exportRecords(entityCode)`** — build workbook (entity + children, skip primaryCode di child). Layout persis `docs/RULES.md §6`. Return `{ filename, buffer }`.
- **`importRecords(fileBuffer: Buffer)`** — parse worksheet:
  - Kolom dari E (index 5); nama field baris 1, kode tabel baris 2; berhenti saat nama field kosong.
  - `fieldCode = slugify(nama field)`; cari field di entity.
  - Baris data mulai 5; berhenti saat kolom D (No.) kosong.
  - Konversi: `DATE` → `excelDateToYmd`; `DARI-TABEL` → `slugify(value)`.
  - `parentEntity = entity dengan parentId null`; `master = slug(primary parent value)`.
  - Per entity per baris: `own = slug(values[entity.primaryCode])`; `recordCode = own || master || \`${entityCode}-${i}\``; panggil `storeRecord`.
  - Return `{ imported: number }`.

#### BUILDER / SESSION (selective fetch)
- **`buildSession(table?, record?)`** — `GET /eav/builder`.
  - Tanpa `table` → `buildMetadata()`.
  - Dengan `table` → metadata satu entity (`entityMap` + `fields` maping `data_source`) + data via `fetchEntityData`.
  - Jika `record` → return `{ table, record, entity, data: data[record] }`.
- **`buildMetadata()`** — fetch semua entity(+fields+dataSource), dataSource, fieldShow, userTemplate, groupForm. Bangun:
  - `entitiesMap` (code → entity dengan `fieldsMap` berisi `data_source`).
  - `menus: { [menu]: [entity.code] }`.
  - `children: { [parentId]: [entity.code] }`.
  - Return `{ entities, menus, children, dataSources, fieldShows, userTemplates, groupForms }`.
- **`fetchEntityData(entityCode, recordCode?)`** — cari entity + children. Query value aktif (`dateEnd:null`) untuk `entity.id + child ids` (opsional filter recordCode). Return `data[recordCode][field.code] = { value_data, uuid_data, code_data }`.

### 7.3 Payslip (`src/payslip/payslip.service.ts`)

- **`list(employeeNrp)`** — slip user urut `year desc, month desc`. Return `{ id, year, month, codeFile, fileUrl }`.
- **`getById(id, employeeNrp)`** — cari `{ id, employeeNrp }`. Tidak ada → `NotFoundException('Slip tidak ditemukan')`.
- **`fetchPdf(url: string|null): Promise<Buffer>`** — url null → `NotFoundException('File slip tidak tersedia')`. Fetch url (timeout 15s) dengan header `X-API-Token` dari `ASSETS_API_TOKEN`. `!res.ok` → `NotFoundException('File slip tidak ditemukan di server assets')`. Error lain → `BadGatewayException('Gagal mengambil file slip dari server assets')`.

### 7.4 Docs (`src/docs/docs.controller.ts`)

- **`list()`** → `{ success:true, data: [{ name, title }] }` — gabungan manual docs (README backend, README frontend) + semua `.md` di `docs/`.
- **`get(name)`** — sanitasi `name` (`/[^a-zA-Z0-9_-]/` dihapus). Cari manual doc atau `docs/{name}.md`. Tidak ada → `NotFoundException('Dokumentasi tidak ditemukan')`. Return `{ success, name, content }`.

### 7.5 Guard JWT (`src/auth/jwt-auth.guard.ts`)

- **`canActivate(context): Promise<boolean>`** — ambil header `Authorization`. Tanpa `Bearer` → `UnauthorizedException('Token tidak ditemukan')`. `verifyAsync<JwtPayload>(token)`; gagal → `UnauthorizedException('Token tidak valid atau sudah kedaluwarsa')`. Sukses → set `request['user'] = payload` (`{ sub, nrp, role }`).

### 7.6 Main / bootstrap (`src/main.ts`)

- `bootstrap()` — buat app; `setGlobalPrefix('api')`; `enableCors()`; global `ValidationPipe({ whitelist:true, transform:true })`; listen `PORT` (default 3000).

---

## 8. Endpoint API (Ringkas)

Lihat `docs/API.md` untuk body & response lengkap.

| Method | Path | Auth | Fungsi |
|---|---|---|---|
| POST | `/api/auth/check` | — | Cek NRP |
| POST | `/api/auth/login` | — | Login NRP+NIK/PIN |
| GET | `/api/auth/validation/:token` | — | Verifikasi token WA |
| POST | `/api/auth/set-pin` | — | Buat PIN 6 digit |
| GET | `/api/auth/me` | JWT | Info user |
| GET | `/api/eav/builder` | JWT | Metadata / tabel / record |
| GET | `/api/eav/entities` | JWT | Daftar entity |
| POST | `/api/eav/entities` | JWT | Buat entity |
| PUT | `/api/eav/entities/:code` | JWT | Update entity |
| DELETE | `/api/eav/entities/:code` | JWT | Hapus entity |
| GET | `/api/eav/entities/:code/fields` | JWT | Daftar field |
| POST | `/api/eav/entities/:code/fields` | JWT | Buat field |
| PUT | `/api/eav/entities/:code/fields/:fieldCode` | JWT | Update field |
| DELETE | `/api/eav/entities/:code/fields/:fieldCode` | JWT | Hapus field |
| GET | `/api/eav/entities/:code/records` | JWT | Daftar record |
| POST | `/api/eav/entities/:code/records` | JWT | Simpan record |
| DELETE | `/api/eav/entities/:code/records/:recordCode` | JWT | Hapus record |
| GET | `/api/eav/entities/:code/export` | JWT | Export `.xlsx` |
| POST | `/api/eav/import` | JWT | Import `.xlsx` (global) |
| GET | `/api/payslips` | JWT | Daftar slip |
| GET | `/api/payslips/:id/file` | JWT | PDF inline (pdf.js) |
| GET | `/api/payslips/:id/download` | JWT | PDF download |
| GET | `/api/docs` | — | Daftar dokumen |
| GET | `/api/docs/:name` | — | Isi dokumen |

---

## 9. Kebutuhan Non-Fungsional

- **Keamanan**: PIN/password hash bcrypt; JWT; jangan commit secret (lihat RULES §10).
- **Kinerja**: data transaksional pakai tabel konkret + index; hindari EAV untuk transaksi.
- **Kompatibilitas**: format Excel & slug (`toUUID`) identik sistem lama.
- **Dokumentasi**: tiap modul terdokumentasi; komentar Bahasa Indonesia.

---

## 10. Matriks Role (1–5)

| Fitur | Karyawan (1) | HR/Admin (3–4) | Superadmin (5) |
|---|---|---|---|
| Login / slip sendiri | ✅ | ✅ | ✅ |
| Form Builder (tambah tabel/kolom) | ❌ | ❌ | ✅ |
| Data (isi/kelola semua tabel) | sesuai level field | ✅ | ✅ |
| Import/Export XLSX | ❌ | ✅ | ✅ |

Detail level field disimpan di `field.level` (minimal role yang boleh melihat).

---

## 11. Roadmap / Backlog

| Item | Status | Keterangan |
|---|---|---|
| Autentikasi (NRP+NIK→PIN+WA) | ✅ | `src/auth/` |
| Engine EAV + Form Builder + Data | ✅ | `src/eav/` + UI |
| Slip gaji | ✅ | `src/payslip/` |
| Import/Export XLSX | ✅ | format lama |
| Migrasi data lama | ✅ | `scripts/migrate-*.ts` |
| Absensi | 🔜 | logika di skill `mbg-attendance`, tabel `attendance` siap |
| Derivasi khusus import (kode finger, status kerja) | 🔜 | menyusul |
| GABUNGAN lintas tabel | 🔜 | butuh `tableShowCode` |

---

## 12. Daftar Istilah

| Istilah | Arti |
|---|---|
| **EAV** | Entity–Attribute–Value (penyimpanan data dinamis). |
| **entity** | "Tabel" dinamis (mis. KARYAWAN). |
| **field** | "Kolom" dinamis (mis. NAMA-KARYAWAN). |
| **value** | Nilai data EAV. |
| **recordCode** | ID unik record = slug primary key. |
| **toUUID / slugify** | Fungsi normalisasi string → kode unik (RULES §2). |
| **NRP** | Nomor Registrasi Pegawai. |
| **NIK** | Nomor Induk Kependudukan (KTP). |
| **deskapp** | Template admin Bootstrap 4. |

---

## 13. Referensi

- `docs/RULES.md` — **aturan sistem (database inti)** wajib dibaca.
- `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/DATABASE-FLOW.md`, `docs/API.md`, `docs/AUTH-FLOW.md`.
- `README.md` — cara menjalankan.
