import crypto from "crypto"
import { read, update } from "./store.js"

// ═══════════════════════════════════════════════════════════
//  AUTENTIKASI ADMIN — Keypair Ed25519 + Challenge-Response
//
//  Alur login (paling aman, private key TAK PERNAH dikirim ke server):
//   1. Client minta challenge (nonce acak).
//   2. Client menandatangani nonce dgn PRIVATE key (.pem) → signature.
//   3. Server verifikasi signature dgn PUBLIC key tersimpan → sesi.
//
//  Generate keypair (khusus OWNER): server bikin keypair, SIMPAN public key,
//  kirim private .pem SEKALI untuk diunduh (nama file = nick). Server tak
//  menyimpan private key.
//
//  Koleksi:
//   admins   → [{ id, nick, username, pubkey, role, createdAt }]
//   sessions → [{ token, username, role, nick, exp }]
//   nonces   → [{ n, exp }]   (challenge sekali pakai)
// ═══════════════════════════════════════════════════════════

const SESSION_TTL = 12 * 3600 * 1000 // 12 jam
const NONCE_TTL = 5 * 60 * 1000 // 5 menit
const norm = (s = "") =>
    String(s)
        .toLowerCase()
        .replace(/[^a-z0-9_.-]/g, "")

// ── Keypair ──
export function generateKeypair() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519")
    return {
        pubkey: publicKey.export({ type: "spki", format: "pem" }).toString(),
        privatePem: privateKey.export({ type: "pkcs8", format: "pem" }).toString()
    }
}

function verifySignature(pubkeyPem, message, signatureB64) {
    try {
        const key = crypto.createPublicKey(pubkeyPem)
        return crypto.verify(
            null,
            Buffer.from(message, "utf8"),
            key,
            Buffer.from(signatureB64, "base64")
        )
    } catch {
        return false
    }
}

// ── Admin storage ──
export async function listAdmins() {
    return (await read("admins")).map((a) => ({
        id: a.id,
        nick: a.nick,
        username: a.username,
        role: a.role,
        createdAt: a.createdAt
    }))
}
export async function countAdmins() {
    return (await read("admins")).length
}
export async function getAdmin(username) {
    const u = norm(username)
    return (await read("admins")).find((a) => a.username === u) || null
}

/**
 * Buat admin baru + keypair. Return { admin, privatePem, filename }.
 * role: "owner" | "admin". filename memakai nick.
 */
export async function createAdmin({ nick, username, role = "admin" }) {
    const u = norm(username || nick)
    if (!u) throw new Error("username/nick wajib")
    const exists = (await read("admins")).some((a) => a.username === u)
    if (exists) throw new Error("Username sudah ada.")
    const { pubkey, privatePem } = generateKeypair()
    const admin = {
        id: crypto.randomBytes(6).toString("hex"),
        nick: String(nick || u).slice(0, 40),
        username: u,
        pubkey,
        role: role === "owner" ? "owner" : "admin",
        createdAt: Date.now()
    }
    await update("admins", (l) => {
        l.push(admin)
        return l
    })
    const safeNick = (admin.nick || admin.username).replace(/[^a-zA-Z0-9_-]/g, "_")
    return { admin, privatePem, filename: `${safeNick}.pem` }
}

export async function deleteAdmin(username, actorRole) {
    if (actorRole !== "owner") return { ok: false, error: "Hanya owner." }
    const u = norm(username)
    const admins = await read("admins")
    const target = admins.find((a) => a.username === u)
    if (!target) return { ok: false, error: "Admin tidak ditemukan." }
    // Jangan biarkan owner terakhir terhapus.
    const owners = admins.filter((a) => a.role === "owner")
    if (target.role === "owner" && owners.length <= 1)
        return { ok: false, error: "Tidak bisa hapus owner terakhir." }
    await update("admins", (l) => l.filter((a) => a.username !== u))
    return { ok: true }
}

// ── Challenge / login ──
export async function issueChallenge() {
    const n = crypto.randomBytes(24).toString("hex")
    const now = Date.now()
    await update("nonces", (l) => {
        const kept = l.filter((x) => x.exp > now) // buang yang kadaluarsa
        kept.push({ n, exp: now + NONCE_TTL })
        return kept.slice(-200)
    })
    return n
}

async function consumeNonce(n) {
    let ok = false
    const now = Date.now()
    await update("nonces", (l) => {
        const idx = l.findIndex((x) => x.n === n && x.exp > now)
        if (idx >= 0) {
            ok = true
            l.splice(idx, 1)
        }
        return l.filter((x) => x.exp > now)
    })
    return ok
}

/** Verifikasi login: username + nonce (challenge) + signature. */
export async function login({ username, nonce, signature }) {
    const admin = await getAdmin(username)
    if (!admin) return { ok: false, error: "Admin tidak ditemukan." }
    if (!(await consumeNonce(nonce)))
        return { ok: false, error: "Challenge tidak valid / kadaluarsa." }
    if (!verifySignature(admin.pubkey, nonce, signature))
        return { ok: false, error: "Signature tidak cocok (.pem salah)." }

    const token = crypto.randomBytes(32).toString("hex")
    const session = {
        token,
        username: admin.username,
        nick: admin.nick,
        role: admin.role,
        exp: Date.now() + SESSION_TTL
    }
    await update("sessions", (l) => {
        const kept = l.filter((s) => s.exp > Date.now())
        kept.push(session)
        return kept.slice(-500)
    })
    return { ok: true, token, role: admin.role, nick: admin.nick, username: admin.username }
}

/** Validasi session token → { ok, role, ... } */
export async function checkSession(token) {
    if (!token) return { ok: false }
    const s = (await read("sessions")).find((x) => x.token === token && x.exp > Date.now())
    if (!s) return { ok: false }
    return { ok: true, role: s.role, nick: s.nick, username: s.username }
}

export async function logout(token) {
    await update("sessions", (l) => l.filter((s) => s.token !== token))
    return { ok: true }
}

export default {
    generateKeypair,
    listAdmins,
    countAdmins,
    getAdmin,
    createAdmin,
    deleteAdmin,
    issueChallenge,
    login,
    checkSession,
    logout
}
