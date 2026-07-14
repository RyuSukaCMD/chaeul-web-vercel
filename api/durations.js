import { DURATIONS } from "../lib/plans.js"
import { cors, json } from "../lib/util.js"

export default function handler(req, res) {
    if (cors(req, res)) return
    json(res, 200, DURATIONS)
}
