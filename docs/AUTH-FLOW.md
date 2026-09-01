# Alur Autentikasi

Diagram alur login & pembuatan PIN aplikasi MBG.

## Login Pertama (belum ada PIN)

```
Karyawan                        Sistem                        HR / Admin
   │                               │                               │
   │ 1. Input NRP                  │                               │
   │──────────────────────────────▶│                               │
   │                               │ 2. Cek user (POST /auth/check)│
   │                               │    → found, isPin=false        │
   │                               │                               │
   │ 3. Input NIK KTP              │                               │
   │──────────────────────────────▶│                               │
   │                               │ 4. Login (POST /auth/login)    │
   │                               │    → status=need_verification  │
   │                               │    → generate token 8-char     │
   │                               │      sha256(nrp)[:8] uppercase │
   │ 5. Tampil "Verifikasi WA"     │                               │
   │    (tombol WhatsApp)          │                               │
   │──────────────────────────────▶│                               │
   │                               │                               │
   │ 6. Kirim pesan WA             │                               │
   │──────────────────────────────────────────────────────────────▶│
   │                               │                               │ 7. Baca pesan,
   │                               │                               │    generate link
   │                               │                               │    /authentication/{token}
   │ 8. Buka link                  │                               │
   │──────────────────────────────▶│ 9. Verifikasi token           │
   │                               │    (GET /auth/validation/:token)│
   │                               │    → found=true                │
   │ 10. Buat PIN 6 digit          │                               │
   │──────────────────────────────▶│ 11. Simpan PIN (POST /auth/set-pin)│
   │                               │     → token dihapus (dipakai)  │
   │                               │                               │
```

Token 8 karakter bersifat **deterministik** (`sha256(nrp)` 8 huruf besar),
sehingga HR dapat menghitungnya dari NRP tanpa query database.

## Login Berikutnya (sudah ada PIN)

```
Karyawan                    Sistem
   │                           │
   │ 1. Input NRP              │
   │──────────────────────────▶│
   │                           │ 2. Cek user → isPin=true
   │ 3. Input PIN 6 digit      │
   │──────────────────────────▶│
   │                           │ 4. Login (POST /auth/login)
   │                           │    → status=success + JWT
   │ 5. Masuk aplikasi         │
   │──────────────────────────▶│
```

## Detail Teknis

- **NIK** disimpan sebagai hash bcrypt di `user.password` (login pertama).
- **PIN** 6 digit disimpan sebagai hash bcrypt di `user.pin`.
- `user.pin == null` → sistem minta NIK; `user.pin` terisi → sistem minta PIN.
- Token validasi disimpan di `user.authLogin`, dihapus setelah PIN dibuat.
- Nomor WhatsApp admin: `WA_ADMIN_NUMBER` (default `6281255897044`).
