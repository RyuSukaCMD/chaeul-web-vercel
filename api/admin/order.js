import { read, update } from "../../lib/store.js"
import { createLicense } from "../../lib/license.js"
import { cors, json, getBody, isAdmin } from "../../lib/util.js"

// Aksi order via ?action=: status | approve | queue | delete
export default async function handler(req, res) {
    if (cors(req, res)) return
    if (!isAdmin(req)) return json(res, 401, { ok: false, error: "Unauthorized" })
    const body = getBody(req)
    const action = req.query?.action || body.action

    if (action === "status") {
        let found = null
        await update("orders", (list) =>
            list.map((o) => (o.id === body.id ? ((found = { ...o, status: body.status, updatedAt: Date.now() }), found) : o))
        )
        return json(res, 200, { ok: !!found, order: found })
    }

    if (action === "queue") {
        let found = null
        await update("orders", (list) =>
            list.map((o) =>
                o.id === body.id ? ((found = { ...o, status: "approved", provisioning: false, updatedAt: Date.now() }), found) : o
            )
        )
        return json(res, 200, { ok: !!found, order: found })
    }

    if (action === "approve") {
        const orders = await read("orders")
        const order = orders.find((o) => o.id === body.id)
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

    if (action === "delete") {
        let ok = false
        await update("orders", (list) => {
            const next = list.filter((o) => o.id !== body.id)
            ok = next.length !== list.length
            return next
        })
        return json(res, 200, { ok })
    }

    json(res, 400, { ok: false, error: "Aksi tidak valid." })
}
