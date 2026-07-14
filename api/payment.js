import crypto from "crypto"
import { read, update } from "../lib/store.js"
import { cors, json, getBody } from "../lib/util.js"

function mode() {
    if (process.env.PAYMENT_MODE) return process.env.PAYMENT_MODE
    if (process.env.MIDTRANS_SERVER_KEY) return "midtrans"
    if (process.env.XENDIT_SECRET_KEY) return "xendit"
    return "placeholder"
}

async function markPaid(orderId) {
    await update("orders", (list) =>
        list.map((o) => (o.id === orderId && o.status === "pending" ? { ...o, status: "paid", paidAt: Date.now() } : o))
    )
}

// Aksi via ?action=: mode | create | webhook-midtrans | webhook-xendit
export default async function handler(req, res) {
    if (cors(req, res)) return
    const action = req.query?.action || "mode"

    if (action === "mode") return json(res, 200, { mode: mode() })

    if (action === "create") {
        const { orderId } = getBody(req)
        const order = (await read("orders")).find((o) => o.id === orderId)
        if (!order) return json(res, 404, { ok: false, error: "Order tidak ditemukan." })
        const m = mode()
        try {
            if (m === "midtrans") return json(res, 200, await midtransSnap(order))
            if (m === "xendit") return json(res, 200, await xenditInvoice(order))
            return json(res, 200, {
                ok: true,
                mode: "placeholder",
                amount: order.price,
                orderId: order.id,
                note: "Payment gateway belum dikonfigurasi. Hubungi owner untuk konfirmasi."
            })
        } catch (e) {
            return json(res, 500, { ok: false, error: e.message })
        }
    }

    if (action === "webhook-midtrans") {
        const b = getBody(req)
        const serverKey = process.env.MIDTRANS_SERVER_KEY || ""
        const expected = crypto
            .createHash("sha512")
            .update(`${b.order_id}${b.status_code}${b.gross_amount}${serverKey}`)
            .digest("hex")
        if (serverKey && b.signature_key && b.signature_key !== expected)
            return json(res, 403, { ok: false, error: "Signature invalid" })
        if (["capture", "settlement"].includes(b.transaction_status)) await markPaid(b.order_id)
        return json(res, 200, { ok: true })
    }

    if (action === "webhook-xendit") {
        const token = req.headers["x-callback-token"]
        if (process.env.XENDIT_CALLBACK_TOKEN && token !== process.env.XENDIT_CALLBACK_TOKEN)
            return json(res, 403, { ok: false, error: "Token invalid" })
        const b = getBody(req)
        if (b.status === "PAID") await markPaid(b.external_id)
        return json(res, 200, { ok: true })
    }

    json(res, 400, { ok: false, error: "Aksi tidak valid." })
}

async function midtransSnap(order) {
    const serverKey = process.env.MIDTRANS_SERVER_KEY
    const isProd = process.env.MIDTRANS_PRODUCTION === "true"
    const url = isProd
        ? "https://app.midtrans.com/snap/v1/transactions"
        : "https://app.sandbox.midtrans.com/snap/v1/transactions"
    const auth = Buffer.from(serverKey + ":").toString("base64")
    const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Basic ${auth}` },
        body: JSON.stringify({
            transaction_details: { order_id: order.id, gross_amount: order.price },
            item_details: [{ id: order.plan, price: order.price, quantity: 1, name: order.planName }],
            customer_details: { phone: order.contact || "" }
        })
    })
    const data = await r.json()
    if (!data.token) throw new Error(data.error_messages?.join(", ") || "Gagal Midtrans.")
    return { ok: true, mode: "midtrans", token: data.token, redirect_url: data.redirect_url, amount: order.price }
}

async function xenditInvoice(order) {
    const key = process.env.XENDIT_SECRET_KEY
    const auth = Buffer.from(key + ":").toString("base64")
    const r = await fetch("https://api.xendit.co/v2/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
        body: JSON.stringify({
            external_id: order.id,
            amount: order.price,
            description: `Sewa ${order.planName}`,
            success_redirect_url: (process.env.PUBLIC_URL || "") + "/?paid=" + order.id
        })
    })
    const data = await r.json()
    if (!data.invoice_url) throw new Error(data.message || "Gagal Xendit.")
    return { ok: true, mode: "xendit", invoice_url: data.invoice_url, amount: order.price }
}
