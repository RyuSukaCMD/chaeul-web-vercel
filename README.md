# ✦ Chaeul Web — Vercel Edition

Website sewa bot WhatsApp Chaeul, **dioptimalkan untuk Vercel** (serverless) &
**responsif di semua device** (HP kecil, HP, tablet, desktop, layar besar).

Fungsional identik dengan versi VPS: landing page elegan, paket sewa, live update,
sistem lisensi, admin dashboard, kupon, payment gateway — tapi berjalan di
serverless functions + storage Upstash Redis.

## 🚀 Deploy ke Vercel (1-klik)

1. **Fork / import repo** ini ke Vercel:
   - [vercel.com/new](https://vercel.com/new) → pilih repo `chaeul-web-vercel`
2. **Buat Upstash Redis** (gratis) di [console.upstash.com](https://console.upstash.com):
   - Buat database Redis → buka tab **REST API** → salin URL & Token
3. **Set Environment Variables** di Vercel (Settings → Environment Variables):
   ```
   UPSTASH_REDIS_REST_URL   = https://xxxx.upstash.io
   UPSTASH_REDIS_REST_TOKEN = Axxxx...
   ADMIN_TOKEN              = token-admin-rahasia
   SYNC_TOKEN              = token-sync-rahasia
   ```
4. **Deploy.** Selesai! URL: `https://namamu.vercel.app`

> **Auto-update:** Vercel otomatis re-deploy setiap kali kamu `git push` — tidak
> perlu webhook manual.

## 📱 Responsif Semua Device

- Breakpoint: ≤360px, ≤480px, ≤768px, ≤900px, ≥1440px + landscape HP
- Tombol full-width & touch target besar di HP
- `prefers-reduced-motion` untuk aksesibilitas
- Dashboard admin adaptif (sidebar → topbar di mobile)

## ⚙️ Beda dengan versi VPS

| Aspek         | VPS                    | Vercel (ini)                       |
| ------------- | ---------------------- | ---------------------------------- |
| Runtime       | Express server         | Serverless functions (`/api/*`)    |
| Live update   | SSE (real-time)        | Polling `/api/live` (tiap 6 detik) |
| Storage       | File JSON              | Upstash Redis (REST)               |
| Auto-update   | GitHub webhook         | Native Vercel Git integration      |

## 📡 API

Publik: `/api/stats` `/api/live` `/api/users` `/api/groups` `/api/fishing`
`/api/plans` `/api/durations` `/api/order` `/api/coupon`

Lisensi (bot): `/api/license/verify`

Sync (bot, header `x-sync-token`): `/api/sync/all` `/api/sync/user`
`/api/sync/group` `/api/sync/fishing` `/api/provision?action=...`

Admin (header `x-admin-token`): `/api/admin/auth` `/api/admin/overview`
`/api/admin/order?action=...` `/api/admin/coupon?action=...`
`/api/license/manage?action=...`

Payment: `/api/payment?action=mode|create|webhook-midtrans|webhook-xendit`

## 🔗 Integrasi Bot

Di `config.js` bot, arahkan ke domain Vercel:
```js
global.license = {
  enable: true,
  key: process.env.CHAEUL_LICENSE,
  apiUrl: "https://namamu.vercel.app",
  adminToken: process.env.CHAEUL_ADMIN_TOKEN, // = ADMIN_TOKEN
  syncToken: process.env.CHAEUL_SYNC_TOKEN    // = SYNC_TOKEN
}
```

## 🧪 Lokal
```bash
npm install
npm i -g vercel
vercel dev   # butuh env di .env.local
```

© Chaeul
