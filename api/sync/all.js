import { write, read } from "../../lib/store.js"
import { cors, json, getBody, isSync } from "../../lib/util.js"

export default async function handler(req, res) {
    if (cors(req, res)) return
    if (!isSync(req)) return json(res, 401, { ok: false, error: "Unauthorized" })
    const body = getBody(req)
    if (Array.isArray(body.users)) await write("users", body.users)
    if (Array.isArray(body.groups)) await write("groups", body.groups)
    json(res, 200, {
        ok: true,
        users: (await read("users")).length,
        groups: (await read("groups")).length
    })
}
