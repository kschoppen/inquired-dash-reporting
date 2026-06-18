// inquirED Reporting Dashboard — data-driven shell. Each skill drops a JSON in /data + a tab.
const TABS = [
  { id: "monthly", label: "Monthly Funnel & Revenue", data: "data/monthly-digest.json", render: renderMonthly },
  { id: "weekly", label: "Weekly Funnel", data: "data/weekly-digest.json", render: renderWeekly },
  { id: "campaign", label: "Campaign Health", data: "data/campaign-analytics.json", render: renderCampaign },
  { id: "defs", label: "Definitions", data: "data/definitions.json", render: renderDefinitions },
];
// inquirED brand palette: green anchor, dark-purple data-viz accent (HIH), medium-purple secondary, pink accent
const IJ = "#144745", IJ_FADE = "rgba(20,71,69,0.30)", ROSE = "#F99792", PLUM = "#5B5A9E", AMBER = "#1C2660", GREY = "rgba(120,130,128,0.5)";
const PRODUCTS = [["all","All products"],["ij","Inquiry Journeys"],["inkwell","Inkwell (ELA)"],["wh","World History"],["gf8","Great First 8"]];
let DATA = null, PRODUCT = "all";
const charts = [];

const fmtN = (n) => n == null ? "—" : Number(n).toLocaleString("en-US");
const fmt$ = (n) => n == null ? "—" : "$" + Math.round(n).toLocaleString("en-US");
const rate = (a, b) => (b && a != null) ? +(a / b * 100).toFixed(1) : null;
function deltaHTML(cur, prev, o = {}) {
  if (cur == null || prev == null || prev === 0) return '<span class="delta flat">—</span>';
  const p = ((cur - prev) / Math.abs(prev)) * 100, cls = Math.abs(p) < 0.5 ? "flat" : (p > 0 ? "up" : "down");
  return `<span class="delta ${cls}">${p > 0 ? "▲" : p < 0 ? "▼" : "→"} ${Math.abs(p).toFixed(0)}%${o.label ? ` <span class="sub">${o.label}</span>` : ""}</span>`;
}
const card = (l, v, d = "", cap = "") => `<div class="card"><div class="label">${l}</div><div class="value">${v}</div><div>${d}</div>${cap ? `<div class="cap">${cap}</div>` : ""}</div>`;
const note = (t) => `<p class="insight">💬 ${t}</p>`;
function mkChart(id, cfg) { const el = document.getElementById(id); if (el) charts.push(new Chart(el, cfg)); }
// ---- contact drill-down drawer (weekly) — IDs only, no PII; links to gated HubSpot records ----
function closeDrawer() { const s = document.getElementById("drawerScrim"), dr = document.getElementById("drawer"); if (s) s.classList.remove("on"); if (dr) dr.classList.remove("on"); }
function openDrawer(title, rows) {
  let sc = document.getElementById("drawerScrim");
  if (!sc) {
    sc = document.createElement("div"); sc.id = "drawerScrim"; sc.className = "scrim"; sc.onclick = closeDrawer;
    const dr = document.createElement("div"); dr.id = "drawer"; dr.className = "drawer";
    document.body.appendChild(sc); document.body.appendChild(dr);
  }
  const dr = document.getElementById("drawer");
  const body = rows.length
    ? rows.map((r) => `<a class="drow" href="https://app.hubspot.com/contacts/4451852/record/0-1/${r[0]}" target="_blank" rel="noopener">Open contact ↗<span class="dmeta">${[r[1], r[2]].filter(Boolean).join(" · ") || "—"}</span></a>`).join("")
    : '<p class="flag" style="padding:14px 18px">No records for this week.</p>';
  dr.innerHTML = `<div class="drawer-head"><strong>${title}</strong><button class="drawer-x" id="drawerX">✕</button></div>
    <div class="drawer-sub">Each row opens the record in HubSpot (access-gated). No names are stored here — segment · source shown for context.</div>
    <div class="drawer-body">${body}</div>`;
  document.getElementById("drawerX").onclick = closeDrawer;
  document.getElementById("drawerScrim").classList.add("on"); dr.classList.add("on");
}
// stage series honoring the product toggle
function ser(m, stage) { return m.map((x) => PRODUCT === "all" ? (x.funnel ? x.funnel[stage] : null) : (x.by_product && x.by_product[PRODUCT] ? x.by_product[PRODUCT][stage] : null)); }
function revSer(m) { return PRODUCT === "all" ? null : m.map((x) => x.rev_by_product ? x.rev_by_product[PRODUCT] : null); }

// ---- helpers for new monthly layout ----
const spkOpts = { plugins: { legend: { display: false } }, maintainAspectRatio: false, scales: { x: { display: false }, y: { display: false, beginAtZero: true } }, elements: { point: { radius: 0 } }, animation: false };

function funnelStage(name, count, prevCount, subLabel, cssClass, yoyCount) {
  const momD = (count != null && prevCount != null && prevCount > 0) ? Math.round((count - prevCount) / prevCount * 100) : null;
  const yoyD = (count != null && yoyCount != null && yoyCount > 0) ? Math.round((count - yoyCount) / yoyCount * 100) : null;
  const pill = (v, lbl) => v == null ? "" : `<span class="delta ${v > 0 ? "up" : v < 0 ? "down" : "flat"}">${v > 0 ? "↑" : v < 0 ? "↓" : ""}${Math.abs(v)}% ${lbl}</span>`;
  return `<div class="funnel-stage">
    <div class="funnel-box ${cssClass}">
      <div class="f-stage-name">${name}</div>
      <div class="f-count">${count != null ? fmtN(count) : "—"}</div>
      ${momD != null || yoyD != null ? `<div class="f-deltas">${pill(momD, "MoM")}${pill(yoyD, "YoY")}</div>` : ""}
    </div>
    ${subLabel ? `<div class="f-sub-label">${subLabel}</div>` : ""}
  </div>`;
}

function funnelConnector(pill) {
  return `<div class="funnel-connector"><div class="conv-rate-pill">${pill}</div><div class="chevron">›</div></div>`;
}

function topPageRows(pages, valKey, valClass, valFmt) {
  if (!pages || !pages.length) return `<p class="pending-note">⚠ Data pending — skill update needed.</p>`;
  return pages.map((p) => `<div class="top-page-row">
    <span class="top-page-path">${p.path}</span>
    <span class="${valClass}">${valFmt(p[valKey])}</span>
    ${p.type ? `<span class="top-page-type">${p.type}</span>` : ""}
  </div>`).join("");
}

function hihProdBreakdown(last) {
  const total = last.funnel ? last.funnel.hih : 0;
  const prods = [
    { key: "ij",      label: "Inquiry Journeys", color: "#144745" },
    { key: "inkwell", label: "Inkwell (ELA)",     color: "#F99792" },
    { key: "wh",      label: "World History",     color: "#5B5A9E" },
    { key: "gf8",     label: "Great First 8",     color: "#B1E0BB" },
  ];
  return prods.map((p) => {
    const n = (last.by_product && last.by_product[p.key]) ? last.by_product[p.key].hih : 0;
    const pct = (n && total) ? Math.round(n / total * 100) : null;
    return `<div class="pb-row"><span class="pb-label"><span class="dot" style="background:${p.color}"></span>${p.label}</span><span><span class="pb-count">${n}</span> <span class="pb-pct">${pct != null ? pct + "%" : "—"}</span></span></div>`;
  }).join("");
}

