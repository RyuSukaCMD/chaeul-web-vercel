import { update } from "../../lib/store.js"
import { cors, json, getBody, isSync } from "../../lib/util.js"

const FEED_MAX = 40

export default async function handler(req, res) {
    if (cors(req, res)) return
    if (!isSync(req)) return json(res, 401, { ok: false, error: "Unauthorized" })
    const b = getBody(req)
    const entry = {
        name: (b.name || "Seseorang").toString().slice(0, 40),
        fish: (b.fish || "ikan").toString().slice(0, 60),
        rarity: (b.rarity || "common").toString().slice(0, 20),
        value: Number(b.value) || 0,
        island: (b.island || "").toString().slice(0, 40),
        at: Date.now()
    }
    await update("fishing", (list) => {
        list.push(entry)
        while (list.length > FEED_MAX) list.shift()
        return list
    })
    json(res, 200, { ok: true })
}
