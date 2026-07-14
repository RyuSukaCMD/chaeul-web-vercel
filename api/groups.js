import { read } from "../lib/store.js"
import { cors, json } from "../lib/util.js"

export default async function handler(req, res) {
    if (cors(req, res)) return
    const groups = await read("groups")
    const items = groups.slice(-100).map((g) => ({
        name: g.name || "Grup",
        type: g.type || "private",
        members: g.members ?? null,
        registeredAt: g.registeredAt || null
    }))
    json(res, 200, { total: groups.length, items })
}
