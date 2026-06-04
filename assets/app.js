// inquirED Reporting Dashboard — data-driven shell. Each skill drops a JSON in /data + a tab.
const TABS = [
  { id: "monthly", label: "Monthly Funnel & Revenue", data: "data/monthly-digest.json", render: renderMonthly },
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
const card = (l, v, d = "") => `<div class="card"><div class="label">${l}</div><div class="value">${v}</div><div>${d}</div></div>`;
const note = (t) => `<p class="insight">💬 ${t}</p>`;
function mkChart(id, cfg) { const el = document.getElementById(id); if (el) charts.push(new Chart(el, cfg)); }
// stage series honoring the product toggle
function ser(m, stage) { return m.map((x) => PRODUCT === "all" ? (x.funnel ? x.funnel[stage] : null) : (x.by_product && x.by_product[PRODUCT] ? x.by_product[PRODUCT][stage] : null)); }
function revSer(m) { return PRODUCT === "all" ? null : m.map((x) => x.rev_by_product ? x.rev_by_product[PRODUCT] : null); }

function renderMonthly(d) {
  charts.forEach((c) => c.destroy()); charts.length = 0;
  const m = d.months, last = m[m.length - 1], prev = m[m.length - 2] || {};
  const labels = m.map((x) => x.label);
  const f = (mo, s) => PRODUCT === "all" ? (mo.funnel ? mo.funnel[s] : null) : (mo.by_product && mo.by_product[PRODUCT] ? mo.by_product[PRODUCT][s] : null);
  const hih = ser(m, "hih"), mql = ser(m, "mql"), sql = ser(m, "sql");
  const conv = m.map((x, i) => rate(sql[i], mql[i]));
  const hihToMql = rate(f(last, "mql"), f(last, "hih")), convLast = rate(f(last, "sql"), f(last, "mql")), convPrev = rate(f(prev, "sql"), f(prev, "mql"));
  const q = last.quality || {}, utm = q.utm_completeness_pct, yoy = last.web && last.web.yoy;
  const pLabel = PRODUCTS.find((p) => p[0] === PRODUCT)[1];
  const cov = PRODUCT === "all" ? null : "product-tagged subset — partial coverage, won't sum to totals";

  // HIH hero
  const hihLast = f(last, "hih"), hihPrev = f(prev, "hih");
  const seasons = d.seasonality ? d.seasonality.note : "";

  document.getElementById("view").innerHTML = `
    <div class="toolbar">
      <span class="tlabel">Product:</span>
      ${PRODUCTS.map((p) => `<button class="chip ${p[0] === PRODUCT ? "on" : ""}" data-p="${p[0]}">${p[1]}</button>`).join("")}
      <span class="cov">${cov ? "⚠ " + cov : ""}</span>
    </div>

    <div class="contextbar">
      <span class="asof">📅 Data as of <strong>${d.updated}</strong> · trailing 12 months (${m[0].label} – ${last.label})</span>
      <span class="timing">Close year Oct 1–Sep 30 · district buying peaks Apr–Aug · ⚡ Oct 2025 spike = list upload</span>
    </div>

    <div class="hero">
      <div class="hero-main">
        <div class="hero-label">★ HIGH-INTENT (HIH) LEADS — north star${PRODUCT !== "all" ? " · " + pLabel : ""}</div>
        <div class="hero-val">${fmtN(hihLast)} ${deltaHTML(hihLast, hihPrev, {label:"MoM"})}</div>
        <div class="hero-sub">HIH→MQL ${hihToMql != null ? hihToMql + "%" : "—"} · MQL→SQL ${convLast != null ? convLast + "%" : "—"} — does high intent convert?</div>
        ${note(hihNarrative(d, last))}
      </div>
      <div class="hero-chart"><div class="chartbox sm"><canvas id="cHih"></canvas></div></div>
    </div>

    <div class="section-label">▲ Leading — what marketing works off${PRODUCT !== "all" ? ` · ${pLabel}` : ""}</div>
    <div class="cards">
      ${card("MQL → SQL", convLast != null ? convLast + "%" : "—", deltaHTML(convLast, convPrev, {label:"MoM"}))}
      ${card("SQLs", fmtN(f(last,"sql")), deltaHTML(f(last,"sql"), f(prev,"sql"), {label:"MoM"}))}
      ${card("MQLs", fmtN(f(last,"mql")), deltaHTML(f(last,"mql"), f(prev,"mql"), {label:"MoM"}))}
      ${card("HIH leads", fmtN(hihLast), deltaHTML(hihLast, hihPrev, {label:"MoM"}))}
      ${PRODUCT === "all" ? card("Attribution (UTM)", utm != null ? utm + "%" : "—", utm != null && utm < 30 ? '<span class="delta down">below 30% target</span>' : '<span class="delta flat">—</span>') : ""}
    </div>
    <div class="grid2">
      <div class="panel"><h3>Funnel by stage${PRODUCT !== "all" ? ` — ${pLabel}` : ""}</h3><div class="chartbox"><canvas id="cFunnel"></canvas></div></div>
      <div class="panel"><h3>MQL → SQL conversion (%)</h3><div class="chartbox"><canvas id="cConv"></canvas></div>${note(funnelNarrative(d, last, convLast))}</div>
    </div>
    <div class="grid2">
      <div class="panel"><h3>HIH by source <span class="muted">(${last.label})</span></h3><div class="chartbox"><canvas id="cSrc"></canvas></div></div>
      <div class="panel"><h3>SQLs by source <span class="muted">(${last.label})</span></h3><div class="chartbox"><canvas id="cSqlSrc"></canvas></div></div>
    </div>

    <div class="section-label">▽ Lagging — sales outcome (context; $ + win rate → RevOps)</div>
    <div class="cards">
      ${card("Closed-won", fmt$(last.revenue.total_won), deltaHTML(last.revenue.total_won, prev.revenue && prev.revenue.total_won, {label:"MoM"}))}
      ${card("New business", fmt$(last.revenue.nb_won), "")}
      ${card("Wins", fmtN(last.revenue.wins), deltaHTML(last.revenue.wins, prev.revenue && prev.revenue.wins, {label:"MoM"}))}
    </div>
    <div class="panel"><h3>Closed-won revenue ${PRODUCT === "all" ? "(District + School)" : `— ${pLabel} <span class="muted">(multi-select; directional)</span>`} <span class="muted">— lagging</span></h3>
      <div class="chartbox"><canvas id="cRev"></canvas></div>
      ${note(laggingNarrative(last))}
      ${last.deals ? dealDrill(last) : ""}
    </div>

    <div class="section-label">🔍 Organic search — by topic area</div>
    <div class="panel">
      ${seoSection(d)}
      <p class="insight">🛈 <strong>How these keywords are chosen:</strong> this is the full set of keywords configured in our Search Atlas rank-tracker (project #77489), not a hand-picked list. The dashboard pulls every tracked keyword and auto-groups it into a topic area by matching the keyword text (e.g. "ela"/"reading" → ELA, "social studies" → Social Studies, "pre-k"/"preschool" → ECE, product/brand names → Brand). <strong>Position</strong> = current Google rank · <strong>"—"</strong> = tracked but not ranking · <strong>Volume</strong> = est. monthly US searches. To add or remove keywords, edit the Search Atlas project. MoM movement begins once we have a prior month to compare.</p>
      ${note(seoNarrative(d))}
    </div>

    <div class="panel"><h3>Monthly detail (all products)</h3>
      <table><thead><tr><th>Month</th><th>HIH</th><th>MQL</th><th>SQL</th><th>MQL→SQL</th><th>Wins</th><th>Closed-won</th></tr></thead><tbody>
      ${m.map((x, i) => `<tr><td>${x.label}</td><td>${fmtN(x.funnel.hih)}</td><td>${fmtN(x.funnel.mql)}</td><td>${fmtN(x.funnel.sql)}</td><td>${rate(x.funnel.sql,x.funnel.mql) != null ? rate(x.funnel.sql,x.funnel.mql)+"%" : "—"}</td><td>${fmtN(x.revenue.wins)}</td><td>${fmt$(x.revenue.total_won)}</td></tr>`).join("")}
      </tbody></table>
      <p class="flag">${d.notes || ""}</p>
    </div>`;

  // wire product chips
  document.querySelectorAll(".chip").forEach((b) => b.onclick = () => { PRODUCT = b.dataset.p; renderMonthly(DATA); });

  const botLeg = { plugins: { legend: { position: "bottom" } }, maintainAspectRatio: false };
  const noLeg = { plugins: { legend: { display: false } }, maintainAspectRatio: false };

  mkChart("cHih", { type: "line", data: { labels, datasets: [{ label: "HIH", data: hih, borderColor: AMBER, backgroundColor: "rgba(28,38,96,0.14)", fill: true, tension: 0.3, spanGaps: true }] }, options: { ...noLeg } });

  const fds = [{ label: "MQL", data: mql, borderColor: IJ, spanGaps: true }, { label: "SQL", data: sql, borderColor: PLUM, spanGaps: true }];
  if (PRODUCT === "all") fds.push({ label: "Opp", data: ser(m, "opp"), borderColor: ROSE, spanGaps: true });
  fds.unshift({ label: "HIH", data: hih, borderColor: AMBER, backgroundColor: "rgba(28,38,96,0.13)", fill: true, tension: 0.3, pointRadius: 2, spanGaps: true });
  mkChart("cFunnel", { type: "line", data: { labels, datasets: fds }, options: { ...botLeg } });

  mkChart("cConv", { type: "line", data: { labels, datasets: [{ label: "MQL→SQL %", data: conv, borderColor: IJ, backgroundColor: IJ_FADE, fill: true, tension: 0.3, spanGaps: true }] }, options: { ...noLeg, scales: { y: { beginAtZero: true, ticks: { callback: (v) => v + "%" } } } } });

  const hsrc = last.hih_by_source || [];
  mkChart("cSrc", { type: "bar", data: { labels: hsrc.map((s) => s[0]), datasets: [{ data: hsrc.map((s) => s[1]), backgroundColor: AMBER }] }, options: { ...noLeg, indexAxis: "y", scales: { x: { beginAtZero: true } } } });

  const ssrc = q.sql_by_source || [];
  mkChart("cSqlSrc", { type: "bar", data: { labels: ssrc.map((s) => s[0]), datasets: [{ data: ssrc.map((s) => s[1]), backgroundColor: IJ }] }, options: { ...noLeg, indexAxis: "y", scales: { x: { beginAtZero: true } } } });

  if (PRODUCT === "all") {
    mkChart("cRev", { type: "bar", data: { labels, datasets: [
      { label: "District", data: m.map((x) => x.revenue.district_won), backgroundColor: IJ_FADE, stack: "r" },
      { label: "School", data: m.map((x) => x.revenue.school_won), backgroundColor: "rgba(91,90,158,0.40)", stack: "r" }] },
      options: { ...botLeg, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } } });
  } else {
    mkChart("cRev", { type: "bar", data: { labels, datasets: [{ label: pLabel + " won $", data: revSer(m), backgroundColor: IJ }] }, options: { ...noLeg, scales: { y: { beginAtZero: true } } } });
  }
}

