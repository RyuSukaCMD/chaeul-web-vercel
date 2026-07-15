import { read, write, update } from "../lib/store.js"
import { heartbeat } from "../lib/license.js"
import { cors, json, getBody, isSync } from "../lib/util.js"

const norm = (n = "") => String(n).replace(/[^0-9]/g, "")
const FEED_MAX = 40
const RARELOG_MAX = 100 // simpan 100 tangkapan langka terakhir
// Rarity yang masuk Rare Fish Log (Secret ke atas).
const RARE_TIERS = ["secret", "ephemeral", "unreal"]
// Urutan rarity utk ranking "ikan terlangka" (index makin tinggi = makin langka).
const RARITY_ORDER = [
    "common",
    "uncommon",
    "rare",
    "epic",
    "legendary",
    "mythical",
    "secret",
    "ephemeral",
    "unreal"
]
const rarityRank = (r) => {
    const i = RARITY_ORDER.indexOf(String(r || "").toLowerCase())
    return i < 0 ? 0 : i
}

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
        const rarity = (body.rarity || "common").toString().slice(0, 20).toLowerCase()
        const entry = {
            name: (body.name || "Seseorang").toString().slice(0, 40),
            number: norm(body.number),
            fish: (body.fish || "ikan").toString().slice(0, 60),
            rarity,
            value: Number(body.value) || 0,
            island: (body.island || "").toString().slice(0, 40),
            at: Date.now()
        }
        // Feed live (semua rarity yang dikirim bot).
        await update("fishing", (list) => {
            list.push(entry)
            while (list.length > FEED_MAX) list.shift()
            return list
        })
        // RARE FISH LOG — hanya Secret ke atas, disimpan permanen (100 terakhir).
        if (RARE_TIERS.includes(rarity)) {
            await update("rarelog", (list) => {
                list.push(entry)
                while (list.length > RARELOG_MAX) list.shift()
                return list
            })
            // Update leaderboard "ikan terlangka" per-user (simpan yang terlangka & termahal).
            await update("lb_rare", (list) => {
                const key = entry.number || entry.name
                const idx = list.findIndex((x) => (x.number || x.name) === key)
                const cur = {
                    number: entry.number,
                    name: entry.name,
                    fish: entry.fish,
                    rarity: entry.rarity,
                    rank: rarityRank(entry.rarity),
                    value: entry.value,
                    at: entry.at
                }
                if (idx < 0) list.push(cur)
                else if (
                    cur.rank > (list[idx].rank || 0) ||
                    (cur.rank === list[idx].rank && cur.value > (list[idx].value || 0))
                )
                    list[idx] = cur
                return list
            })
        }
        return json(res, 200, { ok: true })
    }

    // ── Leaderboard user (kekayaan & kekuatan) dari bot ──
    // Bot push snapshot berkala: number, name, wealth (money+bank), power (atk+def), level.
    if (action === "lbuser") {
        const number = norm(body.number)
        if (!number) return json(res, 400, { ok: false, error: "number wajib" })
        const entry = {
            number,
            name: (body.name || "User").toString().slice(0, 40),
            wealth: Number(body.wealth) || 0,
            power: Number(body.power) || 0,
            level: Number(body.level) || 1,
            at: Date.now()
        }
        await update("lb_user", (list) => {
            const idx = list.findIndex((u) => u.number === number)
            if (idx < 0) list.push(entry)
            else list[idx] = entry
            return list
        })
        return json(res, 200, { ok: true })
    }

    // ── Batch leaderboard user (bot kirim banyak sekaligus, hemat request) ──
    if (action === "lbusers") {
        if (!Array.isArray(body.users)) return json(res, 400, { ok: false, error: "users[] wajib" })
        await update("lb_user", (list) => {
            for (const u of body.users) {
                const number = norm(u.number)
                if (!number) continue
                const entry = {
                    number,
                    name: (u.name || "User").toString().slice(0, 40),
                    wealth: Number(u.wealth) || 0,
                    power: Number(u.power) || 0,
                    level: Number(u.level) || 1,
                    at: Date.now()
                }
                const idx = list.findIndex((x) => x.number === number)
                if (idx < 0) list.push(entry)
                else list[idx] = entry
            }
            return list
        })
        return json(res, 200, { ok: true, count: body.users.length })
    }

    json(res, 400, { ok: false, error: "Aksi tidak valid." })
}
