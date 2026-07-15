import { nanoid } from "nanoid"
import { read, update } from "../lib/store.js"
import { isOnline } from "../lib/license.js"
import { PLANS, DURATIONS } from "../lib/plans.js"
import { cors, json, getBody, maskNumber } from "../lib/util.js"

// Endpoint publik gabungan. Aksi via ?action= :
//   stats | plans | durations | users | groups | fishing | live | order | coupon
export default async function handler(req, res) {
    if (cors(req, res)) return
    const action = req.query?.action || "stats"

    if (action === "plans") return json(res, 200, Object.values(PLANS))
    if (action === "durations") return json(res, 200, DURATIONS)

    if (action === "stats") {
        const [users, groups, licenses] = await Promise.all([
            read("users"),
            read("groups"),
            read("licenses")
        ])
        return json(res, 200, {
            users: users.length,
            groups: groups.length,
            activeLicenses: licenses.filter((l) => l.status === "active").length,
            onlineBots: licenses.filter((l) => isOnline(l)).length,
            privateGroups: groups.filter((g) => g.type === "private").length,
            publicGroups: groups.filter((g) => g.type === "public").length,
            updatedAt: Date.now()
        })
    }

    if (action === "users") {
        const users = await read("users")
        return json(res, 200, {
            total: users.length,
            items: users.slice(-100).map((u) => ({
                display: `${maskNumber(u.number)} - (${u.name || u.username || "User"})`,
                name: u.name || u.username || "User",
                number: maskNumber(u.number),
                joinedAt: u.joinedAt || u.registeredAt || null
            }))
        })
    }

    if (action === "groups") {
        const groups = await read("groups")
        return json(res, 200, {
            total: groups.length,
            items: groups.slice(-100).map((g) => ({
                name: g.name || "Grup",
                type: g.type || "private",
                members: g.members ?? null,
                registeredAt: g.registeredAt || null
            }))
        })
    }

    if (action === "fishing") {
        const feed = await read("fishing")
        return json(res, 200, { total: feed.length, items: feed.slice(-30) })
    }

    // ── RPG page: rare log + leaderboards ──
    if (action === "rpg") {
        const [rarelog, lbRare, lbUser] = await Promise.all([
            read("rarelog"),
            read("lb_rare"),
            read("lb_user")
        ])
        const mask = (n) => (n ? maskNumber(n) : null)
        // Log tangkapan langka (Secret+) terbaru dulu.
        const log = rarelog
            .slice(-60)
            .reverse()
            .map((e) => ({
                name: e.name || "Seseorang",
                number: mask(e.number),
                fish: e.fish,
                rarity: e.rarity,
                value: e.value,
                island: e.island,
                at: e.at
            }))
        // Leaderboard ikan terlangka.
        const rarest = lbRare
            .slice()
            .sort(
                (a, b) =>
                    (b.rank || 0) - (a.rank || 0) ||
                    (b.count || 0) - (a.count || 0) ||
                    (b.value || 0) - (a.value || 0)
            )
            .slice(0, 10)
            .map((e) => ({
                name: e.name || "User",
                number: mask(e.number),
                fish: e.fish,
                rarity: e.rarity,
                value: e.value,
                count: e.count || 0
            }))
        // Terkaya (wealth) & terkuat (power).
        const richest = lbUser
            .slice()
            .sort((a, b) => (b.wealth || 0) - (a.wealth || 0))
            .slice(0, 10)
            .map((e) => ({
                name: e.name,
                number: mask(e.number),
                wealth: e.wealth,
                level: e.level
            }))
        const strongest = lbUser
            .slice()
            .sort((a, b) => (b.power || 0) - (a.power || 0))
            .slice(0, 10)
            .map((e) => ({ name: e.name, number: mask(e.number), power: e.power, level: e.level }))
        // Skor gabungan: normalisasi wealth+power+rarity user.
        const maxW = Math.max(1, ...lbUser.map((u) => u.wealth || 0))
        const maxP = Math.max(1, ...lbUser.map((u) => u.power || 0))
        const rareByNum = {}
        for (const r of lbRare) rareByNum[r.number || r.name] = r.rank || 0
        const overall = lbUser
            .slice()
            .map((u) => {
                const rr = rareByNum[u.number] || 0
                const score = Math.round(
                    ((u.wealth || 0) / maxW) * 40 +
                        ((u.power || 0) / maxP) * 40 +
                        (rr / 8) * 20 +
                        (u.level || 0) * 0.2
                )
                return { name: u.name, number: mask(u.number), score, level: u.level }
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, 10)
        return json(res, 200, {
            log,
            rareCount: rarelog.length,
            leaderboards: { rarest, richest, strongest, overall },
            updatedAt: Date.now()
        })
    }

    // Poll gabungan (pengganti SSE): stats + user + grup + fishing
    if (action === "live") {
        const [users, groups, licenses, fishing] = await Promise.all([
            read("users"),
            read("groups"),
            read("licenses"),
            read("fishing")
        ])
        return json(res, 200, {
            stats: {
                users: users.length,
                groups: groups.length,
                activeLicenses: licenses.filter((l) => l.status === "active").length,
                onlineBots: licenses.filter((l) => isOnline(l)).length,
                privateGroups: groups.filter((g) => g.type === "private").length,
                publicGroups: groups.filter((g) => g.type === "public").length
            },
            users: users.slice(-8).map((u) => ({
                display: `${maskNumber(u.number)} - (${u.name || u.username || "User"})`
            })),
            groups: groups
                .slice(-8)
                .map((g) => ({ name: g.name || "Grup", type: g.type || "private" })),
            fishing: fishing.slice(-12),
            updatedAt: Date.now()
        })
    }

    // Buat pesanan sewa
    if (action === "order") {
        if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" })
        const { plan, groupLink, contact, months, coupon, type } = getBody(req)
        const p = PLANS[plan]
        if (!p) return json(res, 400, { ok: false, error: "Paket tidak valid." })
        // type: "rent" (bot join grup) | "license" (hanya generate lisensi)
        const orderType = type === "license" ? "license" : "rent"
        // Sewa bot butuh link grup; beli lisensi tidak.
        if (orderType === "rent" && (!groupLink || !/chat\.whatsapp\.com\//i.test(groupLink)))
            return json(res, 400, { ok: false, error: "Link grup WhatsApp tidak valid." })
        const mo = DURATIONS.find((d) => d.months === Number(months)) ? Number(months) : 1

        let couponCode = null
        let couponPercent = 0
        if (coupon) {
            const code = String(coupon).trim().toUpperCase()
            const c = (await read("coupons")).find((x) => x.code === code && x.active !== false)
            if (
                c &&
                (!c.expiresAt || Date.now() <= c.expiresAt) &&
                (!c.maxUse || (c.used || 0) < c.maxUse)
            ) {
                couponCode = c.code
                couponPercent = c.percent || 0
                await update("coupons", (list) =>
                    list.map((x) => (x.code === c.code ? { ...x, used: (x.used || 0) + 1 } : x))
                )
            }
        }
        const dur = DURATIONS.find((d) => d.months === mo) || DURATIONS[0]
        const price = Math.round(
            p.price * dur.months * (1 - dur.discount) * (1 - couponPercent / 100)
        )
        const order = {
            id: "ORD-" + nanoid(8).toUpperCase(),
            type: orderType,
            plan: p.id,
            planName: p.name,
            months: mo,
            price,
            coupon: couponCode,
            couponPercent,
            groupLink: orderType === "rent" ? groupLink : null,
            contact: contact || null,
            status: "pending",
            createdAt: Date.now()
        }
        await update("orders", (list) => {
            list.push(order)
            return list
        })
        return json(res, 200, { ok: true, order })
    }

    // Cek kupon
    if (action === "coupon") {
        const code = (getBody(req).code || "").trim().toUpperCase()
        const c = (await read("coupons")).find((x) => x.code === code && x.active !== false)
        if (!c) return json(res, 200, { ok: false, error: "Kupon tidak valid." })
        if (c.expiresAt && Date.now() > c.expiresAt)
            return json(res, 200, { ok: false, error: "Kupon kadaluarsa." })
        if (c.maxUse && (c.used || 0) >= c.maxUse)
            return json(res, 200, { ok: false, error: "Kupon habis." })
        return json(res, 200, { ok: true, coupon: { code: c.code, percent: c.percent || 0 } })
    }

    json(res, 400, { ok: false, error: "Aksi tidak valid." })
}
