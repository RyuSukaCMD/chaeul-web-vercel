import {
    getBotConfig,
    verifyUserLogin,
    getUserConfig,
    updateUserConfig,
    getConfigEntry
} from "../lib/config.js"
import { cors, json, getBody, isSync } from "../lib/util.js"

// Endpoint konfigurasi. Aksi via ?action= :
//   bot     → bot ambil config lengkap (sync token + lisensi aktif)
//   login   → user page login (key + pin)
//   get     → ambil config user (butuh key + pin)
//   update  → simpan perubahan config user (butuh key + pin)
export default async function handler(req, res) {
    if (cors(req, res)) return
    const body = getBody(req)
    const action = req.query?.action || body.action

    // ── BOT: ambil config (WAJIB sync token + lisensi aktif) ──
    if (action === "bot") {
        if (!isSync(req)) return json(res, 401, { ok: false, error: "Unauthorized" })
        const key = body.key
        if (!key) return json(res, 400, { ok: false, error: "key wajib" })
        const r = await getBotConfig(key)
        if (!r.ok) return json(res, 200, { ok: false, reason: r.reason })
        return json(res, 200, { ok: true, config: r.config })
    }

    // ── USER PAGE: login (key + pin) ──
    if (action === "login") {
        const { key, pin } = body
        const r = await verifyUserLogin(key, pin)
        if (!r.ok) return json(res, 200, { ok: false, error: r.reason })
        const config = await getUserConfig(key)
        return json(res, 200, {
            ok: true,
            config,
            license: {
                key: r.license.key,
                plan: r.license.plan,
                status: r.license.status,
                expiresAt: r.license.expiresAt
            }
        })
    }

    // Aksi berikut butuh login (key + pin divalidasi tiap request).
    const auth = await verifyUserLogin(body.key, body.pin)
    if (!auth.ok) return json(res, 401, { ok: false, error: auth.error || "Unauthorized" })

    if (action === "get") {
        return json(res, 200, { ok: true, config: await getUserConfig(body.key) })
    }

    if (action === "update") {
        if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" })
        const config = await updateUserConfig(body.key, body.config || {})
        if (!config) return json(res, 400, { ok: false, error: "Gagal menyimpan." })
        return json(res, 200, { ok: true, config })
    }

    // Info lisensi + PIN (untuk ditampilkan setelah login) — hanya milik sendiri.
    if (action === "me") {
        const entry = await getConfigEntry(body.key, { create: true })
        return json(res, 200, {
            ok: true,
            pin: entry?.pin || null,
            config: await getUserConfig(body.key)
        })
    }

    json(res, 400, { ok: false, error: "Aksi tidak valid." })
}
