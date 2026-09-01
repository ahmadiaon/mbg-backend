# PRD — Mitra Barito Group (MBG) ERP

> **Status: DRAFT (sementara)** — silakan tambah/koreksi.
> Dokumen ini menjelaskan *tujuan* dan *kebutuhan* produk secara menyeluruh.
> Detail teknis ada di `docs/` (README, API, DATABASE, ARCHITECTURE, dll).

---

## 1. Latar Belakang

MBG (Mitra Barito Group) adalah perusahaan pertambangan yang sebelumnya memakai
aplikasi internal berbasis **Laravel** (`mbg-online`). Sistem lama memiliki
masalah utama:

- Semua data disimpan dengan pendekatan EAV murni → query lambat & sulit.
- Data master sangat dinamis (field sering berubah/tambah), tapi sulit dikelola.
- Kode sulit di-maintain dan tidak terdokumentasi.

Proyek ini adalah **migrasi + modernisasi** sistem lama ke stack baru
(Node.js + React) dengan tetap mempertahankan alur bisnis dan format data lama.

## 2. Tujuan Produk

Menyediakan aplikasi internal (ERP) yang:

1. **Fleksibel** — admin/HR bisa menambah tabel & kolom baru tanpa mengubah kode
   (form builder EAV).
2. **Cepat** — data transaksional pakai tabel konkret, bukan EAV murni.
3. **Aman** — autentikasi berlapis (NRP + NIK → verifikasi WhatsApp → PIN).
4. **Terpelihara** — kode modular, terdokumentasi, mudah dilanjutkan tim.
5. **Kompatibel** — format import/export Excel sama dengan sistem lama.

## 3. Target Pengguna

| Peran | Kebutuhan |
|---|---|
| **Karyawan** | Lihat slip gaji sendiri, login dengan PIN. |
| **HR / Admin** | Kelola data karyawan, buat form, import/export data, verifikasi login. |
| **Superadmin (role 5)** | Kelola struktur tabel dinamis (form builder), menu, akses. |
| **Developer** | Maintain & lanjutkan fitur (dibantu dokumentasi). |

## 4. Ruang Lingkup

### Dalam lingkup (in scope)
- Autentikasi (NRP + NIK → verifikasi WhatsApp → PIN → JWT).
- Engine EAV (entity/field/value) + form builder + input data.
- Import/export Excel (format lama).
- Slip gaji (list, render PDF, unduh).
- Dokumentasi teknis (markdown, bisa dibaca lewat MBG-Link).
- Migrasi data lama (tabel, field, data, users, slips).

### Di luar lingkup (out of scope, sementara)
- Payroll lengkap (perhitungan gaji) — sistem lama hanya menampilkan slip.
- Modul absensi penuh (lihat roadmap).
- Aplikasi mobile native (web responsif sudah cukup).

## 5. Kebutuhan Fungsional

### 5.1 Autentikasi
- Login pertama: NRP + NIK (KTP) → verifikasi via WhatsApp → buat PIN 6 digit.
- Login berikutnya: NRP + PIN → JWT.
- Token validasi 8 karakter deterministik (`sha256(nrp)` uppercase).
- Role user 1–5; superadmin = 5.

### 5.2 Data Dinamis (EAV)
- Buat tabel (entity) & kolom (field) lewat UI, tanpa ubah kode.
- Tipe field: TEXT, DATE, DATETIME, COLOR, NOMINAL-UANG, DARI-TABEL,
  INPUT-AUTOCOMPLITE, REFERENCE, GABUNGAN, HIDDEN, FILE, FILE-PDF, NRP.
- Relasi parent-child (tabel induk → tabel anak).
- Filter cascading, search, export/import Excel.

### 5.3 Slip Gaji
- Karyawan melihat slip sendiri (filter tahun/bulan).
- Render PDF jadi gambar (kompatibel Android) + zoom + unduh dengan nama rapi.

### 5.4 Dokumentasi
- Dokumen markdown disajikan lewat MBG-Link → Dokumentasi.

## 6. Kebutuhan Non-Fungsional

- **Keamanan**: password/PIN di-hash (bcrypt); JWT; jangan commit secret.
- **Kinerja**: data transaksional pakai tabel konkret (hindari EAV murni).
- **Kompatibilitas**: format Excel & slug (`toUUID`) identik sistem lama.
- **Dokumentasi**: tiap modul terdokumentasi; komentar Bahasa Indonesia.

## 7. Arsitektur (ringkas)

- **Frontend**: React 19 + Vite + TypeScript + React Router, template deskapp.
- **Backend**: NestJS 10 + TypeScript + Prisma 6 + MySQL, JWT.
- **Database**: `mbg_hr` (baru) + `mbg_old` (dump lama, untuk migrasi).
- **Server assets**: `assets.mitrabaritogroup.com` (file PDF slip).

Lihat `docs/ARCHITECTURE.md` untuk detail.

## 8. Roadmap / Backlog (draft)

| Item | Status | Keterangan |
|---|---|---|
| Autentikasi (NRP+NIK→PIN+WA) | ✅ Selesai | `src/auth/` |
| Engine EAV + Form Builder + Data | ✅ Selesai | `src/eav/` + UI |
| Slip gaji | ✅ Selesai | `src/payslip/` |
| Import/Export XLSX | ✅ Selesai | format lama |
| Migrasi data lama | ✅ Selesai | `scripts/migrate-*.ts` |
| Absensi | 🔜 Belum | logika di skill `mbg-attendance`, tabel `attendance` siap |
| Derivasi khusus import (kode finger, status kerja) | 🔜 Belum | menyusul |
| GABUNGAN lintas tabel | 🔜 Belum | butuh `tableShowCode` |

## 9. Daftar Istilah

| Istilah | Arti |
|---|---|
| **EAV** | Entity–Attribute–Value (penyimpanan data dinamis). |
| **entity** | "Tabel" dinamis (mis. KARYAWAN). |
| **field** | "Kolom" dinamis (mis. NAMA-KARYAWAN). |
| **value** | Nilai data EAV. |
| **recordCode** | ID unik record = slug primary key. |
| **toUUID / slug** | Fungsi normalisasi string → kode unik. |
| **NRP** | Nomor Registrasi Pegawai (ID karyawan). |
| **NIK** | Nomor Induk Kependudukan (KTP). |
| **deskapp** | Template admin Bootstrap 4 yang dipakai frontend. |

## 10. Referensi

- `README.md` — cara menjalankan & ringkasan.
- `docs/ARCHITECTURE.md` — arsitektur sistem.
- `docs/DATABASE.md` — skema database.
- `docs/API.md` — dokumentasi endpoint.
- `docs/AUTH-FLOW.md` — alur autentikasi.
- `docs/DATABASE-FLOW.md` — alur form builder + data + import/export.

---

### Untuk dikoreksi/ditambah
- [ ] Detail kebutuhan absensi (shift, fingerprint).
- [ ] Kebutuhan payroll / slip di masa depan.
- [ ] Matriks hak akses per role (1–5).
- [ ] Hal lain yang belum tercakup.
