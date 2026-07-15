import crypto from "crypto"
import { read, update } from "./store.js"
import { getLicense } from "./license.js"

// ═══════════════════════════════════════════════════════════
//  KONFIGURASI BOT — dikelola dari WEBSITE (per-lisensi).
//
//  Semua pengaturan bot (nama, owner, prefix, settings, sticker,
//  tampilan, DAN kredensial API downloader/AI) disimpan di sini,
//  di-index berdasarkan license key.
//
//  Bot mengambil config ini saat start (HANYA bila lisensi aktif) →
//  jika seseorang menghapus sistem lisensi, bot tak akan pernah
//  menerima kredensial API → downloader & AI mati total.
//
//  Koleksi: "configs"  →  { key, pin, config: {...}, updatedAt }
// ═══════════════════════════════════════════════════════════

const norm = (n = "") => String(n).replace(/[^0-9]/g, "")

// Kredensial API RAHASIA (hanya dikirim ke bot berlisensi aktif).
// Ganti nilai default lewat env agar tidak hardcode di repo.
export function apiCredentials() {
    return {
        baseUrl: process.env.BOT_API_BASEURL || "https://apiz.vsunsee.click",
        key: process.env.BOT_API_KEY || "VsunseeXVANZ"
    }
}

// Nilai default config untuk lisensi baru.
export function defaultConfig(lic = {}) {
    return {
        botname: "Chaeul",
        ownername: "Chaeulso",
        prefix: ".",
        footer: "© Chaeul 2026",
        version: "4.0.0",
        owner: lic.ownerNumber ? [norm(lic.ownerNumber)] : [],
        settings: {
            public: false,
            autoread: true,
            autotyping: false,
            autovoice: false
        },
        sticker: { packname: "Chaeul", author: "Chaeulso" },
        weatherCity: "Jakarta",
        thumbnail: "",
        newsletter: "",
        link: ""
    }
}

function genPin() {
    return String(crypto.randomInt(100000, 999999))
}

/** Ambil (atau buat) entri config untuk sebuah lisensi. */
export async function getConfigEntry(key, { create = false, lic = null } = {}) {
    const list = await read("configs")
    let entry = list.find((c) => c.key === key)
    if (!entry && create) {
        entry = {
            key,
            pin: genPin(),
            config: defaultConfig(lic || {}),
            createdAt: Date.now(),
            updatedAt: Date.now()
        }
        await update("configs", (l) => {
            if (!l.find((c) => c.key === key)) l.push(entry)
            return l
        })
    }
    return entry || null
}

/**
 * Config yang dikirim ke BOT (termasuk kredensial API).
 * WAJIB lisensi aktif. Bila belum ada entri config → dibuat otomatis
 * dgn default (owner diambil dari lisensi).
 */
export async function getBotConfig(key) {
    const lic = await getLicense(key)
    if (!lic) return { ok: false, reason: "Lisensi tidak ditemukan." }
    // Anggap expired bila sudah lewat waktu (walau status masih 'active').
    if (lic.expiresAt && Date.now() > lic.expiresAt)
        return { ok: false, reason: "Lisensi expired." }
    if (lic.status !== "active") return { ok: false, reason: `Lisensi ${lic.status}.` }

    const entry = await getConfigEntry(key, { create: true, lic })
    // Pastikan owner lisensi selalu ada (tak bisa dihapus dari web).
    const cfg = { ...entry.config }
    cfg.owner = Array.isArray(cfg.owner) ? cfg.owner.slice() : []
    if (lic.ownerNumber) {
        const on = norm(lic.ownerNumber)
        if (on && !cfg.owner.includes(on)) cfg.owner.unshift(on)
    }
    // Sisipkan kredensial API (rahasia) + info lisensi.
    cfg.api = apiCredentials()
    cfg.license = {
        key: lic.key,
        plan: lic.plan,
        expiresAt: lic.expiresAt,
        maxMembers: lic.maxMembers
    }
    return { ok: true, config: cfg }
}

/** Config yang ditampilkan di USER PAGE (tanpa kredensial API). */
export async function getUserConfig(key) {
    const entry = await getConfigEntry(key, { create: true })
    if (!entry) return null
    const cfg = { ...entry.config }
    delete cfg.api
    return cfg
}

