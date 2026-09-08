# PRD — Sistem Persetujuan (Approval) MBG

**Product Requirements Document • Version 1.0 • 5 September 2026**

Dokumen ini menjadi acuan pengembangan modul persetujuan (approval) pada
aplikasi MBG backend (NestJS + Prisma) dan frontend (React). Tujuan utama
adalah merekonstruksi sistem approval dari proyek Laravel lama menjadi
modul yang **dinamis, generik, dan berorientasi masa depan**.

---

## 1. Executive Summary

Sistem persetujuan memungkinkan setiap form/tabel data (contoh:
`KEHADIRAN`, `KONTRAK-KARYAWAN`, dsb.) memiliki alur tanda tangan
bertingkat. Setiap alur terdiri dari beberapa **level**, dan pada setiap
level ditentukan **siapa yang menandatangani** (approver) berdasarkan
**grade jabatan** dan **struktur organisasi** karyawan.

Karena aturan "siapa menandatangani" bergantung pada grade dan hirarki
organisasi yang bisa berubah, seluruh aturan bersifat **dinamis** — bukan
hardcode per form — sehingga dapat dikelola tanpa mengubah kode.

## 2. Problem Statement

-   Proyek Laravel lama sudah memiliki tabel `database_persetujuans`
    (konfigurasi) dan `database_data_persetujuans` (data tracking), namun
    alur end-to-end (buat config → submit → resolve approver → approve)
    tidak pernah tersambung penuh.
-   Logika simpan config dikomentari; fungsi UI `addPersetujuan()` /
    `addAgrement()` tidak ditemukan definisinya.
-   Data karyawan (`arr_employees`) hanya dibaca di JavaScript tetapi tidak
    pernah dibangun oleh backend secara eksplisit.
-   Diperlukan satu sumber kebenaran data karyawan + grade + organisasi
    yang dipakai semua fitur, bukan salinan per modul.

## 3. Product Goals

-   Menyediakan config approval per form secara dinamis (multi-level).
-   Menyediakan resolver approver generik berbasis grade + organisasi.
-   Menyediakan satu tabel tracking yang menurunkan tiga pandangan:
    1.  **Atasan** — daftar yang harus ia tanda tangani.
    2.  **User** — status persetujuan miliknya.
    3.  **HR** — daftar yang perlu ditandatangani HR.
-   Setiap function dibuat **sederhana dan se-general mungkin** agar dapat
    dipakai ulang untuk fitur masa depan tanpa modifikasi besar.

## 4. Non-Goals V1

-   Tidak membuat notifikasi (email/WhatsApp) pada V1.
-   Tidak membuat eskalasi otomatis / reminder.
-   Tidak mengubah format data lama `ACC/DECLINE/NULL` (dijaga agar
    migrasi data lama lancar).

> Catatan: **Approver boleh lebih dari satu**. Pemohon (requester)
> memilih sendiri siapa yang menyetujui. Sistem hanya membantu
> **mempersempit kandidat** agar pemohon mudah memilih. Satu level
> menyimpan satu approver terpilih (sesuai data lama `database_data_persetujuans`).

---

## 5. Konsep Inti

```
Form (mis. KEHADIRAN)
   └── Level 1 : diajukan oleh  (approver: NRP)
   └── Level 2 : disetujui oleh (approver: ATASAN-LANGSUNG)
   └── Level 3 : diperiksa oleh (approver: HR)
   └── Level 4 : diketahui oleh (approver: MANAGER)
```

Setiap level memiliki:
-   **Level** — urutan tanda tangan (`LEVEL-1`..`LEVEL-4`).
-   **Group** — tipe approver (`NRP`, `ATASAN-LANGSUNG`, `HR`, `MANAGER`).
-   **Deskripsi** — label tampilan (`DIAJUKAN-OLEH-`, `DISETUJUI-OLEH-`,
    `DIPERIKSA-OLEH-`, `DIKETAHU-OLEH-`).
-   **Reference** — field acuan pada form untuk menentukan subjek
    (umumnya `NRP`).

---

## 6. Struktur Data

### 6.1 Master EAV (kamus kategori) — sudah ada di `mbg_hr`

| Entity | recordCode → value |
|---|---|
| `DATABASE-GROUP-PERSETUJUAN` | `NRP`, `ATASAN-LANGSUNG`, `HR`, `MANAGER` |
| `DATABASE-LEVEL-PERSETUJUAN` | `LEVEL-1`..`LEVEL-4` |
| `DESKRIPSI-PERSETUJUAN` | `DIAJUKAN-OLEH-`, `DISETUJUI-OLEH-`, `DIPERIKSA-OLEH-`, `DIKETAHU-OLEH-` |
| `DATABASE-KELOMPOK-PENANDATANGAN` | `ATASAN-LANGSUNG`, `DIAJUKAN-MANDIRI`, `HR`, `MANAGER-PERTAMA` |

### 6.2 Konfigurasi per form — `SUPPORT-TABLE` (EAV)

Field:

| Field | Tipe | Sumber | Keterangan |
|---|---|---|---|
| `TABEL` | TEXT | — | Nama form yang diatur (mis. `KEHADIRAN`) |
| `LEVEL-PERSETUJUAN` | DARI-TABEL | `DATABASE-LEVEL-PERSETUJUAN` | Level approval |
| `GROUP-PERSETUJUAN` | DARI-TABEL | `DATABASE-GROUP-PERSETUJUAN` | Tipe approver |
| `DESKRIPSI-PERSETUJUAN` | DARI-TABEL | `DESKRIPSI-PERSETUJUAN` | Label tampilan |
| `REFERENCE-PERSETUJUAN` | REFERENCE | — | Field acuan resolve approver |

Contoh isi:

```
TABEL=KEHADIRAN  LEVEL-1  DIAJUKAN-OLEH-   NRP             reference=NRP
TABEL=KEHADIRAN  LEVEL-2  DISETUJUI-OLEH-  ATASAN-LANGSUNG reference=NRP
TABEL=KEHADIRAN  LEVEL-3  DIPERIKSA-OLEH-  HR              reference=NRP
TABEL=KEHADIRAN  LEVEL-4  DIKETAHU-OLEH-   MANAGER         reference=NRP
```

### 6.3 Data tracking — tabel concrete `database_data_persetujuans`

Kolom (identik dengan tabel lama `app`):

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | int PK | |
| `code_form` | string | Kode form (mis. `KEHADIRAN`) |
| `code_data` | string | Kode record yang diajukan |
| `level` | string | `LEVEL-1`..`LEVEL-4` |
| `nrp` | string | NRP approver |
| `status` | string? | `ACC` / `DECLINE` / `NULL` (pending) |
| `date_change` | date? | Tanggal approve/reject |
| `created_at` / `updated_at` | timestamp | |

Satu record form menghasilkan **satu baris per level**.

---

## 7. Aturan Resolve Approver (Dinamis, berbasis Grade)

Sumber data: `arr_employees` = seluruh data karyawan dari
`database_data.KARYAWAN` yang di-join dengan `STATUS-KERJA-KARYAWAN`
(PERUSAHAAN, PROJECT, DEPARTEMEN, DIVISI, JABATAN) dan `JABATAN.GRADE`.

Struktur hasil:

```
arr_employees = {
  all:        [nrp...],
  byCompany:  { code: [nrp...] },
  byProject:  { code: [nrp...] },
  byDept:     { code: [nrp...] },
  byDivision: { code: [nrp...] },
  byGrade:    { 1: [nrp...], 2: [...], ... },
  terminated: [nrp...]
}
```

### 7.1 `NRP`

Approver = subjek itu sendiri (nilai field `reference` pada record).

### 7.2 `ATASAN-LANGSUNG`

Atasan langsung ditentukan dari **grade jabatan + departemen** subjek
(diambil dari profil karyawan). Alur (identik dengan proyek lama):

**Penyaringan awal (selalu):**
1.  `innerJoin` PERUSAHAAN yang sama.
2.  `innerJoin` PROJECT yang sama.
3.  Buang GRADE 3 (Admin Divisi).

**Cabang berdasarkan GRADE + DEPARTEMEN:**

| Grade subjek | Penyaringan |
|---|---|
| ≤ 2 | `innerJoin` DIVISI yang sama |
| 3–4 | `innerJoin` DEPARTEMEN yang sama, buang grade 1, 2, 3 |
| 5 | `innerJoin` DEPARTEMEN yang sama, buang grade 1, 5 |
| 6–7 | `innerJoin` GRADE[8] (Kepala Project) |
| 8–9 | `innerJoin` GRADE[10] (Kepala Perusahaan) |
| 10–11 | `innerJoin` GRADE[12] (Kepala/GM) |
| 12–13 | `innerJoin` GRADE[14] (Super User) |

**Penyaringan akhir (selalu):**
-   Buang GRADE 11 (Staf HO).
-   Buang karyawan PHK/terminated.
-   Buang semua grade `<= grade subjek` (hanya grade di atasnya yang
    muncul).

**Pemetaan admin vs kepala (dari nama grade):**

| Grade | Nama | Sifat |
|---|---|---|
| 1 | Karyawan | crew |
| 2 | Group Leader | crew |
| 3 | Admin Divisi | admin |
| 4 | Koordinator Divisi | kepala |
| 5 | Admin Departemen | admin |
| 6 | Kepala Departemen | kepala |
| 7 | Admin Project | admin |
| 8 | Kepala Project | kepala |
| 9 | Admin/Staf Perusahaan | admin |
| 10 | Kepala Perusahaan | kepala |
| 11 | Staf HO | admin |
| 12 | Kepala/GM | kepala |
| 13 | Owner | admin |
| 14 | Super User | kepala |

> Catatan: admin (grade 3, 5, 7, 9, 11) tidak pernah menjadi atasan
> langsung karena selalu dibuang. Kepala (grade genap) menjadi atasan
> berikutnya. Ini yang membuat admin naik **1 level** ke kepala terdekat,
> sedangkan kepala naik **2 level** (melewati admin di sela-selanya).