function dualDelta(cur, prev, yoyPrev) {
  const momP = (cur != null && prev != null && prev !== 0) ? ((cur - prev) / Math.abs(prev) * 100) : null;
  const yoyP = (cur != null && yoyPrev != null && yoyPrev !== 0) ? ((cur - yoyPrev) / Math.abs(yoyPrev) * 100) : null;
  const momCls = momP == null ? "flat" : (momP > 0 ? "up" : "down");
  const yoyCls = yoyP == null ? "flat" : (yoyP > 0 ? "up" : "down");
  const momTxt = momP == null ? `— <span class="sub">MoM</span>` : `${momP > 0 ? "▲" : "▼"} ${Math.abs(momP).toFixed(0)}% <span class="sub">MoM</span>`;
  const yoyTxt = yoyP == null ? `— <span class="sub">YoY</span>` : `${yoyP > 0 ? "▲" : "▼"} ${Math.abs(yoyP).toFixed(0)}% <span class="sub">YoY</span>`;
  return `<div class="dual-delta"><span class="delta ${momCls}">${momTxt}</span><span class="delta-sep">·</span><span class="delta ${yoyCls}">${yoyTxt}</span></div>`;
}

function kpiCard(label, value, momPrev, yoyPrev, sparkId, capText) {
  return `<div class="card inside">
    <div class="label">${label}</div>
    <div class="value">${value}</div>
    ${dualDelta(typeof value === "string" ? parseFloat(value) : value, momPrev, yoyPrev)}
    ${sparkId ? `<div class="spk"><canvas id="${sparkId}"></canvas></div>` : ""}
    ${capText ? `<div class="cap">${capText}</div>` : ""}
  </div>`;
}

