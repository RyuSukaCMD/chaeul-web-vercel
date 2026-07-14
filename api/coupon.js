import { read } from "../lib/store.js"
import { cors, json, getBody } from "../lib/util.js"

// Cek kupon (publik). POST { code }
export default async function handler(req, res) {
    if (cors(req, res)) return
    if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" })
    const code = (getBody(req).code || "").trim().toUpperCase()
    const c = (await read("coupons")).find((x) => x.code === code && x.active !== false)
    if (!c) return json(res, 200, { ok: false, error: "Kupon tidak valid." })
    if (c.expiresAt && Date.now() > c.expiresAt)
        return json(res, 200, { ok: false, error: "Kupon kadaluarsa." })
    if (c.maxUse && (c.used || 0) >= c.maxUse)
        return json(res, 200, { ok: false, error: "Kupon habis." })
    json(res, 200, { ok: true, coupon: { code: c.code, percent: c.percent || 0 } })
}
