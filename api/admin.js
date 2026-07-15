import { read, update } from "../lib/store.js"
import { listLicenses, isOnline, createLicense } from "../lib/license.js"
import {
    countAdmins,
    createAdmin,
    deleteAdmin,
    listAdmins,
    issueChallenge,
    login,
    logout,
    checkSession
} from "../lib/adminauth.js"
import { cors, json, getBody, isAdmin, adminToken } from "../lib/util.js"

// Ambil token sesi dari header/query/body.
function sessTok(req, body) {
    return req.headers["x-admin-token"] || req.query?.token || body?.token || ""
}

// Guard: valid bila (a) sesi Ed25519 valid, ATAU (b) legacy ADMIN_TOKEN cocok.
async function guard(req, body) {
    const tok = sessTok(req, body)
    const s = await checkSession(tok)
    if (s.ok) return s
    if (isAdmin(req))
        return { ok: true, role: "owner", nick: "root", username: "root", legacy: true }
    return { ok: false }
}

// Endpoint admin gabungan. Aksi via ?action= :
//   challenge | login | logout | session | admins | genkey | deladmin |
//   auth | overview | order | coupon
export default async function handler(req, res) {
    if (cors(req, res)) return
    const body = getBody(req)
    const action = req.query?.action

    // ── AUTH via keypair (.pem) ──
    if (action === "challenge") {
        const nonce = await issueChallenge()
        // Bootstrap: apakah belum ada admin sama sekali?
        const empty = (await countAdmins()) === 0
        return json(res, 200, { ok: true, nonce, bootstrap: empty })
    }
    if (action === "login") {
        const r = await login({
            username: body.username,
            nonce: body.nonce,
            signature: body.signature
        })
        return json(res, r.ok ? 200 : 401, r)
    }
    if (action === "logout") {
        await logout(sessTok(req, body))
        return json(res, 200, { ok: true })
    }
    if (action === "session") {
        const s = await guard(req, body)
        return json(res, 200, s)
    }

    // ── GENERATE KEY (.pem) ──
    // Bootstrap: bila belum ada admin, siapa pun boleh bikin OWNER pertama (decoy).
    // Setelah ada owner, HANYA owner yang boleh generate key baru.
    if (action === "genkey") {
        const empty = (await countAdmins()) === 0
        let role = body.role === "owner" ? "owner" : "admin"
        if (empty) {
            role = "owner" // owner pertama
        } else {
            const s = await guard(req, body)
            if (!s.ok) return json(res, 401, { ok: false, error: "Unauthorized" })
            if (s.role !== "owner")
                return json(res, 403, { ok: false, error: "Hanya owner yang bisa generate key." })
        }
        try {
            const { admin, privatePem, filename } = await createAdmin({
                nick: body.nick,
                username: body.username,
                role
            })
            return json(res, 200, {
                ok: true,
                admin: { nick: admin.nick, username: admin.username, role: admin.role },
                privatePem,
                filename
            })
        } catch (e) {
            return json(res, 400, { ok: false, error: e.message })
        }
    }

    // Legacy auth check (dipakai front-end lama).
    if (action === "auth") {
        return json(res, 200, { ok: body.token === adminToken() })
    }

    // ── Aksi di bawah butuh sesi/owner-token ──
    const auth = await guard(req, body)
    if (!auth.ok) return json(res, 401, { ok: false, error: "Unauthorized" })

    if (action === "admins") {
        return json(res, 200, { ok: true, items: await listAdmins(), me: auth })
    }
    if (action === "deladmin") {
        const r = await deleteAdmin(body.username, auth.role)
        return json(res, r.ok ? 200 : 403, r)
    }

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
                    o.id === body.id
                        ? ((found = { ...o, status: body.status, updatedAt: Date.now() }), found)
                        : o
                )
            )
            return json(res, 200, { ok: !!found, order: found })
        }
        if (op === "queue") {
            let found = null
            await update("orders", (list) =>
                list.map((o) =>
                    o.id === body.id
                        ? ((found = {
                              ...o,
                              status: "approved",
                              provisioning: false,
                              updatedAt: Date.now()
                          }),
                          found)
                        : o
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
                        ? ((updated = {
                              ...o,
                              status: "provisioned",
                              licenseKey: lic.key,
                              updatedAt: Date.now()
                          }),
                          updated)
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
