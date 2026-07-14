import { update } from "../../lib/store.js"
import { cors, json, getBody, isSync } from "../../lib/util.js"

export default async function handler(req, res) {
    if (cors(req, res)) return
    if (!isSync(req)) return json(res, 401, { ok: false, error: "Unauthorized" })
    const b = getBody(req)
    if (!b.jid) return json(res, 400, { ok: false, error: "jid wajib" })
    const name = (b.name || "Grup").toString().slice(0, 60)

    let added = false
    await update("groups", (list) => {
        const idx = list.findIndex((g) => g.jid === b.jid)
        const entry = {
            jid: b.jid,
            name,
            type: b.type || "private",
            members: b.members ?? null,
            registeredAt: Date.now()
        }
        if (idx >= 0) list[idx] = { ...list[idx], ...entry, registeredAt: list[idx].registeredAt }
        else {
            list.push(entry)
            added = true
        }
        return list
    })
    json(res, 200, { ok: true, added })
}
