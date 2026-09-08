# PRD — Arsitektur Caching & Optimasi Kinerja MBG ERP

**Product Requirements Document • Versi 1.0 • 8 September 2026**

Dokumen ini menjadi acuan spesifikasi dan implementasi arsitektur **Caching dan Optimasi Kinerja** pada aplikasi MBG ERP, mencakup backend (**NestJS + Prisma**) dan frontend (**React + Vite**).

Tujuan utama dokumen ini adalah mengeliminasi pengambilan data berulang (*redundant fetching*), mencegah lonjakan beban CPU database server (*database query overload*), dan menjamin kecepatan aplikasi instan (*zero-latency navigation*) dengan mengadopsi prinsip teruji dari sistem Laravel sebelumnya (**`createJsonFileDB`** dan **`getDataDatabase`**).

---

## 1. Executive Summary & Latar Belakang

Berdasarkan audit komprehensif pada frontend dan backend:
1. **Ketiadaan Cache Layer**: Frontend saat ini meng-unmount komponen pada setiap navigasi rute (`react-router-dom`). Saat kembali ke suatu halaman, hook `useEffect` menembak ulang semua HTTP request dari nol.
2. **Beban Berat pada `eavApi.builder()`**: Endpoint `/api/eav/builder` mengeksekusi 6 query Prisma paralel ke database relasional (men-serialize seluruh entitas, field, relasi, template, dan persetujuan). Ini dipanggil berulang-ulang di `Home.tsx`, `DatabaseData.tsx`, dan `DatabaseForm.tsx`.
3. **Waterfall Profil Karyawan di Dashboard**: Untuk menerjemahkan 4 kode/slug (Perusahaan, Project, Jabatan, Departemen), frontend mendownload 4 tabel database secara utuh ke browser.
4. **Pembelajaran dari Sistem Laravel Sebelumnya**:
   Pada sistem Laravel lama (`mbg-online\laravel-mbg`), masalah ini diselesaikan secara sangat efisien melalui:
   * **Server Cache (`generate.json`)**: Skema EAV disimpan dalam file cache. Saat request biasa (`isRefresh == 1`), server tidak menyentuh database sama sekali (CPU DB = 0%). Query DB hanya dijalankan saat ada perubahan form (`isRefresh == 2`).
   * **Client In-Memory & LocalStorage (`db` + `getDataDatabase`)**: Di frontend ada variabel memori `db`. Jika `isRefresh === 0`, data diambil langsung dari memori/localStorage dalam waktu **0 milidetik** tanpa HTTP request.

PRD ini mentransformasikan pola sukses tersebut ke dalam arsitektur modern TypeScript (NestJS Singleton Cache + React Global State Context).

---

## 2. Problem Statement

* **CPU Server Terbebani**: Setiap kali pengguna membuka halaman data/form, server database menjalankan query relasional EAV yang berat berulang kali untuk data yang sebenarnya jarang berubah.
* **Trafik Jaringan Membengkak**: Data skema dan tabel master ditransfer berulang kali lewat jaringan, memboroskan kuota dan memperlambat koneksi yang terbatas.
* **Perpindahan Halaman Lambat**: Pengguna harus menunggu loading indikator saat berpindah antar menu dasar di ERP.

---

## 3. Product Goals & Metrik Keberhasilan

| Metrik | Kondisi Saat Ini | Target dengan Caching |
|---|---|---|
| **Query Database untuk Skema Rutin** | 6 query per navigasi halaman | **0 query** (dilayani langsung dari RAM Server) |
| **Response Time Server untuk Skema** | ~300ms – 600ms | **< 15ms** (in-memory cache) |
| **HTTP Request saat Pindah Menu** | 1 – 6 request per halaman | **0 request** (membaca dari Global React Store) |
| **Waktu Render Pindah Halaman** | ~400ms – 1200ms | **Instant (0 – 10ms)** |
| **Waktu Tunggu Awal Login** | Tetap cepat | **Tidak ada perlambatan login (Lazy Cache)** |

---

## 4. Non-Goals (Batasan Cakupan V1)

* V1 tidak menggunakan Redis eksternal demi kemudahan deployment (cukup In-Memory Cache di proses NestJS + fallback persistensi lokal).
* V1 tidak mengubah struktur tabel Prisma database yang sudah ada.
* V1 tidak mengorbankan keamanan/otorisasi (setiap endpoint tetap dilindungi JWT guard).

---

## 5. Arsitektur Teknis & Alur Kerja

