// Helper umum untuk serverless functions.

export function adminToken() {
    return process.env.ADMIN_TOKEN || "chaeul-admin-secret"
}
export function syncToken() {
    return process.env.SYNC_TOKEN || "chaeul-sync-secret"
}

// Parse body (Vercel biasanya sudah parse; fallback bila string).
export function getBody(req) {
    if (!req.body) return {}
    if (typeof req.body === "string") {
        try {
            return JSON.parse(req.body)
        } catch {
            return {}
        }
    }
    return req.body
}

export function isAdmin(req) {
    const t = req.headers["x-admin-token"] || req.query?.token || getBody(req)?.token
    return t === adminToken()
}
export function isSync(req) {
    const t = req.headers["x-sync-token"] || req.query?.token || getBody(req)?.token
    return t === syncToken()
}

export function json(res, code, obj) {
    res.setHeader("Content-Type", "application/json")
    res.setHeader("Cache-Control", "no-store")
    res.status(code).send(JSON.stringify(obj))
}

// Tangani preflight OPTIONS.
export function cors(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-token, x-sync-token")
    if (req.method === "OPTIONS") {
        res.status(204).end()
        return true
    }
    return false
}

export function maskNumber(n = "") {
    const s = String(n).replace(/[^0-9]/g, "")
    if (s.length <= 5) return s
    return s.slice(0, 5) + "X".repeat(Math.max(4, s.length - 5))
}
