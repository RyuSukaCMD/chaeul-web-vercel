import { read } from "../lib/store.js"
import { cors, json } from "../lib/util.js"

export default async function handler(req, res) {
    if (cors(req, res)) return
    const feed = await read("fishing")
    json(res, 200, { total: feed.length, items: feed.slice(-30) })
}
