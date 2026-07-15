;(() => {
    const $ = (s, r = document) => r.querySelector(s)
    const $$ = (s, r = document) => [...r.querySelectorAll(s)]

    let KEY = ""
    let PIN = ""
    let ownerMain = "" // owner utama dari lisensi (tak bisa dihapus)
    let owners = []

    const TOGGLES = [
        {
            k: "public",
            name: "Mode Publik",
            desc: "Semua orang bisa pakai bot (bukan owner saja)."
        },
        { k: "autoread", name: "Auto Read", desc: "Otomatis membaca pesan masuk." },
        {
            k: "autotyping",
            name: "Auto Typing",
            desc: "Menampilkan status \u201cmengetik…\u201d saat membalas."
        },
        {
            k: "autovoice",
            name: "Auto Voice",
            desc: "Menampilkan status \u201cmerekam suara…\u201d."
        }
    ]

    // ─── Login ───
    async function login() {
        const key = $("#keyInput").value.trim().toUpperCase()
        const pin = $("#pinInput").value.trim()
        const err = $("#loginErr")
        err.style.display = "none"
        if (!key || !pin) {
            err.textContent = "Isi License Key & PIN."
            err.style.display = "block"
            return
        }
        const btn = $("#loginBtn")
        btn.disabled = true
        btn.textContent = "Memeriksa…"
        let d
        try {
            d = await fetch("/api/config?action=login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key, pin })
            }).then((r) => r.json())
        } catch {
            d = { ok: false, error: "Server tidak dapat dihubungi." }
        }
        btn.disabled = false
        btn.textContent = "Masuk"
        if (!d.ok) {
            err.textContent = d.error || "Login gagal."
            err.style.display = "block"
            return
        }
        KEY = key
        PIN = pin
        try {
            sessionStorage.setItem("chaeul_user", JSON.stringify({ key, pin }))
        } catch {}
        showPanel(d)
    }

    function showPanel(d) {
        $("#loginScreen").style.display = "none"
        $("#panel").style.display = "block"
        const lic = d.license || {}
        const exp = lic.expiresAt ? new Date(lic.expiresAt).toLocaleDateString("id-ID") : "-"
        $("#licChip").textContent = `${(lic.plan || "-").toUpperCase()} · s/d ${exp}`
        fillForm(d.config || {})
    }

    // ─── Form ───
    function fillForm(cfg) {
        $("#fBotname").value = cfg.botname || ""
        $("#fOwnername").value = cfg.ownername || ""
        $("#fPrefix").value = cfg.prefix || "."
        $("#fFooter").value = cfg.footer || ""
        $("#fPack").value = cfg.sticker?.packname || ""
        $("#fAuthor").value = cfg.sticker?.author || ""
        $("#fCity").value = cfg.weatherCity || ""
        $("#fLink").value = cfg.link || ""

        owners = Array.isArray(cfg.owner) ? cfg.owner.slice() : []
        ownerMain = owners[0] || ""
        renderOwners()
        renderToggles(cfg.settings || {})
    }

    function renderOwners() {
        const el = $("#ownerList")
        if (!owners.length) {
            el.innerHTML = `<div class="empty" style="padding:16px 0">Belum ada owner.</div>`
            return
        }
        el.innerHTML = owners
            .map((o, i) => {
                const isMain = i === 0
                return `
            <div class="owner-item">
                <span class="onum">${esc(o)}</span>
                ${isMain ? '<span class="obadge">Utama</span>' : ""}
                ${isMain ? "" : `<button class="odel" data-o="${esc(o)}" title="Hapus">×</button>`}
            </div>`
            })
            .join("")
        $$(".odel").forEach((b) =>
            b.addEventListener("click", () => {
                owners = owners.filter((x) => x !== b.dataset.o)
                renderOwners()
            })
        )
    }

    function addOwner() {
        const inp = $("#ownerInput")
        const val = inp.value.replace(/[^0-9]/g, "")
        if (val.length < 8 || val.length > 16) {
            toast("⚠️ Nomor tidak valid (8–16 digit).")
            return
        }
        if (owners.includes(val)) {
            toast("⚠️ Nomor sudah ada.")
            return
        }
        if (owners.length >= 10) {
            toast("⚠️ Maksimal 10 owner.")
            return
        }
        owners.push(val)
        inp.value = ""
        renderOwners()
    }

    function renderToggles(settings) {
        $("#toggleList").innerHTML = TOGGLES.map(
            (t) => `
        <div class="toggle-row">
            <div class="tr-info">
                <div class="tr-name">${t.name}</div>
                <div class="tr-desc">${t.desc}</div>
            </div>
            <label class="switch">
                <input type="checkbox" data-set="${t.k}" ${settings[t.k] ? "checked" : ""} />
                <span class="slider"></span>
            </label>
        </div>`
        ).join("")
    }

    // ─── Save ───
    async function save() {
        const config = {
            botname: $("#fBotname").value.trim(),
            ownername: $("#fOwnername").value.trim(),
            prefix: $("#fPrefix").value.trim() || ".",
            footer: $("#fFooter").value.trim(),
            weatherCity: $("#fCity").value.trim(),
            link: $("#fLink").value.trim(),
            owner: owners,
            settings: {},
            sticker: {
                packname: $("#fPack").value.trim(),
                author: $("#fAuthor").value.trim()
            }
        }
        $$("[data-set]").forEach((c) => (config.settings[c.dataset.set] = c.checked))

        const btn = $("#saveBtn")
        btn.disabled = true
        btn.textContent = "Menyimpan…"
        let d
        try {
            d = await fetch("/api/config?action=update", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key: KEY, pin: PIN, config })
            }).then((r) => r.json())
        } catch {
            d = { ok: false, error: "Server tidak dapat dihubungi." }
        }
        btn.disabled = false
        btn.textContent = "💾 Simpan Perubahan"
        if (!d.ok) {
            toast("⚠️ " + (d.error || "Gagal menyimpan."))
            return
        }
        fillForm(d.config)
        $("#saveNote").textContent = "Tersimpan · " + new Date().toLocaleTimeString("id-ID")
        toast("✅ Perubahan tersimpan! Bot akan memakainya otomatis.")
    }

    function logout() {
        try {
            sessionStorage.removeItem("chaeul_user")
        } catch {}
        location.reload()
    }

    // ─── Helpers ───
    let toastTimer
    function toast(msg) {
        const t = $("#toast")
        t.textContent = msg
        t.classList.add("show")
        clearTimeout(toastTimer)
        toastTimer = setTimeout(() => t.classList.remove("show"), 3200)
    }
    function esc(s) {
        return String(s || "").replace(
            /[&<>"']/g,
            (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
        )
    }

    // ─── Wire ───
    $("#loginBtn").addEventListener("click", login)
    $("#pinInput").addEventListener("keydown", (e) => e.key === "Enter" && login())
    $("#addOwnerBtn").addEventListener("click", addOwner)
    $("#ownerInput").addEventListener("keydown", (e) => e.key === "Enter" && addOwner())
    $("#saveBtn").addEventListener("click", save)
    $("#logoutBtn").addEventListener("click", logout)

    // Auto-login dari sesi.
    try {
        const s = JSON.parse(sessionStorage.getItem("chaeul_user") || "null")
        if (s?.key && s?.pin) {
            $("#keyInput").value = s.key
            $("#pinInput").value = s.pin
            login()
        }
    } catch {}
})()
