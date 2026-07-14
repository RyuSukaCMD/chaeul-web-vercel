import { nanoid } from "nanoid"
import { read, update } from "../lib/store.js"
import { PLANS, DURATIONS } from "../lib/plans.js"
import { cors, json, getBody } from "../lib/util.js"

function priceFor(plan, months, couponPercent = 0) {
    const dur = DURATIONS.find((d) => d.months === months) || DURATIONS[0]
    let total = plan.price * dur.months
    total = total * (1 - dur.discount) * (1 - couponPercent / 100)
    return Math.round(total)
}

export default async function handler(req, res) {
    if (cors(req, res)) return
    if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" })

    const { plan, groupLink, contact, months, coupon } = getBody(req)
    const p = PLANS[plan]
    if (!p) return json(res, 400, { ok: false, error: "Paket tidak valid." })
    if (!groupLink || !/chat\.whatsapp\.com\//i.test(groupLink)) {
        return json(res, 400, { ok: false, error: "Link grup WhatsApp tidak valid." })
    }
    const mo = DURATIONS.find((d) => d.months === Number(months)) ? Number(months) : 1

    // Validasi kupon
    let couponCode = null
    let couponPercent = 0
    if (coupon) {
        const code = String(coupon).trim().toUpperCase()
        const coupons = await read("coupons")
        const c = coupons.find((x) => x.code === code && x.active !== false)
        if (c && (!c.expiresAt || Date.now() <= c.expiresAt) && (!c.maxUse || (c.used || 0) < c.maxUse)) {
            couponCode = c.code
            couponPercent = c.percent || 0
            await update("coupons", (list) =>
                list.map((x) => (x.code === c.code ? { ...x, used: (x.used || 0) + 1 } : x))
            )
        }
    }

    const order = {
        id: "ORD-" + nanoid(8).toUpperCase(),
        plan: p.id,
        planName: p.name,
        months: mo,
        price: priceFor(p, mo, couponPercent),
        coupon: couponCode,
        couponPercent,
        groupLink,
        contact: contact || null,
        status: "pending",
        createdAt: Date.now()
    }
    await update("orders", (list) => {
        list.push(order)
        return list
    })
    json(res, 200, { ok: true, order })
}
