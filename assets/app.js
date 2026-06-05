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
  const wv = last.web || {}, wt = d.web_trend || null;
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
        <div class="hero-label">★ HIGH-INTENT (HIH) LEADS · ${last.label} — north star${PRODUCT !== "all" ? " · " + pLabel : ""}</div>
        <div class="hero-val">${fmtN(hihLast)} ${deltaHTML(hihLast, hihPrev, {label:"MoM"})}</div>
        <div class="hero-sub">HIH→MQL ${hihToMql != null ? hihToMql + "%" : "—"} · MQL→SQL ${convLast != null ? convLast + "%" : "—"} — does high intent convert?</div>
        ${note(hihNarrative(d, last))}
      </div>
      <div class="hero-chart"><div class="chartbox sm"><canvas id="cHih"></canvas></div></div>
    </div>

    <div class="section-label">▲ Leading · ${last.label} — what marketing works off${PRODUCT !== "all" ? ` · ${pLabel}` : ""}</div>
    <div class="cards">
      ${card("MQL → SQL", convLast != null ? convLast + "%" : "—", deltaHTML(convLast, convPrev, {label:"MoM"}))}
      ${card("SQLs", fmtN(f(last,"sql")), deltaHTML(f(last,"sql"), f(prev,"sql"), {label:"MoM"}))}
      ${card("MQLs", fmtN(f(last,"mql")), deltaHTML(f(last,"mql"), f(prev,"mql"), {label:"MoM"}))}
      ${card("HIH leads", fmtN(hihLast), deltaHTML(hihLast, hihPrev, {label:"MoM"}))}
      ${PRODUCT === "all" ? card("Attribution (UTM)", utm != null ? utm + "%" : "—", utm != null && utm < 30 ? '<span class="delta down">below 30% target</span>' : '<span class="delta flat">—</span>') : ""}
    </div>
    <div class="grid2">
      <div class="panel"><h3>Funnel by stage${PRODUCT !== "all" ? ` — ${pLabel}` : ""}</h3><div class="chartbox"><canvas id="cFunnel"></canvas></div>${note("<strong>HIH (high-intent)</strong> = contacts in the High marketing-intent tier — the earliest signal that someone is seriously evaluating, and our north-star metric. It's tracked back to at least early 2024 (this view shows the trailing 12 months). Shown here as the shaded band beneath MQL and SQL.")}</div>
      <div class="panel"><h3>MQL → SQL conversion (%)</h3><div class="chartbox"><canvas id="cConv"></canvas></div>${note(funnelNarrative(d, last, convLast))}</div>
    </div>
    <div class="grid2">
      <div class="panel"><h3>HIH by source <span class="muted">(${last.label})</span></h3><div class="chartbox"><canvas id="cSrc"></canvas></div></div>
      <div class="panel"><h3>SQLs by source <span class="muted">(${last.label})</span></h3><div class="chartbox"><canvas id="cSqlSrc"></canvas></div></div>
    </div>

    ${wv.channels ? `
    <div class="section-label">🌐 Web acquisition · ${last.label} <span class="muted">(GA4 · top of funnel)</span></div>
    <div class="cards">
      ${card("Sessions", fmtN(wv.sessions), deltaHTML(wv.sessions, yoy && yoy.sessions, {label:"YoY"}), wt ? `trailing 12mo ▲${wt.yoy_pct}% YoY · ${last.label} was a traffic spike` : "")}
      ${card("Engaged sessions", (wv.engaged_pct != null ? wv.engaged_pct : "—") + "%", "", "GA4 engagement rate")}
      ${card("Users", fmtN(wv.users))}
      ${card("Page views", fmtN(wv.views))}
    </div>
    <div class="grid2">
      <div class="panel"><h3>Channel mix <span class="muted">(sessions)</span></h3><div class="chartbox"><canvas id="mWebChannel"></canvas></div>${note("GA4's <strong>default channel grouping</strong> — its own session attribution from referrer + Google Ads click-ID + any UTMs, <strong>independent of HubSpot lead-source UTMs</strong>. 'AI Tool' referrals (ChatGPT/Perplexity) land here under Referral until we add a custom GA4 grouping.")}</div>
      <div class="panel"><h3>Sessions — this year vs last</h3><div class="chartbox"><canvas id="mWebTrend"></canvas></div>${note("Trailing 12 months vs the prior 12 — site-wide GA4 sessions. Monthly spikes (Oct, May) are campaign / PR bursts, not baseline growth.")}</div>
    </div>
    <div class="panel"><h3>Web conversions <span class="muted">(GA4 key events · ${last.label})</span></h3>
      <div class="cards">
        ${(wv.conversions || []).map((c) => card(c[0], fmtN(c[1]))).join("")}
      </div>
      ${note("Macro web conversions sit <strong>upstream of HIH</strong>: a visitor downloads a resource or signs up here, then — if high-intent — becomes an HIH lead below. (These are GA4 web events, distinct from HubSpot lead stages and from Google Ads' modeled conversions.)")}
    </div>` : ""}

    <div class="section-label">🔍 Organic search — by topic area</div>
    <div class="panel">
      ${seoSection(d)}
      <p class="insight">🛈 <strong>How these keywords are chosen:</strong> this is the full set of keywords configured in our Search Atlas rank-tracker (project #77489), not a hand-picked list. The dashboard pulls every tracked keyword and auto-groups it into a topic area by matching the keyword text (e.g. "ela"/"reading" → ELA, "social studies" → Social Studies, "pre-k"/"preschool" → ECE, product/brand names → Brand). <strong>Position</strong> = current Google rank · <strong>"—"</strong> = tracked but not ranking · <strong>Volume</strong> = est. monthly US searches. To add or remove keywords, edit the Search Atlas project. MoM movement begins once we have a prior month to compare.</p>
      ${note(seoNarrative(d))}
    </div>

    <div class="section-label">▽ Lagging · ${last.label} — sales outcome (context; $ + win rate → RevOps)</div>
    <div class="cards">
      ${card("Closed-won ($)", fmt$(last.revenue.total_won), deltaHTML(last.revenue.total_won, prev.revenue && prev.revenue.total_won, {label:"MoM"}), `${last.label} · total dollars won (non-test / non-RFP)`)}
      ${card("New business ($)", fmt$(last.revenue.nb_won), "", `${last.label} · new + pilot + pilot-expansion deals`)}
      ${card("Deals won (count)", fmtN(last.revenue.wins), deltaHTML(last.revenue.wins, prev.revenue && prev.revenue.wins, {label:"MoM"}), `${last.label} · closed-won, incl. $0 pilots`)}
    </div>
    <div class="panel"><h3>Closed-won revenue ${PRODUCT === "all" ? "(District + School)" : `— ${pLabel} <span class="muted">(multi-select; directional)</span>`} <span class="muted">— lagging</span></h3>
      <div class="chartbox"><canvas id="cRev"></canvas></div>
      ${note(laggingNarrative(last))}
      ${last.deals ? dealDrill(last) : ""}
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

  if (wv.channels) mkChart("mWebChannel", { type: "bar", data: { labels: wv.channels.map((c) => c[0]), datasets: [{ data: wv.channels.map((c) => c[1]), backgroundColor: AMBER }] }, options: { ...noLeg, indexAxis: "y", scales: { x: { beginAtZero: true } } } });
  if (wt) mkChart("mWebTrend", { type: "line", data: { labels: wt.labels, datasets: [
      { label: "This year", data: wt.current, borderColor: IJ, borderWidth: 3, tension: 0.3, pointRadius: 2 },
      { label: "Last year", data: wt.prior, borderColor: "#9AA6A4", borderWidth: 2, borderDash: [5, 4], tension: 0.3, pointRadius: 2 } ] },
    options: { ...botLeg } });

  mkChart("cHih", { type: "line", data: { labels, datasets: [{ label: "HIH", data: hih, borderColor: AMBER, backgroundColor: "rgba(28,38,96,0.14)", fill: true, tension: 0.3, spanGaps: true }] }, options: { ...noLeg } });

  // HIH = neutral slate background band (north-star context); MQL green + SQL purple = the two bold lines. Opp omitted (tracks SQL; it's in the detail table).
  const fds = [
    { label: "HIH (high-intent)", data: hih, borderColor: "#64748B", backgroundColor: "rgba(100,116,139,0.16)", fill: true, borderWidth: 1.5, tension: 0.3, pointRadius: 2, spanGaps: true },
    { label: "MQL", data: mql, borderColor: IJ, borderWidth: 3, tension: 0.25, pointRadius: 2, spanGaps: true },
    { label: "SQL", data: sql, borderColor: PLUM, borderWidth: 3, tension: 0.25, pointRadius: 2, spanGaps: true },
  ];
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

  document.getElementById("view").innerHTML = `
    <div class="contextbar">
      <span class="asof">📅 Data as of <strong>${d.updated}</strong> · last ${w.length} complete weeks</span>
      <span class="timing">Weekly funnel velocity (ISO weeks) · current partial week excluded</span>
    </div>
    <div class="section-label">▲ Latest complete week — ${last.label || ""}</div>
    <div class="cards">
      ${card("HIH", fmtN(f(last,"hih")), deltaHTML(f(last,"hih"), f(prev,"hih"), {label:"WoW"}))}
      ${card("MQLs", fmtN(f(last,"mql")), deltaHTML(f(last,"mql"), f(prev,"mql"), {label:"WoW"}))}
      ${card("SQLs", fmtN(f(last,"sql")), deltaHTML(f(last,"sql"), f(prev,"sql"), {label:"WoW"}))}
      ${card("Opp", fmtN(f(last,"opp")), deltaHTML(f(last,"opp"), f(prev,"opp"), {label:"WoW"}))}
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
