import { cors, json, getBody, adminToken } from "../../lib/util.js"

export default function handler(req, res) {
    if (cors(req, res)) return
    const token = getBody(req).token
    json(res, 200, { ok: token === adminToken() })
}