/** Verifikasi login user page: license key + PIN + lisensi valid. */
export async function verifyUserLogin(key, pin) {
    const lic = await getLicense(key)
    if (!lic) return { ok: false, reason: "Lisensi tidak ditemukan." }
    if (lic.status === "revoked") return { ok: false, reason: "Lisensi telah dicabut." }
    const entry = await getConfigEntry(key, { create: true, lic })
    if (String(entry.pin) !== String(pin || "")) return { ok: false, reason: "PIN salah." }
    return { ok: true, license: lic }
}

// Field yang boleh diubah user (whitelist — cegah injeksi field aneh).
const ALLOWED = new Set([
    "botname",
    "ownername",
    "prefix",
    "footer",
    "settings",
    "sticker",
    "weatherCity",
    "thumbnail",
    "newsletter",
    "link"
])

/** Update config oleh user (whitelist + owner divalidasi). */
export async function updateUserConfig(key, patch = {}) {
    let saved = null
    await update("configs", (list) => {
        const entry = list.find((c) => c.key === key)
        if (!entry) return list
        const cfg = entry.config || {}

        for (const [k, v] of Object.entries(patch)) {
            if (k === "owner") {
                // Normalisasi & unik; batasi maksimal 10 owner.
                const arr = (Array.isArray(v) ? v : [v])
                    .map((x) => norm(x))
                    .filter((x) => x.length >= 7 && x.length <= 16)
                cfg.owner = [...new Set(arr)].slice(0, 10)
            } else if (ALLOWED.has(k)) {
                if (k === "settings" && v && typeof v === "object") {
                    cfg.settings = {
                        public: !!v.public,
                        autoread: !!v.autoread,
                        autotyping: !!v.autotyping,
                        autovoice: !!v.autovoice
                    }
                } else if (k === "sticker" && v && typeof v === "object") {
                    cfg.sticker = {
                        packname: String(v.packname || "").slice(0, 40),
                        author: String(v.author || "").slice(0, 40)
                    }
                } else if (typeof v === "string") {
                    cfg[k] = v.slice(0, 200)
                }
            }
        }
        entry.config = cfg
        entry.updatedAt = Date.now()
        saved = entry
        return list
    })
    if (!saved) return null
    const out = { ...saved.config }
    delete out.api
    return out
}

/** Set PIN spesifik (admin). Kosong = generate acak. Return PIN baru. */
export async function setPin(key, pin) {
    const lic = await getLicense(key)
    await getConfigEntry(key, { create: true, lic })
    const clean = String(pin || "").replace(/[^0-9]/g, "")
    const newPin = clean.length >= 4 && clean.length <= 8 ? clean : genPin()
    await update("configs", (list) => {
        const entry = list.find((c) => c.key === key)
        if (entry) {
            entry.pin = newPin
            entry.updatedAt = Date.now()
        }
        return list
    })
    return newPin
}

/** Set PIN awal saat lisensi baru dibuat (bila admin menentukan). */
export async function initPin(key, pin, lic = null) {
    const entry = await getConfigEntry(key, { create: true, lic })
    const clean = String(pin || "").replace(/[^0-9]/g, "")
    if (clean.length >= 4 && clean.length <= 8) {
        await update("configs", (list) => {
            const e = list.find((c) => c.key === key)
            if (e) {
                e.pin = clean
                e.updatedAt = Date.now()
            }
            return list
        })
        return clean
    }
    return entry.pin
}

/** Reset / regenerasi PIN (dipakai admin bila user lupa). */
export async function resetPin(key) {
    // Pastikan entri config ada dulu (lisensi mungkin baru dibuat).
    const lic = await getLicense(key)
    await getConfigEntry(key, { create: true, lic })
    let pin = null
    await update("configs", (list) => {
        const entry = list.find((c) => c.key === key)
        if (entry) {
            pin = genPin()
            entry.pin = pin
            entry.updatedAt = Date.now()
        }
        return list
    })
    return pin
}

export default {
    apiCredentials,
    defaultConfig,
    getConfigEntry,
    getBotConfig,
    getUserConfig,
    verifyUserLogin,
    updateUserConfig,
    setPin,
    initPin,
    resetPin
}
