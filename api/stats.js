import { read } from "../lib/store.js"
import { cors, json } from "../lib/util.js"

export default async function handler(req, res) {
    if (cors(req, res)) return
    const [users, groups, licenses] = await Promise.all([
        read("users"),
        read("groups"),
        read("licenses")
    ])
    json(res, 200, {
        users: users.length,
        groups: groups.length,
        activeLicenses: licenses.filter((l) => l.status === "active").length,
        privateGroups: groups.filter((g) => g.type === "private").length,
        publicGroups: groups.filter((g) => g.type === "public").length,
        updatedAt: Date.now()
    })
}
