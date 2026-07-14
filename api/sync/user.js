import { update } from "../../lib/store.js"
import { cors, json, getBody, isSync } from "../../lib/util.js"

const norm = (n = "") => String(n).replace(/[^0-9]/g, "")

export default async function handler(req, res) {
    if (cors(req, res)) return
    if (!isSync(req)) return json(res, 401, { ok: false, error: "Unauthorized" })
    const b = getBody(req)
    const number = norm(b.number)
    const name = (b.name || b.username || "User").toString().slice(0, 40)
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
    json(res, 200, { ok: true, added })
}