function renderMonthly(d) {
  charts.forEach((c) => c.destroy()); charts.length = 0;
  const m = d.months, last = m[m.length - 1], prev = m[m.length - 2] || {};
  const labels = m.map((x) => x.label);
  const hih = ser(m, "hih"), mql = ser(m, "mql"), sql = ser(m, "sql");
  const conv = m.map((x, i) => rate(sql[i], mql[i]));

  const fu = (mo, s) => mo.funnel ? mo.funnel[s] : null;
  const fp = (mo, s) => PRODUCT === "all" ? fu(mo, s) : (mo.by_product && mo.by_product[PRODUCT] ? mo.by_product[PRODUCT][s] : null);

  const q = last.quality || {}, utm = q.utm_completeness_pct;
  const wv = last.web || {}, wt = d.web_trend || null, yoy = wv.yoy || {};
  const pLabel = PRODUCTS.find((p) => p[0] === PRODUCT)[1];

  const hihVel = fu(last, "hih"), hihVelPrev = fu(prev, "hih");
  const hihPool = last.hih_pool_active || null;
  const hihToMql = rate(fu(last, "mql"), hihVel), heroConv = rate(fu(last, "sql"), fu(last, "mql"));

  const sessions = wv.sessions, sessionsPrev = (prev.web || {}).sessions;
  const lead = fu(last, "lead"), leadPrev = fu(prev, "lead");
  const sqlRate = rate(fp(last, "sql"), fp(last, "mql")), sqlRatePrev = rate(fp(prev, "sql"), fp(prev, "mql"));
  const sqlToOpp = rate(fu(last, "opp"), fu(last, "sql"));

  document.getElementById("view").innerHTML = `
    <div class="contextbar">
      <span class="asof">📅 Data as of <strong>${d.updated}</strong> · trailing 12 months (${m[0].label} – ${last.label})</span>
      <span class="timing">Close year Oct 1–Sep 30 · district buying peaks Apr–Aug · ⚡ Oct 2025 spike = list upload</span>
    </div>

    <!-- HIH HERO -->
    <div class="hih-hero">
      <div class="hih-hero-top">
        <div class="hih-hero-main">
          <div class="hero-label">★ HIGH-INTENT (HIH) POOL — active right now</div>
          <div class="hero-val">${hihPool != null ? fmtN(hihPool) : (hihVel != null ? fmtN(hihVel) : "—")}</div>
          <div class="hero-sub">Contacts active in the <strong>last 90 days</strong> with High marketing-intent — the working list of serious evaluators. This pool refreshes continuously in HubSpot.</div>
          <a class="hih-hs-link" href="https://app.hubspot.com/contacts/4451852/objectLists/10586/filters" target="_blank" rel="noopener">View HIH list in HubSpot ↗</a>
          <div class="hih-def-box"><strong>✦ What is HIH?</strong> A signal layer that spans all funnel stages — a contact becomes HIH when they engage with high-intent content (ROI calculator, curriculum guide, demo request, whitepaper) regardless of lifecycle stage. HIH contacts convert to MQL at <strong>${hihToMql != null ? hihToMql + "%" : "—"}</strong>, making them our highest-value top-of-funnel signal.</div>
        </div>
        <div class="hih-hero-velocity">
          <div class="hero-label">★ HIH VELOCITY — new contacts this month (${last.label})</div>
          <div class="hero-val-sm">${fmtN(hihVel)} &nbsp;${deltaHTML(hihVel, hihVelPrev, {label:"MoM"})}</div>
          <div class="hero-sub">New contacts reaching High-intent · HIH→MQL <strong>${hihToMql != null ? hihToMql + "%" : "—"}</strong> · MQL→SQL <strong>${heroConv != null ? heroConv + "%" : "—"}</strong><br><span style="color:var(--muted);font-size:12px">YoY available when prior-year month is in history</span></div>
          <div class="sparkbox"><canvas id="cHihVelocity"></canvas></div>
          <div class="hih-prod-breakdown">${hihProdBreakdown(last)}<p style="font-size:10px;color:var(--muted);margin:6px 0 0">product-tagged contacts only · partial coverage</p></div>
        </div>
      </div>
      <div class="hih-hero-chart">
        <h4>HIH velocity — trailing 12 months</h4>
        <div class="hih-trend-box"><canvas id="cHihTrend"></canvas></div>
      </div>
    </div>

    <!-- FUNNEL ARROW -->
    <div class="section-label">★ Funnel — ${last.label} · all-product · monthly new contacts</div>
    <div class="funnel-panel">
      <h3>Prospect → Opp · full funnel with conversion rates</h3>
      <p class="f-sub">Monthly new contacts entering each stage. MoM delta shown; YoY populates once prior-year data is in history. HIH is a <em>signal layer</em>, not a sequential step — shown in the hero above.</p>
      <div class="funnel-flow">
        ${funnelStage("Prospect", sessions, sessionsPrev, "web sessions", "f-prospect", yoy.sessions)}
        ${funnelConnector("form / download")}
        ${funnelStage("Lead", lead, leadPrev, "new this month", "f-prospect", null)}
        ${funnelConnector("MQL criteria")}
        ${funnelStage("MQL", fu(last,"mql"), fu(prev,"mql"), "mktg qualified", "f-mql", null)}
        ${funnelConnector(heroConv != null ? heroConv + "% MQL→SQL" : "MQL→SQL")}
        ${funnelStage("SQL", fu(last,"sql"), fu(prev,"sql"), "sales qualified", "f-sql", null)}
        ${funnelConnector(sqlToOpp != null ? sqlToOpp + "% SQL→Opp" : "SQL→Opp")}
        ${funnelStage("Opp", fu(last,"opp"), fu(prev,"opp"), "open opportunity", "f-opp", null)}
      </div>
      ${lead == null ? `<p class="pending-note">⚠ Lead count (HubSpot <code>recent_conversion_date</code> in month window) — skill update needed. Run the monthly digest skill to populate this field.</p>` : ""}
    </div>

    <!-- PRODUCT SECTION -->
    <div class="product-section">
      <div class="product-section-head">
        <div>
          <div class="product-section-title">▲ Leading Indicators · ${last.label}</div>
          <div class="product-section-note">Product chips below scope <em>this entire section only</em> — all-product totals live in the funnel above.</div>
        </div>
        <div class="toolbar">
          <span class="tlabel">Product:</span>
          ${PRODUCTS.map((p) => `<button class="chip ${p[0] === PRODUCT ? "on" : ""}" data-p="${p[0]}">${p[1]}</button>`).join("")}
        </div>
      </div>
      ${PRODUCT !== "all" ? `<div class="product-filter-bar">Filtered to: <strong>${pLabel}</strong> <span class="pfbar-note">product-tagged contacts only · partial coverage · won't sum to totals · click <em>All products</em> to reset</span></div>` : ""}

      <div class="cards">
        ${kpiCard("HIH new this month", fmtN(fp(last,"hih")), fp(prev,"hih"), null, "spkHih", `vs ${fmtN(fp(prev,"hih"))} ${prev.label || ""} · YoY available when prior-year month in history`)}
        ${kpiCard("MQLs", fmtN(fp(last,"mql")), fp(prev,"mql"), null, "spkMql", `vs ${fmtN(fp(prev,"mql"))} ${prev.label || ""} · seasonal May dip expected`)}
        ${kpiCard("SQLs", fmtN(fp(last,"sql")), fp(prev,"sql"), null, "spkSql", `vs ${fmtN(fp(prev,"sql"))} ${prev.label || ""}`)}
        ${kpiCard("MQL → SQL conv.", sqlRate != null ? sqlRate + "%" : "—", sqlRatePrev, null, "spkConv", `vs ${sqlRatePrev != null ? sqlRatePrev + "%" : "—"} ${prev.label || ""} · B2B benchmark 13–22%`)}
        <div class="card inside">
          <div class="label">UTM attribution</div>
          <div class="value">${utm != null ? utm + "%" : "—"}</div>
          <div class="dual-delta">${utm != null && utm < 30 ? '<span class="delta down">below 30% target</span>' : '<span class="delta flat">—</span>'}</div>
          <div class="cap">% MQLs with source UTM · offline + direct dominate</div>
        </div>
      </div>

      <div class="panel" style="margin-bottom:14px">
        <h3>MQL → SQL conversion — 12-month trend</h3>
        <div class="chartbox"><canvas id="cConvTrend"></canvas></div>
        ${note(funnelNarrative(d, last, sqlRate))}
      </div>

      <div class="grid2" style="margin-bottom:0">
        <div class="panel" style="margin-bottom:0">
          <h3>HIH by source <span class="muted">(${last.label})</span></h3>
          <div class="chartbox xs"><canvas id="cSrc"></canvas></div>
        </div>
        <div class="panel" style="margin-bottom:0">
          <h3>HIH by product <span class="muted">(${last.label})</span></h3>
          ${hihByProductTable(last)}
        </div>
      </div>
    </div>

    <!-- WEB ACQUISITION -->
    ${wv.channels ? `
    <div class="section-label">🌐 Web acquisition · ${last.label} <span class="muted">(GA4 · top of funnel)</span></div>
    <div class="cards">
      <div class="card"><div class="label">Sessions</div><div class="value">${fmtN(wv.sessions)}</div>${dualDelta(wv.sessions, sessionsPrev, yoy.sessions)}<div class="cap">${yoy.sessions ? `vs ${fmtN(yoy.sessions)} same mo. prior year` : "YoY populates with 2 years of data"}</div></div>
      <div class="card"><div class="label">Users</div><div class="value">${fmtN(wv.users)}</div>${dualDelta(wv.users, (prev.web||{}).users, yoy.users)}<div class="cap">${yoy.users ? `vs ${fmtN(yoy.users)} prior year` : ""}</div></div>
      <div class="card"><div class="label">Page views</div><div class="value">${fmtN(wv.views)}</div>${dualDelta(wv.views, (prev.web||{}).views, yoy.views)}<div class="cap">${yoy.views ? `vs ${fmtN(yoy.views)} prior year` : ""}</div></div>
      ${wv.engaged_pct != null ? `<div class="card"><div class="label">Engagement rate</div><div class="value">${wv.engaged_pct}%</div><div class="dual-delta"><span class="delta flat">—</span></div><div class="cap">GA4 engaged sessions / sessions</div></div>` : ""}
    </div>
    <div class="grid2">
      <div class="panel"><h3>Channel mix <span class="muted">(sessions)</span></h3><div class="chartbox xs"><canvas id="mWebChannel"></canvas></div>${note("GA4's <strong>default channel grouping</strong> — independent of HubSpot lead-source UTMs. AI referrals (ChatGPT/Perplexity) land under Referral until we add a custom GA4 grouping.")}</div>
      <div class="panel"><h3>Web conversions <span class="muted">(GA4 key events · ${last.label})</span></h3><div class="chartbox xs"><canvas id="mWebConv"></canvas></div>${note("Macro web conversions sit <strong>upstream of HIH</strong>: a visitor downloads a resource or signs up here, then — if high-intent — becomes an HIH lead.")}</div>
    </div>
    <div class="panel">
      <h3>Top conversion pages <span class="source-badge ga4">GA4 API</span></h3>
      <p style="font-size:12px;color:var(--muted);margin:0 0 12px">Pages where visitors completed a key event (form submit, download, demo request) in ${last.label} — ranked by completions</p>
      ${last.web && last.web.top_conversion_pages
        ? topPageRows(last.web.top_conversion_pages, "completions", "top-page-conv", (v) => `${fmtN(v)} completions`)
        : `<p class="pending-note">⚠ Top conversion pages — GA4 query not yet in skill. Run updated monthly digest skill to populate.</p>`}
    </div>` : ""}

    <!-- SEO -->
    <div class="section-label">🔍 Organic search · ${last.label} <span class="muted">(Semrush rankings · SemRush traffic)</span></div>
    <div class="grid2">
      <div class="panel">
        <h3>Keyword rankings by topic <span class="source-badge semrush">Semrush</span></h3>
        ${seoSection(d)}
        <p class="insight">🛈 <strong>How these keywords are chosen:</strong> this is the full set of keywords configured in our Semrush Position Tracking project, not a hand-picked list. The dashboard pulls every tracked keyword and auto-groups it into a topic area by matching the keyword text (e.g. "ela"/"reading" → ELA, "social studies" → Social Studies, "pre-k"/"preschool" → ECE, product/brand names → Brand). <strong>Position</strong> = current Google rank · <strong>"—"</strong> = tracked but not ranking · <strong>Volume</strong> = est. monthly US searches. To add or remove keywords, edit the Semrush Position Tracking project. MoM movement begins once we have a prior month to compare.</p>
        ${note(seoNarrative(d))}
      </div>
      <div class="panel">
        <h3>Top organic entry pages <span class="source-badge semrush">SemRush API</span></h3>
        <p style="font-size:12px;color:var(--muted);margin:0 0 12px">Pages receiving the most organic search traffic in ${last.label} — ranked by estimated visits from Google</p>
        ${last.seo_top_pages
          ? topPageRows(last.seo_top_pages, "visits", "top-page-traffic", (v) => `~${fmtN(v)} visits`)
          : `<p class="pending-note">⚠ SemRush top organic pages — pending skill update + egress allowlist for <code>api.semrush.com</code>.</p>`}
      </div>
    </div>

    <!-- AI VISIBILITY + KEYWORD GAP -->
    <div class="section-label">🤖 AI &amp; competitive search visibility · ${last.label} <span class="muted">(Semrush)</span></div>
    <div class="grid2">
      <div class="panel">
        <h3>AI visibility score <span class="source-badge semrush">Semrush</span></h3>
        ${aiVisSection(last)}
      </div>
      <div class="panel">
        <h3>Keyword gap — ELA &amp; SS only <span class="source-badge semrush">Semrush</span></h3>
        ${kwGapSection(last)}
      </div>
    </div>

    <div class="panel" style="font-size:13px;color:#3a3a3a">

    <!-- LAGGING -->
    <div class="section-label">▽ Lagging · ${last.label} — sales outcome <span class="muted">(context; $ pipeline + win rate → RevOps)</span></div>
    <div class="cards">
      <div class="card"><div class="label">Closed-won ($)</div><div class="value">${fmt$(last.revenue.total_won)}</div>${dualDelta(last.revenue.total_won, prev.revenue && prev.revenue.total_won, null)}<div class="cap">${last.label} · total dollars won (non-test / non-RFP)</div></div>
      <div class="card"><div class="label">New business ($)</div><div class="value">${fmt$(last.revenue.nb_won)}</div><div class="dual-delta"><span class="delta flat">—</span></div><div class="cap">new + pilot + pilot-expansion deals</div></div>
      <div class="card"><div class="label">Deals won (count)</div><div class="value">${fmtN(last.revenue.wins)}</div>${dualDelta(last.revenue.wins, prev.revenue && prev.revenue.wins, null)}<div class="cap">${last.label} · incl. $0 pilots</div></div>
      ${last.revenue.win_rate_count_pct != null ? `<div class="card"><div class="label">Win rate (count)</div><div class="value">${last.revenue.win_rate_count_pct}%</div><div class="dual-delta"><span class="delta flat">—</span></div><div class="cap">monthly close-date basis · RevOps owns pipeline</div></div>` : ""}
    </div>
    <div class="panel"><h3>Closed-won revenue (District + School) <span class="muted">— lagging</span></h3>
      <div class="chartbox"><canvas id="cRev"></canvas></div>
      ${note(laggingNarrative(last))}
      ${last.deals ? dealDrill(last) : ""}
    </div>

    <div class="panel"><h3>Monthly detail — all products (trailing 12 months)</h3>
      <table><thead><tr><th>Month</th><th>HIH</th><th>MQL</th><th>SQL</th><th>MQL→SQL</th><th>Wins</th><th>Closed-won</th></tr></thead><tbody>
      ${m.map((x) => `<tr><td>${x.label}</td><td>${fmtN(fu(x,"hih"))}</td><td>${fmtN(fu(x,"mql"))}</td><td>${fmtN(fu(x,"sql"))}</td><td>${rate(fu(x,"sql"),fu(x,"mql")) != null ? rate(fu(x,"sql"),fu(x,"mql"))+"%" : "—"}</td><td>${fmtN(x.revenue.wins)}</td><td>${fmt$(x.revenue.total_won)}</td></tr>`).join("")}
      </tbody></table>
      <p class="flag">${d.notes || ""}</p>
    </div>`;

  // wire product chips
  document.querySelectorAll(".chip[data-p]").forEach((b) => b.onclick = () => { PRODUCT = b.dataset.p; renderMonthly(DATA); });

  const botLeg = { plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } }, maintainAspectRatio: false };
  const noLeg  = { plugins: { legend: { display: false } }, maintainAspectRatio: false };

  // HIH velocity sparkline (6 months in hero right panel)
  const hih6 = hih.slice(-6), labels6 = labels.slice(-6);
  mkChart("cHihVelocity", { type: "line", data: { labels: labels6, datasets: [{ data: hih6, borderColor: AMBER, backgroundColor: "rgba(28,38,96,0.15)", fill: true, tension: 0.4, pointRadius: [0,0,0,0,0,4], pointBackgroundColor: AMBER }] }, options: { ...noLeg, scales: { x: { display: true, ticks: { font: { size: 10 }, color: "#999" }, grid: { display: false } }, y: { display: false, beginAtZero: true } } } });

  // HIH 12-month trend (full width inside hero)
  mkChart("cHihTrend", { type: "line", data: { labels, datasets: [{ data: hih, borderColor: AMBER, backgroundColor: "rgba(20,71,69,0.10)", fill: true, tension: 0.35, pointRadius: 4, pointBackgroundColor: "#fff", pointBorderColor: AMBER, pointBorderWidth: 2, spanGaps: true }] }, options: { ...noLeg, scales: { x: { ticks: { font: { size: 11 }, color: "#5a7a78" }, grid: { color: "rgba(20,71,69,0.08)" } }, y: { beginAtZero: true, ticks: { font: { size: 11 }, color: "#5a7a78" }, grid: { color: "rgba(20,71,69,0.08)" } } } } });

  // KPI sparklines
  mkChart("spkHih",  { type: "line", data: { labels, datasets: [{ data: ser(m,"hih"),  borderColor: AMBER, borderWidth: 2, fill: false, tension: 0.4, spanGaps: true }] }, options: spkOpts });
  mkChart("spkMql",  { type: "line", data: { labels, datasets: [{ data: ser(m,"mql"),  borderColor: IJ,    borderWidth: 2, fill: false, tension: 0.4, spanGaps: true }] }, options: spkOpts });
  mkChart("spkSql",  { type: "line", data: { labels, datasets: [{ data: ser(m,"sql"),  borderColor: PLUM,  borderWidth: 2, fill: false, tension: 0.4, spanGaps: true }] }, options: spkOpts });
  mkChart("spkConv", { type: "line", data: { labels, datasets: [{ data: conv,          borderColor: "#1a7f5a", borderWidth: 2, fill: false, tension: 0.4, spanGaps: true }] }, options: spkOpts });

  // MQL→SQL 12-month trend with benchmarks
  mkChart("cConvTrend", { type: "line", data: { labels, datasets: [
    { label: "MQL→SQL %", data: conv, borderColor: IJ, backgroundColor: "rgba(20,71,69,0.10)", fill: true, tension: 0.3, pointRadius: 3, spanGaps: true },
    { label: "Top performer (45%)", data: Array(m.length).fill(45), borderColor: "#aaa", borderWidth: 1.5, borderDash: [6, 4], pointRadius: 0 },
    { label: "B2B benchmark (22%)", data: Array(m.length).fill(22), borderColor: "#ccc", borderWidth: 1.5, borderDash: [6, 4], pointRadius: 0 }
  ] }, options: { ...botLeg, scales: { y: { beginAtZero: true, max: 85, ticks: { callback: (v) => v + "%" } } } } });

  // HIH by source
  const hsrc = last.hih_by_source || [];
  mkChart("cSrc", { type: "bar", data: { labels: hsrc.map((s) => s[0]), datasets: [{ data: hsrc.map((s) => s[1]), backgroundColor: AMBER }] }, options: { ...noLeg, indexAxis: "y", scales: { x: { beginAtZero: true } } } });

  // Web channels + conversions
  if (wv.channels) mkChart("mWebChannel", { type: "bar", data: { labels: wv.channels.map((c) => c[0]), datasets: [{ data: wv.channels.map((c) => c[1]), backgroundColor: AMBER }] }, options: { ...noLeg, indexAxis: "y", scales: { x: { beginAtZero: true } } } });
  if (wv.conversions) mkChart("mWebConv", { type: "bar", data: { labels: wv.conversions.map((c) => c[0]), datasets: [{ data: wv.conversions.map((c) => c[1]), backgroundColor: IJ }] }, options: { ...noLeg, indexAxis: "y", scales: { x: { beginAtZero: true } } } });

  // Revenue stacked bar
  mkChart("cRev", { type: "bar", data: { labels, datasets: [
    { label: "District", data: m.map((x) => x.revenue.district_won), backgroundColor: IJ_FADE, stack: "r" },
    { label: "School",   data: m.map((x) => x.revenue.school_won),   backgroundColor: "rgba(91,90,158,0.40)", stack: "r" }
  ] }, options: { ...botLeg, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } } });
}

function hihByProductTable(last) {
  const prods = [
    { key: "ij",      label: "Inquiry Journeys", color: "#144745" },
    { key: "inkwell", label: "Inkwell (ELA)",     color: "#F99792" },
    { key: "wh",      label: "World History",     color: "#5B5A9E" },
    { key: "gf8",     label: "Great First 8",     color: "#B1E0BB" },
  ];
  const bp = last.by_product || {};
  const totHih = last.funnel ? last.funnel.hih : null;
  const totMql = last.funnel ? last.funnel.mql : null;
  const totSql = last.funnel ? last.funnel.sql : null;
  const totConv = rate(totSql, totMql);
  const rows = prods.map((p) => {
    const r = bp[p.key] || {};
    const conv = rate(r.sql, r.mql);
    return `<tr><td><span class="dot" style="background:${p.color}"></span>${p.label}</td><td>${r.hih != null ? fmtN(r.hih) : "—"}</td><td>${r.mql != null ? fmtN(r.mql) : "—"}</td><td>${r.sql != null ? fmtN(r.sql) : "—"}</td><td>${conv != null ? conv + "%" : "—"}</td></tr>`;
  }).join("");
  return `<table>
    <thead><tr><th>Product</th><th>New HIH</th><th>New MQL</th><th>New SQL</th><th>MQL→SQL</th></tr></thead>
    <tbody>${rows}
    <tr><td><strong>All products</strong></td><td>${fmtN(totHih)}</td><td>${fmtN(totMql)}</td><td>${fmtN(totSql)}</td><td>${totConv != null ? totConv + "%" : "—"}</td></tr>
    </tbody></table>
  <p class="cap">New contacts created &amp; tagged this month · product-tagged subset · partial coverage · sums won't match all-product totals</p>`;
}

