import { PLANS, DURATIONS } from "../lib/plans.js"
import { cors, json } from "../lib/util.js"

// Endpoint gabungan: ?type=durations untuk durasi, default plans.
export default function handler(req, res) {
    if (cors(req, res)) return
    if (req.query?.type === "durations") return json(res, 200, DURATIONS)
    json(res, 200, Object.values(PLANS))
}
