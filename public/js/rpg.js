;(() => {
    const $ = (s) => document.querySelector(s)
    const rp = (n) => "Rp " + Number(n || 0).toLocaleString("id-ID")
    const esc = (s) =>
        String(s || "").replace(
            /[&<>"']/g,
            (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
        )
    const RARE_EMOJI = { secret: "🌸", ephemeral: "🌈", unreal: "🔥" }
    const RARE_LABEL = { secret: "Secret", ephemeral: "Ephemeral", unreal: "Unreal" }

    $("#year").textContent = new Date().getFullYear()

    function timeAgo(ts) {
        if (!ts) return ""
        const s = Math.floor((Date.now() - ts) / 1000)
        if (s < 60) return "baru saja"
        if (s < 3600) return Math.floor(s / 60) + " mnt lalu"
        if (s < 86400) return Math.floor(s / 3600) + " jam lalu"
        return Math.floor(s / 86400) + " hari lalu"
    }

    function lbItem(rank, name, sub, val) {
        return `<li class="lb-item">
            <span class="lb-rank">${rank}</span>
            <div class="lb-meta">
                <div class="lb-name">${esc(name)}</div>
                ${sub ? `<div class="lb-sub">${esc(sub)}</div>` : ""}
            </div>
            <div class="lb-val">${val}</div>
        </li>`
    }
    const emptyLi = (msg) =>
        `<li class="lb-item" style="justify-content:center;color:var(--faint)">${msg}</li>`

    function renderLeaderboards(lb) {
        // Ikan terlangka
        $("#lbRare").innerHTML = lb.rarest?.length
            ? lb.rarest
                  .map((e, i) =>
                      lbItem(
                          i + 1,
                          e.name,
                          `${RARE_LABEL[e.rarity] || e.rarity} · ${e.fish}`,
                          e.value ? rp(e.value) : ""
                      )
                  )
                  .join("")
            : emptyLi("Belum ada data")
        // Terkaya
        $("#lbRich").innerHTML = lb.richest?.length
            ? lb.richest
                  .map((e, i) =>
                      lbItem(
                          i + 1,
                          e.name,
                          `Lv.${e.level || 1}`,
                          "$" + Number(e.wealth || 0).toLocaleString("id-ID")
                      )
                  )
                  .join("")
            : emptyLi("Belum ada data")
        // Terkuat
        $("#lbStrong").innerHTML = lb.strongest?.length
            ? lb.strongest
                  .map((e, i) =>
                      lbItem(
                          i + 1,
                          e.name,
                          `Lv.${e.level || 1}`,
                          "⚔ " + Number(e.power || 0).toLocaleString("id-ID")
                      )
                  )
                  .join("")
            : emptyLi("Belum ada data")
        // Overall
        $("#lbOverall").innerHTML = lb.overall?.length
            ? lb.overall
                  .map((e, i) => lbItem(i + 1, e.name, `Lv.${e.level || 1}`, "★ " + e.score))
                  .join("")
            : emptyLi("Belum ada data")
    }

    function renderLog(log) {
        const el = $("#rareLog")
        if (!log || !log.length) {
            el.innerHTML = `<div class="rpg-empty">Belum ada tangkapan langka. Jadilah yang pertama! 🎣</div>`
            return
        }
        el.innerHTML = log
            .map((e) => {
                const r = (e.rarity || "secret").toLowerCase()
                const who = e.number ? `${e.name} · ${e.number}` : e.name
                return `<div class="rare-item r-${r}">
                <div class="rare-badge">${RARE_EMOJI[r] || "🐟"}</div>
                <div class="rare-body">
                    <div class="rare-fish">${esc(e.fish)}</div>
                    <div class="rare-who">${esc(who)}${e.island ? " · " + esc(e.island) : ""}</div>
                    <span class="rare-tag r-${r}">${RARE_LABEL[r] || r}</span>
                </div>
                <div class="rare-side">
                    <div class="rare-val">${e.value ? "+" + rp(e.value) : ""}</div>
                    <div class="rare-time">${timeAgo(e.at)}</div>
                </div>
            </div>`
            })
            .join("")
    }

    let firstOk = false
    async function load() {
        try {
            const r = await fetch("/api/public?action=rpg")
            if (!r.ok) throw new Error("HTTP " + r.status)
            const d = await r.json()
            $("#rareCount").textContent = (d.rareCount || 0).toLocaleString("id-ID")
            $("#anglerCount").textContent = (d.leaderboards?.overall?.length || 0).toLocaleString(
                "id-ID"
            )
            renderLeaderboards(d.leaderboards || {})
            renderLog(d.log || [])
            firstOk = true
        } catch {
            if (!firstOk) {
                renderLeaderboards({})
                renderLog([])
            }
        }
    }
    load()
    // Refresh ringan tiap 30 detik, hanya saat tab aktif.
    setInterval(() => {
        if (!document.hidden) load()
    }, 30000)
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) load()
    })
})()