// ---- narratives ----
function funnelNarrative(d, last, conv) {
  return `MQL→SQL ${conv != null ? conv + "%" : "—"} — well above the B2B benchmark (13–22%; top performers 30–45%). Volume dips in May–Jun are the seasonal buying crunch, not a lead-gen failure — watch off-cycle drops instead.`;
}
function laggingNarrative(last) {
  return `Revenue lags ~2 quarters in K-12 (a deal closing now was sourced last fall). One deal (Puyallup $60K) is most of the month — don't over-read a single month. $ pipeline + official win rate live in RevOps.`;
}
function seoNarrative(d) {
  const t = (n) => (d.seo_topics || []).find((x) => x.topic === n) || {};
  const ela = t("ELA (Inkwell)"), ece = t("ECE / Pre-K (GF8)");
  return `We own Brand (avg pos 1.1) and rank core Social Studies — but ELA is ${ela.top10 || 0}/${ela.tracked || 0} in top-10 and ECE/Pre-K is ${ece.top10 || 0}/${ece.tracked || 0}. The non-brand growth products are nearly invisible — the clearest SEO opportunity. (MoM deltas start next month.)`;
}

// ---- SEO topic → keyword drill ----
function seoSection(d) {
  const topics = d.seo_topics || [];
  if (!topics.length) return '<p class="flag">SEO data unavailable.</p>';
  return `<table><thead><tr><th>Topic area</th><th>Tracked</th><th>Ranked</th><th>In top 10</th><th>Avg pos</th><th>MoM</th></tr></thead><tbody>
    ${topics.map((t) => `<tr><td><strong>${t.topic}</strong></td><td>${t.tracked}</td><td>${t.ranked}</td><td>${t.top10}</td><td>${t.avg_position != null ? t.avg_position : "—"}</td><td><span class="delta flat">baseline</span></td></tr>`).join("")}
  </tbody></table>
  ${topics.map((t) => `<details class="kwd"><summary>${t.topic} — ${t.keywords.length} keywords</summary>
    <table><thead><tr><th>Keyword</th><th>Position</th><th>Volume</th><th>MoM</th></tr></thead><tbody>
    ${t.keywords.map((k) => `<tr><td>${k.kw}</td><td>${k.pos != null ? k.pos : "—"}</td><td>${fmtN(k.vol)}</td><td><span class="delta flat">—</span></td></tr>`).join("")}
    </tbody></table></details>`).join("")}`;
}