### 7.3 `HR`

Approver HR diambil dari:
-   Departemen HRGA pada **project yang sama** dengan subjek, **ditambah**
-   HR utama / HO = **grade 11** (Staf HO) bila tersedia.

Filter grade statis (sesuai proyek lama): buang grade `<= 4` dan grade 11
dari kandidat HRGA project (grade 11 justru ditambahkan sebagai HR utama).

### 7.4 `MANAGER` (Kepala Departemen)

Approver adalah yang **role-nya "kepala departemen" (grade 6) dalam project
yang sama** dengan subjek.

### 7.5 Prinsip Kandidat (bukan auto-pilih)

`resolveApprovers` **mengembalikan daftar kandidat** (bisa lebih dari satu
NRP). Pemohon memilih salah satu dari daftar tersebut. Sistem hanya
mempersempit kandidat agar pemohon mudah memilih — bukan memilih otomatis.

Semua aturan di atas berjalan dinamis terhadap data karyawan dan grade,
bukan hardcode NRP.

---

## 8. Function (Rancangan Generik)

Setiap function dirancang **generik** — parameter berupa `form`, `record`,
`level`, `group`, `profile`, bukan hardcode nama form.

| Function | Tanggung jawab | Parameter |
|---|---|---|
| `buildArrEmployees()` | Kumpulkan semua karyawan + org unit + grade | — |
| `getApprovalConfig(form)` | Baca config approval per form (dari `SUPPORT-TABLE`) | `form` |
| `resolveApprovers(group, profile)` | Kembalikan **daftar kandidat** approver per level (bisa >1) | `group`, `profile` |
| `initApproval(form, record, requester, approvers)` | Buat baris tracking per level saat submit | `form`, `record`, `requester`, `approvers` |
| `listApproval({ nrp?, record?, form? })` | Satu query untuk semua pandangan | filter opsional |
| `approve(id, action)` | Set `ACC`/`DECLINE` + tanggal | `id`, `action` |

### Pandangan turunan dari `listApproval`

-   **Atasan**: `listApproval({ nrp: saya, status: null })`
-   **User**: `listApproval({ record: recordSaya })`
-   **HR**: `listApproval({ nrp: saya })` (dengan pemisahan level ber-group
    `HR` di sisi UI bila diperlukan)

---

## 9. Alur End-to-End

1.  **Konfigurasi** — Admin mengisi `SUPPORT-TABLE` untuk form tertentu
    (tabel + level + group + deskripsi + reference).
2.  **Submit** — Saat record form diajukan, sistem memanggil
    `initApproval(...)`.
3.  **Resolve** — Untuk tiap level, `resolveApprovers(group, profile)`
    mengembalikan **daftar kandidat** NRP.
4.  **Pilih** — Pemohon memilih approver dari daftar kandidat (kandidat
    sudah dipersempit agar mudah dipilih).
5.  **Tracking** — Satu baris ditulis ke `database_data_persetujuans` per
    level dengan `status = NULL` dan NRP terpilih.
6.  **Approve** — Approver melihat daftarnya lewat `listApproval` dan
    memanggil `approve(id, 'ACC' | 'DECLINE')`, yang mengisi `status` dan
    `date_change`.

---

## 10. Status Implementasi (Laravel lama vs target)

| Bagian | Laravel lama | Target |
|---|---|---|
| Master EAV (group/level/deskripsi) | ✅ Ada | Dipertahankan |
| Config per form | ✅ `database_persetujuans` | Dipindah ke EAV `SUPPORT-TABLE` |
| Tracking | ✅ `database_data_persetujuans` | Dipertahankan (tabel concrete) |
| Resolve approver | ⚠️ JS, bergantung `arr_employees` | Backend generik (`resolveApprovers`) |
| Build `arr_employees` | ❌ tidak ditemukan | Backend (`buildArrEmployees`) |
| Form buat config | ❌ kosong | UI `SUPPORT-TABLE` |
| Simpan config | ❌ dikomen | Endpoint generik |

---

## 11. Kriteria Penerimaan (Acceptance Criteria)

-   Config approval dapat dikelola dari Database/Data (`SUPPORT-TABLE`).
-   `resolveApprovers` mengembalikan **daftar kandidat** (bisa >1), bukan
    auto-pilih satu approver.
-   Atasan langsung = 1 atau 2 level di atas (admin=1, kepala=2, admin
    tidak masuk daftar); grade 1/2/3 → grade 4.
-   HR = HRGA project yang sama + HR utama (di atas perusahaan/HO).
-   Kepala departemen = role kepala dept dalam project yang sama.
-   Satu tabel tracking menurunkan view atasan, user, dan HR.
-   Data lama `database_data_persetujuans` dapat dimigrasi tanpa ubah
    format status `ACC/DECLINE/NULL`.

---

## 12. Keputusan (resolved)

1.  Filter grade pada resolver memakai **angka statis** (tidak perlu
    dinamis dari nama/kode grade).
2.  **HR utama / HO = grade 11** (Staf HO).
3.  **Kepala departemen = grade 6** (untuk resolver `MANAGER`).