// ---- narratives ----
function hihNarrative(d, last) {
  const s = last.hih_by_source || []; const top = s[0];
  const share = top && last.funnel.hih ? Math.round(top[1] / s.reduce((a, x) => a + x[1], 0) * 100) : null;
  return `HIH is the earliest read on high-intent demand. ${top ? `${top[0]} drives ${share}% of it` : ""}; attribution is thin (UTM ${last.quality ? last.quality.utm_completeness_pct + "%" : "—"}), so source detail is directional.`;
}
function funnelNarrative(d, last, conv) {
  return `MQL→SQL ${conv != null ? conv + "%" : "—"}. Volume dips in May–Jun are the seasonal buying crunch (see note), not a lead-gen failure — watch off-cycle drops instead.`;
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

// ---- deal drill-down ----
function dealDrill(last) {
  const ds = last.deals || [];
  return `<details class="kwd"><summary>▸ ${ds.length} closed-won deals (${last.label}) — click to view + open in HubSpot</summary>
    <table><thead><tr><th>Deal</th><th>Segment</th><th>Pipeline</th><th>Type</th><th>Amount</th></tr></thead><tbody>
    ${ds.map((x) => `<tr><td><a href="${x.url}" target="_blank">${x.name} ↗</a></td><td>${x.segment}</td><td>${x.pipeline}</td><td>${x.type}</td><td>${fmt$(x.amount)}</td></tr>`).join("")}
    </tbody></table></details>`;
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
  charts.forEach((c) => c.destroy()); charts.length = 0; PRODUCT = "all";
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