// ---- AI visibility section ----
function aiVisSection(m) {
  const av = m.ai_visibility;
  if (!av) return '<p class="pending-note">⚠ AI Visibility — read Semrush AI Visibility PDF (Step 3h) to populate.</p>';
  const llms = av.by_llm || [];
  return `<div class="ai-vis-score">
      <span class="ai-vis-num">${av.score}</span><span class="ai-vis-denom">/100</span>
      <span class="ai-vis-badge ${av.label.toLowerCase()}">${av.label}</span>
    </div>
    <div class="ai-vis-stats">
      ${[["Mentions", av.mentions, av.mentions_delta_pct], ["Citations", av.citations, av.citations_delta_pct], ["Cited pages", av.cited_pages, av.cited_pages_delta_pct]].map(([lbl, val, delta]) =>
      `<div class="ai-vis-stat"><span class="ai-vis-stat-label">${lbl}</span><span class="ai-vis-stat-val">${val}</span>${delta != null ? `<span class="delta ${delta >= 0 ? "up" : "down"}">${delta > 0 ? "+" : ""}${delta}%</span>` : ""}</div>`
    ).join("")}
    </div>
    ${llms.length ? `<div class="ai-vis-llm">
      <div class="ai-vis-llm-hdr">By AI engine</div>
      ${llms.map((l) => `<div class="ai-vis-llm-row"><span class="ai-vis-llm-name">${l.llm}</span><div class="ai-vis-bar-wrap"><div class="ai-vis-bar" style="width:${l.pct}%"></div></div><span class="ai-vis-llm-pct">${l.pct}% · ${l.count}</span></div>`).join("")}
    </div>` : ""}`;
}

