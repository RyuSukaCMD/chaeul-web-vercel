# ✦ Chaeul Web — Vercel Edition

Website sewa bot WhatsApp Chaeul, siap **deploy ke Vercel** (serverless) &
**responsif di semua device** (HP kecil, HP, tablet, desktop, layar besar).

Landing page elegan, paket sewa, live update, sistem lisensi, admin dashboard,
kupon, payment gateway — berjalan di serverless functions + Upstash Redis.

## 🚀 Deploy ke Vercel

1. Import repo ini di [vercel.com/new](https://vercel.com/new).
2. Buat **Upstash Redis** (gratis) di [console.upstash.com](https://console.upstash.com):
   database Redis → tab **REST API** → salin URL & Token.
3. Set **Environment Variables** di Vercel (Settings → Environment Variables):
   ```
   UPSTASH_REDIS_REST_URL   = https://xxxx.upstash.io
   UPSTASH_REDIS_REST_TOKEN = Axxxx...
   ADMIN_TOKEN              = token-admin-rahasia
   SYNC_TOKEN              = token-sync-rahasia
   ```
4. **Deploy.** URL: `https://namamu.vercel.app` — halaman admin di `/admin`.

> Tanpa Upstash pun web tetap jalan (mode in-memory untuk demo), tapi data
> reset saat cold start. Untuk produksi, set Upstash.

## 📱 Responsif Semua Device

Breakpoint: ≤360px, ≤480px, ≤768px, ≤900px, ≥1440px + landscape HP.
Tombol full-width & touch target besar di HP. Dashboard admin adaptif.
Mendukung `prefers-reduced-motion` untuk aksesibilitas.

## 🧩 Struktur (max 6 serverless functions — aman untuk Hobby plan)

| Function            | Fungsi                                                        |
| ------------------- | ------------------------------------------------------------ |
| `api/public.js`     | stats, plans, durations, users, groups, fishing, live, order, coupon |
| `api/sync.js`       | terima data user/grup/fishing dari bot                       |
| `api/license.js`    | verify (bot) + kelola lisensi (admin)                        |
| `api/admin.js`      | auth, overview, order, coupon (admin)                        |
| `api/provision.js`  | job auto-provisioning + notifikasi                           |
| `api/payment.js`    | Midtrans/Xendit + webhook                                    |

Semua endpoint memakai `?action=`. Ada juga rewrite di `vercel.json` agar path
lama (mis. `/api/sync/all`, `/api/license/verify`) tetap bekerja — jadi **bot
tidak perlu diubah**.

## 📡 API (ringkas)

- Publik: `/api/stats` `/api/live` `/api/users` `/api/groups` `/api/fishing`
  `/api/plans` `/api/durations` `/api/order` `/api/coupon`
- Bot (header `x-sync-token`): `/api/sync/all|user|group|fishing`,
  `/api/provision/jobs|report|notifications`
- Lisensi: `/api/license/verify`
- Admin (header `x-admin-token`): `/api/admin?action=auth|overview|order|coupon`,
  `/api/license?action=create|list|status|extend|revoke|delete`
- Payment: `/api/payment?action=mode|create|webhook-midtrans|webhook-xendit`

## 🔗 Integrasi Bot

Di `config.js` bot:
```js
global.license = {
  enable: true,
  key: process.env.CHAEUL_LICENSE,
  apiUrl: "https://namamu.vercel.app",
  adminToken: process.env.CHAEUL_ADMIN_TOKEN, // = ADMIN_TOKEN
  syncToken: process.env.CHAEUL_SYNC_TOKEN    // = SYNC_TOKEN
}
```

© Chaeul
