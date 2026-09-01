# MBG Backend (NestJS)

## Stack
NestJS 10 + TypeScript, Prisma 6 + MySQL, JWT (`bcryptjs`), `class-validator`, `class-transformer`.

## Struktur
- `src/auth/` — login NRP+NIK→PIN, verifikasi WhatsApp, token 8-char, JWT.
- `src/eav/` — engine EAV (CRUD entity/field/value + builder selective fetch).
- `src/payslip/` — slip gaji.
- `src/prisma/` — PrismaService (global).

## Database (MySQL Laragon)
- `mbg_hr` — DB utama (prisma). `.env`: `DATABASE_URL`, `JWT_SECRET`, `PORT`, `WA_ADMIN_NUMBER`.
- `mbg_old` — dump sistem lama (untuk migrasi).

## Auth flow
NRP+NIK (pertama) → `need_verification` (token 8-char = `sha256(nrp)[:8]` uppercase + WA) → `GET /auth/validation/:token` → `POST /auth/set-pin` (PIN 6 digit) → NRP+PIN (JWT).

## Endpoint utama
- `POST /api/auth/check`, `POST /api/auth/login`, `GET /api/auth/validation/:token`, `POST /api/auth/set-pin`, `GET /api/auth/me`.
- `/api/eav/*` (builder, entities, fields, records).
- `GET /api/payslips`.

## Perintah
- build: `npm.cmd run build`
- dev: `npm.cmd run start:dev` (port 3000)
- migrate: `npx.cmd prisma migrate dev`
- seed: `npx.cmd prisma db seed`
- migrasi data lama: `npm.cmd run migrate:old` (script `scripts/migrate-old.ts`)

## Aturan
- Komentar Bahasa Indonesia.
- Jangan commit secret.