// ---- keyword gap section ----
function kwGapSection(m) {
  const kg = m.keyword_gap;
  if (!kg) return '<p class="pending-note">⚠ Keyword Gap — read Semrush Keyword Gap PDF (Step 3i). Math keywords auto-filtered; ELA/SS gaps only shown.</p>';
  const gaps = kg.top_gaps || [];
  return `<div class="kw-gap-hero"><span class="kw-gap-n">${kg.relevant_missing}</span> ELA/SS keywords we're missing <span class="muted">(of ${fmtN(kg.total_missing)} total — math excluded)</span></div>
    ${gaps.length ? `<table><thead><tr><th>Keyword</th><th>Est. volume</th></tr></thead><tbody>
      ${gaps.map((g) => `<tr><td>${g.kw}</td><td>${fmtN(g.vol)}</td></tr>`).join("")}
    </tbody></table>` : ""}
    ${kg.filter_note ? note(kg.filter_note) : ""}`;
}

// ---- deal drill-down ----
function dealDrill(last) {
  const ds = last.deals || [];
  return `<details class="kwd"><summary>▸ ${ds.length} closed-won deals (${last.label}) — click to view + open in HubSpot</summary>
    <table><thead><tr><th>Deal</th><th>Segment</th><th>Pipeline</th><th>Type</th><th>Amount</th></tr></thead><tbody>
    ${ds.map((x) => `<tr><td><a href="${x.url}" target="_blank">${x.name} ↗</a></td><td>${x.segment}</td><td>${x.pipeline}</td><td>${x.type}</td><td>${fmt$(x.amount)}</td></tr>`).join("")}
    </tbody></table></details>`;
}

// ---- weekly tab ----
const WK_PRODUCT_ROWS = [["ij", "Inquiry Journeys"], ["inkwell", "Inkwell"], ["wh", "World History"]];
const WK_SEGMENT_ROWS = [["single_small", "Single / Small"], ["medium", "Medium"], ["large", "Large"], ["enterprise", "Enterprise"]];
const WK_STAGES = [["hih", "HIH"], ["mql", "MQL"], ["sql", "SQL"], ["opp", "Opp"]];

// WoW arrow for a breakdown cell. Suppressed when last week's base < 5 (small-sample noise).
function wowArrow(cur, prv) {
  if (cur == null) return "";
  if (prv == null || prv < 5) return "";
  const p = (cur - prv) / Math.abs(prv) * 100;
  if (Math.abs(p) < 5) return '<span class="delta flat">=</span>';
  return p > 0 ? `<span class="delta up">▲${Math.round(p)}%</span>` : `<span class="delta down">▼${Math.round(Math.abs(p))}%</span>`;
}

// Always-on breakdown table: rows = product or segment, cols = funnel stages, cell = this week + WoW arrow.
function wkBreakdownTable(rows, dimKey, last, prev, opts = {}) {
  const get = (o, k, s) => (o[dimKey] && o[dimKey][k]) ? o[dimKey][k][s] : null;
  const body = rows.map(([k, label]) => {
    const cells = WK_STAGES.map(([s]) => `<td>${fmtN(get(last, k, s))} ${wowArrow(get(last, k, s), get(prev, k, s))}</td>`).join("");
    return `<tr><td>${label}</td>${cells}</tr>`;
  }).join("");
  let extra = "";
  if (opts.untagged) {
    const cells = WK_STAGES.map(([s]) => {
      const tot = last.funnel ? last.funnel[s] : null;
      const tagged = rows.reduce((a, [k]) => a + (get(last, k, s) || 0), 0);
      return `<td>${tot == null ? "—" : fmtN(tot - tagged)}</td>`;
    }).join("");
    extra = `<tr class="untagged"><td>Untagged</td>${cells}</tr>`;
  }
  return `<table class="bd"><thead><tr><th></th>${WK_STAGES.map(([, l]) => `<th>${l}</th>`).join("")}</tr></thead><tbody>${body}${extra}</tbody></table>`;
}

