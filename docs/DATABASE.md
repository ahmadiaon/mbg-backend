# Database

Skema database **MBG** (Prisma, MySQL). DB utama: `mbg_hr`. DB lama (referensi migrasi): `mbg_old`.

## Tabel EAV (data dinamis)

### `entity`
"Tabel" dinamis. Kolom: `code` (unik), `name`, `menu`, `parentId` (self-relasi parent/child), `primaryCode`.

### `field`
"Kolom" dinamis. Kolom: `entityId`, `code`, `name`, `fullCode`, `type`, `level` (role 1..5), `sort`, `visibility`, `dataSource`.

### `value`
Nilai EAV. Kolom: `entityId`, `fieldId`, `recordCode` (PK = slug), `recordUuid`, `value`, `dateStart`, `dateEnd` (histori/soft-delete).

### `dataSource`, `fieldShow`, `userTemplate`, `groupForm`
- `dataSource`: lookup (`entitySource` + `fieldSource`) untuk field `DARI-TABEL`.
- `fieldShow`: definisi field `GABUNGAN` (concat beberapa field).
- `userTemplate`: field yang ditampilkan per user.
- `groupForm`: pengelompokan menu (uuid + description).

## Tabel Konkret (transaksional)

### `user`
```prisma
nrp (unik), name, email, password (hash NIK), pin (hash PIN, null = belum set),
role (1..5), authLogin (token validasi), active
```

### `attendance`
```prisma
employeeNrp, date, shiftCode, code (KODE-ABSEN), checkIn, checkOut, note
```

### `payslip`
```prisma
employeeNrp, year, month, codeFile (unik), fileUrl (URL PDF di server assets)
```

## Tipe Field (`field.type`)

`TEXT`, `DATE`, `COLOR`, `DARI-TABEL`, `INPUT-AUTOCOMPLITE`, `GABUNGAN`, `HIDDEN`, `FILE`, `NOMINAL-UANG`, `REFERENCE`.

## `toUUID` (slug)

Fungsi slug menggantikan "UUID" di sistem lama:

```
slug(s) = s.replace(/[^A-Za-z0-9\-_&]/g, ' ')   // buang karakter asing -> spasi
            .replace(/[./_ ]/g, '-')             // ., /, _, spasi -> '-'
            .toUpperCase()
```

Contoh:
| Input | Slug |
|---|---|
| `MBLE-0422003` | `MBLE-0422003` |
| `BK/PL-130108` | `BK-PL-130108` |
| `PT. MBLE` | `PT--MBLE` |

## Migrasi Data Lama

DB `mbg_old` (dump `2026-08-18-ONLINE-mitrabarito_app.sql`) berisi skema sistem Laravel lama:

| Lama | Baru | Jumlah |
|---|---|---|
| `database_tables` | `entity` | 51 |
| `database_fields` | `field` | 141 |
| `database_data` | `value` | 66.802 |
| `users` | `user` | 969 |
| `slips` | `payslip` | 15.084 |

Perintah:
```bash
npm run migrate:old     # entity/field/value + users
npm run migrate:slips   # slips -> payslip
```

Catatan: `slips.nrp` di sistem lama memakai **slug**, dipetakan ke `user.nrp`
(raw) lewat helper slugify saat migrasi.
