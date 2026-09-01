# PRD --- MBG File Management Platform

**Product Requirements Document • Version 1.0 • 1 September 2026**

Dokumen ini menjadi acuan pengembangan aplikasi File Management Platform
milik Mitra Barito Group (MBG). Prioritas utama adalah membangun sistem
baru tanpa merusak atau mengubah kontrak endpoint aplikasi
`assets.mitrabaritogroup.com` yang sudah berjalan.

## 1. Executive Summary

MBG akan mengembangkan aplikasi file management berbasis Node.js yang
pada tahap pengembangan berjalan di Mini PC Ubuntu Server dan dapat
diakses melalui `file.mitrabaritogroup.com`. Pada tahap berikutnya,
aplikasi akan direverse/proxy agar dapat diakses sesuai kebutuhan
jaringan dan/atau dipindahkan ke VPS Ubuntu Server.

Aplikasi baru akan menyediakan Web File Manager dan REST API. REST API
menjadi fondasi integrasi dengan OpenCode yang berjalan di Mini PC,
sehingga file seperti database, backup, sample data, dokumen, dan arsip
dapat diunggah dari laptop lalu diambil oleh OpenCode melalui API.

## 2. Problem Statement

-   Laptop dan Mini PC merupakan lingkungan kerja yang berbeda sehingga
    pertukaran file development tidak praktis.
-   OpenCode pada Mini PC membutuhkan cara terstruktur untuk memperoleh
    file dari laptop.
-   Aplikasi `assets.mitrabaritogroup.com` sudah digunakan oleh aplikasi
    lain sehingga endpoint existing tidak boleh rusak.
-   Diperlukan platform file management yang nantinya dapat
    di-online-kan dan digunakan oleh banyak client melalui API.

## 3. Product Goals

-   Menyediakan file manager berbasis web.
-   Menyediakan REST API versioned untuk OpenCode dan aplikasi lain.
-   Mendukung upload, download, delete, rename, folder, search, dan
    metadata file.
-   Menggunakan SQL untuk metadata dan filesystem untuk isi file.
-   Menjaga backward compatibility endpoint legacy.
-   Menjalankan development awal di Mini PC Ubuntu Server.
-   Menyiapkan arsitektur yang portable untuk deployment ke VPS Ubuntu
    Server.
-   Menyediakan authentication web dan API token.
-   Menyediakan activity log dan fondasi file versioning.

## 4. Non-Goals V1

-   Tidak mengubah atau menghapus endpoint legacy `/upload`.
-   Tidak memindahkan file existing secara paksa.
-   Tidak menyimpan binary file sebagai BLOB di database.
-   Tidak membuat Mini PC sebagai public file server utama.
-   Tidak membuat storage terdistribusi/multi-node pada V1.

## 5. Target Architecture

### Development

``` text
Laptop → Browser → file.mitrabaritogroup.com → Mini PC Ubuntu Server → Node.js → SQL + Filesystem
```

Mini PC juga menjalankan OpenCode. OpenCode mengakses File Manager
melalui HTTPS/API lokal atau domain yang dipetakan ke Mini PC selama
fase development.

### Production

``` text
Internet → VPS Ubuntu Server → Nginx/Reverse Proxy → Node.js File Manager → MySQL/MariaDB + Filesystem
```

Mini PC/OpenCode menjadi API client. Reverse proxy digunakan ketika
`file.mitrabaritogroup.com` ingin diakses dari luar jaringan.

## 6. Domain Strategy

Domain aplikasi baru:

``` text
file.mitrabaritogroup.com
```

Tidak menggunakan subdomain baru lainnya untuk fungsi utama. Pada tahap
development, domain tersebut diarahkan ke Mini PC sesuai konfigurasi
DNS/proxy yang tersedia. Pada tahap production, domain dapat
diarahkan/reverse proxied ke VPS.

Domain `assets.mitrabaritogroup.com` tetap dipertahankan untuk aplikasi
existing. Domain tersebut tidak boleh diganti menjadi
`file.mitrabaritogroup.com` dan endpoint existing tidak boleh dipaksa
menggunakan API baru.

## 7. Existing Legacy Application --- WAJIB DIPERTAHANKAN

Kode berikut adalah baseline compatibility contract. Development baru
harus dilakukan secara additive. Refactor internal diperbolehkan selama
perilaku eksternal endpoint tetap kompatibel.

