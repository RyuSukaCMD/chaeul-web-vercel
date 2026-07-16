import { read, update } from "../lib/store.js"
import { createLicense, getLicenseByGroup } from "../lib/license.js"
import { cors, json, getBody, isSync } from "../lib/util.js"

// Endpoint provisioning & notifikasi (bot). Aksi via ?action=:
//   jobs | groupstatus | report | notifications | ack
export default async function handler(req, res) {
    if (cors(req, res)) return
    if (!isSync(req)) return json(res, 401, { ok: false, error: "Unauthorized" })
    const body = getBody(req)
    const action = req.query?.action || body.action

    // ── Cek apakah sebuah grup SUDAH terdaftar (punya lisensi aktif) ──
    // Bot memanggil ini sebelum join agar tidak dobel-join grup yang sudah punya bot.
    if (action === "groupstatus") {
        const groupJid = body.groupJid || req.query?.groupJid
        if (!groupJid) return json(res, 400, { ok: false, error: "groupJid wajib." })
        const lic = await getLicenseByGroup(groupJid)
        return json(res, 200, {
            ok: true,
            exists: !!lic,
            license: lic
                ? {
                      key: lic.key,
                      plan: lic.plan,
                      expiresAt: lic.expiresAt,
                      groupName: lic.groupName,
                      maxMembers: lic.maxMembers ?? null
                  }
                : null
        })
    }

    // ── Job provisioning (order approved) ──
    if (action === "jobs") {
        const orders = await read("orders")
        const jobs = orders
            .filter(
                (o) =>
                    o.type !== "license" && // beli-lisensi tak perlu bot join grup
                    // paid/approved = order baru; needs_approval/restricted = retry otomatis
                    (o.status === "paid" ||
                        o.status === "approved" ||
                        o.status === "needs_approval" ||
                        o.status === "restricted") &&
                    !o.provisioning
            )
            .map((o) => ({
                id: o.id,
                plan: o.plan,
                groupLink: o.groupLink,
                contact: o.contact,
                maxMembers:
                    o.plan === "private" ? Number(o.maxMembers) || 3 : (o.maxMembers ?? null)
            }))
        return json(res, 200, { ok: true, jobs })
    }

    // ── Laporan hasil provisioning ──
    if (action === "report") {
        const orders = await read("orders")
        const order = orders.find((o) => o.id === body.id)
        if (!order) return json(res, 404, { ok: false, error: "Order tidak ditemukan." })

        if (!body.success) {
            // Status kegagalan yang bisa dilaporkan bot:
            //   already_exists  → grup sudah punya bot/lisensi aktif (butuh perhatian admin)
            //   needs_approval  → grup butuh persetujuan admin untuk join (pending)
            //   over_limit      → jumlah anggota melebihi batas paket private
            //   restricted      → akun bot dibatasi WhatsApp (invite manual)
            //   failed          → error umum lainnya
            const KNOWN = ["already_exists", "needs_approval", "over_limit", "restricted"]
            const st = KNOWN.includes(body.status) ? body.status : "failed"
            await update("orders", (list) =>
                list.map((o) =>
                    o.id === body.id
                        ? {
                              ...o,
                              status: st,
                              failReason: body.reason || "Gagal.",
                              groupJid: body.groupJid || o.groupJid,
                              groupName: body.groupName || o.groupName,
                              members: body.members ?? o.members,
                              // needs_approval/restricted masih bisa dicoba lagi otomatis nanti,
                              // jadi JANGAN tandai provisioning=true (biar tetap jadi job).
                              provisioning:
                                  st === "needs_approval" || st === "restricted"
                                      ? false
                                      : o.provisioning,
                              updatedAt: Date.now()
                          }
                        : o
                )
            )
            return json(res, 200, { ok: true, status: st })
        }
        let license = null
        if (!order.licenseKey) {
            // Durasi mengikuti bulan pesanan (1 bln = 30 hari), fallback 30 hari.
            const days = Number(body.days) || (order.months ? order.months * 30 : 30)
            license = await createLicense({
                plan: order.plan,
                days,
                ownerNumber: body.ownerNumber || order.contact || "",
                groupJid: body.groupJid || null, // group lock otomatis
                groupName: body.groupName || null,
                maxMembers: order.plan === "private" ? Number(order.maxMembers) || 3 : null,
                note: `Auto-provision order ${order.id}`
            })
        }
        await update("orders", (list) =>
            list.map((o) =>
                o.id === body.id
                    ? {
                          ...o,
                          status: "provisioned",
                          provisioning: true,
                          groupJid: body.groupJid || o.groupJid,
                          groupName: body.groupName || o.groupName,
                          members: body.members ?? o.members,
                          licenseKey: license ? license.key : o.licenseKey,
                          updatedAt: Date.now()
                      }
                    : o
            )
        )
        return json(res, 200, { ok: true, status: "provisioned", license })
    }

    // ── Notifikasi owner ──
    if (action === "notifications") {
        const notifs = []
        const orders = await read("orders")
        for (const o of orders) {
            if (o.status === "pending" && !o.notified) {
                notifs.push({
                    type: "new_order",
                    text: `🧾 *Order Baru!*\nID: ${o.id}\nPaket: ${o.planName}${o.months ? ` (${o.months} bln)` : ""}\nHarga: Rp ${Number(o.price).toLocaleString("id-ID")}\nKontak: ${o.contact || "-"}\nGrup: ${o.groupLink}`,
                    orderId: o.id
                })
            }
        }
        const licenses = await read("licenses")
        for (const l of licenses) {
            if (l.status === "active" && l.expiresAt) {
                const left = l.expiresAt - Date.now()
                // Notif otomatis saat sisa ≤ 3 hari (sekali saja per lisensi).
                if (left > 0 && left <= 3 * 86400000 && !l.expNotified) {
                    const days = Math.ceil(left / 86400000)
                    const tgl = new Date(l.expiresAt).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "long",
                        year: "numeric"
                    })
                    notifs.push({
                        type: "expiring",
                        // Dikirim ke OWNER + langsung ke GRUP (bila lisensi terkunci grup).
                        text:
                            `⏰ *Masa Aktif Bot Hampir Habis!*\n\n` +
                            `Sisa *${days} hari* lagi (s/d ${tgl}).\n` +
                            `Segera perpanjang agar bot tetap aktif di grup ini. 🙏`,
                        ownerText: `⏰ *Lisensi Hampir Habis!*\n${l.key} (${l.plan})\nSisa: ${days} hari (s/d ${tgl})${l.groupName ? `\nGrup: ${l.groupName}` : ""}`,
                        key: l.key,
                        groupJid: l.groupJid || null
                    })
                }
            }
        }
        return json(res, 200, { ok: true, notifications: notifs })
    }

    // ── Ack notifikasi ──
    if (action === "ack") {
        const orderIds = body.orderIds || []
        const licenseKeys = body.licenseKeys || []
        if (orderIds.length)
            await update("orders", (list) =>
                list.map((o) => (orderIds.includes(o.id) ? { ...o, notified: true } : o))
            )
        if (licenseKeys.length)
            await update("licenses", (list) =>
                list.map((l) => (licenseKeys.includes(l.key) ? { ...l, expNotified: true } : l))
            )
        return json(res, 200, { ok: true })
    }

    json(res, 400, { ok: false, error: "Aksi tidak valid." })
}
