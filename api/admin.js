import { read, update } from "../lib/store.js"
import { listLicenses, isOnline, createLicense } from "../lib/license.js"
import { cors, json, getBody, isAdmin, adminToken } from "../lib/util.js"

// Endpoint admin gabungan. Aksi via ?action= :
//   auth | overview | order | coupon
export default async function handler(req, res) {
    if (cors(req, res)) return
    const body = getBody(req)
    const action = req.query?.action

    // AUTH — cek token (tanpa guard, ini yang menentukan valid/tidak)
    if (action === "auth") {
        return json(res, 200, { ok: body.token === adminToken() })
    }

    // Sisanya butuh admin token
    if (!isAdmin(req)) return json(res, 401, { ok: false, error: "Unauthorized" })

    // OVERVIEW
    if (action === "overview") {
        const [users, groups, orders] = await Promise.all([
            read("users"),
            read("groups"),
            read("orders")
        ])
        const licenses = (await listLicenses()).map((l) => ({ ...l, online: isOnline(l) }))
        const revenue = orders
            .filter((o) => o.status === "paid" || o.status === "provisioned")
            .reduce((s, o) => s + (o.price || 0), 0)
        const stats = {
            users: users.length,
            groups: groups.length,
            licenses: licenses.length,
            activeLicenses: licenses.filter((l) => l.status === "active").length,
            onlineBots: licenses.filter((l) => l.online).length,
            orders: orders.length,
            pendingOrders: orders.filter((o) => o.status === "pending").length,
            revenue
        }
        const today = new Date().toISOString().slice(0, 10)
        await update("history", (list) => {
            const idx = list.findIndex((h) => h.date === today)
            const snap = {
                date: today,
                users: stats.users,
                groups: stats.groups,
                activeLicenses: stats.activeLicenses,
                revenue: stats.revenue
            }
            if (idx >= 0) list[idx] = snap
            else list.push(snap)
            while (list.length > 30) list.shift()
            return list
        })
        return json(res, 200, {
            ok: true,
            stats,
            history: (await read("history")).slice(-14),
            licenses: licenses.sort((a, b) => b.createdAt - a.createdAt),
            orders: orders.sort((a, b) => b.createdAt - a.createdAt),
            updatedAt: Date.now()
        })
    }

    // ORDER — sub-aksi via body.op: status | queue | approve | delete
    if (action === "order") {
        const op = body.op
        if (op === "status") {
            let found = null
            await update("orders", (list) =>
                list.map((o) =>
                    o.id === body.id ? ((found = { ...o, status: body.status, updatedAt: Date.now() }), found) : o
                )
            )
            return json(res, 200, { ok: !!found, order: found })
        }
        if (op === "queue") {
            let found = null
            await update("orders", (list) =>
                list.map((o) =>
                    o.id === body.id ? ((found = { ...o, status: "approved", provisioning: false, updatedAt: Date.now() }), found) : o
                )
            )
            return json(res, 200, { ok: !!found, order: found })
        }
        if (op === "approve") {
            const order = (await read("orders")).find((o) => o.id === body.id)
            if (!order) return json(res, 404, { ok: false, error: "Order tidak ditemukan." })
            const lic = await createLicense({
                plan: order.plan,
                days: Number(body.days) || 30,
                ownerNumber: order.contact || "",
                note: `Dari order ${order.id}`
            })
            let updated = null
            await update("orders", (list) =>
                list.map((o) =>
                    o.id === body.id
                        ? ((updated = { ...o, status: "provisioned", licenseKey: lic.key, updatedAt: Date.now() }), updated)
                        : o
                )
            )
            return json(res, 200, { ok: true, license: lic, order: updated })
        }
        if (op === "delete") {
            let ok = false
            await update("orders", (list) => {
                const next = list.filter((o) => o.id !== body.id)
                ok = next.length !== list.length
                return next
            })
            return json(res, 200, { ok })
        }
        return json(res, 400, { ok: false, error: "op tidak valid." })
    }

    // COUPON — sub-aksi via body.op: list | create | delete
    if (action === "coupon") {
        const op = body.op || "list"
        if (op === "list") return json(res, 200, { ok: true, items: await read("coupons") })
        if (op === "create") {
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
        if (op === "delete") {
            const code = (body.code || "").trim().toUpperCase()
            let ok = false
            await update("coupons", (list) => {
                const next = list.filter((c) => c.code !== code)
                ok = next.length !== list.length
                return next
            })
            return json(res, 200, { ok })
        }
        return json(res, 400, { ok: false, error: "op tidak valid." })
    }

    json(res, 400, { ok: false, error: "Aksi tidak valid." })
}
