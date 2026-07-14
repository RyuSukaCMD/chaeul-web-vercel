import { read } from "../lib/store.js"
import { cors, json, maskNumber } from "../lib/util.js"

// Endpoint poll gabungan (pengganti SSE di serverless):
// stats + daftar user & grup + fishing feed, dalam 1 request.
export default async function handler(req, res) {
    if (cors(req, res)) return
    const [users, groups, licenses, fishing] = await Promise.all([
        read("users"),
        read("groups"),
        read("licenses"),
        read("fishing")
    ])
    json(res, 200, {
        stats: {
            users: users.length,
            groups: groups.length,
            activeLicenses: licenses.filter((l) => l.status === "active").length,
            privateGroups: groups.filter((g) => g.type === "private").length,
            publicGroups: groups.filter((g) => g.type === "public").length
        },
        users: users.slice(-8).map((u) => ({
            display: `${maskNumber(u.number)} - (${u.name || u.username || "User"})`
        })),
        groups: groups.slice(-8).map((g) => ({
            name: g.name || "Grup",
            type: g.type || "private"
        })),
        fishing: fishing.slice(-12),
        updatedAt: Date.now()
    })
}