``` javascript
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Helper untuk membersihkan nama folder (hindari path traversal)
function sanitizeFolder(folder = '') {
    // Hapus karakter berbahaya, biarkan huruf, angka, dash, underscore, slash
    return folder
        .replace(/\.\./g, '')             // cegah naik direktori
        .replace(/[^a-zA-Z0-9\/\-_]/g, '_')
        .replace(/^\/+/, '');             // hilangkan slash di awal
}

// Konfigurasi penyimpanan
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const baseDir = path.join(__dirname, 'uploads');
        // Ambil folder dari body, default ke root uploads
        const rawFolder = req.body.folder || '';
        const folder = sanitizeFolder(rawFolder);
        const finalDir = path.join(baseDir, folder);

        // Buat folder jika belum ada
        fs.mkdir(finalDir, { recursive: true }, (err) => {
            if (err) return cb(err);
            cb(null, finalDir);
        });
    },
    filename: (req, file, cb) => {
        const name = req.body.filename || file.originalname;
        const safeName = name.replace(/[^a-zA-Z0-9\.\-_]/g, '_');
        cb(null, safeName);
    }
});

const upload = multer({ storage });

// Token keamanan
const API_TOKEN = 'secret-token-anda';

function authToken(req, res, next) {
    if (req.headers['x-api-token'] !== API_TOKEN) {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    next();
}

// Endpoint upload file — LEGACY CONTRACT
app.post('/upload', authToken, upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'File tidak ada' });
    }

    const folder = sanitizeFolder(req.body.folder || '');
    const url = `https://assets.mitrabaritogroup.com/uploads/${folder ? folder + '/' : ''}${req.file.filename}`;
    res.json({ success: true, url });
});

// Sajikan file statis dari folder uploads — LEGACY CONTRACT
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Assets API running on port ${PORT}`));
```

## 8. Compatibility Rules

1.  `POST /upload` harus tetap tersedia.
2.  Header `x-api-token` harus tetap diterima untuk legacy endpoint.
3.  Multipart field `file` tetap bernama `file`.
4.  Multipart field `folder` tetap didukung.
5.  Multipart field `filename` tetap didukung.
6.  Response sukses legacy tetap berbentuk
    `{ success: true, url: '...' }`.
7.  URL response legacy tetap menggunakan
    `https://assets.mitrabaritogroup.com/uploads/...`.
8.  `GET /uploads/*` tetap dapat melayani file existing.
9.  Folder `uploads` existing tidak boleh dihapus atau dipindahkan tanpa
    migration plan.
10. API baru harus menggunakan namespace `/api/v1` dan tidak
    menggantikan endpoint legacy.

## 9. Proposed V1 Web Features

-   Login/logout pengguna.
-   Dashboard file manager.
-   Folder tree.
-   Create folder.
-   Upload single/multiple files.
-   Drag & drop upload.
-   List/grid view.
-   Search file.
-   Download file.
-   Delete file dengan confirmation.
-   Rename file.
-   Move/copy file.
-   File metadata: name, size, MIME type, hash, folder, uploader,
    timestamps.
-   Activity log.
-   Basic file preview bila memungkinkan.

## 10. REST API V1

  Method   Endpoint                       Purpose
  -------- ------------------------------ ------------------------
  GET      `/api/v1/files`                List/search files
  GET      `/api/v1/files/:id`            Metadata file
  POST     `/api/v1/files`                Upload file
  GET      `/api/v1/files/:id/download`   Download
  DELETE   `/api/v1/files/:id`            Delete
  PATCH    `/api/v1/files/:id`            Rename/update metadata
  GET      `/api/v1/folders`              List folders
  POST     `/api/v1/folders`              Create folder
  PATCH    `/api/v1/folders/:id`          Rename/move folder
  DELETE   `/api/v1/folders/:id`          Delete folder

## 11. API Authentication

API baru menggunakan Bearer Token:

``` text
Authorization: Bearer <API_TOKEN>
```

Token disimpan secara aman dan tidak hardcoded di source code.

Legacy API tetap menerima `x-api-token` agar aplikasi existing tidak
perlu diubah pada tahap awal.

## 12. Database Design

### users

``` text
id
name
email/username
password_hash
role
status
created_at
updated_at
```

### folders

``` text
id
parent_id
name
path
created_by
created_at
updated_at
```

### files

``` text
id
folder_id
filename
original_filename
storage_path
mime_type
size
sha256
uploaded_by
created_at
updated_at
```

### api_tokens

``` text
id
name
token_hash
owner/user_id
scopes
last_used_at
expires_at
status
created_at
```

