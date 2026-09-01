# Alur Database Dinamis (Form Builder + Data)

Dokumen ini menjelaskan alur pembuatan tabel/kolom dinamis (EAV) dan pengisian
data, termasuk format import/export Excel. Bisa dibaca lewat **MBG-Link →
Dokumentasi**.

## Halaman

| Halaman | Route | Fungsi |
|---|---|---|
| Form Builder | `/database/form` | Buat/edit tabel (entity) + kolom (field) |
| Data | `/database/data` | Lihat/isi data, filter, import/export |

Kedua halaman hanya untuk **superadmin (role 5)**.

---

## 1. Form Builder (`/database/form`)

Membuat "tabel" dinamis = **entity + field-nya**. Mirip Google Forms, tapi
untuk mendefinisikan struktur data.

### Manage Form
- **Nama Form** → jadi `code` entity (slug, contoh `KARYAWAN`).
- **Field Primary** → primary key (contoh `NRP`).
- **Nama Menu** → group form (pengelompokan menu, dari `groupForm`).
- **Level Table** → `Primary` (tabel induk) / `Secondary` (tabel anak, wajib isi Referensi Tabel).
- **Referensi Tabel (Parent)** → untuk tabel anak (relasi parent-child).

### Daftar Field (kartu, bisa reorder ↑/↓)
Tipe field yang didukung:

| Tipe | Keterangan |
|---|---|
| `TEXT` | Teks biasa |
| `DARI-TABEL` | Lookup ke tabel lain (butuh Tabel Sumber + Field Sumber) |
| `INPUT-AUTOCOMPLITE` | Autocomplete dari tabel lain |
| `REFERENCE` | Referensi ke tabel lain |
| `DATE` / `DATETIME` | Tanggal / tanggal-jam |
| `NOMINAL-UANG` | Nominal (format Rp) |
| `COLOR` | Warna (hex) |
| `FILE` / `FILE-PDF` | File / PDF |
| `NRP` | NIP karyawan |
| `GABUNGAN` | Gabungan beberapa field + separator (mis. `FULL-NAME` = NRP \| NAMA \| JABATAN) |
| `HIDDEN` | Tersembunyi |

### Alur simpan
1. `POST /eav/entities` → buat/update entity.
2. `POST /eav/entities/:code/fields` → buat/update tiap field (auto-sort by posisi).
3. `DARI-TABEL`/`REFERENCE` → simpan `dataSource` (tabel + field sumber).
4. `GABUNGAN` → simpan `fieldShow` (daftar field + separator).
5. Secondary → auto buat field `HIDDEN` untuk primary parent.

---

## 2. Data (`/database/data`)

### List Tabel (kiri atas)
DataTable dengan search + filter. Klik nama tabel untuk memuat datanya.

### Form (kanan atas)
Isi/edit record. Input menyesuaikan tipe field:
- `DATE` → date picker, `COLOR` → color picker, `NOMINAL-UANG` → number,
  `DARI-TABEL` → dropdown (record tabel sumber), `GABUNGAN` → readonly (terhitung).

### List Data (bawah, full width)
- **Search** global.
- **Filter cascading** per kolom (searchable multi-select). Opsi filter mengikuti
  hasil filter saat ini (sama seperti sistem lama).
- **Export** / **Import** tombol di kanan.

---

## 3. Import / Export (XLSX)

Format sama dengan sistem lama (multi-tabel dalam satu file).

### Struktur file

| Posisi | Isi |
|---|---|
| `A1` / `C1` / `D1` | "KETERANGAN DATA" / "TANGGAL UPDATE" / "No." |
| `A2` | "PENGELOMPOKAN DATA" |
| `A4` / `B4` | "URUTAN" / "FIELD NAME" |
| `E1, F1, ...` | **Nama field** |
| `E2, F2, ...` | **Kode tabel** field tsb |
| `E4, F4, ...` | Urutan field |
| `D5, D6, ...` | "No." (penanda baris; berhenti saat kosong) |
| `A5+, B5+` | legend: urutan + nama field (vertikal) |
| `E5+, F5+, ...` | **Data** (1 baris = 1 record karyawan + child-nya) |

### Export
`GET /eav/entities/:code/export` → unduh `.xlsx` (parent + tabel anak digabung).

### Import
`POST /eav/import` → upload `.xlsx` (global, distribusi ke banyak tabel sesuai
kode tabel di baris 2).

### Aturan konversi saat import
- **Kode field** = slug nama field: `replace(/[^a-zA-Z0-9&]/g, '-').toUpperCase()`.
  Contoh `Tanggal Masuk Kerja (TMK)` → `TANGGAL-MASUK-KERJA--TMK-`.
- **`DATE`** → otomatis jadi `YYYY-MM-DD` (mendukung string, angka serial Excel, Date).
- **`DARI-TABEL`** → nilai otomatis di-slug.
- **recordCode** = slug nilai field primary tabel induk.

---

## Endpoint terkait

| Endpoint | Fungsi |
|---|---|
| `GET /eav/builder` | Metadata (entity + field + menu + fieldShow + groupForm) |
| `GET /eav/entities` | Daftar entity |
| `POST /eav/entities` | Buat entity |
| `PUT /eav/entities/:code` | Update entity |
| `DELETE /eav/entities/:code` | Hapus entity |
| `POST /eav/entities/:code/fields` | Buat field (termasuk `gabungan`) |
| `PUT /eav/entities/:code/fields/:fieldCode` | Update field |
| `DELETE /eav/entities/:code/fields/:fieldCode` | Hapus field |
| `GET /eav/entities/:code/records` | Daftar record |
| `POST /eav/entities/:code/records` | Simpan record |
| `DELETE /eav/entities/:code/records/:recordCode` | Hapus record |
| `GET /eav/entities/:code/export` | Export `.xlsx` |
| `POST /eav/import` | Import `.xlsx` (global) |

## Catatan

- **Derivasi khusus** (kode fingger, status kerja, user dari NIK) belum
  direplikasi di import backend baru — menyusul.
- GABUNGAN masih **same-entity** (concat field di tabel yang sama); cross-table
  butuh kolom `tableShowCode` (follow-up).
