// ═══════════════════════════════════════════════════════════
//  STORAGE — Upstash Redis via REST API (cocok untuk serverless).
//  Env yang dibutuhkan:
//    UPSTASH_REDIS_REST_URL
//    UPSTASH_REDIS_REST_TOKEN
//  Bila env tidak di-set → fallback in-memory (data reset saat cold start,
//  web tetap jalan untuk demo).
//
//  Tiap "koleksi" (users, groups, licenses, orders, fishing, coupons, history)
//  disimpan sebagai 1 key JSON di Redis: "chaeul:<name>".
// ═══════════════════════════════════════════════════════════

const URL = process.env.UPSTASH_REDIS_REST_URL
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const PREFIX = "chaeul:"

export const hasRedis = () => !!(URL && TOKEN)

// Fallback in-memory (per instance)
const mem = new Map()

async function redis(command) {
    // command: array, mis. ["GET", "chaeul:users"]
    const res = await fetch(URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${TOKEN}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(command)
    })
    if (!res.ok) throw new Error("Redis error " + res.status)
    const data = await res.json()
    return data.result
}

/** Baca koleksi (array/objek). */
export async function read(name, fallback = []) {
    const key = PREFIX + name
    if (!hasRedis()) {
        return mem.has(key) ? mem.get(key) : fallback
    }
    try {
        const raw = await redis(["GET", key])
        if (raw == null) return fallback
        return typeof raw === "string" ? JSON.parse(raw) : raw
    } catch {
        return fallback
    }
}

/** Tulis koleksi. */
export async function write(name, data) {
    const key = PREFIX + name
    if (!hasRedis()) {
        mem.set(key, data)
        return data
    }
    try {
        await redis(["SET", key, JSON.stringify(data)])
    } catch {}
    return data
}

/** Update koleksi dengan fungsi mutator. */
export async function update(name, fn, fallback = []) {
    const data = await read(name, fallback)
    const next = fn(data) ?? data
    await write(name, next)
    return next
}

export default { read, write, update, hasRedis }
