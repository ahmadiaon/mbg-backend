# API External Login MBG

Endpoint ini dipakai aplikasi lain untuk login menggunakan **NRP + PIN**.
Sumber identitas dan privilege tetap `mbg-backend`. Aplikasi pemanggil bebas
mengelola session dan alur pekerjaannya sendiri.

## Endpoint

```http
POST https://api.example.com/api/auth/external-login
Content-Type: application/json
```

Development lokal:

```http
POST http://localhost:3000/api/auth/external-login
```

## Request

```json
{
  "nrp": "MBLE-0422003",
  "pin": "123456"
}
```

Aturan:

- `nrp` wajib string.
- `pin` wajib tepat 6 digit.
- User harus aktif.
- PIN diverifikasi menggunakan bcrypt.
- PIN dan hash PIN tidak pernah dikembalikan.
- Gunakan HTTPS di production.
- Jangan mencatat PIN ke log.

## Response sukses

```json
{
  "status": "success",
  "accessToken": "<jwt>",
  "tokenType": "Bearer",
  "expiresIn": "7d",
  "user": {
    "id": 1,
    "nrp": "MBLE-0422003",
    "name": "Ahmadi",
    "email": "user@example.com",
    "role": 15,
    "active": true
  },
  "authority": {
    "roleLevels": [15],
    "statuses": [],
    "features": {
      "HISTORICAL-DATA": {
        "code": "HISTORICAL-DATA",
        "name": "Historical Data",
        "route": "/database/data",
        "icon": "bi bi-clock-history",
        "read": true,
        "write": true,
        "edit": true,
        "delete": true,
        "import": true,
        "export": true,
        "submit": true,
        "approve": true,
        "reject": true,
        "history": true,
        "restore": true,
        "scopes": ["ALL_SYSTEM"]
      }
    }
  }
}
```

## Arti privilege

| Properti | Arti |
|---|---|
| `roleLevels` | Semua grade/role dari status kerja aktif user. |
| `statuses` | Status kerja aktif beserta posisi organisasinya. |
| `read` | Boleh melihat feature/data. |
| `write` | Boleh membuat pengajuan/data baru. |
| `edit` | Boleh mengubah data sesuai policy. |
| `delete` | Boleh menghapus/membatalkan sesuai policy. |
| `import` | Boleh import data. |
| `export` | Boleh export data. |
| `submit` | Boleh mengajukan perubahan. |
| `approve` | Boleh menyetujui sesuai workflow. |
| `reject` | Boleh menolak sesuai workflow. |
| `history` | Boleh melihat riwayat. |
| `restore` | Boleh memulihkan versi. |
| `scopes` | Cakupan data yang boleh diakses. |

Privilege dihitung dari:

```text
user aktif
→ semua status kerja aktif
→ grade/role dari status kerja
→ feature policy
→ user override
→ effective permission + scope
```

Jika user mempunyai beberapa status kerja aktif, role dan scope digabung.

## Contoh cURL

```bash
curl -X POST "https://api.example.com/api/auth/external-login" \
  -H "Content-Type: application/json" \
  -d '{"nrp":"MBLE-0422003","pin":"123456"}'
```

## Contoh JavaScript

```js
const response = await fetch(
  'https://api.example.com/api/auth/external-login',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nrp: 'MBLE-0422003',
      pin: '123456',
    }),
  },
);

if (!response.ok) throw new Error('Login gagal');

const result = await response.json();
const token = result.accessToken;
const fileAccess = result.authority.features['FILE-MANAGER'];

if (fileAccess?.read) {
  // Buka modul file manager.
}
```

## Contoh Node.js

```js
const response = await fetch(
  'https://api.example.com/api/auth/external-login',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nrp, pin }),
  },
);

const result = await response.json();
if (!response.ok) throw new Error(result.message || 'Login gagal');

// Simpan token di server-side session aplikasi pemanggil.
session.mbGAccessToken = result.accessToken;
session.mbGAuthority = result.authority;
```

## Memakai JWT

```http
GET https://api.example.com/api/access/bootstrap
Authorization: Bearer <accessToken>
```

Aplikasi lain dapat meneruskan token tersebut ke API MBG yang menerima JWT.
Tetap lakukan pemeriksaan privilege di aplikasi pemanggil untuk pekerjaannya.

## Kode error

| HTTP | Arti |
|---:|---|
| 400 | NRP/PIN tidak sesuai format. |
| 401 | NRP atau PIN salah, user nonaktif, atau token invalid. |
| 403 | User tidak memiliki privilege untuk aksi tertentu. |
| 404 | Data yang diminta tidak ditemukan. |
| 429 | Terlalu banyak percobaan login. |

## Upload file ke Assets API

Upload file dilakukan ke server Assets, bukan ke endpoint login MBG:

```http
POST https://assets.mitrabaritogroup.com/upload
Content-Type: multipart/form-data
x-api-token: <ASSETS_API_TOKEN>
```

Field multipart:

```text
file
folder
filename
```

Contoh:

```bash
curl -X POST "https://assets.mitrabaritogroup.com/upload" \
  -H "x-api-token: <ASSETS_API_TOKEN>" \
  -F "file=@./kontrak.pdf" \
  -F "folder=karyawan/kontrak" \
  -F "filename=MBLE-0422003-kontrak.pdf"
```

Response:

```json
{
  "success": true,
  "url": "https://assets.mitrabaritogroup.com/uploads/karyawan/kontrak/MBLE-0422003-kontrak.pdf"
}
```

Aturan upload:

- Token Assets hanya boleh berada di server.
- Jangan kirim `x-api-token` dari browser.
- Binary tidak disimpan di EAV/MySQL.
- Database hanya menyimpan URL atau file reference.
- Folder dan filename tetap disanitasi server Assets.
- URL hasil dapat disimpan pada field `FILE` atau `FILE-PDF`.

## Alur aplikasi lain

```text
User input NRP + PIN
    ↓
POST /api/auth/external-login
    ↓
Terima accessToken + authority
    ↓
Aplikasi pemanggil membuat session
    ↓
Cek feature/action dari authority
    ↓
Jalankan pekerjaan aplikasi
```

Endpoint ini tidak membuat user baru di aplikasi pemanggil dan tidak mengubah
database aplikasi pemanggil.
