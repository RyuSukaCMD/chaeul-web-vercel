import {
    createLicense,
    listLicenses,
    getLicense,
    verifyLicense,
    setStatus,
    extendLicense,
    setExpiry,
    setGroupLock,
    revokeLicense,
    deleteLicense,
    isOnline
} from "../lib/license.js"
import { getConfigEntry, resetPin, setPin, initPin } from "../lib/config.js"
import { checkSession } from "../lib/adminauth.js"
import { cors, json, getBody, isAdmin } from "../lib/util.js"

// Admin valid bila sesi Ed25519 valid ATAU legacy ADMIN_TOKEN cocok.
async function adminOK(req, body) {
    const tok = req.headers["x-admin-token"] || req.query?.token || body?.token || ""
    const s = await checkSession(tok)
    if (s.ok) return true
    return isAdmin(req)
}

// Aksi via ?action= :
//   verify (publik/bot) | create|list|get|status|extend|revoke|delete (admin)
export default async function handler(req, res) {
    if (cors(req, res)) return
    const body = getBody(req)
    const action = req.query?.action || body.action

    // ── VERIFY (dipakai bot, tanpa admin token) ──
    if (action === "verify") {
        if (req.method !== "POST")
            return json(res, 405, { valid: false, reason: "Method not allowed" })
        const { key, groupJid, version } = body
        if (!key) return json(res, 400, { valid: false, reason: "Key wajib diisi." })
        const result = await verifyLicense(key, { groupJid, version })
        if (!result.valid) return json(res, 200, { valid: false, reason: result.reason })
        const lic = result.license
        return json(res, 200, {
            valid: true,
            license: {
                key: lic.key,
                plan: lic.plan,
                ownerNumber: lic.ownerNumber,
                groupJid: lic.groupJid,
                maxMembers: lic.maxMembers,
                expiresAt: lic.expiresAt,
                status: lic.status
            },
            nextHeartbeat: (2 + Math.random() * 4) * 3600000
        })
    }

    // ── Aksi admin (butuh token) ──
    if (!(await adminOK(req, body))) return json(res, 401, { ok: false, error: "Unauthorized" })

    switch (action) {
        case "create": {
            const license = await createLicense(body)
            // Buat/atur PIN untuk user page (pakai body.pin bila diisi).
            const pin = await initPin(license.key, body.pin, license)
            return json(res, 200, { ok: true, license, pin })
        }
        case "list": {
            const items = (await listLicenses()).map((l) => ({ ...l, online: isOnline(l) }))
            return json(res, 200, { ok: true, total: items.length, items })
        }
        case "get": {
            const lic = await getLicense(body.key)
            if (!lic) return json(res, 404, { ok: false, error: "Not found" })
            return json(res, 200, { ok: true, license: { ...lic, online: isOnline(lic) } })
        }
        case "status":
            return json(res, 200, { ok: true, license: await setStatus(body.key, body.status) })
        case "extend":
            return json(res, 200, { ok: true, license: await extendLicense(body.key, body.days) })
        case "setexpiry": {
            // Atur masa aktif bebas: expiresAt = sekarang + body.days.
            const license = await setExpiry(body.key, body.days)
            return json(res, 200, { ok: !!license, license })
        }
        case "setpin": {
            // Atur PIN user page ke nilai spesifik (kosong = acak).
            const pin = await setPin(body.key, body.pin)
            return json(res, 200, { ok: !!pin, pin })
        }
        case "setgroup": {
            // Group lock: kunci lisensi ke grup (jid). Kosong = lepas.
            const license = await setGroupLock(body.key, body.groupJid, body.groupName)
            return json(res, 200, { ok: !!license, license })
        }
        case "revoke":
            return json(res, 200, { ok: true, license: await revokeLicense(body.key) })
        case "delete":
            return json(res, 200, { ok: await deleteLicense(body.key) })
        case "pin": {
            // Lihat PIN user page milik sebuah lisensi (untuk bantu user).
            const entry = await getConfigEntry(body.key, { create: true })
            return json(res, 200, { ok: !!entry, pin: entry?.pin || null })
        }
        case "resetpin": {
            const pin = await resetPin(body.key)
            return json(res, 200, { ok: !!pin, pin })
        }
        default:
            return json(res, 400, { ok: false, error: "Aksi tidak valid." })
    }
}
