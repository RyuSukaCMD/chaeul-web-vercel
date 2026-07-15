import { read, write, update } from "../lib/store.js"
import { heartbeat } from "../lib/license.js"
import { cors, json, getBody, isSync } from "../lib/util.js"

const norm = (n = "") => String(n).replace(/[^0-9]/g, "")
const FEED_MAX = 40

// Endpoint sync bot → web. Aksi via ?action= : heartbeat | all | user | group | fishing
export default async function handler(req, res) {
    if (cors(req, res)) return
    if (!isSync(req)) return json(res, 401, { ok: false, error: "Unauthorized" })
    const body = getBody(req)
    const action = req.query?.action

    // ── HEARTBEAT CEPAT (bot kirim tiap ~1 menit) ──
    // Menandakan bot "online" & sekaligus channel perintah balik:
    // bila lisensi expired/suspended/revoked → { valid:false, status } →
    // bot broadcast ke semua grup lalu masuk mode idle.
    if (action === "heartbeat") {
        const key = body.key
        if (!key) return json(res, 400, { ok: false, valid: false, error: "key wajib" })
        const r = await heartbeat(key, {
            version: body.version,
            groups: Number(body.groups) || 0,
            users: Number(body.users) || 0
        })
        return json(res, 200, { ok: true, ...r })
    }

    if (action === "all") {
        if (Array.isArray(body.users)) await write("users", body.users)
        if (Array.isArray(body.groups)) await write("groups", body.groups)
        return json(res, 200, {
            ok: true,
            users: (await read("users")).length,
            groups: (await read("groups")).length
        })
    }

    if (action === "user") {
        const number = norm(body.number)
        const name = (body.name || body.username || "User").toString().slice(0, 40)
        if (!number) return json(res, 400, { ok: false, error: "number wajib" })
        let added = false
        await update("users", (list) => {
            const idx = list.findIndex((u) => norm(u.number) === number)
            if (idx >= 0) list[idx].name = name
            else {
                list.push({ number, name, joinedAt: Date.now() })
                added = true
            }
            return list
        })
        return json(res, 200, { ok: true, added })
    }

    if (action === "group") {
        if (!body.jid) return json(res, 400, { ok: false, error: "jid wajib" })
        const name = (body.name || "Grup").toString().slice(0, 60)
        let added = false
        await update("groups", (list) => {
            const idx = list.findIndex((g) => g.jid === body.jid)
            const entry = {
                jid: body.jid,
                name,
                type: body.type || "private",
                members: body.members ?? null,
                registeredAt: Date.now()
            }
            if (idx >= 0)
                list[idx] = { ...list[idx], ...entry, registeredAt: list[idx].registeredAt }
            else {
                list.push(entry)
                added = true
            }
            return list
        })
        return json(res, 200, { ok: true, added })
    }

    if (action === "fishing") {
        const entry = {
            name: (body.name || "Seseorang").toString().slice(0, 40),
            fish: (body.fish || "ikan").toString().slice(0, 60),
            rarity: (body.rarity || "common").toString().slice(0, 20),
            value: Number(body.value) || 0,
            island: (body.island || "").toString().slice(0, 40),
            at: Date.now()
        }
        await update("fishing", (list) => {
            list.push(entry)
            while (list.length > FEED_MAX) list.shift()
            return list
        })
        return json(res, 200, { ok: true })
    }

    json(res, 400, { ok: false, error: "Aksi tidak valid." })
}
