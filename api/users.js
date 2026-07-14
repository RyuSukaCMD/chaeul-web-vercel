import { read } from "../lib/store.js"
import { cors, json, maskNumber } from "../lib/util.js"

export default async function handler(req, res) {
    if (cors(req, res)) return
    const users = await read("users")
    const items = users.slice(-100).map((u) => ({
        display: `${maskNumber(u.number)} - (${u.name || u.username || "User"})`,
        name: u.name || u.username || "User",
        number: maskNumber(u.number),
        joinedAt: u.joinedAt || u.registeredAt || null
    }))
    json(res, 200, { total: users.length, items })
}
