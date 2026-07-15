import {
    createLicense,
    listLicenses,
    getLicense,
    verifyLicense,
    setStatus,
    extendLicense,
    revokeLicense,
    deleteLicense,
    isOnline
} from "../lib/license.js"
import { cors, json, getBody, isAdmin } from "../lib/util.js"

// Aksi via ?action= :
//   verify (publik/bot) | create|list|get|status|extend|revoke|delete (admin)
export default async function handler(req, res) {
    if (cors(req, res)) return
    const body = getBody(req)
    const action = req.query?.action || body.action

    // ── VERIFY (dipakai bot, tanpa admin token) ──
    if (action === "verify") {
        if (req.method !== "POST") return json(res, 405, { valid: false, reason: "Method not allowed" })
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
    if (!isAdmin(req)) return json(res, 401, { ok: false, error: "Unauthorized" })

    switch (action) {
        case "create":
            return json(res, 200, { ok: true, license: await createLicense(body) })
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
        case "revoke":
            return json(res, 200, { ok: true, license: await revokeLicense(body.key) })
        case "delete":
            return json(res, 200, { ok: await deleteLicense(body.key) })
        default:
            return json(res, 400, { ok: false, error: "Aksi tidak valid." })
    }
}