```
[ BROWSER / CLIENT ]                                [ BACKEND (NestJS) ]
        |                                                    |
        +-- (1) Buka Halaman / Menu                          |
        |       Cek React EavContext                         |
        |       Sudah ada di RAM / localStorage?             |
        |       [YA] --> Render INSTAN (0ms, 0 HTTP)         |
        |       [TIDAK / First Load]                         |
        |                 |                                  |
        |                 v (HTTP Request)                   |
        +--------------------------------------------------> +-- (2) EavCacheService
                                                             |       Ada di RAM Server?
                                                             |       [YA] --> Return dlm 5-10ms (NO DB HIT)
                                                             |       [TIDAK / Invalidate]
                                                             |                 |
                                                             |                 v
                                                             |       (3) Query Prisma DB (6 queries)
                                                             |       Simpan ke RAM Server
                                                             +------------------+
                                                             | Return Payload   |
        +<---------------------------------------------------+------------------+
        |
        v
  (4) Simpan ke React EavContext + localStorage
  (5) Render UI
```

---

## 6. Rincian Komponen Teknis

### 6.1. Sisi Backend (NestJS)

1. **In-Memory Cache di `EavService`**:
   * Menyimpan objek skema `buildMetadata()` di memori RAM proses NestJS.
   * Setiap pemanggilan `GET /api/eav/builder` tanpa parameter langsung mengembalikan objek dari RAM.
2. **Automatic Cache Invalidation (Mirip `isRefresh == 2` di Laravel)**:
   * Cache server otomatis dibersihkan / diperbarui setiap kali terjadi aksi penulisan:
     * `createEntity`, `updateEntity`, `deleteEntity`
     * `createField`, `updateField`, `deleteField`
     * `approvalApi.saveConfig`
3. **Endpoint Profil Ringkas**:
   * Menghilangkan waterfall `profile.ts` dengan menyediakan data organisasi karyawan yang sudah diterjemahkan langsung dari server pada `/access/bootstrap` atau `/access/me`.

### 6.2. Sisi Frontend (React + Vite)

1. **`EavContext` & `EavProvider` (`src/context/EavContext.tsx`)**:
   * Diletakkan di level root (`App.tsx`), membungkus seluruh aplikasi.
   * State yang dikelola:
     * `entities`: Record entitas beserta field-nya.
     * `menus`: Record grup menu.
     * `fieldShows`: Konfigurasi tampilan gabungan.
     * `persetujuan`: Konfigurasi alur approval per form.
     * `masterOptions`: Map cache untuk record tabel referensi (`DARI-TABEL`), misal `PERUSAHAAN`, `DEPARTEMEN`, dsb.
     * `isInitialized`: Penanda apakah skema sudah dimuat ke memori.
   * Metode:
     * `getSchema()`: Mengembalikan skema aktif dari RAM/localStorage.
     * `getMasterRecords(tableCode)`: Mengambil record master dengan sistem cache (hanya fetch jika belum ada di RAM).
     * `invalidateSchema()`: Memaksa sinkronisasi ulang dengan backend saat admin melakukan perubahan form.
2. **Pola Lazy-Loading & Cache-First**:
   * Saat **Login**: Tidak membebani browser dengan download massal.
   * Saat **Buka Menu**: Membaca dari cache memori secara instan.
3. **Optimasi Halaman Spesifik**:
   * **`Home.tsx`**: Membaca jumlah entitas aktif dan menu langsung dari `EavContext` (0 HTTP call).
   * **`DatabaseData.tsx`**: Menggunakan skema dan master record dari `EavContext`. Menghilangkan panggilan redundan `approvalApi.config(code)`.
   * **`DatabaseForm.tsx`**: Membaca skema dari `EavContext`, memicu `invalidateSchema()` setelah simpan form, serta menerapkan `Promise.all` untuk batching field.
   * **`MySlip.tsx`**: Menyimpan `ArrayBuffer` PDF bulan yang sudah dibuka ke dalam cache in-memory agar bolak-balik bulan dan tombol unduh berjalan seketika tanpa request ganda.

---

## 7. Rencana Rilis & Milestone

1. **Milestone 1**: Implementasi In-Memory Schema Cache di Backend NestJS + Invalidation.
2. **Milestone 2**: Pembuatan `EavContext` di Frontend React & integrasi persistensi `localStorage`.
3. **Milestone 3**: Refactor `DatabaseData.tsx`, `DatabaseForm.tsx`, dan `Home.tsx` untuk menggunakan context.
4. **Milestone 4**: Verifikasi benchmarking kecepatan (sebelum vs sesudah) dan pengujian integritas form.
