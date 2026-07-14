import { read, update } from "../../lib/store.js"
import { cors, json, getBody, isAdmin } from "../../lib/util.js"

// Aksi kupon via ?action=: list | create | delete
export default async function handler(req, res) {
    if (cors(req, res)) return
    if (!isAdmin(req)) return json(res, 401, { ok: false, error: "Unauthorized" })
    const body = getBody(req)
    const action = req.query?.action || body.action || "list"

    if (action === "list") {
        return json(res, 200, { ok: true, items: await read("coupons") })
    }

    if (action === "create") {
        const code = (body.code || "").trim().toUpperCase()
        if (!code) return json(res, 400, { ok: false, error: "Kode wajib." })
        const coupon = {
            code,
            percent: Math.min(100, Math.max(0, Number(body.percent) || 0)),
            maxUse: Number(body.maxUse) || 0,
            used: 0,
            active: true,
            expiresAt: body.days ? Date.now() + Number(body.days) * 86400000 : 0,
            createdAt: Date.now()
        }
        let exists = false
        await update("coupons", (list) => {
            if (list.some((c) => c.code === code)) {
                exists = true
                return list
            }
            list.push(coupon)
            return list
        })
        if (exists) return json(res, 400, { ok: false, error: "Kode sudah ada." })
        return json(res, 200, { ok: true, coupon })
    }

    if (action === "delete") {
        const code = (body.code || "").trim().toUpperCase()
        let ok = false
        await update("coupons", (list) => {
            const next = list.filter((c) => c.code !== code)
            ok = next.length !== list.length
            return next
        })
        return json(res, 200, { ok })
    }

    json(res, 400, { ok: false, error: "Aksi tidak valid." })
}
