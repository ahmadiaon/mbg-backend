# Arsitektur Sistem

Dokumen ini menjelaskan arsitektur aplikasi **MBG** hasil migrasi dari Laravel (`mbg-online`) ke Node.js + React.

## Ringkasan

Aplikasi MBG adalah **ERP pertambangan** dengan data master yang sangat dinamis
(field sering bertambah). Karena itu, arsitektur datanya memakai pendekatan
**hybrid**:

- **EAV (Entity–Attribute–Value)** untuk data master/referensi yang dinamis.
- **Tabel konkret** untuk data transaksional (login, absensi, slip gaji).

Ini menghindari kelemahan sistem lama (semua data EAV = lambat & sulit di-query),
sambil tetap mempertahankan fleksibilitas menambah field tanpa mengubah skema.

## Komponen

```
┌─────────────┐    HTTP/JSON (JWT)     ┌──────────────────┐
│  Frontend   │ ─────────────────────▶ │  Backend (NestJS)│
│ React+Vite  │ ◀───────────────────── │  Prisma + MySQL  │
│  (deskapp)  │                        └────────┬─────────┘
└─────────────┘                                 │
                                  ┌─────────────┴─────────────┐
                                  │  MySQL                    │
                                  │  - mbg_hr (baru)          │
                                  │  - mbg_old (dump lama)    │
                                  └───────────────────────────┘

  Server assets (VPS): assets.mitrabaritogroup.com
    └─ menyimpan file PDF slip di uploads/slips/
```

## Model Data Hybrid

### EAV (dinamis)

| Tabel | Peran |
|---|---|
| `entity` | "Tabel" dinamis (contoh: KARYAWAN, JABATAN, AGAMA). |
| `field` | "Kolom" dinamis (contoh: NRP, NAMA-KARYAWAN). |
| `value` | Nilai data (EAV murni: entityId + fieldId + recordCode + value). |
| `dataSource` | Lookup antar tabel (tipe `DARI-TABEL`). |
| `fieldShow` | Gabungan field (tipe `GABUNGAN`). |
| `userTemplate` | Template tampilan per user. |
| `groupForm` | Pengelompokan menu. |

Setiap `record` diidentifikasi oleh `recordCode` = **slug** dari primary key
(lihat `toUUID` di bawah).

### Konkret (transaksional)

| Tabel | Peran |
|---|---|
| `user` | Akun login (nrp, password=NIK, pin, role). |
| `attendance` | Absensi harian. |
| `payslip` | Slip gaji (metadata + URL file PDF). |

## `toUUID` = slug (BUKAN UUID)

Di sistem lama, "UUID" sebenarnya adalah **slug**:

```
slug(s) = replace([^A-Za-z0-9\-_&] → ' ') lalu replace([./_ ] → '-') lalu UPPERCASE
```

Contoh: `BK/PL-130108` → `BK-PL-130108`, `PT. MBLE` → `PT--MBLE`.

Dipakai untuk `recordCode`, `code_field`, dan `code_table`.

## Alur Autentikasi

Lihat [AUTH-FLOW.md](./AUTH-FLOW.md).

## Modul

| Modul | Status | Keterangan |
|---|---|---|
| Auth (NRP+NIK→PIN+WA) | ✅ | `src/auth/` |
| Engine EAV | ✅ | `src/eav/` |
| Slip Gaji | ✅ | `src/payslip/` |
| Form Builder + Data (EAV UI) | ✅ | `/database/form` + `/database/data` (React) |
| Import/Export XLSX | ✅ | Format sama dengan sistem lama |
| Absensi | 🔜 | Logika di `mbg-attendance` (skill), tabel `attendance` siap |
| Dokumentasi (Markdown) | ✅ | `src/docs/` → dibaca di MBG-Link |

Alur form builder + data + import/export: lihat [DATABASE-FLOW.md](./DATABASE-FLOW.md).

## Teknologi

- Backend: NestJS 10, TypeScript, Prisma 6, MySQL, JWT, class-validator.
- Frontend: React 19, Vite, TypeScript, React Router, pdfjs-dist, template deskapp.
- Infra: Laragon (local), VPS Hestia CP + PM2 (production).