function renderWeekly(d) {
  charts.forEach((c) => c.destroy()); charts.length = 0;
  const w = d.weeks || [], last = w[w.length - 1] || {}, prev = w[w.length - 2] || {};
  const labels = w.map((x) => x.label);
  const f = (o, s) => (o && o.funnel) ? o.funnel[s] : null;
  const conv = w.map((x) => rate(f(x, "sql"), f(x, "mql")));
  const pipe = d.pipeline || {}, cov = d.segment_coverage || {};
  const covLine = `tagging coverage — HIH ${cov.hih ?? "—"}% · MQL ${cov.mql ?? "—"}% · SQL ${cov.sql ?? "—"}% · Opp ${cov.opp ?? "—"}%`;
  const drill = last.drill || {};
  const dcard = (stage, l, v, dl) => {
    const n = (drill[stage] || []).length;
    return n ? `<div class="card drill" data-drill="${stage}"><div class="label">${l}</div><div class="value">${v}</div><div>${dl}</div><div class="cap">▸ ${n} contacts — click to view in HubSpot</div></div>` : card(l, v, dl);
  };

  document.getElementById("view").innerHTML = `
    <div class="contextbar">
      <span class="asof">📅 Data as of <strong>${d.updated}</strong> · last ${w.length} complete weeks</span>
      <span class="timing">Weekly funnel velocity (ISO weeks) · current partial week excluded</span>
    </div>
    <div class="section-label">▲ Latest complete week — ${last.label || ""}</div>
    <div class="cards">
      ${dcard("hih", "HIH", fmtN(f(last,"hih")), deltaHTML(f(last,"hih"), f(prev,"hih"), {label:"WoW"}))}
      ${dcard("mql", "MQLs", fmtN(f(last,"mql")), deltaHTML(f(last,"mql"), f(prev,"mql"), {label:"WoW"}))}
      ${dcard("sql", "SQLs", fmtN(f(last,"sql")), deltaHTML(f(last,"sql"), f(prev,"sql"), {label:"WoW"}))}
      ${dcard("opp", "Opp", fmtN(f(last,"opp")), deltaHTML(f(last,"opp"), f(prev,"opp"), {label:"WoW"}))}
      ${card("MQL → SQL", (rate(f(last,"sql"), f(last,"mql")) ?? "—") + "%", "")}
    </div>
    <div class="grid2">
      <div class="panel"><h3>Funnel by week</h3><div class="chartbox"><canvas id="wFunnel"></canvas></div>${note("<strong>HIH</strong> (high-intent, north star) shown as the shaded band; <strong>MQL</strong> and <strong>SQL</strong> as bold lines. New-contact volume is deliberately excluded — list uploads make it too noisy to read WoW.")}</div>
      <div class="panel"><h3>MQL → SQL conversion (%)</h3><div class="chartbox"><canvas id="wConv"></canvas></div></div>
    </div>

    <div class="section-label">Where it's coming from — ${last.label || ""} <span class="muted">(this week · WoW)</span></div>
    <div class="grid2">
      <div class="panel"><h3>By product</h3>
        ${wkBreakdownTable(WK_PRODUCT_ROWS, "by_product", last, prev, {untagged:true})}
        ${note("Each contact counts under its single <strong>primary</strong> product (priority Inkwell → IJ → World History), so rows sum to the tagged total — the rest is <em>Untagged</em>. WoW arrow shown only when last week's base was ≥ 5.")}
      </div>
      <div class="panel"><h3>By account segment</h3>
        ${wkBreakdownTable(WK_SEGMENT_ROWS, "by_segment", last, prev, {})}
        ${note("Account segment (clean, single-select; " + covLine + "). Unassigned contacts are excluded here but still in the headline totals. WoW arrow shown only when last week's base was ≥ 5.")}
      </div>
    </div>

    <div class="grid2">
      <div class="panel"><h3>Open pipeline <span class="muted">(snapshot ${pipe.as_of || d.updated})</span></h3>
        <div class="cards">
          ${card("District — open deals", fmtN(pipe.district_open), "", "District Sales Pipeline")}
          ${card("School — open deals", fmtN(pipe.school_open), "", "School Sales Pipeline")}
        </div>
        ${note("Point-in-time count of open deals, not a weekly trend. " + (pipe.note || ""))}
      </div>
      <div class="panel"><h3>Lead disposition by week <span class="muted">(churn / list cleanup context)</span></h3>
        <div class="chartbox"><canvas id="wDisp"></canvas></div>
        ${note("Disqualified + Entered-Nurture counts. Big DQ spikes (e.g. " + Math.max(...w.map(x=>x.disposition?.dq||0)).toLocaleString() + " in one week) are list imports / database cleanup, <strong>not</strong> a funnel signal — they explain volatility in new-contact counts and are why we read stage transitions instead.")}
      </div>
    </div>

    <div class="panel"><h3>Weekly detail</h3>
      <table><thead><tr><th>Week of</th><th>HIH</th><th>MQL</th><th>SQL</th><th>Opp</th><th>MQL→SQL</th><th>DQ</th><th>Nurture</th></tr></thead><tbody>
      ${w.map((x, i) => `<tr><td>${x.label}</td><td>${fmtN(f(x,"hih"))}</td><td>${fmtN(f(x,"mql"))}</td><td>${fmtN(f(x,"sql"))}</td><td>${fmtN(f(x,"opp"))}</td><td>${conv[i] != null ? conv[i] + "%" : "—"}</td><td>${fmtN(x.disposition&&x.disposition.dq)}</td><td>${fmtN(x.disposition&&x.disposition.nurture)}</td></tr>`).join("")}
      </tbody></table>
      <p class="flag">${d.notes || ""}</p>
    </div>`;

  document.querySelectorAll("[data-drill]").forEach((el) => el.onclick = () => {
    const s = el.dataset.drill, rows = (last.drill && last.drill[s]) || [];
    const labels = { hih: "High-intent (HIH)", mql: "MQLs", sql: "SQLs", opp: "Opportunities" };
    openDrawer(`Week of ${last.label} · ${labels[s] || s} (${rows.length})`, rows);
  });

  const botLeg = { plugins: { legend: { position: "bottom" } }, maintainAspectRatio: false };
  mkChart("wFunnel", { type: "line", data: { labels, datasets: [
      { label: "HIH (high-intent)", data: w.map((x) => f(x,"hih")), borderColor: "#64748B", backgroundColor: "rgba(100,116,139,0.16)", fill: true, borderWidth: 1.5, tension: 0.3, pointRadius: 2 },
      { label: "MQL", data: w.map((x) => f(x,"mql")), borderColor: IJ, borderWidth: 3, tension: 0.25, pointRadius: 2 },
      { label: "SQL", data: w.map((x) => f(x,"sql")), borderColor: PLUM, borderWidth: 3, tension: 0.25, pointRadius: 2 } ] },
    options: { ...botLeg } });
  mkChart("wConv", { type: "line", data: { labels, datasets: [{ label: "MQL→SQL %", data: conv, borderColor: IJ, backgroundColor: IJ_FADE, fill: true, tension: 0.3 }] },
    options: { plugins: { legend: { display: false } }, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { callback: (v) => v + "%" } } } } });
  mkChart("wDisp", { type: "bar", data: { labels, datasets: [
      { label: "Disqualified", data: w.map((x) => x.disposition && x.disposition.dq), backgroundColor: GREY },
      { label: "Entered Nurture", data: w.map((x) => x.disposition && x.disposition.nurture), backgroundColor: ROSE } ] },
    options: { ...botLeg, scales: { y: { beginAtZero: true } } } });
}

// ---- campaign tab ----
const GROUP_COLORS = { "Inquiry Journeys": IJ, "Inkwell": PLUM, "Always-on / brand": "#6B7B79", "Re-engagement / ABM": AMBER, "Great First Eight": ROSE };
const gColor = (g) => GROUP_COLORS[g] || "#6B7B79";

