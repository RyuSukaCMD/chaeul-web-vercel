;(() => {
    const $ = (s, r = document) => r.querySelector(s)
    const $$ = (s, r = document) => [...r.querySelectorAll(s)]
    const rp = (n) => "Rp " + Number(n || 0).toLocaleString("id-ID")
    const esc = (s) =>
        String(s || "").replace(
            /[&<>"']/g,
            (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
        )
    let TOKEN = sessionStorage.getItem("chaeul_admin") || ""
    let DATA = { stats: {}, licenses: [], orders: [] }

    // ─── API helper ───
    async function api(path, method = "GET", body) {
        const opt = { method, headers: { "x-admin-token": TOKEN } }
        if (body) {
            opt.headers["Content-Type"] = "application/json"
            opt.body = JSON.stringify(body)
        }
        const r = await fetch(path, opt)
        return r.json()
    }

    let ROLE = sessionStorage.getItem("chaeul_admin_role") || "admin"

    // ─── Kripto: import PKCS8 Ed25519 PEM & tanda tangani challenge ───
    function pemToArrayBuffer(pem) {
        const b64 = pem
            .replace(/-----BEGIN [^-]+-----/, "")
            .replace(/-----END [^-]+-----/, "")
            .replace(/\s+/g, "")
        const bin = atob(b64)
        const buf = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
        return buf.buffer
    }
    async function signChallenge(pemText, nonce) {
        const keyData = pemToArrayBuffer(pemText)
        const key = await crypto.subtle.importKey("pkcs8", keyData, { name: "Ed25519" }, false, [
            "sign"
        ])
        const sig = await crypto.subtle.sign(
            { name: "Ed25519" },
            key,
            new TextEncoder().encode(nonce)
        )
        return btoa(String.fromCharCode(...new Uint8Array(sig)))
    }
    const readFile = (file) =>
        new Promise((res, rej) => {
            const fr = new FileReader()
            fr.onload = () => res(fr.result)
            fr.onerror = rej
            fr.readAsText(file)
        })

    // ─── Login (username + .pem) ───
    let pemText = ""
    $("#pemInput")?.addEventListener("change", async (e) => {
        const f = e.target.files[0]
        if (!f) return
        pemText = await readFile(f)
        $("#pemName").textContent = "✓ " + f.name
    })

    $("#loginBtn").addEventListener("click", async () => {
        const username = $("#userInput").value.trim()
        $("#loginErr").style.display = "none"
        if (!username || !pemText) {
            $("#loginErr").textContent = "Isi username & pilih file .pem."
            $("#loginErr").style.display = "block"
            return
        }
        const btn = $("#loginBtn")
        btn.disabled = true
        btn.textContent = "Memverifikasi…"
        try {
            // 1. minta challenge
            const ch = await fetch("/api/admin?action=challenge", { method: "POST" }).then((x) =>
                x.json()
            )
            // 2. tanda tangani nonce
            const signature = await signChallenge(pemText, ch.nonce)
            // 3. login
            const r = await fetch("/api/admin?action=login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, nonce: ch.nonce, signature })
            }).then((x) => x.json())
            if (!r.ok) throw new Error(r.error || "Login gagal")
            TOKEN = r.token
            ROLE = r.role
            sessionStorage.setItem("chaeul_admin", TOKEN)
            sessionStorage.setItem("chaeul_admin_role", ROLE)
            enterDash()
        } catch (err) {
            $("#loginErr").textContent = "⚠️ " + (err.message || "Login gagal")
            $("#loginErr").style.display = "block"
        } finally {
            btn.disabled = false
            btn.textContent = "Masuk Dashboard"
        }
    })

    // ─── Bootstrap: tampilkan form buat OWNER pertama bila belum ada admin ───
    ;(async () => {
        try {
            const ch = await fetch("/api/admin?action=challenge", { method: "POST" }).then((x) =>
                x.json()
            )
            if (ch.bootstrap) $("#bootstrapBox").style.display = "block"
        } catch {}
    })()
    $("#bsBtn")?.addEventListener("click", async () => {
        const nick = $("#bsNick").value.trim()
        const username = $("#bsUser").value.trim() || nick
        if (!nick || !username) return toast("⚠️ Isi nick & username")
        const r = await fetch("/api/admin?action=genkey", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nick, username, role: "owner" })
        }).then((x) => x.json())
        if (!r.ok) return toast("⚠️ " + (r.error || "Gagal"))
        downloadPem(r.privatePem, r.filename)
        toast("🔑 Key owner dibuat! File .pem terunduh. Login pakai file itu.")
        $("#userInput").value = username
    })

    function downloadPem(pem, filename) {
        const blob = new Blob([pem], { type: "application/x-pem-file" })
        const a = document.createElement("a")
        a.href = URL.createObjectURL(blob)
        a.download = filename || "key.pem"
        document.body.appendChild(a)
        a.click()
        setTimeout(() => {
            URL.revokeObjectURL(a.href)
            a.remove()
        }, 1000)
    }

    function enterDash() {
        $("#loginScreen").style.display = "none"
        $("#dash").style.display = "grid"
        // Owner-only UI (mis. tab Admin/generate key)
        document.body.classList.toggle("is-owner", ROLE === "owner")
        loadAll()
        clearInterval(window.__poll)
        // Refresh ringan tiap 20 detik & HANYA saat tab aktif (tidak berat).
        window.__poll = setInterval(() => {
            if (!document.hidden) loadAll()
        }, 20000)
    }

    $("#logoutBtn").addEventListener("click", async () => {
        try {
            await fetch("/api/admin?action=logout", {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-admin-token": TOKEN }
            })
        } catch {}
        sessionStorage.removeItem("chaeul_admin")
        sessionStorage.removeItem("chaeul_admin_role")
        location.reload()
    })

    // ─── Tabs ───
    const TAB_INFO = {
        overview: ["Overview", "Ringkasan real-time bot & lisensi."],
        licenses: ["Lisensi", "Kelola semua lisensi bot."],
        orders: ["Pesanan", "Pesanan sewa masuk dari website."],
        coupons: ["Kupon", "Kelola kode diskon."],
        admins: ["Admin", "Kelola akun admin & generate key .pem (owner)."]
    }
    $$(".side-link[data-tab]").forEach((b) =>
        b.addEventListener("click", () => {
            $$(".side-link").forEach((x) => x.classList.remove("active"))
            b.classList.add("active")
            const tab = b.dataset.tab
            $$(".tab").forEach((t) => (t.style.display = "none"))
            $("#tab-" + tab).style.display = "block"
            $("#tabTitle").textContent = TAB_INFO[tab][0]
            $("#tabSub").textContent = TAB_INFO[tab][1]
            if (tab === "admins") loadAdmins()
        })
    )
    $("#refreshBtn").addEventListener("click", loadAll)

    // ─── Load & render ───
    async function loadAll() {
        const r = await api("/api/admin?action=overview")
        if (!r.ok) {
            if (r.error === "Unauthorized") {
                sessionStorage.removeItem("chaeul_admin")
                location.reload()
            }
            return
        }
        DATA = r
        renderKPI(r.stats)
        renderCharts(r.history || [])
        renderBots(r.licenses)
        renderLicenses(r.licenses)
        renderOrders(r.orders)
        loadCoupons()
    }

    // ─── Admins (owner only) ───
    async function loadAdmins() {
        const r = await api("/api/admin?action=admins", "POST", {})
        if (!r.ok) return
        renderAdmins(r.items || [], r.me || {})
    }
    function renderAdmins(items, me) {
        const body = $("#admBody")
        if (!items.length) {
            body.innerHTML = `<tr><td colspan="5" class="empty-tbl">Belum ada admin.</td></tr>`
            return
        }
        body.innerHTML = items
            .map((a) => {
                const isSelf = a.username === me.username
                const canDel = me.role === "owner" && !isSelf
                return `<tr>
                <td>${esc(a.nick)}</td>
                <td class="mono">${esc(a.username)}</td>
                <td><span class="st ${a.role === "owner" ? "active" : "pending"}">${a.role}</span></td>
                <td style="font-size:.82rem;color:var(--muted)">${a.createdAt ? fmtDate(a.createdAt) : "-"}</td>
                <td>${canDel ? `<button class="mini-btn danger" data-adm-del="${esc(a.username)}">Hapus</button>` : isSelf ? '<span style="color:var(--faint);font-size:.78rem">kamu</span>' : "-"}</td>
            </tr>`
            })
            .join("")
        $$("[data-adm-del]").forEach((b) =>
            b.addEventListener("click", async () => {
                if (!confirm(`Hapus admin ${b.dataset.admDel}?`)) return
                const r = await api("/api/admin?action=deladmin", "POST", {
                    username: b.dataset.admDel
                })
                if (r.ok) {
                    toast("🗑️ Admin dihapus")
                    loadAdmins()
                } else toast("⚠️ " + (r.error || "Gagal"))
            })
        )
    }
    $("#newAdminBtn")?.addEventListener("click", () => {
        $("#modalBody").innerHTML = `
            <h3>Generate Key Baru</h3>
            <p class="modal-sub">Buat akun admin/owner. File .pem akan terunduh (nama = nick).</p>
            <div class="field">
                <label>Nick (nama file .pem)</label>
                <input id="gkNick" placeholder="mis. Staff1" />
            </div>
            <div class="field">
                <label>Username (untuk login)</label>
                <input id="gkUser" placeholder="mis. staff1" />
            </div>
            <div class="field">
                <label>Role</label>
                <select id="gkRole">
                    <option value="admin">Admin</option>
                    <option value="owner">Owner (bisa generate key)</option>
                </select>
            </div>
            <button class="btn btn-primary" id="gkSubmit" style="width:100%;justify-content:center">Generate & Unduh .pem</button>`
        openModal()
        $("#gkSubmit").addEventListener("click", async () => {
            const nick = $("#gkNick").value.trim()
            const username = $("#gkUser").value.trim() || nick
            if (!nick || !username) return toast("⚠️ Isi nick & username")
            const r = await api("/api/admin?action=genkey", "POST", {
                nick,
                username,
                role: $("#gkRole").value
            })
            if (!r.ok) return toast("⚠️ " + (r.error || "Gagal"))
            downloadPem(r.privatePem, r.filename)
            closeModal()
            toast("🔑 Key dibuat & .pem terunduh! Simpan baik-baik.")
            loadAdmins()
        })
    })

    // ─── Coupons ───
    async function loadCoupons() {
        const r = await api("/api/admin?action=coupon", "POST", { op: "list" })
        if (!r.ok) return
        renderCoupons(r.items || [])
    }
    function renderCoupons(items) {
        const body = $("#cpnBody")
        if (!body) return
        if (!items.length) {
            body.innerHTML = `<tr><td colspan="5" class="empty-tbl">Belum ada kupon.</td></tr>`
            return
        }
        body.innerHTML = items
            .map((c) => {
                const exp = c.expiresAt ? fmtDate(c.expiresAt) : "Tak terbatas"
                const use = c.maxUse ? `${c.used || 0}/${c.maxUse}` : `${c.used || 0}/∞`
                return `<tr>
                <td class="mono">${c.code}</td>
                <td>${c.percent}%</td>
                <td>${use}</td>
                <td style="font-size:.82rem;color:var(--muted)">${exp}</td>
                <td><div class="row-actions">
                    <button class="mini-btn danger" data-cpn-del="${c.code}">Hapus</button>
                </div></td>
            </tr>`
            })
            .join("")
        $$("[data-cpn-del]").forEach((b) =>
            b.addEventListener("click", async () => {
                if (!confirm("Hapus kupon " + b.dataset.cpnDel + "?")) return
                await api("/api/admin?action=coupon", "POST", {
                    op: "delete",
                    code: b.dataset.cpnDel
                })
                toast("🗑️ Kupon dihapus")
                loadCoupons()
            })
        )
    }

    // ─── SVG Charts (no dependency) ───
    function lineChart(el, series, opts = {}) {
        const W = 500,
            H = 170,
            pad = 8
        if (!series.length || series.every((s) => !s.data.some((v) => v > 0))) {
            el.innerHTML = `<div class="chart-empty">Belum ada data.</div>`
            return
        }
        const n = series[0].data.length
        const allVals = series.flatMap((s) => s.data)
        const max = Math.max(...allVals, 1)
        const xStep = n > 1 ? (W - pad * 2) / (n - 1) : 0
        const y = (v) => H - pad - (v / max) * (H - pad * 2)
        const x = (i) => pad + i * xStep

        let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">`
        // gridlines
        for (let g = 0; g <= 3; g++) {
            const gy = pad + (g / 3) * (H - pad * 2)
            svg += `<line x1="${pad}" y1="${gy}" x2="${W - pad}" y2="${gy}" stroke="rgba(255,255,255,.06)" stroke-width="1"/>`
        }
        series.forEach((s) => {
            const pts = s.data.map((v, i) => `${x(i)},${y(v)}`).join(" ")
            // area fill
            const area = `${pad},${H - pad} ${pts} ${x(n - 1)},${H - pad}`
            svg += `<polygon points="${area}" fill="${s.color}" opacity="0.08"/>`
            svg += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`
            // last point dot
            const li = n - 1
            svg += `<circle cx="${x(li)}" cy="${y(s.data[li])}" r="4" fill="${s.color}"/>`
        })
        svg += `</svg>`
        el.innerHTML = svg
    }

    function renderCharts(history) {
        // Pastikan minimal 2 titik biar garisnya kelihatan
        const h = history.length === 1 ? [{ ...history[0] }, history[0]] : history
        const users = h.map((x) => x.users || 0)
        const groups = h.map((x) => x.groups || 0)
        const rev = h.map((x) => x.revenue || 0)

        lineChart($("#growthChart"), [
            { data: users, color: "#7c9cff" },
            { data: groups, color: "#5eead4" }
        ])
        lineChart($("#revenueChart"), [{ data: rev, color: "#b98cff" }])
    }

    function renderKPI(s) {
        const cards = [
            { ic: "👥", n: s.users, l: "User Terdaftar" },
            { ic: "💬", n: s.groups, l: "Grup Aktif" },
            { ic: "🔑", n: s.activeLicenses, l: "Lisensi Aktif" },
            { ic: "🟢", n: s.onlineBots, l: "Bot Online" },
            { ic: "🧾", n: s.orders, l: "Total Pesanan" },
            { ic: "⏳", n: s.pendingOrders, l: "Pesanan Pending" },
            { ic: "💰", n: rp(s.revenue), l: "Pendapatan", raw: true },
            { ic: "📦", n: s.licenses, l: "Total Lisensi" }
        ]
        $("#kpiGrid").innerHTML = cards
            .map(
                (c) => `
            <div class="kpi">
                <div class="kpi-ico">${c.ic}</div>
                <div class="kpi-num">${c.raw ? c.n : Number(c.n || 0).toLocaleString("id-ID")}</div>
                <div class="kpi-label">${c.l}</div>
            </div>`
            )
            .join("")
    }

    function renderBots(licenses) {
        const el = $("#botStatus")
        const active = licenses.filter((l) => l.status === "active")
        if (!active.length) {
            el.innerHTML = `<div class="empty-tbl">Belum ada bot aktif.</div>`
            return
        }
        el.innerHTML = active
            .map((l) => {
                const hb = l.lastHeartbeat
                    ? "Heartbeat: " + timeAgo(l.lastHeartbeat)
                    : "Belum ada heartbeat"
                return `<div class="mini-row">
                <span class="stat-dot ${l.online ? "on" : "off"}"></span>
                <span class="mono">${l.key}</span>
                <span style="color:var(--faint)">·</span>
                <span>${l.plan}</span>
                <span style="margin-left:auto;color:var(--faint);font-size:.82rem">${hb}</span>
            </div>`
            })
            .join("")
    }

    let LICENSES = []
    function renderLicenses(licenses) {
        LICENSES = licenses || []
        const body = $("#licBody")
        if (!licenses.length) {
            body.innerHTML = `<tr><td colspan="7" class="empty-tbl">Belum ada lisensi.</td></tr>`
            return
        }
        body.innerHTML = licenses
            .map((l) => {
                return `<tr>
                <td><span class="mono copy-key" data-copy="${l.key}" title="Klik untuk salin">${l.key}</span></td>
                <td>${l.plan}</td>
                <td class="mono">${l.ownerNumber || "-"}</td>
                <td><span class="st ${l.status}">${l.status}</span></td>
                <td><span class="stat-dot ${l.online ? "on" : "off"}"></span></td>
                <td style="font-size:.82rem;color:var(--muted)">${l.expiresAt ? fmtDate(l.expiresAt) : "-"}</td>
                <td>
                    <div class="row-actions">
                        <button class="mini-btn" data-lic-edit="${l.key}">Edit</button>
                        <button class="mini-btn" data-lic-extend="${l.key}">+30h</button>
                        ${
                            l.status === "active"
                                ? `<button class="mini-btn" data-lic-suspend="${l.key}">Suspend</button>`
                                : `<button class="mini-btn ok" data-lic-activate="${l.key}">Aktifkan</button>`
                        }
                        <button class="mini-btn danger" data-lic-revoke="${l.key}">Revoke</button>
                    </div>
                </td>
            </tr>`
            })
            .join("")
        wireLicenseActions()
    }

    function renderOrders(orders) {
        const body = $("#ordBody")
        if (!orders.length) {
            body.innerHTML = `<tr><td colspan="7" class="empty-tbl">Belum ada pesanan.</td></tr>`
            return
        }
        body.innerHTML = orders
            .map((o) => {
                const link = o.groupLink
                    ? `<a href="${o.groupLink}" target="_blank" style="color:var(--brand)">link ↗</a>`
                    : "-"
                return `<tr>
                <td class="mono">${o.id}</td>
                <td>${o.planName || o.plan}</td>
                <td>${link}</td>
                <td class="mono">${o.contact || "-"}</td>
                <td>${rp(o.price)}</td>
                <td><span class="st ${o.status}">${o.status}</span>${
                    o.licenseKey
                        ? `<div class="mono" style="font-size:.72rem;color:var(--faint);margin-top:4px">${o.licenseKey}</div>`
                        : ""
                }</td>
                <td>
                    <div class="row-actions">
                        ${
                            o.status === "pending"
                                ? `<button class="mini-btn" data-ord-paid="${o.id}">Tandai Bayar</button>
                                   <button class="mini-btn ok" data-ord-approve="${o.id}">Terbitkan</button>
                                   <button class="mini-btn" data-ord-queue="${o.id}">Auto-Provision</button>`
                                : o.status === "paid"
                                  ? `<button class="mini-btn ok" data-ord-approve="${o.id}">Terbitkan Lisensi</button>
                                     <button class="mini-btn" data-ord-queue="${o.id}">Auto-Provision</button>`
                                  : o.status === "approved"
                                    ? `<span style="color:var(--faint);font-size:.78rem">⏳ menunggu bot...</span>`
                                    : o.status === "failed"
                                      ? `<button class="mini-btn" data-ord-queue="${o.id}">Coba Lagi</button>`
                                      : ""
                        }
                        <button class="mini-btn danger" data-ord-del="${o.id}">Hapus</button>
                    </div>
                </td>
            </tr>`
            })
            .join("")
        wireOrderActions()
    }

    // ─── Actions ───
    function wireLicenseActions() {
        // ── Edit lisensi: atur masa aktif (hari) & PIN sebebasnya ──
        $$("[data-lic-edit]").forEach((b) =>
            b.addEventListener("click", () => openEditLicense(b.dataset.licEdit))
        )
        $$("[data-copy]").forEach((el) =>
            el.addEventListener("click", () => {
                navigator.clipboard?.writeText(el.dataset.copy)
                toast("🔑 Key disalin!")
            })
        )
        $$("[data-lic-extend]").forEach((b) =>
            b.addEventListener("click", async () => {
                await fetch("/api/license?action=extend", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "x-admin-token": TOKEN },
                    body: JSON.stringify({ key: b.dataset.licExtend, days: 30 })
                })
                toast("✅ Diperpanjang 30 hari")
                loadAll()
            })
        )
        $$("[data-lic-suspend]").forEach((b) =>
            b.addEventListener("click", () => setLicStatus(b.dataset.licSuspend, "suspended"))
        )
        $$("[data-lic-activate]").forEach((b) =>
            b.addEventListener("click", () => setLicStatus(b.dataset.licActivate, "active"))
        )
        $$("[data-lic-revoke]").forEach((b) =>
            b.addEventListener("click", async () => {
                if (!confirm("Revoke lisensi ini? Bot akan berhenti.")) return
                await fetch("/api/license?action=revoke", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "x-admin-token": TOKEN },
                    body: JSON.stringify({ key: b.dataset.licRevoke })
                })
                toast("🚫 Lisensi dicabut")
                loadAll()
            })
        )
    }
    // Modal edit lisensi — set masa aktif (hari dari sekarang) & PIN.
    async function openEditLicense(key) {
        const lic = LICENSES.find((l) => l.key === key) || {}
        const daysLeft =
            lic.expiresAt && lic.expiresAt > Date.now()
                ? Math.max(0, Math.round(((lic.expiresAt - Date.now()) / 86400000) * 10) / 10)
                : 0
        // Ambil PIN saat ini.
        let curPin = ""
        try {
            const pr = await fetch("/api/license?action=pin", {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-admin-token": TOKEN },
                body: JSON.stringify({ key })
            }).then((x) => x.json())
            curPin = pr.pin || ""
        } catch {}

        $("#modalBody").innerHTML = `
            <h3>Edit Lisensi</h3>
            <p class="modal-sub mono" style="word-break:break-all">${key}</p>
            <div class="field">
                <label>Masa Aktif (hari dari sekarang)</label>
                <input id="edDays" type="number" step="0.5" value="${daysLeft}" />
                <div class="hint">Sisa saat ini: ${daysLeft} hari. Set bebas — mis. 9999 (seumur hidup) atau 0 (langsung habis).</div>
            </div>
            <div class="field">
                <label>PIN User Page (4–8 digit)</label>
                <input id="edPin" inputmode="numeric" maxlength="8" value="${curPin}" />
            </div>
            <div class="field">
                <label>🔒 Group Lock (JID grup)</label>
                <input id="edGroup" placeholder="1203xxxx@g.us" value="${esc(lic.groupJid || "")}" />
                <div class="hint">Kunci lisensi ke grup ini. Kosongkan = tidak dikunci. Bot mengisi otomatis saat join grup.</div>
            </div>
            <div style="display:flex;gap:10px;margin-top:6px">
                <button class="btn btn-ghost btn-sm" id="edRandPin" type="button" style="flex:1;justify-content:center">🎲 Acak PIN</button>
                <button class="btn btn-primary" id="edSave" type="button" style="flex:2;justify-content:center">💾 Simpan</button>
            </div>`
        openModal()

        $("#edRandPin").addEventListener("click", () => {
            $("#edPin").value = String(Math.floor(100000 + Math.random() * 900000))
        })
        $("#edSave").addEventListener("click", async () => {
            const days = parseFloat($("#edDays").value)
            const pin = $("#edPin").value.trim()
            const btn = $("#edSave")
            btn.disabled = true
            btn.textContent = "Menyimpan…"
            try {
                if (!isNaN(days)) {
                    await fetch("/api/license?action=setexpiry", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "x-admin-token": TOKEN },
                        body: JSON.stringify({ key, days })
                    })
                }
                if (pin) {
                    await fetch("/api/license?action=setpin", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "x-admin-token": TOKEN },
                        body: JSON.stringify({ key, pin })
                    })
                }
                // Group lock (selalu kirim — memungkinkan clear dgn kosong).
                await fetch("/api/license?action=setgroup", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "x-admin-token": TOKEN },
                    body: JSON.stringify({ key, groupJid: $("#edGroup").value.trim() })
                })
                closeModal()
                toast("✅ Lisensi diperbarui")
                loadAll()
            } catch {
                btn.disabled = false
                btn.textContent = "💾 Simpan"
                toast("⚠️ Gagal menyimpan")
            }
        })
    }

    async function setLicStatus(key, status) {
        await fetch("/api/license?action=status", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-admin-token": TOKEN },
            body: JSON.stringify({ key, status })
        })
        toast("✅ Status: " + status)
        loadAll()
    }

    function wireOrderActions() {
        $$("[data-ord-paid]").forEach((b) =>
            b.addEventListener("click", async () => {
                await api("/api/admin?action=order", "POST", {
                    op: "status",
                    id: b.dataset.ordPaid,
                    status: "paid"
                })
                toast("💰 Ditandai sudah bayar")
                loadAll()
            })
        )
        $$("[data-ord-approve]").forEach((b) =>
            b.addEventListener("click", async () => {
                const r = await api("/api/admin?action=order", "POST", {
                    op: "approve",
                    id: b.dataset.ordApprove,
                    days: 30
                })
                if (r.ok) toast("🔑 Lisensi terbit: " + r.license.key)
                else toast("⚠️ " + (r.error || "Gagal"))
                loadAll()
            })
        )
        $$("[data-ord-queue]").forEach((b) =>
            b.addEventListener("click", async () => {
                const r = await api("/api/admin?action=order", "POST", {
                    op: "queue",
                    id: b.dataset.ordQueue
                })
                if (r.ok) toast("🤖 Diantre — bot akan join grup & terbitkan lisensi")
                else toast("⚠️ Gagal")
                loadAll()
            })
        )
        $$("[data-ord-del]").forEach((b) =>
            b.addEventListener("click", async () => {
                if (!confirm("Hapus pesanan ini?")) return
                await api("/api/admin?action=order", "POST", { op: "delete", id: b.dataset.ordDel })
                toast("🗑️ Pesanan dihapus")
                loadAll()
            })
        )
    }

    // ─── New license modal ───
    // ─── New coupon modal ───
    $("#newCouponBtn").addEventListener("click", () => {
        $("#modalBody").innerHTML = `
            <h3>Buat Kupon</h3>
            <p class="modal-sub">Kode diskon untuk pelanggan.</p>
            <div class="field">
                <label>Kode Kupon</label>
                <input id="ncCode" placeholder="HEMAT20" style="text-transform:uppercase" />
            </div>
            <div class="field">
                <label>Diskon (%)</label>
                <input id="ncPercent" type="number" value="10" min="0" max="100" />
            </div>
            <div class="field">
                <label>Maks Pemakaian (0 = tak terbatas)</label>
                <input id="ncMax" type="number" value="0" min="0" />
            </div>
            <div class="field">
                <label>Berlaku (hari, 0 = selamanya)</label>
                <input id="ncDays" type="number" value="0" min="0" />
            </div>
            <button class="btn btn-primary" id="ncSubmit" style="width:100%;justify-content:center">Buat Kupon</button>`
        openModal()
        $("#ncSubmit").addEventListener("click", async () => {
            const code = $("#ncCode").value.trim().toUpperCase()
            if (!code) return toast("⚠️ Kode wajib diisi")
            const r = await api("/api/admin?action=coupon", "POST", {
                op: "create",
                code,
                percent: parseInt($("#ncPercent").value, 10) || 0,
                maxUse: parseInt($("#ncMax").value, 10) || 0,
                days: parseInt($("#ncDays").value, 10) || 0
            })
            if (r.ok) {
                closeModal()
                toast("🎟️ Kupon " + code + " dibuat")
                loadCoupons()
            } else toast("⚠️ " + (r.error || "Gagal"))
        })
    })

    $("#newLicBtn").addEventListener("click", () => {
        $("#modalBody").innerHTML = `
            <h3>Buat Lisensi</h3>
            <p class="modal-sub">Terbitkan lisensi baru untuk bot.</p>
            <div class="field">
                <label>Paket</label>
                <select id="nlPlan">
                    <option value="private">Private Group (maks 3)</option>
                    <option value="public">Public Group</option>
                </select>
            </div>
            <div class="field">
                <label>Nomor Owner (WA)</label>
                <input id="nlOwner" placeholder="628xxxxxxxxxx" />
            </div>
            <div class="field">
                <label>Durasi (hari)</label>
                <input id="nlDays" type="number" value="30" />
            </div>
            <div class="field">
                <label>PIN User Page (opsional, 4–8 digit)</label>
                <input id="nlPin" inputmode="numeric" placeholder="Kosongkan = acak" maxlength="8" />
                <div class="hint">Dipakai user untuk login ke Panel Pengguna.</div>
            </div>
            <div class="field">
                <label>Grup JID (opsional, kunci ke grup)</label>
                <input id="nlGroup" placeholder="1203xxxx@g.us" />
            </div>
            <button class="btn btn-primary" id="nlSubmit" style="width:100%;justify-content:center">Buat Lisensi</button>`
        openModal()
        $("#nlSubmit").addEventListener("click", async () => {
            const body = {
                plan: $("#nlPlan").value,
                ownerNumber: $("#nlOwner").value.trim(),
                days: parseInt($("#nlDays").value, 10) || 30,
                pin: $("#nlPin").value.trim() || undefined,
                groupJid: $("#nlGroup").value.trim() || null
            }
            const r = await fetch("/api/license?action=create", {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-admin-token": TOKEN },
                body: JSON.stringify(body)
            }).then((x) => x.json())
            if (r.ok) {
                $("#modalBody").innerHTML = `
                    <h3>✅ Lisensi Dibuat</h3>
                    <p class="modal-sub">Berikan detail ini ke pelanggan.</p>
                    <div class="field">
                        <label>License Key</label>
                        <input readonly value="${r.license.key}" onclick="this.select()" />
                    </div>
                    <div class="field">
                        <label>PIN User Page</label>
                        <input readonly value="${r.pin}" onclick="this.select()" />
                    </div>
                    <button class="btn btn-primary" id="nlDone" style="width:100%;justify-content:center">Selesai</button>`
                $("#nlDone").addEventListener("click", () => {
                    closeModal()
                    loadAll()
                })
                toast("🔑 Lisensi dibuat!")
            } else toast("⚠️ Gagal membuat lisensi")
        })
    })

    // ─── Modal + toast ───
    const modal = $("#modal")
    function openModal() {
        modal.classList.add("open")
        document.body.style.overflow = "hidden"
    }
    function closeModal() {
        modal.classList.remove("open")
        document.body.style.overflow = ""
    }
    $$("[data-close]").forEach((el) => el.addEventListener("click", closeModal))
    document.addEventListener("keydown", (e) => e.key === "Escape" && closeModal())

    let toastTimer
    function toast(msg) {
        const t = $("#toast")
        t.textContent = msg
        t.classList.add("show")
        clearTimeout(toastTimer)
        toastTimer = setTimeout(() => t.classList.remove("show"), 3000)
    }

    // ─── Helpers ───
    function fmtDate(ts) {
        return new Date(ts).toLocaleDateString("id-ID", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        })
    }
    function timeAgo(ts) {
        const s = Math.floor((Date.now() - ts) / 1000)
        if (s < 60) return s + " dtk lalu"
        if (s < 3600) return Math.floor(s / 60) + " mnt lalu"
        if (s < 86400) return Math.floor(s / 3600) + " jam lalu"
        return Math.floor(s / 86400) + " hari lalu"
    }

    // Auto-login bila sesi tersimpan (validasi ke server).
    if (TOKEN) {
        fetch("/api/admin?action=session", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-admin-token": TOKEN }
        })
            .then((x) => x.json())
            .then((s) => {
                if (s.ok) {
                    ROLE = s.role || ROLE
                    enterDash()
                } else {
                    sessionStorage.removeItem("chaeul_admin")
                    sessionStorage.removeItem("chaeul_admin_role")
                }
            })
            .catch(() => {})
    }
})()
