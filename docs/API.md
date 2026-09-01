# Dokumentasi API

Base URL: `/api`. Semua endpoint kecuali yang disebutkan memakai header
`Authorization: Bearer <token>` (JWT).

## Autentikasi

### POST `/auth/check`
Cek NRP (untuk langkah pertama login).

Request:
```json
{ "nrp": "MBLE-0422003" }
```

Response:
```json
{ "found": true, "isPin": false, "name": "MBLE-0422003" }
```

### POST `/auth/login`
Login NRP + NIK (pertama) atau NRP + PIN.

Request:
```json
{ "nrp": "MBLE-0422003", "credential": "6213082808000003" }
```

Response (belum ada PIN):
```json
{
  "status": "need_verification",
  "nrp": "MBLE-0422003",
  "name": "MBLE-0422003",
  "validationToken": "CF6ABDF3",
  "waNumber": "6281255897044"
}
```

Response (sudah ada PIN):
```json
{
  "status": "success",
  "token": "<jwt>",
  "user": { "id": 1, "nrp": "MBLE-0422003", "name": "...", "role": 5 }
}
```

### GET `/auth/validation/:token`
Verifikasi token validasi (dibuka dari link WhatsApp).

```json
{ "found": true, "nrp": "MBLE-0422003", "name": "..." }
```

### POST `/auth/set-pin`
Buat PIN 6 digit (menggunakan token validasi).

Request:
```json
{ "token": "CF6ABDF3", "pin": "123456" }
```

Response:
```json
{ "message": "PIN berhasil dibuat" }
```

### GET `/auth/me` (JWT)
Info user dari token.

## EAV

### GET `/eav/builder` (JWT)
Selective fetch.

- Tanpa param → metadata (semua `entity` + `field`, tanpa data).
- `?table=JABATAN` → satu tabel + semua record (untuk dropdown).
- `?table=KARYAWAN&record=MBLE-0422003` → satu record (parent + child digabung).

### CRUD Entity
- `GET /eav/entities` — daftar entity.
- `POST /eav/entities` — buat entity (`{ code, name, menu?, parentCode?, primaryCode? }`).
- `PUT /eav/entities/:code` — update.
- `DELETE /eav/entities/:code` — hapus.

### CRUD Field
- `GET /eav/entities/:code/fields` — daftar field.
- `POST /eav/entities/:code/fields` — buat field.
- `PUT /eav/entities/:code/fields/:fieldCode` — update.
- `DELETE /eav/entities/:code/fields/:fieldCode` — hapus.

Body field:
```json
{
  "code": "NAMA-KARYAWAN",
  "name": "Nama Karyawan",
  "type": "TEXT",
  "level": 1,
  "sort": 1,
  "visibility": "show",
  "sourceEntityCode": "PERUSAHAAN",
  "sourceFieldCode": "NAMA-PERUSAHAAN-PENDEK",
  "gabungan": [
    { "fieldShowCode": "NRP", "splitBy": "|", "sort": 0 },
    { "fieldShowCode": "NAMA-KARYAWAN", "splitBy": "|", "sort": 1 }
  ]
}
```

- `sourceEntityCode` + `sourceFieldCode` → untuk tipe `DARI-TABEL`/`INPUT-AUTOCOMPLITE`/`REFERENCE`.
- `gabungan` → untuk tipe `GABUNGAN` (disimpan ke `fieldShow`).

### Record
- `GET /eav/entities/:code/records` — semua record (grouped).
- `POST /eav/entities/:code/records` — simpan record (`{ recordCode, recordUuid?, values: { fieldCode: value } }`).
- `DELETE /eav/entities/:code/records/:recordCode` — hapus record.

### Export / Import (XLSX)

- `GET /eav/entities/:code/export` — unduh `.xlsx` (parent + tabel anak).
- `POST /eav/import` — upload `.xlsx` (global, distribusi ke banyak tabel).

Format XLSX (sama dengan sistem lama): lihat [DATABASE-FLOW.md](./DATABASE-FLOW.md).

### Dokumentasi

- `GET /docs` — daftar dokumen.
- `GET /docs/:name` — isi dokumen (markdown).

## Slip Gaji (JWT)

### GET `/payslips`
Daftar slip user login.

```json
[
  { "id": 13081, "year": 2026, "month": 4, "codeFile": "MBLE-0422003-2026-4", "fileUrl": "https://assets.mitrabaritogroup.com/uploads/slips/xxx.pdf" }
]
```

### GET `/payslips/:id/file`
Proxy PDF slip (inline, `Content-Type: application/pdf`). Dipakai pdf.js untuk render jadi gambar.

### GET `/payslips/:id/download`
Proxy PDF slip dengan `Content-Disposition: attachment; filename="SLIP-{tahun}-{bulan}.pdf"`.

## Kode Error

| Status | Arti |
|---|---|
| 400 | Validasi / format salah |
| 401 | Token/credential tidak valid |
| 404 | Data tidak ditemukan |
| 409 | Konflik (duplikat) |
| 502 | Gagal mengambil file dari server assets |
