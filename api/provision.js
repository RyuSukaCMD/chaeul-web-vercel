import { read, update } from "../lib/store.js"
import { createLicense } from "../lib/license.js"
import { cors, json, getBody, isSync } from "../lib/util.js"

// Endpoint provisioning & notifikasi (bot). Aksi via ?action=:
//   jobs | report | notifications | ack
export default async function handler(req, res) {
    if (cors(req, res)) return
    if (!isSync(req)) return json(res, 401, { ok: false, error: "Unauthorized" })
    const body = getBody(req)
    const action = req.query?.action || body.action

    // ── Job provisioning (order approved) ──
    if (action === "jobs") {
        const orders = await read("orders")
        const jobs = orders
            .filter(
                (o) =>
                    o.type !== "license" && // beli-lisensi tak perlu bot join grup
                    (o.status === "paid" || o.status === "approved") &&
                    !o.provisioning
            )
            .map((o) => ({
                id: o.id,
                plan: o.plan,
                groupLink: o.groupLink,
                contact: o.contact,
                maxMembers: o.plan === "private" ? 3 : null
            }))
        return json(res, 200, { ok: true, jobs })
    }

    // ── Laporan hasil provisioning ──
    if (action === "report") {
        const orders = await read("orders")
        const order = orders.find((o) => o.id === body.id)
        if (!order) return json(res, 404, { ok: false, error: "Order tidak ditemukan." })

        if (!body.success) {
            await update("orders", (list) =>
                list.map((o) =>
                    o.id === body.id
                        ? {
                              ...o,
                              status: "failed",
                              failReason: body.reason || "Gagal.",
                              updatedAt: Date.now()
                          }
                        : o
                )
            )
            return json(res, 200, { ok: true, status: "failed" })
        }
        let license = null
        if (!order.licenseKey) {
            license = await createLicense({
                plan: order.plan,
                days: Number(body.days) || 30,
                ownerNumber: body.ownerNumber || order.contact || "",
                groupJid: body.groupJid || null,
                groupName: body.groupName || null,
                note: `Auto-provision order ${order.id}`
            })
        }
        await update("orders", (list) =>
            list.map((o) =>
                o.id === body.id
                    ? {
                          ...o,
                          status: "provisioned",
                          provisioning: true,
                          groupJid: body.groupJid || o.groupJid,
                          groupName: body.groupName || o.groupName,
                          members: body.members ?? o.members,
                          licenseKey: license ? license.key : o.licenseKey,
                          updatedAt: Date.now()
                      }
                    : o
            )
        )
        return json(res, 200, { ok: true, status: "provisioned", license })
    }

    // ── Notifikasi owner ──
    if (action === "notifications") {
        const notifs = []
        const orders = await read("orders")
        for (const o of orders) {
            if (o.status === "pending" && !o.notified) {
                notifs.push({
                    type: "new_order",
                    text: `🧾 *Order Baru!*\nID: ${o.id}\nPaket: ${o.planName}${o.months ? ` (${o.months} bln)` : ""}\nHarga: Rp ${Number(o.price).toLocaleString("id-ID")}\nKontak: ${o.contact || "-"}\nGrup: ${o.groupLink}`,
                    orderId: o.id
                })
            }
        }
        const licenses = await read("licenses")
        for (const l of licenses) {
            if (l.status === "active" && l.expiresAt) {
                const left = l.expiresAt - Date.now()
                if (left > 0 && left < 3 * 86400000 && !l.expNotified) {
                    notifs.push({
                        type: "expiring",
                        text: `⏰ *Lisensi Hampir Habis!*\n${l.key} (${l.plan})\nSisa: ${Math.ceil(left / 86400000)} hari`,
                        key: l.key
                    })
                }
            }
        }
        return json(res, 200, { ok: true, notifications: notifs })
    }

    // ── Ack notifikasi ──
    if (action === "ack") {
        const orderIds = body.orderIds || []
        const licenseKeys = body.licenseKeys || []
        if (orderIds.length)
            await update("orders", (list) =>
                list.map((o) => (orderIds.includes(o.id) ? { ...o, notified: true } : o))
            )
        if (licenseKeys.length)
            await update("licenses", (list) =>
                list.map((l) => (licenseKeys.includes(l.key) ? { ...l, expNotified: true } : l))
            )
        return json(res, 200, { ok: true })
    }

    json(res, 400, { ok: false, error: "Aksi tidak valid." })
}