function renderCampaign(d) {
  charts.forEach((c) => c.destroy()); charts.length = 0;
  const months = d.months || [];
  if (!months.length) {
    document.getElementById("view").innerHTML = `
      <div class="contextbar">
        <span class="asof">📅 As of <strong>${d.updated}</strong></span>
        <span class="timing">Campaign quality — full report is a private DM to Kelsey</span>
      </div>
      <div class="panel"><h3>Campaign Health — awaiting first run</h3>
        <p class="insight">This tab populates on the next <strong>campaign-analytics-report</strong> run (monthly). The full per-campaign report still goes as a private DM to Kelsey; this dashboard is the visual companion that retains it. Once it runs, every element from the DM lands here:</p>
        <ul class="planned">
          <li><strong>Headline KPIs</strong> — active campaigns, total contacts, HIH count + share, MQL MoM</li>
          <li><strong>HIH by strategic group</strong> — the bar chart, colored by group (the product cut: Inquiry Journeys / Inkwell / GF8 are product-aligned)</li>
          <li><strong>Group rollup table</strong> — contacts · HIH · HIH% · MQL per group</li>
          <li><strong>Per-campaign quality</strong> — every campaign: total, HIH, HIH%, MQL, MoM, ranked</li>
          <li><strong>Intent distribution</strong> — % High / Med / Low per campaign (lists ≥100 contacts)</li>
          <li><strong>MQL trend</strong> across months · <strong>data flags</strong> (low-volume / asset-audit)</li>
        </ul>
        <p style="font-size:14px;color:#3a3a3a">Strategic groups tracked: ${(d.strategic_groups || []).map((g) => `<strong style="color:${gColor(g)}">${g}</strong>`).join(" · ")}.</p>
      </div>`;
    return;
  }
  const last = months[months.length - 1], labels = months.map((m) => m.label);
  const groups = last.groups || [], camps = (last.campaigns || []).slice().sort((a, b) => (b.hih || 0) - (a.hih || 0));
  const t = last.total || {}, flags = last.flags || [];
  const intentCamps = camps.filter((c) => c.intent && (c.total || 0) >= 100);
  const grpTotal = (k) => groups.reduce((s, g) => s + (g[k] || 0), 0);

  document.getElementById("view").innerHTML = `
    <div class="contextbar"><span class="asof">📅 As of <strong>${d.updated}</strong> · ${last.label}</span><span class="timing">Campaign quality by strategic group · full detail is a private DM to Kelsey</span></div>
    ${last.verdict ? note("<strong>Verdict:</strong> " + last.verdict) : ""}
    <div class="section-label">▲ ${last.label} — headline</div>
    <div class="cards">
      ${card("Active campaigns", fmtN(t.active_campaigns ?? camps.length))}
      ${card("Contacts touched", fmtN(t.contacts ?? grpTotal("contacts")))}
      ${card("HIH leads", fmtN(t.hih ?? grpTotal("hih")), "", "high-intent handraisers")}
      ${card("HIH share", (t.hih_pct ?? rate(t.hih ?? grpTotal("hih"), t.contacts ?? grpTotal("contacts"))) + "%")}
      ${card("MQLs", fmtN(t.mql ?? grpTotal("mql")), deltaHTML(t.mql, t.mql_prior, {label:"MoM"}))}
    </div>
    <div class="grid2">
      <div class="panel"><h3>${last.label} — HIH by strategic group</h3><div class="chartbox"><canvas id="cGroup"></canvas></div>
        ${note("HIH (high-intent) by group is the headline quality read. Inquiry Journeys / Inkwell / Great First Eight are product-aligned, so this doubles as the product cut.")}</div>
      <div class="panel"><h3>MQL trend <span class="muted">(all campaigns)</span></h3><div class="chartbox"><canvas id="cTrend"></canvas></div></div>
    </div>
    <div class="panel"><h3>Group rollup</h3>
      <table><thead><tr><th>Strategic group</th><th>Contacts</th><th>HIH</th><th>HIH %</th><th>MQL</th><th>MoM</th></tr></thead><tbody>
      ${groups.map((g) => `<tr><td><span class="dot" style="background:${gColor(g.group)}"></span>${g.group}</td><td>${fmtN(g.contacts)}</td><td>${fmtN(g.hih)}</td><td>${g.hih_pct ?? rate(g.hih,g.contacts) ?? "—"}%</td><td>${fmtN(g.mql)}</td><td>${deltaHTML(g.mql, g.mql_prior)}</td></tr>`).join("")}
      </tbody></table></div>
    <div class="panel"><h3>Per-campaign quality <span class="muted">(ranked by HIH)</span></h3>
      <table><thead><tr><th>Campaign</th><th>Group</th><th>Contacts</th><th>HIH</th><th>HIH %</th><th>MQL</th><th>MoM</th><th>Flags</th></tr></thead><tbody>
      ${camps.map((c) => `<tr><td>${c.name}</td><td><span class="dot" style="background:${gColor(c.group)}"></span>${c.group || "—"}</td><td>${fmtN(c.total)}</td><td>${fmtN(c.hih)}</td><td>${c.hih_pct ?? rate(c.hih,c.total) ?? "—"}%</td><td>${fmtN(c.mql)}</td><td>${deltaHTML(c.mql, c.mql_prior)}</td><td>${(c.flags||[]).length ? "⚠️ " + c.flags.join("; ") : ""}</td></tr>`).join("")}
      </tbody></table></div>
    ${intentCamps.length ? `<div class="panel"><h3>Intent distribution <span class="muted">(lists ≥100 contacts)</span></h3><div class="chartbox"><canvas id="cIntent"></canvas></div>
      ${note("Share of each campaign's audience at High / Medium / Low marketing-intent tier. A curated list skewing High is a bright spot; a big list skewing Low is an asset-tagging or targeting flag.")}</div>` : ""}
    ${flags.length ? `<div class="panel"><h3>Data flags</h3><ul class="planned">${flags.map((x) => `<li>⚠️ ${x}</li>`).join("")}</ul></div>` : ""}`;

  const noLeg = { plugins: { legend: { display: false } }, maintainAspectRatio: false };
  const botLeg = { plugins: { legend: { position: "bottom" } }, maintainAspectRatio: false };
  mkChart("cGroup", { type: "bar", data: { labels: groups.map((g) => g.group), datasets: [{ data: groups.map((g) => g.hih), backgroundColor: groups.map((g) => gColor(g.group)) }] }, options: { ...noLeg, indexAxis: "y", scales: { x: { beginAtZero: true } } } });
  mkChart("cTrend", { type: "line", data: { labels, datasets: [{ label: "MQL", data: months.map((m) => m.total && m.total.mql), borderColor: IJ, backgroundColor: IJ_FADE, fill: true, tension: 0.25 }] }, options: { ...noLeg } });
  if (intentCamps.length) {
    mkChart("cIntent", { type: "bar", data: { labels: intentCamps.map((c) => c.name), datasets: [
        { label: "High", data: intentCamps.map((c) => c.intent.high), backgroundColor: IJ, stack: "i" },
        { label: "Medium", data: intentCamps.map((c) => c.intent.medium), backgroundColor: PLUM, stack: "i" },
        { label: "Low", data: intentCamps.map((c) => c.intent.low), backgroundColor: GREY, stack: "i" } ] },
      options: { ...botLeg, indexAxis: "y", scales: { x: { stacked: true, beginAtZero: true }, y: { stacked: true } } } });
  }
}

// ---- definitions tab ----
function renderDefinitions(d) {
  charts.forEach((c) => c.destroy()); charts.length = 0;
  document.getElementById("view").innerHTML = `
    <div class="panel glossary">
      ${d.intro ? `<p class="insight">${d.intro}</p>` : ""}
      ${(d.sections || []).map((s) => `<h3>${s.heading}</h3><dl>${s.terms.map((t) => `<dt>${t.term}</dt><dd>${t.def}</dd>`).join("")}</dl>`).join("")}
    </div>`;
}

// ---- shell ----
async function loadTab(tab) {
  charts.forEach((c) => c.destroy()); charts.length = 0; PRODUCT = "all"; closeDrawer();
  document.getElementById("view").innerHTML = '<div class="loading">Loading…</div>';
  try {
    const res = await fetch(tab.data, { cache: "no-store" });
    DATA = await res.json();
    document.getElementById("updated").textContent = DATA.updated ? "Updated " + DATA.updated : "";
    tab.render(DATA);
  } catch (e) { document.getElementById("view").innerHTML = `<div class="loading">Could not load ${tab.data} — ${e}</div>`; }
}
function init() {
  const nav = document.getElementById("tabs");
  TABS.forEach((tab, i) => {
    const b = document.createElement("button"); b.textContent = tab.label;
    if (i === 0) b.classList.add("active");
    b.onclick = () => { document.querySelectorAll(".tabs button").forEach((x) => x.classList.remove("active")); b.classList.add("active"); loadTab(tab); };
    nav.appendChild(b);
  });
  if (TABS.length) loadTab(TABS[0]);
}
init();
