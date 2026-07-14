import {
    createLicense,
    listLicenses,
    getLicense,
    setStatus,
    extendLicense,
    revokeLicense,
    deleteLicense,
    isOnline
} from "../../lib/license.js"
import { cors, json, getBody, isAdmin } from "../../lib/util.js"

// Endpoint admin lisensi. Aksi via ?action= atau body.action:
//   create | list | get | status | extend | revoke | delete
export default async function handler(req, res) {
    if (cors(req, res)) return
    if (!isAdmin(req)) return json(res, 401, { ok: false, error: "Unauthorized" })

    const body = getBody(req)
    const action = req.query?.action || body.action

    switch (action) {
        case "create": {
            const lic = await createLicense(body)
            return json(res, 200, { ok: true, license: lic })
        }
        case "list": {
            const items = (await listLicenses()).map((l) => ({ ...l, online: isOnline(l) }))
            return json(res, 200, { ok: true, total: items.length, items })
        }
        case "get": {
            const lic = await getLicense(body.key)
            if (!lic) return json(res, 404, { ok: false, error: "Not found" })
            return json(res, 200, { ok: true, license: { ...lic, online: isOnline(lic) } })
        }
        case "status": {
            const lic = await setStatus(body.key, body.status)
            return json(res, 200, { ok: !!lic, license: lic })
        }
        case "extend": {
            const lic = await extendLicense(body.key, body.days)
            return json(res, 200, { ok: !!lic, license: lic })
        }
        case "revoke": {
            const lic = await revokeLicense(body.key)
            return json(res, 200, { ok: !!lic, license: lic })
        }
        case "delete": {
            const ok = await deleteLicense(body.key)
            return json(res, 200, { ok })
        }
        default:
            return json(res, 400, { ok: false, error: "Aksi tidak valid." })
    }
}
