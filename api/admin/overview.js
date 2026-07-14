import { read, update } from "../../lib/store.js"
import { listLicenses, isOnline } from "../../lib/license.js"
import { cors, json, isAdmin } from "../../lib/util.js"

export default async function handler(req, res) {
    if (cors(req, res)) return
    if (!isAdmin(req)) return json(res, 401, { ok: false, error: "Unauthorized" })

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

    // snapshot harian untuk grafik
    const today = new Date().toISOString().slice(0, 10)
    await update("history", (list) => {
        const idx = list.findIndex((h) => h.date === today)
        const snap = { date: today, users: stats.users, groups: stats.groups, activeLicenses: stats.activeLicenses, revenue: stats.revenue }
        if (idx >= 0) list[idx] = snap
        else list.push(snap)
        while (list.length > 30) list.shift()
        return list
    })
    const history = (await read("history")).slice(-14)

    json(res, 200, {
        ok: true,
        stats,
        history,
        licenses: licenses.sort((a, b) => b.createdAt - a.createdAt),
        orders: orders.sort((a, b) => b.createdAt - a.createdAt),
        updatedAt: Date.now()
    })
}
