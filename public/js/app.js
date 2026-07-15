;(() => {
    const D = window.CHAEUL_DATA
    const $ = (s, r = document) => r.querySelector(s)
    const $$ = (s, r = document) => [...r.querySelectorAll(s)]
    const rp = (n) => "Rp " + Number(n).toLocaleString("id-ID")

    let PLANS = {
        private: { id: "private", name: "Private Group", price: 10000, maxMembers: 3 },
        public: { id: "public", name: "Public Group", price: 15000, maxMembers: null }
    }
    let DURATIONS = [
        { months: 1, label: "1 Bulan", discount: 0 },
        { months: 3, label: "3 Bulan", discount: 0.05 },
        { months: 6, label: "6 Bulan", discount: 0.1 },
        { months: 12, label: "1 Tahun", discount: 0.2 }
    ]
    fetch("/api/public?action=durations")
        .then((r) => r.json())
        .then((d) => {
            if (Array.isArray(d) && d.length) DURATIONS = d
        })
        .catch(() => {})

    // ─── Year ───
    $("#year").textContent = new Date().getFullYear()

    // ─── Navbar scroll ───
    const nav = $("#nav")
    const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 30)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })

    // ─── Mobile nav ───
    const toggle = $("#navToggle")
    const links = $(".nav-links")
    toggle?.addEventListener("click", () => links.classList.toggle("open"))
    $$(".nav-links a").forEach((a) =>
        a.addEventListener("click", () => links.classList.remove("open"))
    )

    // ─── Reveal on scroll ───
    const io = new IntersectionObserver(
        (entries) => {
            entries.forEach((e) => {
                if (e.isIntersecting) {
                    e.target.classList.add("visible")
                    io.unobserve(e.target)
                }
            })
        },
        { threshold: 0.12 }
    )
    $$(".reveal").forEach((el) => io.observe(el))

    // ─── Render highlights strip ───
    if (D.highlights && $("#highlightStrip")) {
        $("#highlightStrip").innerHTML = D.highlights
            .map(
                (h) => `
        <div class="highlight-item">
            <div class="highlight-num">${h.num}</div>
            <div class="highlight-label">${h.label}</div>
        </div>`
            )
            .join("")
    }

    // ─── Render features ───
    $("#featureGrid").innerHTML = D.features
        .map(
            (f) => `
        <div class="feature-card reveal">
            ${f.tag ? `<span class="feat-tag">${f.tag}</span>` : ""}
            <div class="feature-ico">${f.icon}</div>
            <h3>${f.title}</h3>
            <p>${f.desc}</p>
        </div>`
        )
        .join("")

    // ─── Render FAQ ───
    if (D.faq && $("#faqList")) {
        $("#faqList").innerHTML = D.faq
            .map(
                (f) => `
        <div class="faq-item">
            <div class="faq-q">${f.q}<span class="faq-ico">+</span></div>
            <div class="faq-a"><div class="faq-a-inner">${f.a}</div></div>
        </div>`
            )
            .join("")
        $$(".faq-item").forEach((item) => {
            const q = item.querySelector(".faq-q")
            const a = item.querySelector(".faq-a")
            q.addEventListener("click", () => {
                const isOpen = item.classList.contains("open")
                $$(".faq-item").forEach((o) => {
                    o.classList.remove("open")
                    o.querySelector(".faq-a").style.maxHeight = null
                })
                if (!isOpen) {
                    item.classList.add("open")
                    a.style.maxHeight = a.scrollHeight + "px"
                }
            })
        })
    }

    // spotlight hover on feature cards
    $$(".feature-card").forEach((card) => {
        card.addEventListener("mousemove", (e) => {
            const r = card.getBoundingClientRect()
            card.style.setProperty("--mx", `${e.clientX - r.left}px`)
            card.style.setProperty("--my", `${e.clientY - r.top}px`)
        })
    })

    // ─── Render steps ───
    $("#steps").innerHTML = D.steps
        .map(
            (s, i) => `
        <div class="step reveal">
            <div class="step-num">0${i + 1}</div>
            <h4>${s.t}</h4>
            <p>${s.d}</p>
        </div>`
        )
        .join("")

    // ─── Render pricing ───
    function renderPricing() {
        const feats = {
            private: [
                "Bot pribadi untuk 1 grup",
                "Maksimal 3 anggota grup",
                "Semua 240+ command aktif",
                "Prioritas support",
                "Uptime tinggi 24/7"
            ],
            public: [
                "Bot untuk grup publik",
                "Anggota grup tanpa batas",
                "Semua 240+ command aktif",
                "Anti-spam & antilink",
                "Uptime tinggi 24/7"
            ]
        }
        $("#priceGrid").innerHTML = Object.values(PLANS)
            .map((p) => {
                const featured = p.id === "public"
                return `
            <div class="price-card ${featured ? "featured" : ""} reveal">
                ${featured ? '<span class="price-tag">POPULER</span>' : ""}
                <div class="price-name">${p.name}</div>
                <div class="price-amount">${rp(p.price)}<small> /bulan</small></div>
                <div class="price-desc">${
                    p.id === "private"
                        ? "Cocok untuk grup kecil & privat."
                        : "Cocok untuk komunitas & grup ramai."
                }</div>
                <ul class="price-feats">
                    ${feats[p.id].map((f) => `<li><span class="check">✓</span> ${f}</li>`).join("")}
                </ul>
                <button class="btn btn-primary" data-order="${p.id}">Sewa ${p.name}</button>
            </div>`
            })
            .join("")
        // re-observe new reveals + wire order buttons
        $$("#priceGrid .reveal").forEach((el) => io.observe(el))
        $$("[data-order]").forEach((b) =>
            b.addEventListener("click", () => openOrder(b.dataset.order))
        )
    }
    renderPricing()

    // ─── Animated chat mockup ───
    const chatBody = $("#chatBody")
    let ci = 0
    function pushBubble() {
        if (ci >= D.chat.length) {
            setTimeout(() => {
                chatBody.innerHTML = ""
                ci = 0
                pushBubble()
            }, 3500)
            return
        }
        const c = D.chat[ci++]
        const b = document.createElement("div")
        b.className = `bubble ${c.side}`
        b.textContent = c.text
        chatBody.appendChild(b)
        chatBody.scrollTop = chatBody.scrollHeight
        setTimeout(pushBubble, c.side === "out" ? 700 : 1400)
    }
    pushBubble()

    // ─── Counters ───
    function animateCounter(el, target) {
        const start = Number(el.dataset.counter) || 0
        if (start === target) return
        el.dataset.counter = target
        const dur = 900
        const t0 = performance.now()
        function tick(t) {
            const p = Math.min((t - t0) / dur, 1)
            const eased = 1 - Math.pow(1 - p, 3)
            el.textContent = Math.round(start + (target - start) * eased).toLocaleString("id-ID")
            if (p < 1) requestAnimationFrame(tick)
            else {
                el.textContent = target.toLocaleString("id-ID")
                if (target > start) {
                    el.classList.add("flash")
                    setTimeout(() => el.classList.remove("flash"), 600)
                }
            }
        }
        requestAnimationFrame(tick)
    }

    // ─── Live data (auto-scroll marquee, no manual scroll) ───
    const iconFor = (name) => (name || "?").trim().charAt(0).toUpperCase() || "?"

    // Bungkus daftar item jadi marquee yang bergulir mulus & loop.
    // - Bila item cukup untuk mengisi > tinggi kolom → duplikat konten &
    //   animasikan translateY(0 → -50%) sehingga loop tak terlihat sambungannya.
    // - Bila item sedikit → tampilkan statis (biar ga "loncat" aneh).
    // - Kecepatan konsisten: durasi ∝ jumlah item.
    const MIN_LOOP = 6 // minimal item agar mulai berputar
    function paintMarquee(el, html, count) {
        if (!el) return
        // Saat statis/kosong → tinggi ikut konten (hilangkan blank space di HP).
        // Saat loop → pakai tinggi tetap (kelas .looping mengembalikan height).
        if (!count) {
            el.classList.remove("looping")
            el.innerHTML = `<div class="empty">${el.dataset.empty || "Belum ada data."}</div>`
            return
        }
        if (count < MIN_LOOP) {
            el.classList.remove("looping")
            el.innerHTML = `<ul class="live-list">${html}</ul>`
            return
        }
        // durasi: makin banyak item makin lama (kecepatan tetap ~enak dibaca)
        el.classList.add("looping")
        const dur = Math.max(14, count * 2.6)
        el.innerHTML = `<div class="marquee-track" style="animation-duration:${dur}s">${html}${html}</div>`
    }

    // User: format "62857XXXX - (Nama)"
    function userItemHtml(u) {
        const disp = u.display || `${u.number || "•••"} - (${u.name || "User"})`
        const nm = (u.name || (u.display && u.display.split("(")[1]) || "U").replace(")", "")
        return `
        <div class="live-item">
            <div class="av">${iconFor(nm)}</div>
            <div class="meta">
                <div class="t1 mono-num">${escapeHtml(disp)}</div>
            </div>
        </div>`
    }
    function renderUsers(items, total) {
        $("#liveUsersCount").textContent = total
        const el = $("#liveUsers")
        el.dataset.empty = "Belum ada user terdaftar."
        const list = items.slice().reverse()
        paintMarquee(el, list.map(userItemHtml).join(""), list.length)
    }

    // Grup: nama grup saja
    function groupItemHtml(g) {
        return `
        <div class="live-item">
            <div class="av">${iconFor(g.name)}</div>
            <div class="meta"><div class="t1">${escapeHtml(g.name || "Grup")}</div></div>
            <span class="tag ${g.type === "public" ? "public" : "private"}">${g.type || "private"}</span>
        </div>`
    }
    function renderGroups(items, total) {
        $("#liveGroupsCount").textContent = total
        const el = $("#liveGroups")
        el.dataset.empty = "Belum ada grup ter-register."
        const list = items.slice().reverse()
        paintMarquee(el, list.map(groupItemHtml).join(""), list.length)
    }

    // Fishing feed
    const fishFeed = []
    function fishItemHtml(f) {
        const r = (f.rarity || "common").toLowerCase()
        const val = f.value ? `+Rp ${Number(f.value).toLocaleString("id-ID")}` : ""
        return `
        <div class="fish-item">
            <span class="fi-dot r-${r}"></span>
            <div class="fi-meta">
                <div class="fi-name">${escapeHtml(f.fish)}</div>
                <div class="fi-who">${escapeHtml(f.name)}${f.island ? " · " + escapeHtml(f.island) : ""}</div>
            </div>
            <span class="fi-val">${val}</span>
        </div>`
    }
    function renderFishing() {
        const el = $("#liveFishing")
        if (!el) return
        el.dataset.empty = "Menunggu tangkapan..."
        const list = fishFeed.slice().reverse()
        paintMarquee(el, list.map(fishItemHtml).join(""), list.length)
    }

    function applyStats(s) {
        s = s || {}
        animateCounter($("#statUsers"), s.users || 0)
        animateCounter($("#statGroups"), s.groups || 0)
        animateCounter($("#statLic"), s.activeLicenses || 0)
        const on = $("#statOnline")
        if (on) animateCounter(on, s.onlineBots || 0)
    }

    // Vercel = serverless → tidak ada SSE. Pakai polling ke /api/live
    // (1 request gabungan berisi stats + user + grup + fishing feed).
    // Re-render HANYA saat data berubah, supaya animasi scroll tidak
    // ter-reset di tengah jalan (itu yang bikin terlihat "kepotong").
    let sigUsers = "",
        sigGroups = "",
        sigFish = ""
    let polledOnce = false

    async function poll() {
        try {
            const r = await fetch("/api/public?action=live")
            if (!r.ok) throw new Error("HTTP " + r.status)
            const d = await r.json()
            applyStats(d.stats || {})

            const users = d.users || []
            const uSig = JSON.stringify(users.map((u) => u.display))
            if (uSig !== sigUsers) {
                sigUsers = uSig
                renderUsers(users, d.stats?.users || 0)
            } else {
                $("#liveUsersCount").textContent = d.stats?.users || 0
            }

            const groups = d.groups || []
            const gSig = JSON.stringify(groups.map((g) => g.name + g.type))
            if (gSig !== sigGroups) {
                sigGroups = gSig
                renderGroups(groups, d.stats?.groups || 0)
            } else {
                $("#liveGroupsCount").textContent = d.stats?.groups || 0
            }

            // Fishing: gabung data nyata (bila ada) + feed simulasi yang selalu hidup.
            realFish = d.fishing || []
            syncFishFeed()
            polledOnce = true
        } catch {
            if (!polledOnce) {
                renderUsers([], 0)
                renderGroups([], 0)
                syncFishFeed()
            }
        }
    }

    // ─── Fishing feed simulasi (selalu hidup, loop terus) ───
    const FISH_NAMES = [
        "Aqua Serpent",
        "Coral Whisper",
        "Void Angler",
        "Sunlit Marlin",
        "Ghost Koi",
        "Emberfin",
        "Crystal Ray",
        "Storm Eel",
        "Lunar Jelly",
        "Golden Arowana",
        "Abyssal Lantern",
        "Prism Bass",
        "Frost Piranha",
        "Nebula Squid",
        "Titan Grouper",
        "Whispering Trout",
        "Obsidian Shark",
        "Radiant Puffer",
        "Mistral Carp",
        "Dawn Seahorse"
    ]
    const FISH_ANGLERS = [
        "Rendy",
        "Sasha",
        "Bagas",
        "Nadia",
        "Fikri",
        "Alya",
        "Dimas",
        "Citra",
        "Yoga",
        "Putri",
        "Reza",
        "Maya",
        "Galih",
        "Intan",
        "Bima",
        "Tari"
    ]
    const FISH_ISLANDS = [
        "Fisherman Isle",
        "Coral Reef",
        "Vulcanic Bay",
        "Sacred Lake",
        "Deep Sea",
        "Rocky Shore",
        "Haunted Cove"
    ]
    const FISH_RARITIES = [
        { r: "common", w: 34, v: [500, 3000] },
        { r: "uncommon", w: 24, v: [3000, 8000] },
        { r: "rare", w: 16, v: [8000, 18000] },
        { r: "epic", w: 11, v: [18000, 35000] },
        { r: "legendary", w: 7, v: [35000, 70000] },
        { r: "mythical", w: 4, v: [70000, 130000] },
        { r: "secret", w: 2, v: [130000, 250000] },
        { r: "ephemeral", w: 1.3, v: [250000, 500000] },
        { r: "unreal", w: 0.7, v: [500000, 1200000] }
    ]
    const pick = (a) => a[Math.floor(Math.random() * a.length)]
    const rint = (a, b) => Math.floor(a + Math.random() * (b - a))
    function pickRarity() {
        const tot = FISH_RARITIES.reduce((s, x) => s + x.w, 0)
        let n = Math.random() * tot
        for (const x of FISH_RARITIES) {
            if ((n -= x.w) <= 0) return x
        }
        return FISH_RARITIES[0]
    }
    function makeFish() {
        const rar = pickRarity()
        return {
            name: pick(FISH_ANGLERS),
            fish: pick(FISH_NAMES),
            rarity: rar.r,
            value: rint(rar.v[0], rar.v[1]),
            island: pick(FISH_ISLANDS),
            _sim: true
        }
    }

    // Simulasi dibuat SEKALI dgn cukup item → marquee loop selamanya tanpa
    // re-render (mulus, tidak "kepotong"). Hanya di-render ulang bila data
    // NYATA dari server berubah.
    const simFish = []
    for (let i = 0; i < 14; i++) simFish.push(makeFish())

    let realFish = []
    function syncFishFeed() {
        // Data nyata di atas, disusul simulasi supaya feed selalu penuh & hidup.
        fishFeed.length = 0
        realFish.forEach((x) => fishFeed.push(x))
        simFish.forEach((x) => fishFeed.push(x))
        while (fishFeed.length > 26) fishFeed.shift()
        const s = JSON.stringify(fishFeed.map((f) => f.fish + f.name + f.value))
        if (s !== sigFish) {
            sigFish = s
            renderFishing()
        }
    }

    function initLive() {
        poll()
        setInterval(poll, 30000) // poll data nyata tiap 30 detik (marquee ga perlu sering)
        syncFishFeed()
    }
    initLive()

    // ─── Order modal ───
    const modal = $("#orderModal")
    const modalBody = $("#modalBody")

    function openModal() {
        modal.classList.add("open")
        modal.setAttribute("aria-hidden", "false")
        document.body.style.overflow = "hidden"
    }
    function closeModal() {
        modal.classList.remove("open")
        modal.setAttribute("aria-hidden", "true")
        document.body.style.overflow = ""
    }
    $$("[data-close]").forEach((el) => el.addEventListener("click", closeModal))
    document.addEventListener("keydown", (e) => e.key === "Escape" && closeModal())

    function openOrder(planId) {
        const p = PLANS[planId]
        if (!p) return
        modalBody.innerHTML = `
            <h3>Sewa ${p.name}</h3>
            <p class="modal-sub">Lengkapi data grup untuk melanjutkan.</p>
            <div class="summary">
                <div>
                    <div class="s-name">${p.name}</div>
                    <div style="color:var(--faint);font-size:.82rem">${
                        p.id === "private" ? "Maks 3 anggota" : "Tanpa batas anggota"
                    }</div>
                </div>
                <div class="s-price">${rp(p.price)}<small style="font-size:.7rem;color:var(--faint)">/bln</small></div>
            </div>
            <div class="field">
                <label>Link Grup WhatsApp</label>
                <input id="fGroup" type="url" placeholder="https://chat.whatsapp.com/..." autocomplete="off" />
                <div class="hint">${
                    p.id === "private"
                        ? "Grup akan dicek: maksimal 3 anggota."
                        : "Grup publik, anggota bebas."
                }</div>
                <div class="err" id="errGroup">Link grup tidak valid.</div>
            </div>
            <div class="field">
                <label>Nomor WhatsApp kamu (untuk konfirmasi)</label>
                <input id="fContact" type="text" placeholder="628xxxxxxxxxx" autocomplete="off" />
            </div>
            <div class="field">
                <label>Durasi Sewa</label>
                <div class="dur-grid" id="durGrid"></div>
            </div>
            <div class="field">
                <label>Kode Kupon (opsional)</label>
                <div class="coupon-row">
                    <input id="fCoupon" type="text" placeholder="KODE" autocomplete="off" style="text-transform:uppercase" />
                    <button class="btn btn-ghost btn-sm" id="applyCoupon" type="button">Pakai</button>
                </div>
                <div class="hint" id="couponMsg"></div>
            </div>
            <div class="total-row">
                <span>Total</span>
                <span class="total-amt" id="totalAmt">${rp(p.price)}</span>
            </div>
            <button class="btn btn-primary" id="submitOrder" style="width:100%;justify-content:center">
                Lanjut ke Pembayaran
                <svg viewBox="0 0 24 24" class="ico"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </button>`
        openModal()

        // Render duration options + total calculator
        let selMonths = 1
        let couponPercent = 0
        let couponCode = null
        renderDurations()
        function renderDurations() {
            $("#durGrid").innerHTML = DURATIONS.map(
                (
                    d
                ) => `<button type="button" class="dur-opt ${d.months === selMonths ? "active" : ""}" data-mo="${d.months}">
                    ${d.label}${d.discount ? `<span class="dur-off">-${d.discount * 100}%</span>` : ""}
                </button>`
            ).join("")
            $$("#durGrid .dur-opt").forEach((b) =>
                b.addEventListener("click", () => {
                    selMonths = Number(b.dataset.mo)
                    renderDurations()
                    calcTotal()
                })
            )
        }
        function calcTotal() {
            const dur = DURATIONS.find((d) => d.months === selMonths) || DURATIONS[0]
            let t = p.price * dur.months * (1 - dur.discount) * (1 - couponPercent / 100)
            $("#totalAmt").textContent = rp(Math.round(t))
        }
        $("#applyCoupon").addEventListener("click", async () => {
            const code = $("#fCoupon").value.trim().toUpperCase()
            if (!code) return
            const r = await fetch("/api/public?action=coupon", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code })
            }).then((x) => x.json())
            const msg = $("#couponMsg")
            if (r.ok) {
                couponPercent = r.coupon.percent
                couponCode = r.coupon.code
                msg.textContent = `✅ Kupon -${couponPercent}% diterapkan!`
                msg.style.color = "var(--green)"
            } else {
                couponPercent = 0
                couponCode = null
                msg.textContent = "⚠️ " + (r.error || "Kupon tidak valid.")
                msg.style.color = "#f87171"
            }
            calcTotal()
        })

        $("#submitOrder").addEventListener("click", () =>
            submitOrder(planId, selMonths, couponCode)
        )
    }

    async function submitOrder(planId, months = 1, coupon = null) {
        const groupLink = $("#fGroup").value.trim()
        const contact = $("#fContact").value.trim()
        const err = $("#errGroup")
        if (!/chat\.whatsapp\.com\//i.test(groupLink)) {
            err.style.display = "block"
            return
        }
        err.style.display = "none"
        const btn = $("#submitOrder")
        btn.disabled = true
        btn.textContent = "Memproses..."

        let data
        try {
            data = await fetch("/api/public?action=order", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ plan: planId, groupLink, contact, months, coupon })
            }).then((r) => r.json())
        } catch {
            data = { ok: false, error: "Server tidak dapat dihubungi." }
        }

        if (!data.ok) {
            btn.disabled = false
            btn.textContent = "Lanjut ke Pembayaran"
            toast("⚠️ " + (data.error || "Gagal membuat pesanan."))
            return
        }
        await showPayment(data.order)
    }

    async function showPayment(order) {
        toast("✅ Pesanan " + order.id + " dibuat!")
        // Coba buat pembayaran lewat gateway (Midtrans/Xendit) bila aktif.
        let pay = { mode: "placeholder", amount: order.price }
        try {
            pay = await fetch("/api/payment?action=create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId: order.id })
            }).then((r) => r.json())
        } catch {}

        // Xendit → redirect ke invoice
        if (pay.mode === "xendit" && pay.invoice_url) {
            modalBody.innerHTML = payShell(
                order,
                pay.amount,
                `
                <a class="btn btn-primary" style="width:100%;justify-content:center"
                   href="${pay.invoice_url}" target="_blank" rel="noopener">💳 Bayar Sekarang</a>`
            )
            return
        }

        // Midtrans → buka Snap popup bila script tersedia, else redirect_url
        if (pay.mode === "midtrans" && pay.token) {
            modalBody.innerHTML = payShell(
                order,
                pay.amount,
                `
                <button class="btn btn-primary" id="snapBtn" style="width:100%;justify-content:center">💳 Bayar Sekarang</button>`
            )
            $("#snapBtn").addEventListener("click", () => {
                if (window.snap) window.snap.pay(pay.token)
                else if (pay.redirect_url) window.open(pay.redirect_url, "_blank")
            })
            return
        }

        // Placeholder → konfirmasi manual via WhatsApp
        modalBody.innerHTML = payShell(
            order,
            pay.amount || order.price,
            `<a class="btn btn-primary" style="width:100%;justify-content:center"
                href="https://wa.me/6285800360340?text=${encodeURIComponent(
                    `Halo, saya mau bayar sewa bot.\nOrder: ${order.id}\nPaket: ${order.planName}\nGrup: ${order.groupLink}`
                )}" target="_blank" rel="noopener">💬 Konfirmasi via WhatsApp</a>`,
            pay.note || "Selesaikan pembayaran lalu konfirmasi ke owner."
        )
    }

    function payShell(order, amount, actionHtml, note) {
        return `
            <h3>Pembayaran</h3>
            <p class="modal-sub">Pesanan berhasil dibuat. Selesaikan pembayaran.</p>
            <div class="pay-box">
                <div style="color:var(--muted);font-size:.9rem">Total tagihan</div>
                <div class="big">${rp(amount)}</div>
                <div class="order-id">${order.id}</div>
                <p style="color:var(--muted);font-size:.86rem;margin-bottom:18px">
                    ${note || "Klik tombol di bawah untuk melanjutkan pembayaran."}
                </p>
                ${actionHtml}
            </div>`
    }

    // ─── Toast ───
    let toastTimer
    function toast(msg) {
        const t = $("#toast")
        t.textContent = msg
        t.classList.add("show")
        clearTimeout(toastTimer)
        toastTimer = setTimeout(() => t.classList.remove("show"), 3200)
    }

    function escapeHtml(s) {
        return String(s || "").replace(
            /[&<>"']/g,
            (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
        )
    }

    // load plans from API (override defaults if available)
    fetch("/api/public?action=plans")
        .then((r) => r.json())
        .then((list) => {
            if (Array.isArray(list) && list.length) {
                PLANS = {}
                list.forEach((p) => (PLANS[p.id] = p))
                renderPricing()
            }
        })
        .catch(() => {})
})()
