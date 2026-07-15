import crypto from "crypto"
import { read, write, update } from "./store.js"

const norm = (n = "") => String(n).replace(/[^0-9]/g, "")

export function genKey() {
    const seg = () => crypto.randomBytes(3).toString("hex").toUpperCase().slice(0, 4)
    return `CHAEUL-${seg()}-${seg()}-${seg()}`
}

export async function createLicense(opt = {}) {
    const now = Date.now()
    const days = Number(opt.days) || 30
    const lic = {
        key: genKey(),
        ownerNumber: norm(opt.ownerNumber),
        plan: opt.plan === "public" ? "public" : "private",
        groupJid: opt.groupJid || null,
        groupName: opt.groupName || null,
        maxMembers: opt.plan === "public" ? null : Number(opt.maxMembers) || 3,
        status: "active",
        createdAt: now,
        expiresAt: now + days * 86400000,
        lastHeartbeat: null,
        heartbeatCount: 0,
        note: opt.note || ""
    }
    await update("licenses", (list) => {
        list.push(lic)
        return list
    })
    return lic
}

export async function getLicense(key) {
    return (await read("licenses")).find((l) => l.key === key) || null
}
export async function listLicenses() {
    return read("licenses")
}

export async function verifyLicense(key, meta = {}) {
    const list = await read("licenses")
    const lic = list.find((l) => l.key === key)
    if (!lic) return { valid: false, reason: "Lisensi tidak ditemukan." }

    if (lic.status === "active" && lic.expiresAt && Date.now() > lic.expiresAt) {
        lic.status = "expired"
        await write("licenses", list)
    }
    if (lic.status !== "active")
        return { valid: false, reason: `Lisensi ${lic.status}.`, license: lic }
    if (lic.groupJid && meta.groupJid && lic.groupJid !== meta.groupJid) {
        return { valid: false, reason: "Lisensi tidak cocok untuk grup ini.", license: lic }
    }

    lic.lastHeartbeat = Date.now()
    lic.heartbeatCount = (lic.heartbeatCount || 0) + 1
    if (meta.version) lic.botVersion = meta.version
    await write("licenses", list)
    return { valid: true, license: lic }
}

export async function setStatus(key, status) {
    let found = null
    await update("licenses", (list) =>
        list.map((l) => (l.key === key ? ((found = { ...l, status }), found) : l))
    )
    return found
}
export async function extendLicense(key, days) {
    let found = null
    await update("licenses", (list) =>
        list.map((l) => {
            if (l.key === key) {
                const base = Math.max(l.expiresAt || Date.now(), Date.now())
                l.expiresAt = base + Number(days) * 86400000
                if (l.status === "expired") l.status = "active"
                found = l
            }
            return l
        })
    )
    return found
}
// Set masa aktif SECARA BEBAS: expiresAt = sekarang + days (boleh besar/kecil).
// days boleh desimal (mis. 0.5 = 12 jam) atau 0 (langsung expired).
export async function setExpiry(key, days) {
    let found = null
    const ms = Math.round(Number(days) * 86400000)
    await update("licenses", (list) =>
        list.map((l) => {
            if (l.key === key) {
                l.expiresAt = Date.now() + (isNaN(ms) ? 0 : ms)
                if (l.expiresAt > Date.now()) {
                    if (l.status === "expired") l.status = "active"
                } else if (l.status === "active") {
                    l.status = "expired" // days<=0 → langsung habis
                }
                found = l
            }
            return l
        })
    )
    return found
}

export async function revokeLicense(key) {
    return setStatus(key, "revoked")
}
export async function deleteLicense(key) {
    let ok = false
    await update("licenses", (list) => {
        const next = list.filter((l) => l.key !== key)
        ok = next.length !== list.length
        return next
    })
    return ok
}
// Bot dianggap ONLINE bila heartbeat terakhir < 3 menit lalu.
// Bot mengirim heartbeat cepat tiap ~1 menit (lihat lib/license.js pada bot).
export const ONLINE_WINDOW_MS = 3 * 60 * 1000
export function isOnline(lic) {
    if (!lic?.lastHeartbeat) return false
    if (lic.status && lic.status !== "active") return false
    return Date.now() - lic.lastHeartbeat < ONLINE_WINDOW_MS
}

// Heartbeat ringan (dipanggil bot tiap ~1 menit tanpa verify penuh).
// Update lastHeartbeat + kembalikan status terkini agar bot tahu kalau
// lisensi sudah expired/suspended/revoked (→ bot broadcast & idle).
export async function heartbeat(key, meta = {}) {
    const list = await read("licenses")
    const lic = list.find((l) => l.key === key)
    if (!lic) return { valid: false, status: "notfound", reason: "Lisensi tidak ditemukan." }

    // Auto-expire bila lewat masa aktif.
    if (lic.status === "active" && lic.expiresAt && Date.now() > lic.expiresAt) {
        lic.status = "expired"
    }

    // Selalu catat waktu kontak terakhir (agar dashboard tahu bot masih hidup).
    lic.lastSeen = Date.now()
    if (meta.version) lic.botVersion = meta.version
    if (typeof meta.groups === "number") lic.groupCount = meta.groups
    if (typeof meta.users === "number") lic.userCount = meta.users

    if (lic.status !== "active") {
        await write("licenses", list)
        return { valid: false, status: lic.status, reason: `Lisensi ${lic.status}.` }
    }

    // Aktif → hitung sebagai heartbeat resmi (menandakan online).
    lic.lastHeartbeat = Date.now()
    lic.heartbeatCount = (lic.heartbeatCount || 0) + 1
    await write("licenses", list)
    return { valid: true, status: "active", expiresAt: lic.expiresAt }
}

export default {
    genKey,
    createLicense,
    getLicense,
    listLicenses,
    verifyLicense,
    setStatus,
    extendLicense,
    setExpiry,
    revokeLicense,
    deleteLicense,
    isOnline,
    heartbeat
}
