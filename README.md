# MBG Backend

Backend aplikasi **Mitra Barito Group** (sistem ERP pertambangan), hasil migrasi dari Laravel (proyek `mbg-online`) ke **Node.js**.

> **Tujuan & kebutuhan produk**: lihat [PRD.md](./PRD.md).

## Tech Stack

- **NestJS 10** + TypeScript
- **Prisma 6** + MySQL
- **JWT** (bcryptjs) untuk autentikasi
- `class-validator` / `class-transformer` untuk validasi DTO

## Fitur yang sudah jadi

| Fitur | Keterangan |
|---|---|
| **Autentikasi** | Login NRP + NIK (pertama) → verifikasi WhatsApp → token 8-char → buat PIN 6 digit → NRP + PIN (JWT) |
| **Engine EAV** | CRUD `entity`/`field`/`value` dinamis + endpoint `builder` (selective fetch) |
| **Slip Gaji** | List slip per karyawan + proxy file PDF + download (rename) |
| **Migrasi data** | Script migrasi dari DB lama (`mbg_old`) ke skema baru |

## Struktur Folder

```
mbg-backend/
├── prisma/
│   ├── schema.prisma       # Skema (EAV + tabel konkret)
│   └── seed.ts             # Seed data demo
├── scripts/
│   ├── migrate-old.ts      # Migrasi EAV lama (database_tables/fields/data)
│   └── migrate-slips.ts    # Migrasi slips -> payslip
├── src/
│   ├── auth/               # Login, verifikasi, set PIN, JWT guard
│   ├── eav/                # Engine EAV (entity/field/value + builder)
│   ├── payslip/            # Slip gaji (list + proxy file + download)
│   └── prisma/             # PrismaService (global)
└── .env                    # Konfigurasi (lihat .env.example)
```

## Skema Database (ringkas)

- **EAV** (data master/dinamis): `entity`, `field`, `value`, `dataSource`, `fieldShow`, `userTemplate`, `groupForm`.
- **Konkret** (transaksional): `user` (auth), `attendance` (absensi), `payslip` (slip gaji).

Detail lengkap: lihat `docs/DATABASE.md`.

## Endpoint API (ringkas)

| Method | Path | Keterangan |
|---|---|---|
| POST | `/api/auth/check` | Cek NRP (ada / pakai PIN atau NIK) |
| POST | `/api/auth/login` | Login NRP + NIK/PIN |
| GET | `/api/auth/validation/:token` | Verifikasi token validasi (WA) |
| POST | `/api/auth/set-pin` | Buat PIN 6 digit |
| GET | `/api/auth/me` | Info user (JWT) |
| GET | `/api/eav/builder` | Metadata (entity + field) / selective fetch |
| GET | `/api/payslips` | Daftar slip user login |
| GET | `/api/payslips/:id/file` | Proxy PDF slip (inline) |
| GET | `/api/payslips/:id/download` | Download slip (rename) |

Detail lengkap: lihat `docs/API.md`.

## Cara Menjalankan

### Prasyarat
- Node.js v22, MySQL (Laragon).

### Setup

```bash
npm install
cp .env.example .env   # sesuaikan nilai
npx prisma migrate dev  # buat tabel
npx prisma db seed      # (opsional) seed data demo
```

### Jalankan (development)

```bash
npm run start:dev       # port 3000
```

### Build (production)

```bash
npm run build
node dist/main.js
```

## Migrasi Data Lama

```bash
npm run migrate:old     # EAV lama (database_tables/fields/data) -> entity/field/value + users
npm run migrate:slips   # slips lama -> payslip
```

> Data lama diambil dari database `mbg_old` (dump sistem Laravel). Pastikan DB tersebut sudah di-import ke MySQL lokal.

## Environment Variables (`.env`)

| Var | Keterangan |
|---|---|
| `DATABASE_URL` | Koneksi MySQL (Prisma) |
| `PORT` | Port aplikasi (default 3000) |
| `JWT_SECRET` | Secret untuk JWT |
| `JWT_EXPIRES_IN` | Masa berlaku token (mis. `7d`) |
| `WA_ADMIN_NUMBER` | Nomor WhatsApp admin untuk verifikasi login |
| `ASSETS_API_TOKEN` | Token akses ke server assets (untuk proxy slip) |