### activity_logs

``` text
id
user_id/token_id
action
file_id/folder_id
metadata_json
ip_address
user_agent
created_at
```

### file_versions

``` text
id
file_id
version
storage_path
size
sha256
created_by
created_at
```

Database menyimpan metadata saja. Binary file tetap berada di
filesystem/storage. MySQL/MariaDB dipilih untuk production karena
platform akan online dan memiliki API/client lebih dari satu.

## 13. Storage Strategy

Existing `uploads/` tetap dipertahankan untuk compatibility. Sistem baru
menggunakan storage service internal yang dapat membaca/menulis storage
yang sama tanpa mengubah URL legacy.

Contoh:

``` text
uploads/
├── database/
├── project/
├── backup/
└── documents/
```

File existing dapat di-index ke tabel `files` secara bertahap. Tidak ada
kewajiban memindahkan file lama pada V1.

## 14. Environment Configuration

``` env
APP_ENV=development
APP_URL=https://file.mitrabaritogroup.com

PORT=3001

DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=mbg_file_manager
DB_USERNAME=
DB_PASSWORD=

STORAGE_PATH=./uploads

LEGACY_API_TOKEN=secret-token-anda
JWT_OR_SESSION_SECRET=

MAX_UPLOAD_SIZE_MB=1024
```

Nilai `LEGACY_API_TOKEN` pada production harus sama dengan token
existing selama aplikasi lama belum dimigrasikan. Setelah seluruh client
legacy dimigrasikan, token dapat dirotasi melalui change plan.

## 15. OpenCode Integration

OpenCode di Mini PC menggunakan API V1, bukan filesystem VPS secara
langsung.

``` env
ASSETS_API_URL=https://file.mitrabaritogroup.com/api/v1
ASSETS_API_TOKEN=<secure-token>
```

Workflow:

``` text
User upload development.sql dari laptop
        ↓
File Manager menyimpan file + metadata
        ↓
OpenCode memanggil GET /api/v1/files
        ↓
OpenCode mengunduh file
        ↓
File digunakan pada project Mini PC
```

## 16. Security Requirements

-   HTTPS wajib untuk akses online.
-   Password harus di-hash dengan algoritma password hashing yang aman.
-   API token tidak boleh disimpan plaintext bila tidak diperlukan;
    simpan hash/secure secret.
-   Path traversal harus dicegah pada folder dan filename.
-   Jangan pernah mengizinkan akses filesystem arbitrary dari parameter
    URL.
-   Upload size harus dibatasi.
-   MIME type, filename, dan extension harus divalidasi.
-   File `.env`, credential, private key, dan secret tidak boleh
    otomatis diekspos sebagai public static asset.
-   Rate limiting untuk endpoint API dan authentication.
-   Audit log untuk upload/delete/rename/move/download penting.
-   CORS tidak boleh dibiarkan wildcard pada production jika tidak
    diperlukan.
-   Storage managed tidak boleh dapat diakses bypass terhadap
    authorization.

## 17. Reverse Proxy / Deployment

### Development --- Mini PC

-   Ubuntu Server
-   Node.js
-   MySQL/MariaDB
-   Nginx atau reverse proxy yang tersedia
-   PM2 atau systemd
-   `file.mitrabaritogroup.com` → Mini PC

### Production --- VPS

-   Ubuntu Server VPS
-   Nginx sebagai reverse proxy
-   HTTPS certificate
-   Node.js application service
-   MySQL/MariaDB
-   Filesystem storage
-   `file.mitrabaritogroup.com` → VPS

## 18. Suggested Project Structure

``` text
mbg-file-manager/
├── src/
│   ├── app.js
│   ├── server.js
│   ├── config/
│   ├── routes/
│   │   ├── legacy.routes.js
│   │   ├── api.routes.js
│   │   └── web.routes.js
│   ├── controllers/
│   ├── services/
│   │   ├── storage.service.js
│   │   ├── file.service.js
│   │   └── auth.service.js
│   ├── middleware/
│   │   ├── legacyAuth.js
│   │   ├── apiAuth.js
│   │   └── upload.js
│   ├── models/
│   └── utils/
├── public/
│   ├── css/
│   ├── js/
│   └── assets/
├── views/
├── uploads/
├── migrations/
├── .env
├── .env.example
├── package.json
└── README.md
```

## 19. Development Rules --- Critical

