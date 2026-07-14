import { verifyLicense } from "../../lib/license.js"
import { cors, json, getBody } from "../../lib/util.js"

export default async function handler(req, res) {
    if (cors(req, res)) return
    if (req.method !== "POST") return json(res, 405, { valid: false, reason: "Method not allowed" })
    const { key, groupJid, version } = getBody(req)
    if (!key) return json(res, 400, { valid: false, reason: "Key wajib diisi." })

    const result = await verifyLicense(key, { groupJid, version })
    if (!result.valid) return json(res, 200, { valid: false, reason: result.reason })

    const lic = result.license
    json(res, 200, {
        valid: true,
        license: {
            key: lic.key,
            plan: lic.plan,
            ownerNumber: lic.ownerNumber,
            groupJid: lic.groupJid,
            maxMembers: lic.maxMembers,
            expiresAt: lic.expiresAt,
            status: lic.status
        },
        nextHeartbeat: (2 + Math.random() * 4) * 3600000
    })
}