1.  Jangan menghapus endpoint `/upload`.
2.  Jangan mengubah response contract `/upload`.
3.  Jangan mengubah URL domain `assets.mitrabaritogroup.com` yang
    dikembalikan oleh legacy upload.
4.  Jangan memindahkan `uploads/` existing tanpa backup dan migration
    test.
5.  Pisahkan route legacy dari route API V1.
6.  Gunakan service layer agar legacy dan API V1 dapat menggunakan
    storage service yang sama.
7.  Semua perubahan legacy harus diuji menggunakan integration test.
8.  Gunakan `.env` untuk secret dan konfigurasi.
9.  Semua API baru harus menggunakan prefix `/api/v1`.
10. Perubahan schema database harus menggunakan migration.

## 20. Acceptance Criteria V1

-   Aplikasi dapat dijalankan di Ubuntu Server Mini PC.
-   `file.mitrabaritogroup.com` dapat membuka Web File Manager pada
    environment development.
-   User dapat login.
-   User dapat membuat folder.
-   User dapat upload satu atau banyak file.
-   User dapat melihat daftar file.
-   User dapat mencari file.
-   User dapat download file.
-   User dapat rename/move/delete file dengan authorization.
-   Metadata file tersimpan di MySQL/MariaDB.
-   Isi file tersimpan di filesystem.
-   OpenCode dapat menggunakan API V1 dengan Bearer Token.
-   Legacy `POST /upload` tetap menghasilkan response dan URL yang sama.
-   Legacy `GET /uploads/*` tetap dapat mengakses file existing.
-   Existing application yang menggunakan `assets.mitrabaritogroup.com`
    tidak mengalami perubahan kontrak.
-   Deployment dapat dipindahkan dari Mini PC ke VPS tanpa perubahan
    besar pada source code.
-   Secrets tidak hardcoded pada production source code.

## 21. Testing Strategy

-   Legacy endpoint regression test: `POST /upload`.
-   Legacy static file test: `GET /uploads/...`.
-   Upload API test.
-   Download API test.
-   Authorization test.
-   Path traversal test.
-   Invalid file/upload size test.
-   Delete/rename/move authorization test.
-   Database migration test.
-   End-to-end test dari laptop → Mini PC → File Manager.
-   OpenCode API integration test.
-   Reverse proxy test sebelum online production.

## 22. Roadmap

  -----------------------------------------------------------------------------
  Phase                   Focus                   Deliverables
  ----------------------- ----------------------- -----------------------------
  Phase 1                 Baseline &              Pisahkan legacy route,
                          compatibility           konfigurasi `.env`, project
                                                  structure, test endpoint
                                                  existing

  Phase 2                 Core backend            MySQL/MariaDB, folder, files,
                                                  storage service,
                                                  authentication, API V1

  Phase 3                 Web File Manager        UI, upload, drag/drop, folder
                                                  tree, search, download,
                                                  delete, rename, move

  Phase 4                 OpenCode integration    API token, client workflow,
                                                  Mini PC integration

  Phase 5                 Hardening               Security, audit log, rate
                                                  limit, validation, regression
                                                  tests

  Phase 6                 Reverse                 VPS deployment atau reverse
                          proxy/production        proxy dari
                                                  `file.mitrabaritogroup.com`
  -----------------------------------------------------------------------------

## 23. Future Features

-   File versioning penuh.
-   Trash/restore.
-   Role-based access control.
-   Folder-level permissions.
-   Signed temporary download URL.
-   Chunked/resumable upload untuk file besar.
-   ZIP/extract.
-   Checksum verification.
-   Storage quota.
-   Object storage/S3-compatible backend bila diperlukan.
-   Webhook/event notification.
-   Multi-project/workspace.

## 24. Final Architectural Decision

`file.mitrabaritogroup.com` adalah aplikasi File Management Platform
baru. Pada tahap development aplikasi berjalan di Mini PC Ubuntu Server.
Pada tahap production aplikasi dapat dipindahkan ke VPS Ubuntu Server
atau diakses melalui reverse proxy.

Aplikasi `assets.mitrabaritogroup.com` tetap menjadi legacy asset
service dan endpoint `/upload` serta `/uploads/*` harus tetap
kompatibel.

Dengan pendekatan ini, pengembangan fitur baru tidak memaksa aplikasi
existing untuk berubah. Legacy API dan API V1 berjalan berdampingan dan
berbagi storage service yang sama.

------------------------------------------------------------------------

**END OF PRD --- MBG FILE MANAGEMENT PLATFORM v1.0**
