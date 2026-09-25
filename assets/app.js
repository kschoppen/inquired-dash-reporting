// inquirED Reporting Dashboard — data-driven shell. Each skill drops a JSON in /data + a tab.
const TABS = [
  { id: "overview",    label: "Overview",           data: "data/overview.json",          render: renderOverview,
    meta: { desc: "Command center — funnel health, campaign signals, and weekly pulse across all products.", cadence: "Live", next: "Always current",
      sources: ["HubSpot CRM (contacts + deals)", "Google Search Console (brand lift)", "Account Pulse snapshot (MQA count)"] } },
  { id: "monthly",    label: "Monthly Digest",      data: "data/monthly-digest.json",    render: renderMonthly,
    meta: { desc: "Full-funnel monthly report: new contacts, MQLs, SQLs, revenue, win rate by segment, and SEO.", cadence: "Monthly", next: "~Aug 1, 2026",
      sources: ["HubSpot CRM", "HubSpot Marketing Email", "HubSpot AEO", "GA4", "Semrush (Position Tracking · AI Visibility · Keyword Gap)", "Google Ads", "LinkedIn Ads", "Google Search Console (brand lift)"] } },
  { id: "weekly",     label: "Weekly Digest",       data: "data/weekly-digest.json",     render: renderWeekly,
    meta: { desc: "Weekly funnel snapshot: stage entries, MQL velocity, open pipeline, and active account list.", cadence: "Weekly · Mondays", next: "Jul 21, 2026",
      sources: ["HubSpot CRM (contacts + deals)", "Google Search Console (brand lift)"] } },
  { id: "campaign",   label: "Campaign Health",     data: "data/campaign-analytics.json", render: renderCampaign,
    meta: { desc: "Per-campaign performance: impressions, CTR, CPL, and pipeline attribution by channel.", cadence: "Monthly", next: "~Aug 1, 2026",
      sources: ["HubSpot CRM (list membership)"] } },
  { id: "pulse",      label: "Account Pulse (MQA)", data: "data/account-pulse.json",     render: renderAccountPulse,
    meta: { desc: "Marketing-qualified account list: engagement scores, HIH activity, and stage readiness by account.", cadence: "Weekly · Mondays", next: "Jul 21, 2026",
      sources: ["HubSpot CRM (company + contact records)"] } },
  { id: "state-signal", label: "State Signal (MQA)", data: "data/state-signal.json",     render: renderStateSignal,
    meta: { desc: "MQA/Engaged accounts ranked by state, cross-referenced with real, cited state curriculum/literacy policy signals (all 50 states + DC), live Starbridge RFP data, and real account-driven campaign history.", cadence: "Weekly · Mondays", next: "Sep 22, 2026",
      sources: ["HubSpot CRM (company records — mqa_lifecycle_stage, notes_last_contacted, state_st, starbridge_id)", "State DOE / legislature sites (policy citations, via WebSearch)", "Starbridge (live RFP / buyer-intelligence Bridges)", "Starbridge (Warm Signals bridges — GFE/IJ/Inkwell, live)", "inquirED Fall 2025-2026 Account-Driven Campaign brief + post-mortems"] } },
  { id: "content",    label: "Content Performance", data: "data/content-performance.json", render: renderContentPerformance,
    meta: { desc: "Pages, blog posts, and landing pages ranked by view-to-contact conversion. Surfaces high-traffic content converting under 0.5%.", cadence: "Weekly · Mondays", next: "Sep 15, 2026",
      sources: ["HubSpot Content Analytics"] } },
  { id: "competitive", label: "Competitive Intel",  static: true,                        render: renderCompetitiveIntel,
    metaFile: "data/competitive-intel.json",
    meta: { desc: "Competitive landscape scan across Inkwell (ELA), Inquiry Journeys (SS), and GF8 (PreK) — K–5 scope.", cadence: "Bi-monthly", next: "Sep 2026",
      sources: ["Competitor websites", "Meta Ad Library", "LinkedIn Ad Library", "Google Ads Transparency Center", "Semrush (keywords)", "Web search (weekly news signals)", "HubSpot (closed-lost deals)", "Gainsight (churn)"] } },
  { id: "nurture",     label: "Nurture Programs",   static: true,                        render: renderNurturePrograms,
    metaFile: "data/nurture-programs.json",
    meta: { desc: "HubSpot email nurture programs: linked workflows for status checks, plus send/open/click performance by track.", cadence: "On demand", next: "On demand",
      sources: ["HubSpot Marketing Email", "HubSpot CRM (lifecycle + nurture_track)", "Manually maintained workflow registry (data/nurture-workflows.json)"] } },
  { id: "teacher-nurture", label: "Teacher Nurture", static: true,                      render: renderTeacherNurture,
    metaFile: "data/teacher-nurture.json",
    meta: { desc: "IJ Teacher Marketing Program in Mailchimp: teachers by phase, plus send/open/click performance for all six automation flows.", cadence: "Live on page load", next: "Always current",
      sources: ["Mailchimp Marketing API (saved phase segments + flow email reports)", "Gainsight fields synced into Mailchimp (Phase Status, Activation Substate, Active User Flag)", "Flow registry (data/teacher-nurture.json)"] } },
  { id: "defs",       label: "Definitions",         data: "data/definitions.json",       render: renderDefinitions,
    meta: { desc: "Reference — how every metric, stage, segment, and product is defined in this dashboard.", cadence: "Updated as needed", next: "On metric change",
      sources: ["Static reference — maintained manually, no live data pull"] } },
];
// inquirED brand palette: green anchor, dark-purple data-viz accent (HIH), medium-purple secondary, pink accent
const IJ = "#144745", IJ_FADE = "rgba(20,71,69,0.30)", ROSE = "#F99792", PLUM = "#5B5A9E", AMBER = "#1C2660", GREY = "rgba(120,130,128,0.5)";
const PRODUCTS = [["all","All products"],["ij","Inquiry Journeys"],["inkwell","Inkwell (ELA)"],["wh","World History"],["gf8","Great First 8"]];
let DATA = null, PRODUCT = "all";
const charts = [];

const fmtN = (n) => n == null ? "—" : Number(n).toLocaleString("en-US");
const escapeHtml = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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

// step-conversion bridge: sits in the strip under the stage row, spanning the centers of two stages
function funnelBridge(step, col, cur, yoyRate) {
  const pp = (cur != null && yoyRate != null) ? +(cur - yoyRate).toFixed(1) : null;
  const cls = pp == null ? "flat" : pp > 0 ? "up" : pp < 0 ? "down" : "flat";
  return `<div class="f-bridge" style="grid-column:${col} / span 2">
    <div class="f-bridge-bracket"></div>
    <div class="f-bridge-step">${step}</div>
    <div class="f-bridge-rate">${cur != null ? cur + "%" : "—"}</div>
    <div class="f-bridge-yoy ${cls}">${pp == null ? "YoY n/a" : `${pp > 0 ? "↑" : pp < 0 ? "↓" : ""}${Math.abs(pp)} pts YoY`}</div>
    ${yoyRate != null ? `<div class="f-bridge-ly">LY ${yoyRate}%</div>` : ""}
  </div>`;
}

function topPageRows(pages, valKey, valClass, valFmt) {
  if (!pages || !pages.length) return `<p class="pending-note">⚠ Data pending — skill update needed.</p>`;
  return pages.map((p) => `<div class="top-page-row">
    <span class="top-page-path">${p.path}</span>
    <span class="${valClass}">${valFmt(p[valKey])}</span>
    ${p.type ? `<span class="top-page-type">${p.type}</span>` : ""}
  </div>`).join("");
}

// ---- Overview: command center ----
// The KPI strip accepts either shape overview.json has shipped: the rich tile array
// (label/value/delta/sub/spark) or the flat block the weekly routine writes
// ({hih_pool, mql_to_sql_pct, closed_won_mtd}). Anything else degrades to no tiles
// rather than throwing and blanking the whole tab.
const KPI_FLAT_META = {
  hih_pool:       { label: "HIH Pool",        sub: "High-intent contacts · 90-day rolling pool", fmt: fmtN },
  mql_to_sql_pct: { label: "MQL → SQL Conv.", sub: "Latest weekly run",                          fmt: (v) => v + "%" },
  closed_won_mtd: { label: "Closed Won MTD",  sub: "Month to date",                              fmt: (v) => v },
};
function normalizeKpis(k) {
  if (Array.isArray(k)) return k;
  if (!k || typeof k !== "object") return [];
  return Object.keys(k).map((key) => {
    const meta = KPI_FLAT_META[key] || {};
    const raw = k[key];
    return {
      label: meta.label || key.replace(/_/g, " "),
      value: raw == null ? "—" : (meta.fmt ? meta.fmt(raw) : raw),
      delta: "", delta_dir: "flat", sub: meta.sub || "", spark: [],
    };
  });
}

function renderOverview(d) {
  charts.forEach((c) => c.destroy()); charts.length = 0;

  const s = d.summary || {};
  const signals = (s.signals || []).map((sig) =>
    `<span class="ov-chip ${sig.dir}">${sig.dir === "up" ? "↑" : sig.dir === "down" ? "↓" : "⚠"} ${sig.label}</span>`
  ).join("");

  const kpis = normalizeKpis(d.kpis);
  const kpiHTML = kpis.map((k, i) => `
    <div class="ov-kpi">
      <div class="ov-kpi-label">${k.label}</div>
      <div class="ov-kpi-value">${k.value != null ? k.value : "—"}</div>
      ${k.delta ? `<span class="ov-kpi-delta ${k.delta_dir || "flat"}">${k.delta}</span>` : ""}
      <div class="ov-kpi-sub">${k.sub || ""}</div>
      <div class="ov-kpi-spk"><canvas id="ovSpk${i}"></canvas></div>
    </div>`).join("");

  const ws = d.weekly_signal;
  function wsCard(entry, label) {
    if (!entry) return "";
    return `<div class="ov-weekly-signal${label === "previous" ? " ov-ws-previous" : ""}">
      <div class="ov-ws-meta">
        <span class="ov-ws-badge">AI Weekly Digest Summary</span>
        <span class="ov-ws-label">Generated ${new Date(entry.updated + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })} · Data week of ${entry.week_label.replace("Week of ", "")+", "+entry.updated.slice(0,4)}</span>
      </div>
      <div class="ov-ws-narrative">${entry.narrative}</div>
    </div>`;
  }
  // Support both old flat shape and new {current, previous} shape
  const wsCurrent = ws && ws.current ? ws.current : ws;
  const wsPrevious = ws && ws.previous ? ws.previous : null;
  const weeklySignalHTML = ws ? wsCard(wsCurrent) + wsCard(wsPrevious, "previous") : "";

  document.getElementById("view").innerHTML = `
    <div class="ov-narrative">
      <div class="ov-narr-meta">
        <span class="ov-ai-badge">AI Monthly Digest Summary</span>
        <span class="ov-narr-date">Generated ${new Date(d.updated + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })} · Data month of ${(() => { const r = new Date(d.updated + "T12:00:00Z"); r.setUTCMonth(r.getUTCMonth() - 1); return r.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }); })()}</span>
      </div>
      <div class="ov-narr-headline">${s.headline || ""}</div>
      <div class="ov-narr-body">${s.body || ""}</div>
      <div class="ov-signals">${signals}</div>
    </div>
    ${weeklySignalHTML}
    <div class="ov-section-label">Key metrics</div>
    <div class="ov-kpi-strip">${kpiHTML}</div>
    ${pipelineGoalSection(d.pipeline_goal, { full: false })}
    <div class="ov-defs-link"><a href="#" onclick="switchToTab('defs');return false;">View metric definitions →</a></div>`;

  // sparklines
  const spkColors = [IJ, PLUM, ROSE, "#1C6854"];
  kpis.forEach((k, i) => {
    const el = document.getElementById(`ovSpk${i}`);
    if (!el || !k.spark || !k.spark.length) return;
    const color = spkColors[i] || IJ;
    charts.push(new Chart(el, {
      type: "line",
      data: {
        labels: k.spark.map((_, j) => j),
        datasets: [{ data: k.spark, borderColor: color, borderWidth: 2,
          backgroundColor: color.startsWith("#") ? color + "18" : color,
          tension: 0.4, pointRadius: 0, fill: true }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false, beginAtZero: false } }
      }
    }));
  });
}

// ---- jump rail (section quick-nav, built by the caller after #view is rendered) ----
function buildJumpRail(sections) {
  const rail = document.getElementById("jump-rail");
  if (!rail || !sections || !sections.length) return;
  rail.innerHTML = sections.map((s) => `<button data-jump="${s.id}">${s.label}</button>`).join("");
  rail.hidden = false;
  rail.querySelectorAll("button").forEach((b) => {
    b.onclick = () => {
      const el = document.getElementById(b.dataset.jump);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    };
  });
  const targets = sections.map((s) => document.getElementById(s.id)).filter(Boolean);
  if (targets.length && "IntersectionObserver" in window) {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        rail.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.jump === entry.target.id));
      });
    }, { rootMargin: "-15% 0px -70% 0px" });
    targets.forEach((t) => obs.observe(t));
  }
}

// ---- digest redesign helpers (Monthly + Weekly) — tiered layout, one comparison per tile, detail in drawers ----
const RD_PROD = [["ij", "Inquiry Journeys", "#144745"], ["inkwell", "Inkwell (ELA)", "#F99792"], ["wh", "World History", "#5B5A9E"], ["gf8", "Great First 8", "#079DD9"]];
const RD_SEG = [["single_small", "Single / Small", "#B1E0BB"], ["medium", "Medium", "#4A9FD8"], ["large", "Large", "#5B5A9E"], ["enterprise", "Enterprise", "#144745"]];
const RD_STAGES = ["Sales Qualified", "Interest", "Consideration", "Conviction", "Desire", "Validation / Approval"];
const RD_PIPES = [["new_business", "New Business"], ["account_growth", "Account Growth"], ["renewal", "Renewal"]];
const fmtK = (n) => n == null ? "—" : n >= 1e6 ? "$" + (n / 1e6).toFixed(2).replace(/\.00$/, "") + "M" : n >= 1e3 ? "$" + Math.round(n / 1e3) + "K" : "$" + Math.round(n);

// Count change in % ("↑25% YoY"); rate change in points ("↓7 pts YoY"); small-base change as raw count ("+11").
function rdPct(cur, base, lbl) {
  if (cur == null || base == null || base === 0) return `<span class="d flat">— ${lbl}</span>`;
  const p = Math.round((cur - base) / Math.abs(base) * 100);
  return `<span class="d ${p > 0 ? "up" : p < 0 ? "down" : "flat"}">${p > 0 ? "↑" : p < 0 ? "↓" : ""}${Math.abs(p)}% ${lbl}</span>`;
}
function rdPts(cur, base, lbl) {
  if (cur == null || base == null) return `<span class="d flat">— ${lbl}</span>`;
  const p = +(cur - base).toFixed(1);
  return `<span class="d ${p > 0 ? "up" : p < 0 ? "down" : "flat"}">${p > 0 ? "↑" : p < 0 ? "↓" : ""}${Math.abs(p)} pts ${lbl}</span>`;
}
function rdRaw(cur, base) {
  if (cur == null || base == null || cur === base) return "";
  const d = cur - base;
  return `<span class="chg ${d > 0 ? "up" : "down"}">${d > 0 ? "+" : "−"}${Math.abs(d)}</span>`;
}
// vs-average for weekly tiles: "5.0× avg", "−1 vs avg", "≈ avg"
// invert = true when a rise is bad news (e.g. disqualifications)
function rdVsAvg(cur, avg, invert) {
  if (cur == null || !avg) return { html: `<span class="d flat">—</span>`, st: "watch", lbl: "—" };
  const r = cur / avg, [hi, lo] = invert ? ["down", "up"] : ["up", "down"];
  if (r >= 1.2) return { html: `<span class="d ${hi}">${r.toFixed(1)}× avg</span>`, st: invert ? "bad" : "good", lbl: r >= 2 ? "Surge" : "Up" };
  if (r <= 0.8) return { html: `<span class="d ${lo}">${r.toFixed(1)}× avg</span>`, st: invert ? "good" : "bad", lbl: "Down" };
  const diff = Math.round(cur - avg);
  return { html: `<span class="d flat">${diff === 0 ? "≈ avg" : (diff > 0 ? "+" : "−") + Math.abs(diff) + " vs avg"}</span>`, st: "watch", lbl: "Flat" };
}
const rdStatus = (st, lbl) => `<span class="rd-status ${st}">${lbl}</span>`;
const rdTier = (n, title, why, extra) => `<div class="rd-tier"><span class="n">${n}</span><h2>${title}</h2>${why ? `<span class="why">${why}</span>` : ""}${extra || ""}</div>`;
const rdCov = (t) => `<span class="rd-cov">${t}</span>`;
const rdNeeds = () => `<span class="rd-needs">Needs new pull</span>`;
const rdCtx = (label, t) => t ? `<div class="rd-context"><b>${label}</b> ${t}</div>` : "";
const rdAbout = (title, body) => body ? `<details class="rd-about"><summary>${title}</summary><div class="cap">${body}</div></details>` : "";
function rdDz(title, right, body, opts = {}) {
  return `<details class="rd-dz ${opts.cls || ""}"${opts.open ? " open" : ""}${opts.id ? ` id="${opts.id}"` : ""}>
    <summary>${opts.tag ? `<span class="rd-tag">${opts.tag}</span>` : ""}<span class="dt">${title}${opts.src ? ` <span class="rd-src">${opts.src}</span>` : ""}</span><span class="ds">${right || ""}</span></summary>
    <div class="dbody">${body}</div></details>`;
}
function rdBars(rows, fmt) {
  const mx = Math.max(1, ...rows.map((r) => r[1] || 0));
  return `<div class="rd-bars">${rows.map((r) => `<div class="rd-bar"><span>${r[2] ? `<span class="dot" style="background:${r[2]}"></span>` : ""}${r[0]}</span><span class="t"><i style="width:${((r[1] || 0) / mx * 100).toFixed(1)}%${r[2] ? `;background:${r[2]}` : ""}"></i></span><span class="n">${fmt ? fmt(r[1]) : fmtN(r[1])}${r.length > 3 ? rdRaw(r[1], r[3]) : ""}</span></div>`).join("")}</div>`;
}
function rdRead(read) {
  if (!read || !(read.up || read.down || read.watch)) return "";
  return `<div class="rd-read">${[["up", "Up"], ["down", "Down"], ["watch", "Watch"]].map(([k, l]) => read[k] ? `<div><div class="k ${k}">${l}</div><p>${read[k]}</p></div>` : "").join("")}</div>`;
}
function rdKpi(o) {
  return `<div class="rd-kpi${o.hero ? " hero" : ""}">${o.st ? rdStatus(o.st, o.stLbl) : ""}
    <div class="lab">${o.label}</div><div class="val">${o.value}</div>
    ${o.bar != null ? `<div class="rd-meter"><i style="width:${Math.min(100, o.bar)}%"></i></div>` : ""}
    <div>${o.delta || ""} ${o.cmp ? `<span class="cmp">${o.cmp}</span>` : ""}</div>
    ${o.spark ? `<div class="rd-spk"><canvas id="${o.spark}"></canvas></div>` : ""}
    ${o.cap ? `<div class="cap">${o.cap}</div>` : ""}</div>`;
}
function rdMini(label, value, deltas, cap, spark, valStyle) {
  return `<div class="rd-mini"><div class="lab">${label}</div><div class="v"${valStyle ? ` style="${valStyle}"` : ""}>${value}</div><div>${deltas || ""}</div>${spark ? `<div class="rd-spk"><canvas id="${spark}"></canvas></div>` : ""}${cap ? `<div class="cap">${cap}</div>` : ""}</div>`;
}
function rdSpark(id, data, color) {
  mkChart(id, { type: "line", data: { labels: data.map((_, i) => i), datasets: [{ data, borderColor: color || IJ, borderWidth: 1.8, backgroundColor: "rgba(20,71,69,0.08)", fill: true, tension: 0.35, spanGaps: true, pointRadius: data.map((_, i) => i === data.length - 1 ? 2.5 : 0), pointBackgroundColor: color || IJ }] }, options: spkOpts });
}
// Point value labels for line charts — opt in per chart via options.plugins.rdLabels.on
if (window.Chart) Chart.register({ id: "rdLabels", afterDatasetsDraw(c, a, o) {
  if (!o || !o.on) return;
  const x = c.ctx; x.save(); x.font = "900 11px Lato, sans-serif"; x.textAlign = "center";
  c.data.datasets.forEach((ds, di) => { if (ds.rdNoLabel) return; c.getDatasetMeta(di).data.forEach((p, i) => {
    const v = ds.data[i]; if (v == null) return;
    x.fillStyle = (o.hi || []).includes(i) ? IJ : "#757575"; x.fillText(o.fmt ? o.fmt(v) : v, p.x, p.y - 9);
  }); });
  x.restore();
} });
// Benchmark bands with inline labels (MQL→SQL trend)
const rdBandLabels = { id: "rdBands", afterDatasetsDraw(c, a, o) {
  if (!o || !o.bands) return;
  const x = c.ctx, ar = c.chartArea; x.save(); x.font = "700 10px Lato, sans-serif"; x.fillStyle = "#757575"; x.textAlign = "left";
  o.bands.forEach(([v, t]) => x.fillText(t, ar.left + 6, c.scales.y.getPixelForValue(v) - 5)); x.restore();
} };
if (window.Chart) Chart.register(rdBandLabels);
const rdBand = (n, v) => ({ data: Array(n).fill(v), borderColor: "#aaa", borderDash: [5, 4], borderWidth: 1.2, pointRadius: 0, rdNoLabel: true });

// Brand lift block: branded search number + weekly/monthly chart, YouTube/Instagram as placeholders
function rdBrandBlock(bl, deltaLabel, chartId) {
  if (!bl) return "";
  const s = bl.series || [], last = s[s.length - 1] || {}, prev = s[s.length - 2] || {};
  const collecting = bl.status === "collecting" || !s.length;
  const cmp = bl.comparable && bl.comparable.channels ? bl.comparable.channels.branded : null;
  const clk = (e) => e && e.branded ? e.branded.clicks : null;
  const delta = collecting ? `<span class="d flat">Collecting</span>`
    : cmp ? `${rdPct(cmp.current, cmp.previous, deltaLabel)} <span class="cmp">same ${bl.comparable.days} settled days</span>`
    : rdPct(clk(last), clk(prev), deltaLabel);
  const cap = collecting ? "Organic clicks on branded queries · inquired.com"
    : `${fmtN(last.branded && last.branded.impressions)} impressions${last.provisional ? ` · provisional, ${last.settled_days} of 7 days final` : ""}`;
  const ph = (t) => `<div class="rd-ph"><div class="lab">${t}</div><div class="phv">Placeholder</div><div class="cap">Not in the Search Analytics API. Wiring TBD.</div></div>`;
  return `<div class="rd-g3b">
      ${rdKpi({ label: "Branded search clicks", value: collecting ? "—" : fmtN(clk(last)), delta, cap })}
      ${ph("YouTube in Google Search")}${ph("Instagram in Google Search")}
    </div>
    ${s.length >= 2 ? `<div class="rd-card" style="margin-top:12px"><div class="eyebrow">Branded search clicks by ${deltaLabel === "WoW" ? "week" : "month"}</div><div class="chartbox sm"><canvas id="${chartId}"></canvas></div>${last.provisional ? `<p class="cap">The ${last.label} point is provisional and revises upward on the next run.</p>` : ""}</div>` : ""}
    ${rdAbout("About this data", bl.note)}`;
}
function rdBrandChart(bl, chartId) {
  const s = (bl && bl.series) || [];
  if (s.length < 2) return;
  mkChart(chartId, { type: "line", data: { labels: s.map((x) => x.label), datasets: [{ data: s.map((x) => x.branded ? x.branded.clicks : null), borderColor: IJ, backgroundColor: "rgba(20,71,69,0.08)", fill: true, tension: 0.3, borderWidth: 2.5, pointRadius: s.map((x) => x.provisional ? 5 : 3), pointBackgroundColor: s.map((x) => x.provisional ? "#fff" : IJ), pointBorderColor: IJ, pointBorderWidth: 2, spanGaps: true }] },
    options: { maintainAspectRatio: false, layout: { padding: { top: 16 } }, plugins: { legend: { display: false }, rdLabels: { on: true, hi: [s.length - 1] } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { maxTicksLimit: 5 } } } } });
}

// Latest content_engagement snapshot in the weekly history (it isn't written every week)
function rdLatestCE(w) { for (let i = w.length - 1; i >= 0; i--) if (w[i].content_engagement) return w[i].content_engagement; return null; }
const rdPieceType = (t) => /-DL:/.test(t) ? "Download" : /-WEB:/.test(t) ? "Webinar" : /Demo|Contact/i.test(t) ? "Hand-raise" : "Form";
const rdPieceProd = (t) => /^(IJ|SS)/.test(t) ? "Inquiry Journeys" : /^ELA/.test(t) ? "Inkwell" : /^(GF8|ECE)/.test(t) ? "Great First 8" : /^WH/.test(t) ? "World History" : "—";

function renderMonthly(d) {
  charts.forEach((c) => c.destroy()); charts.length = 0;
  const m = d.months, last = m[m.length - 1], prev = m[m.length - 2] || {};
  const labels = m.map((x) => x.label), short = labels.map((l) => l.replace(" 20", "’"));
  const hih = ser(m, "hih"), mql = ser(m, "mql"), sql = ser(m, "sql");
  const conv = m.map((x, i) => rate(sql[i], mql[i]));

  const fu = (mo, s) => mo && mo.funnel ? mo.funnel[s] : null;
  const fp = (mo, s) => PRODUCT === "all" ? fu(mo, s) : (mo && mo.by_product && mo.by_product[PRODUCT] ? mo.by_product[PRODUCT][s] : null);
  const rv = (mo, k) => mo && mo.revenue ? mo.revenue[k] : null;

  const q = last.quality || {}, utm = q.utm_completeness_pct, utmPrev = (prev.quality || {}).utm_completeness_pct;
  const wv = last.web || {}, wt = d.web_trend || null, yoy = wv.yoy || {};
  const pLabel = PRODUCTS.find((p) => p[0] === PRODUCT)[1];

  // prior-year same month (e.g. Aug 2026 → Aug 2025) — the one comparison on the scorecard + funnel
  const [lastMon, lastYr] = (last.label || "").split(" ");
  const ly = m.find((x) => x.label === `${lastMon} ${+lastYr - 1}`) || {};
  const lyIdx = m.indexOf(ly);

  const hihVel = fu(last, "hih"), hihPrev = fu(prev, "hih"), hihLY = fu(ly, "hih");
  const hihPool = fu(last, "hih_pool_active");
  const heroConv = rate(fu(last, "sql"), fu(last, "mql")), lyConv = rate(fu(ly, "sql"), fu(ly, "mql"));

  const sessions = wv.sessions, sessionsPrev = (prev.web || {}).sessions;
  const lead = fu(last, "lead"), leadPrev = fu(prev, "lead");
  const sqlToOpp = rate(fu(last, "opp"), fu(last, "sql"));
  const sessionsLY = yoy.sessions != null ? yoy.sessions : (ly.web || {}).sessions;
  const stepConv = {
    lead: [rate(lead, sessions), rate(fu(ly, "lead"), sessionsLY)],
    mql:  [rate(fu(last, "mql"), lead), rate(fu(ly, "mql"), fu(ly, "lead"))],
    sql:  [heroConv, lyConv],
    opp:  [sqlToOpp, rate(fu(ly, "opp"), fu(ly, "sql"))],
  };

  // scorecard
  const pg = d.pipeline_goal || null, pgAct = pg ? pgTotal(pg.actual) : null, pgPct = pg && pg.goal && pg.goal.generated ? pgAct / pg.goal.generated * 100 : null;
  const won = rv(last, "total_won"), wonLY = rv(ly, "total_won");
  const convPts = heroConv != null && lyConv != null ? heroConv - lyConv : null;
  const sqlYoY = fu(ly, "sql") ? (fu(last, "sql") - fu(ly, "sql")) / fu(ly, "sql") * 100 : null;
  const st = (v, goodAt, badAt) => v == null ? ["watch", "—"] : v >= goodAt ? ["good", "Up"] : v <= badAt ? ["bad", "Down"] : ["watch", "Flat"];
  const [convSt, convLbl] = st(convPts, 2, -2), [sqlSt, sqlLbl] = st(sqlYoY, 5, -5);
  const wonSt = wonLY ? (won >= wonLY ? ["good", "Ahead"] : ["bad", "Behind"]) : ["watch", "—"];

  // leading indicators (product-scoped)
  const pr = (mo) => rate(fp(mo, "sql"), fp(mo, "mql"));
  const bp = last.by_product || {};

  document.getElementById("view").innerHTML = `
    <div class="rd">
    ${rdTier(1, "The read", "Written by the digest skill each run")}
    ${rdRead(last.read) || `<p class="cap">No summary for ${last.label} yet. The digest skill writes it on the next run.</p>`}
    <div class="rd-grid g4" style="margin-top:12px">
      ${rdKpi({ label: "MQL → SQL", value: heroConv != null ? heroConv + "%" : "—", st: convSt, stLbl: convLbl, delta: rdPts(heroConv, lyConv, "YoY"), cmp: lyConv != null ? `vs ${lyConv}%` : "", spark: "rdSpkConv" })}
      ${rdKpi({ label: "SQLs", value: fmtN(fu(last, "sql")), st: sqlSt, stLbl: sqlLbl, delta: rdPct(fu(last, "sql"), fu(ly, "sql"), "YoY"), cmp: `vs ${fmtN(fu(ly, "sql"))}`, spark: "rdSpkSql" })}
      ${pg ? rdKpi({ label: `Pipeline · ${pg.school_year}`, value: fmtK(pgAct), st: pgPct >= 50 ? "good" : "watch", stLbl: pgPct >= 50 ? "On track" : "Watch", bar: pgPct, cap: `${pgPct.toFixed(1)}% of ${fmtK(pg.goal.generated)} generated goal` }) : ""}
      ${rdKpi({ label: "Closed-won", value: fmtK(won), st: wonSt[0], stLbl: wonSt[1], delta: rdPct(won, wonLY, "YoY"), cmp: `vs ${fmtK(wonLY)}`, spark: "rdSpkWon" })}
    </div>

    <div id="sec-hih">${rdTier(1, "High-intent (HIH)", "North-star signal · spans all funnel stages")}</div>
    <div class="rd-grid g4">
      ${rdKpi({ label: "New this month", value: fmtN(hihVel), hero: true, delta: hihPrev != null ? `<span class="d ${hihVel >= hihPrev ? "up" : "down"}">${hihVel >= hihPrev ? "↑" : "↓"}${Math.abs(hihVel - hihPrev)} MoM</span>` : "", cmp: `vs ${fmtN(hihPrev)} in ${(prev.label || "").split(" ")[0]}` })}
      ${rdKpi({ label: `vs ${ly.label || "last year"}`, value: hihLY ? (hihVel / hihLY).toFixed(1) + "×" : "—", delta: hihLY != null ? `<span class="d ${hihVel >= hihLY ? "up" : "down"}">${hihVel >= hihLY ? "↑" : "↓"}${Math.abs(hihVel - hihLY)} YoY</span>` : "", cmp: `vs ${fmtN(hihLY)} in ${ly.label || "—"}` })}
      ${rdKpi({ label: "Active pool (90 days)", value: hihPool != null ? fmtN(hihPool) : "—", cap: hihPool != null ? "Contacts with High intent active in the last 90 days" : "Not populated this run. Fills in when the digest skill writes the 90-day pool." })}
      <div class="rd-card"><div class="eyebrow" style="margin-bottom:8px">By product <span class="lc">· tagged only</span></div>${rdBars(RD_PROD.map(([k, l, c]) => [l, bp[k] ? bp[k].hih : null, c]))}</div>
    </div>
    <div class="rd-card" style="margin-top:12px">
      <div class="rd-row"><div class="eyebrow">HIH new contacts by month · last ${m.length} months</div><a class="hih-hs-link" style="margin:0" href="https://app.hubspot.com/contacts/4451852/objectLists/10586/filters" target="_blank" rel="noopener">View HIH list in HubSpot ↗</a></div>
      <div class="chartbox" style="height:220px"><canvas id="rdHih"></canvas></div>
      ${rdAbout("What is HIH?", "A signal layer that spans all funnel stages. A contact becomes HIH when they engage with high-intent content (ROI calculator, curriculum guide, demo request, whitepaper) regardless of lifecycle stage. It isn't a sequential gate, so there's no HIH→MQL conversion rate. Read it alongside the funnel.")}
    </div>

    <div id="sec-funnel">${rdTier(2, "Funnel", `Monthly new contacts per stage · YoY vs ${ly.label || "prior year"}`)}</div>
    <div class="funnel-panel">
      <div class="funnel-scroll"><div class="funnel-grid">
        ${funnelStage("Prospect", sessions, sessionsPrev, "web sessions", "f-prospect", sessionsLY)}
        ${funnelStage("Lead", lead, leadPrev, "new this month", "f-prospect", fu(ly, "lead"))}
        ${funnelStage("MQL", fu(last, "mql"), fu(prev, "mql"), "mktg qualified", "f-mql", fu(ly, "mql"))}
        ${funnelStage("SQL", fu(last, "sql"), fu(prev, "sql"), "sales qualified", "f-sql", fu(ly, "sql"))}
        ${funnelStage("Opp", fu(last, "opp"), fu(prev, "opp"), "open opportunity", "f-opp", fu(ly, "opp"))}
        <div class="f-strip-bg"></div>
        <div class="f-strip-label">Step<br>conversion</div>
        ${funnelBridge("Session → Lead", 2, ...stepConv.lead)}
        ${funnelBridge("Lead → MQL", 4, ...stepConv.mql)}
        ${funnelBridge("MQL → SQL", 6, ...stepConv.sql)}
        ${funnelBridge("SQL → Opp", 8, ...stepConv.opp)}
      </div></div>
      ${lead == null ? `<p class="data-empty">Lead count not yet populated. Run the monthly digest skill.</p>` : ""}
    </div>

    <div id="sec-leading">${rdTier(2, "Leading indicators by product", "", rdCov("Product-tagged only · won't sum to totals"))}</div>
    <div class="rd-card">
      <div class="rd-row">
        <div class="toolbar" style="margin:0">${PRODUCTS.map((p) => `<button class="chip ${p[0] === PRODUCT ? "on" : ""}" data-p="${p[0]}">${p[1]}</button>`).join("")}</div>
        <span class="cap" style="margin:0">${PRODUCT === "all" ? "Chips filter this section only" : `Filtered to <strong>${pLabel}</strong> · partial coverage`}</span>
      </div>
      <div class="rd-grid g5">
        ${rdMini("HIH new", fmtN(fp(last, "hih")), `${rdPct(fp(last, "hih"), fp(prev, "hih"), "MoM")} ${rdPct(fp(last, "hih"), fp(ly, "hih"), "YoY")}`, "", "rdSpkHih")}
        ${rdMini("MQLs", fmtN(fp(last, "mql")), `${rdPct(fp(last, "mql"), fp(prev, "mql"), "MoM")} ${rdPct(fp(last, "mql"), fp(ly, "mql"), "YoY")}`, "", "rdSpkMql")}
        ${rdMini("SQLs", fmtN(fp(last, "sql")), `${rdPct(fp(last, "sql"), fp(prev, "sql"), "MoM")} ${rdPct(fp(last, "sql"), fp(ly, "sql"), "YoY")}`, "", "rdSpkSql2")}
        ${rdMini("MQL → SQL", pr(last) != null ? pr(last) + "%" : "—", `${rdPts(pr(last), pr(prev), "MoM")} ${rdPts(pr(last), pr(ly), "YoY")}`, "B2B benchmark 13–22%", "rdSpkConv2")}
        ${rdMini("UTM attribution", utm != null ? utm + "%" : "—", rdPts(utm, utmPrev, "MoM"), `% of MQLs with a source UTM · target 30%`, "", utm != null && utm < 30 ? "color:var(--down)" : "")}
      </div>
      <div class="rd-sub">
        <div class="rd-row"><div class="eyebrow">MQL → SQL conversion · ${m.length}-month trend</div></div>
        <div class="chartbox" style="height:230px"><canvas id="rdConv"></canvas></div>
        ${rdCtx("Context", funnelNarrative(d, last, pr(last), pr(prev)))}
      </div>
      <div class="rd-grid g2 rd-sub">
        <div><div class="eyebrow" style="margin-bottom:6px">HIH by source · ${last.label}</div>${rdBars((last.hih_by_source || []).map((s) => [s[0], s[1]]))}</div>
        <div><div class="eyebrow" style="margin-bottom:6px">By product · ${last.label}</div>${hihByProductTable(last)}</div>
      </div>
    </div>

    <div class="rd-group g-out" id="sec-lagging">
      <div class="rd-ghead"><span class="n">3</span><h2>Pipeline &amp; revenue</h2><span class="why">Lagging sales outcome · RevOps owns the official view</span></div>
      <div class="rd-banner">Under construction: the numbers in this section haven't been validated. QA and RevOps alignment are in progress, so treat them as directional until reconciled.</div>
      ${pg ? rdDz(`Pipeline vs ${pg.school_year} goal`, `<b>${fmtK(pgAct)}</b> of ${fmtK(pg.goal.generated)} generated · <b>${fmtK(pg.actual.won)}</b> of ${fmtK(pg.goal.closed_won)} won`,
        pipelineGoalSection(pg, { full: true, bare: true }) + rdAbout("How this goal is measured", pg.note), { open: true }) : ""}
      ${rdDz(`Closed-won · ${last.label}`, `<b>${fmt$(won)}</b> · ${rdPct(won, wonLY, "YoY")} · ${fmtN(rv(last, "wins"))} deals`, `
        <div class="rd-grid g4">
          ${rdMini("Closed-won", fmt$(won), `${rdPct(won, rv(prev, "total_won"), "MoM")} ${rdPct(won, wonLY, "YoY")}`, "total dollars won (non-test / non-RFP)")}
          ${rdMini("New business", fmt$(rv(last, "nb_won")), rdPct(rv(last, "nb_won"), rv(prev, "nb_won"), "MoM"), "new + pilot + pilot-expansion deals")}
          ${rdMini("Deals won", fmtN(rv(last, "wins")), `${rdPct(rv(last, "wins"), rv(prev, "wins"), "MoM")} ${rdPct(rv(last, "wins"), rv(ly, "wins"), "YoY")}`, "incl. $0 pilots")}
          ${rv(last, "win_rate_count_pct") != null ? rdMini("Win rate (count)", rv(last, "win_rate_count_pct") + "%", "", "monthly close-date basis · RevOps owns the official rate") : ""}
        </div>
        <div class="rd-sub"><div class="eyebrow">Closed-won by month · District + School</div><div class="chartbox"><canvas id="cRev"></canvas></div>${rdCtx("Context", laggingNarrative(last))}</div>
        ${last.deals ? dealDrill(last) : ""}
        ${last.rev_by_product ? rdAbout("Closed-won by product", `<table class="bd"><tbody>${RD_PROD.map(([k, l]) => `<tr><td>${l}</td><td>${fmt$(last.rev_by_product[k])}</td></tr>`).join("")}</tbody></table>${last.rev_by_product.note || ""}`) : ""}`, { open: true })}
    </div>

    <div class="rd-group g-ch">
      <div class="rd-ghead"><span class="n">3</span><h2>Channels</h2><span class="why">Top of funnel · each drawer shows its headline so you can skim it closed</span></div>
      ${wv.channels ? rdDz("Web acquisition", `<b>${fmtN(wv.sessions)}</b> sessions · ${rdPct(wv.sessions, yoy.sessions, "YoY")}`, `
        <div class="rd-grid g4" id="sec-web">
          ${rdMini("Sessions", fmtN(wv.sessions), `${rdPct(wv.sessions, sessionsPrev, "MoM")} ${rdPct(wv.sessions, yoy.sessions, "YoY")}`, yoy.sessions ? `vs ${fmtN(yoy.sessions)} same month last year` : "")}
          ${rdMini("Users", fmtN(wv.users), `${rdPct(wv.users, (prev.web || {}).users, "MoM")} ${rdPct(wv.users, yoy.users, "YoY")}`, yoy.users ? `vs ${fmtN(yoy.users)} last year` : "")}
          ${rdMini("Page views", fmtN(wv.views), `${rdPct(wv.views, (prev.web || {}).views, "MoM")} ${rdPct(wv.views, yoy.views, "YoY")}`, yoy.views ? `vs ${fmtN(yoy.views)} last year` : "")}
          ${wv.engaged_pct != null ? rdMini("Engagement rate", wv.engaged_pct + "%", "", "GA4 engaged sessions / sessions") : ""}
        </div>
        ${wt ? `<div class="rd-sub"><div class="eyebrow">Sessions by month · this year vs last year</div><div class="chartbox sm"><canvas id="rdWebTrend"></canvas></div></div>` : ""}
        <div class="rd-grid g2 rd-sub">
          <div><div class="eyebrow" style="margin-bottom:6px">Channel mix · sessions</div>${rdBars(wv.channels.slice().sort((a, b) => b[1] - a[1]).map((c) => [c[0], c[1]]))}${rdAbout("About channel grouping", d.web_note || "GA4's default channel grouping, independent of HubSpot lead-source UTMs.")}</div>
          <div><div class="eyebrow" style="margin-bottom:6px">Web conversions · GA4 key events</div>${wv.conversions ? rdBars(wv.conversions.map((c) => [c[0], c[1]])) : ""}<p class="cap">Macro web conversions sit upstream of HIH. A visitor downloads a resource or signs up here; if high-intent, they become an HIH lead.</p></div>
        </div>
        <div class="rd-sub"><div class="eyebrow" style="margin-bottom:6px">Top conversion pages <span class="source-badge ga4">GA4 API</span></div>
          ${wv.top_conversion_pages ? topPageRows(wv.top_conversion_pages, "completions", "top-page-conv", (v) => `${fmtN(v)} completions`) : `<p class="data-empty">Data pending. Populated by the monthly digest run (GA4 API; credentials in the routine env).</p>`}</div>`,
        { open: true, tag: "Web", cls: "ch-web", src: "GA4" }) : ""}
      ${rdDz("Organic search", (() => { const t = d.seo_topics || []; return `<b>${t.reduce((a, x) => a + (x.top10 || 0), 0)} of ${t.reduce((a, x) => a + (x.tracked || 0), 0)}</b> tracked keywords in the top 10`; })(), `
        <div class="rd-grid g2" id="sec-seo">
          <div><div class="eyebrow" style="margin-bottom:6px">Keyword rankings by topic</div>${seoSection(d)}</div>
          <div><div class="eyebrow" style="margin-bottom:6px">Top organic entry pages · ${last.label}</div>${last.seo_top_pages ? topPageRows(last.seo_top_pages, "visits", "top-page-traffic", (v) => `~${fmtN(v)} visits`) : `<p class="data-empty">Data pending. Populated by the monthly digest run (Semrush API).</p>`}</div>
        </div>
        ${rdCtx("Context", seoNarrative(d))}
        ${rdAbout("How these keywords are chosen", "The full set of keywords in our Semrush Position Tracking project, not a hand-picked list. Keywords are auto-grouped into topics by matching the keyword text (ela/reading → ELA, social studies → Social Studies, pre-k/preschool → ECE, product/brand names → Brand). Position is the current Google rank; “—” means tracked but not ranking. Volume is estimated US monthly searches. To add or remove keywords, edit the Semrush project. MoM starts once there's a prior month to compare.")}`,
        { open: true, tag: "SEO", cls: "ch-seo", src: "Semrush" })}
      ${rdDz("AI &amp; answer engines", last.ai_visibility ? `Visibility score <b>${last.ai_visibility.score}</b> ${last.ai_visibility.label} · ${fmtN(last.ai_visibility.citations)} citations` : "Data pending", `
        <div class="rd-grid g2" id="sec-aeo">
          <div><div class="eyebrow" style="margin-bottom:6px">AI visibility</div>${aiVisSection(last)}</div>
          <div><div class="eyebrow" style="margin-bottom:6px">Keyword gap · ELA &amp; SS only</div>${kwGapSection(last)}</div>
        </div>
        ${rdCtx("HubSpot AEO", "Under construction. It tracks visibility for named prompts across AI assistants (ChatGPT, Claude, Gemini), plus competitor share of voice on buyer questions like “Great First Eight vs Frog Street.” That's a different lens from the Semrush score above, which counts overall brand mentions. The pull is built and waiting on HubSpot AEO permission.")}`,
        { open: true, tag: "AEO", cls: "ch-aeo", src: "Semrush" })}
      ${d.brand_lift ? rdDz("Brand lift", d.brand_lift.status === "collecting" || !(d.brand_lift.series || []).length ? `<span class="cap">Collecting · baseline month</span>` : `<b>${fmtN(((d.brand_lift.series.slice(-1)[0] || {}).branded || {}).clicks)}</b> branded clicks`,
        rdBrandBlock(d.brand_lift, "MoM", "mBrandLift"), { open: d.brand_lift.status !== "collecting" && (d.brand_lift.series || []).length > 0, tag: "Brand", cls: "ch-brand", src: "Google Search Console" }) : ""}
    </div>

    <div id="sec-detail">${rdTier(4, "Reference", "")}</div>
    ${rdDz("Monthly detail · all products", `trailing ${m.length} months`, `<div class="tscroll"><table><thead><tr><th>Month</th><th>HIH</th><th>MQL</th><th>SQL</th><th>MQL→SQL</th><th>Wins</th><th>Closed-won</th></tr></thead><tbody>
      ${m.map((x) => `<tr><td>${x.label}</td><td>${fmtN(fu(x, "hih"))}</td><td>${fmtN(fu(x, "mql"))}</td><td>${fmtN(fu(x, "sql"))}</td><td>${rate(fu(x, "sql"), fu(x, "mql")) != null ? rate(fu(x, "sql"), fu(x, "mql")) + "%" : "—"}</td><td>${fmtN(rv(x, "wins"))}</td><td>${fmt$(rv(x, "total_won"))}</td></tr>`).join("")}
      </tbody></table></div>`)}
    ${d.notes ? rdDz("Data notes &amp; methodology", "backfill, product splits, corrections", `<p class="cap">${d.notes}</p>`) : ""}
    </div>`;

  document.querySelectorAll(".chip[data-p]").forEach((b) => b.onclick = () => { PRODUCT = b.dataset.p; renderMonthly(DATA); });

  buildJumpRail([
    { id: "sec-hih", label: "HIH" },
    { id: "sec-funnel", label: "Funnel" },
    { id: "sec-leading", label: "Leading ind." },
    { id: "sec-lagging", label: "Pipeline" },
    { id: "sec-web", label: "Web" },
    { id: "sec-seo", label: "SEO" },
    { id: "sec-aeo", label: "AEO" },
    { id: "sec-detail", label: "Detail" },
  ]);

  const grid = { color: "rgba(20,71,69,0.08)" };
  rdSpark("rdSpkConv", conv, IJ); rdSpark("rdSpkSql", sql, PLUM); rdSpark("rdSpkWon", m.map((x) => rv(x, "total_won")), IJ);
  rdSpark("rdSpkHih", ser(m, "hih"), AMBER); rdSpark("rdSpkMql", ser(m, "mql"), IJ); rdSpark("rdSpkSql2", ser(m, "sql"), PLUM);
  rdSpark("rdSpkConv2", m.map((x) => pr(x)), "#1a7f5a");

  // HIH monthly trend — every point labeled; prior-year month + latest month emphasized
  const hl = [lyIdx, m.length - 1].filter((i) => i >= 0);
  mkChart("rdHih", { type: "line", data: { labels: short, datasets: [{ data: hih, borderColor: IJ, backgroundColor: "rgba(20,71,69,0.08)", fill: true, tension: 0.3, borderWidth: 2.5, spanGaps: true,
      pointRadius: hih.map((_, i) => hl.includes(i) ? 6 : 3.5), pointBackgroundColor: hih.map((_, i) => hl.includes(i) ? IJ : "#fff"), pointBorderColor: IJ, pointBorderWidth: 2 }] },
    options: { maintainAspectRatio: false, layout: { padding: { top: 18 } }, plugins: { legend: { display: false }, rdLabels: { on: true, hi: hl } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid, ticks: { maxTicksLimit: 5 } } } } });

  const pconv = m.map((x) => pr(x));
  mkChart("rdConv", { type: "line", data: { labels: short, datasets: [
      { data: pconv, borderColor: IJ, backgroundColor: "rgba(20,71,69,0.08)", fill: true, tension: 0.3, borderWidth: 2.5, pointRadius: 3, pointBackgroundColor: IJ, spanGaps: true },
      rdBand(m.length, 45), rdBand(m.length, 22)] },
    options: { maintainAspectRatio: false, layout: { padding: { top: 18 } }, plugins: { legend: { display: false }, rdLabels: { on: true, fmt: (v) => v + "%", hi: [m.length - 1] }, rdBands: { bands: [[45, "Top performers 45%"], [22, "B2B benchmark 22%"]] } },
      scales: { x: { grid: { display: false } }, y: { beginAtZero: true, max: 100, grid, ticks: { callback: (v) => v + "%", maxTicksLimit: 6 } } } } });

  if (wt) mkChart("rdWebTrend", { type: "line", data: { labels: wt.labels, datasets: [
      { label: "This year", data: wt.current, borderColor: PLUM, borderWidth: 2.5, tension: 0.3, pointRadius: 2.5, pointBackgroundColor: PLUM },
      { label: "Last year", data: wt.prior, borderColor: "#999", borderDash: [5, 4], borderWidth: 1.5, tension: 0.3, pointRadius: 0 }] },
    options: { maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { boxWidth: 10 } } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid, ticks: { maxTicksLimit: 5 } } } } });

  rdBrandChart(d.brand_lift, "mBrandLift");

  mkChart("cRev", { type: "bar", data: { labels: short, datasets: [
    { label: "District", data: m.map((x) => rv(x, "district_won")), backgroundColor: IJ, stack: "r" },
    { label: "School",   data: m.map((x) => rv(x, "school_won")),   backgroundColor: "#B1E0BB", stack: "r" }
  ] }, options: { maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { boxWidth: 10 } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt$(c.raw)}` } } },
    scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, grid, ticks: { callback: (v) => fmtK(v), maxTicksLimit: 5 } } } } });
}

function hihByProductTable(last) {
  const prods = [
    { key: "ij",      label: "Inquiry Journeys", color: "#144745" },
    { key: "inkwell", label: "Inkwell (ELA)",     color: "#F99792" },
    { key: "wh",      label: "World History",     color: "#5B5A9E" },
    { key: "gf8",     label: "Great First 8",     color: "#079DD9" },
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
function funnelNarrative(d, last, conv, prevConv) {
  if (conv == null) return "MQL→SQL conversion — not enough data this month.";
  const benchLabel = conv >= 30 ? "well above the B2B benchmark (13–22%; top performers 30–45%)"
    : conv >= 13 ? "within the B2B benchmark range (13–22%)"
    : "below the B2B benchmark range (13–22%)";
  const momClause = prevConv != null
    ? (conv >= prevConv ? ` — up from ${prevConv}% last month` : ` — down from ${prevConv}% last month`)
    : "";
  const [, moStr] = (last.period || "").split("-");
  const mo = parseInt(moStr, 10);
  const seasonNote = (mo === 5 || mo === 6)
    ? " May–June volume dips are the seasonal district-buying crunch, not a lead-gen failure."
    : "";
  const flagNote = last.funnel_note ? ` ${last.funnel_note}` : "";
  return `MQL→SQL ${conv}%${momClause} — ${benchLabel}.${seasonNote}${flagNote}`;
}
function laggingNarrative(last) {
  const deals = (last.deals || []).filter((x) => x.amount > 0);
  const total = last.revenue ? last.revenue.total_won : null;
  const base = "Revenue lags ~2 quarters in K-12 (a deal closing now was sourced last fall).";
  if (!deals.length || !total) {
    return `${base} $ pipeline + official win rate live in RevOps.`;
  }
  const top = deals.slice().sort((a, b) => b.amount - a.amount)[0];
  const share = Math.round((top.amount / total) * 100);
  const concentrationNote = share >= 40
    ? ` Don't over-read a single month.`
    : ` A broad month across ${deals.length} paid deals, not one outlier.`;
  return `${base} ${top.name} (${fmt$(top.amount)}) is ${share}% of this month's ${fmt$(total)} won.${concentrationNote} $ pipeline + official win rate live in RevOps.`;
}
function seoNarrative(d) {
  const t = (n) => (d.seo_topics || []).find((x) => x.topic === n) || {};
  const ela = t("ELA (Inkwell)"), ece = t("ECE / Pre-K (GF8)");
  return `We own Brand (avg pos 1.1) and rank core Social Studies — but ELA is ${ela.top10 || 0}/${ela.tracked || 0} in top-10 and ECE/Pre-K is ${ece.top10 || 0}/${ece.tracked || 0}. The non-brand growth products are nearly invisible — the clearest SEO opportunity. (MoM deltas start next month.)`;
}

// ---- top conversion pages (monthly MoM/YoY + weekly WoW) ----
function topPagesSection(pages, priorPages, mode) {
  if (!pages || !pages.length) return '<p class="flag">Top conversion pages — data populates on next digest run.</p>';
  const priorMap = {};
  if (priorPages) priorPages.forEach((p) => { priorMap[p.path] = p.completions; });
  const isMonthly = mode === "monthly";
  return `<table><thead><tr><th>Page</th><th>Completions</th><th>${isMonthly ? "MoM" : "WoW"}</th>${isMonthly ? "<th>YoY</th>" : ""}<th>Type</th></tr></thead><tbody>
    ${pages.map((p) => `<tr>
      <td class="page-path">${p.path}</td>
      <td><strong>${fmtN(p.completions)}</strong></td>
      <td>${deltaHTML(p.completions, isMonthly ? p.prior_mom : priorMap[p.path])}</td>
      ${isMonthly ? `<td>${deltaHTML(p.completions, p.prior_yoy, {label:"YoY"})}</td>` : ""}
      <td><span class="page-type-badge">${p.type || ""}</span></td>
    </tr>`).join("")}
  </tbody></table>`;
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
  if (!av) return '<p class="data-empty">— Data pending — the monthly digest run reads the Semrush AI Visibility PDF from Google Drive (cloud-capable)</p>';
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
  if (!kg) return '<p class="data-empty">— Data pending — the monthly digest run reads the Semrush Keyword Gap PDF from Google Drive (cloud-capable)</p>';
  const gaps = kg.top_gaps || [];
  return `<div class="kw-gap-hero"><span class="kw-gap-n">${kg.relevant_missing}</span> ELA/SS keywords we're missing <span class="muted">(of ${fmtN(kg.total_missing)} total — math excluded)</span></div>
    ${gaps.length ? `<table><thead><tr><th>Keyword</th><th>Est. volume</th></tr></thead><tbody>
      ${gaps.map((g) => `<tr><td>${g.kw}</td><td>${fmtN(g.vol)}</td></tr>`).join("")}
    </tbody></table>` : ""}
    ${kg.filter_note ? note(kg.filter_note) : ""}`;
}

// ---- AEO (HubSpot) sections — not currently called; the AEO panel shows a single
// "under construction" banner until HubSpot AEO permission clears. Re-wire these in
// (see the removed grid2 block in git history, commit "Split Organic Search into
// tinted SEO/AEO sections...") once month.aeo has real data. ----
function aeoVisSection(m) {
  const ae = m.aeo;
  if (!ae || ae.run_status !== "ok") {
    const reason = ae && ae.run_status === "no_permission"
      ? "HubSpot AEO permission not yet granted on this connection — reconnect the HubSpot integration once access is approved."
      : "Data pending — populated by the monthly digest run (HubSpot AEO, same connector as CRM data — no separate credential).";
    return `<p class="data-empty">— ${reason}</p>`;
  }
  return `<div class="ai-vis-score">
      <span class="ai-vis-num">${ae.visibility_score != null ? ae.visibility_score : "—"}</span><span class="ai-vis-denom">/100</span>
    </div>
    <div class="ai-vis-stats">
      ${[["Mentions", ae.mentions], ["Citations", ae.citations], ["Prompts tracked", ae.prompts_tracked]].map(([lbl, val]) =>
      `<div class="ai-vis-stat"><span class="ai-vis-stat-label">${lbl}</span><span class="ai-vis-stat-val">${val != null ? fmtN(val) : "—"}</span></div>`
    ).join("")}
    </div>`;
}

function aeoCompetitorSection(m) {
  const ae = m.aeo;
  if (!ae || ae.run_status !== "ok" || !ae.competitors || !ae.competitors.length) {
    return '<p class="data-empty">— Data pending — populated by the monthly digest run</p>';
  }
  return `<table><thead><tr><th>Brand</th><th>Mentions</th><th>Share of voice</th></tr></thead><tbody>
    ${ae.competitors.map((c) => `<tr><td>${c.name}</td><td>${fmtN(c.mentions)}</td><td>${c.share_pct}%</td></tr>`).join("")}
  </tbody></table>`;
}

function aeoAssistantSection(m) {
  const ae = m.aeo;
  if (!ae || ae.run_status !== "ok" || !ae.by_assistant || !ae.by_assistant.length) return "";
  return `<div class="panel" style="margin-bottom:0">
    <h3>Mentions by AI assistant <span class="muted">(${m.label} · HubSpot)</span></h3>
    <div class="ai-vis-llm">
      ${ae.by_assistant.map((a) => `<div class="ai-vis-llm-row"><span class="ai-vis-llm-name">${a.assistant}</span><div class="ai-vis-bar-wrap"><div class="ai-vis-bar" style="width:${a.pct}%"></div></div><span class="ai-vis-llm-pct">${a.pct}% · ${a.mentions}</span></div>`).join("")}
    </div>
  </div>`;
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
// Product rows for the disposition-by-product table
const WK_PIPE_PRODUCT_ROWS = [["ij", "Inquiry Journeys", "#144745"], ["inkwell", "Inkwell", "#F99792"], ["wh", "World History", "#5B5A9E"], ["gf8", "Great First 8", "#079DD9"]];

// ---- content engagement (intent tier + content tags — running totals, not a weekly-window count) ----
const CE_TIER_COLORS = { high: "#144745", medium: "#1C2660", low: "#94A3AE" };

function ceTagDeltaHTML(d) {
  if (d == null) return "";
  if (d === 0) return '<span class="delta flat">=</span>';
  return d > 0 ? `<span class="delta up">▲${fmtN(d)}</span>` : `<span class="delta down">▼${fmtN(Math.abs(d))}</span>`;
}

function contentEngagementSection(ce) {
  if (!ce) return "";
  const tier = ce.intent_tier || {};
  const tierCards = ["high", "medium", "low"].map((k) => {
    const label = k.charAt(0).toUpperCase() + k.slice(1) + " intent";
    return `<div class="card"><div class="label" style="color:${CE_TIER_COLORS[k]}">${label}</div><div class="value">${fmtN(tier[k])}</div><div class="cap">Contacts currently tagged</div></div>`;
  }).join("");

  const tags = ce.top_content_tags || [];
  const tagRows = tags.map((t) => `<tr><td>${t.tag}</td><td>${fmtN(t.count)}</td><td>${ceTagDeltaHTML(t.delta)}</td></tr>`).join("");

  return `
    <div class="panel"><h3>Content engagement <span class="muted">(as of ${ce.as_of || "—"})</span></h3>
      ${note("Running totals — how many contacts currently carry each value, not new this week. WoW compares against last week's stored snapshot.")}
      <div class="cards">${tierCards}</div>
      <h4>Top content tags</h4>
      ${tagRows ? `<table class="bd"><thead><tr><th>Tag</th><th>Contacts</th><th>WoW</th></tr></thead><tbody>${tagRows}</tbody></table>` : `<p class="cap">No tagged contacts yet.</p>`}
      ${note("Content tags are multi-select — a contact with more than one tag counts toward each, so this won't sum to total contacts.")}
    </div>`;
}

function dispositionProductTable(last) {
  const bp = (last.disposition && last.disposition.by_product) || {};
  const rows = WK_PIPE_PRODUCT_ROWS.map(([k, label, color]) => {
    const r = bp[k] || {};
    return `<tr><td><span class="dot" style="background:${color}"></span>${label}</td><td>${r.dq != null ? fmtN(r.dq) : "—"}</td><td>${r.nurture != null ? fmtN(r.nurture) : "—"}</td></tr>`;
  }).join("");
  return `<table><thead><tr><th>Product</th><th>Disqualified</th><th>Sent to nurture</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// ---- pipeline vs. goal (weekly compact + monthly full) — shared by both tabs ----
const PG_SEGMENT_ROWS = [["single_small", "Single / Small"], ["medium", "Medium"], ["large", "Large"], ["enterprise", "Enterprise"]];
const PG_PRODUCT_ROWS = [["ij", "Inquiry Journeys"], ["inkwell", "Inkwell"], ["wh", "World History"], ["gf8", "Great First 8"], ["untagged", "Untagged"]];
const PG_PIPELINE_ROWS = [["district", "District"], ["school", "School"], ["new_business", "New Business"]];

function pgTotal(b) { return ((b && b.open) || 0) + ((b && b.lost) || 0) + ((b && b.won) || 0); }
function pgBarSegs(b) {
  const t = pgTotal(b) || 1;
  const wonPct = ((b && b.won) || 0) / t * 100, lostPct = ((b && b.lost) || 0) / t * 100, openPct = ((b && b.open) || 0) / t * 100;
  return `<div class="stack-bar"><div class="stack-seg won" style="width:${wonPct}%"></div><div class="stack-seg lost" style="width:${lostPct}%"></div><div class="stack-seg open" style="width:${openPct}%"></div></div>`;
}
function pgBreakdownRows(rowDefs, data) {
  return rowDefs.map(([k, label]) => `<div class="stack-row"><span class="lbl">${label}</span>${pgBarSegs(data && data[k])}<span class="val">${fmt$(pgTotal(data && data[k]))}</span></div>`).join("");
}
function pgBreakdownTable(rowDefs, data) {
  const body = rowDefs.map(([k, label]) => { const b = (data && data[k]) || {}; return `<tr><td>${label}</td><td>${fmt$(b.open)}</td><td>${fmt$(b.lost)}</td><td>${fmt$(b.won)}</td></tr>`; }).join("");
  return `<table class="bd"><thead><tr><th></th><th>Open</th><th>Lost</th><th>Won</th></tr></thead><tbody>${body}</tbody></table>`;
}

function pipelineGoalSection(pg, opts = {}) {
  if (!pg) return "";
  const goal = pg.goal || {}, actual = pg.actual || {}, ref = pg.reference_year || {};
  const total = pgTotal(actual);
  const pipelinePct = goal.generated ? Math.min(100, total / goal.generated * 100) : 0;
  const wonPct = goal.closed_won ? Math.min(100, (actual.won || 0) / goal.closed_won * 100) : 0;
  const showTarget = total > 100;
  const bd = showTarget ? { segment: pg.by_segment, product: pg.by_product, pipeline: pg.by_pipeline, label: pg.school_year }
                        : { segment: ref.by_segment, product: ref.by_product, pipeline: ref.by_pipeline, label: `${ref.school_year || "last year"} for reference` };

  return `
  <div class="panel">${opts.bare ? "" : `<h3>Pipeline vs. ${pg.school_year || ""} Goal</h3>`}
    <p class="cap" style="margin-top:0">Deal Start Year = ${(pg.field_value || (pg.school_year || "").replace("SY", ""))} · District + School + New Business pipelines · as of ${pg.as_of || "—"}${opts.full ? "" : " · updates weekly"}${pg.hubspot_list_url ? ` · <a class="hih-hs-link" style="margin:0;padding:2px 9px;font-size:11.5px" href="${pg.hubspot_list_url}" target="_blank" rel="noopener">View deals in HubSpot ↗</a>` : ""}</p>
    <div class="goal-row">
      <div class="goal-block">
        <div class="goal-top"><span class="goal-label">Pipeline generated</span><span class="goal-pct">${pipelinePct.toFixed(1)}%</span></div>
        <div class="goal-nums">${fmt$(total)} <span class="of">/ ${fmt$(goal.generated)} goal</span></div>
        <div class="goal-bar-wrap"><div class="goal-bar-fill pipeline" style="width:${pipelinePct}%"></div></div>
      </div>
      <div class="goal-block">
        <div class="goal-top"><span class="goal-label">Closed-won</span><span class="goal-pct">${wonPct.toFixed(1)}%</span></div>
        <div class="goal-nums">${fmt$(actual.won)} <span class="of">/ ${fmt$(goal.closed_won)} goal</span></div>
        <div class="goal-bar-wrap"><div class="goal-bar-fill won" style="width:${wonPct}%"></div></div>
      </div>
    </div>
    ${ref.generated ? `<p class="cap">Last full year (${ref.school_year}): ${fmt$(ref.generated)} generated · ${fmt$(ref.closed_won)} closed-won · ${ref.win_rate_pct}% win rate — the basis for this year's targets.</p>` : ""}
    ${opts.full ? `
    <h4 style="font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:18px 0 8px">By segment <span style="text-transform:none;font-weight:400;letter-spacing:0">— ${bd.label}</span></h4>
    ${pgBreakdownRows(PG_SEGMENT_ROWS, bd.segment)}
    ${note(`<span class="dot" style="background:var(--iq-green)"></span>Won &nbsp; <span class="dot" style="background:var(--lost)"></span>Lost &nbsp; <span class="dot" style="background:var(--iq-purple-lt)"></span>Open — bar width is share of that segment's own total. Descriptive context, not a separate goal per segment.`)}
    <div class="grid2">
      <div>
        <h4 style="font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:14px 0 6px">By product <span style="text-transform:none;font-weight:400;letter-spacing:0">— ${bd.label}</span></h4>
        ${pgBreakdownTable(PG_PRODUCT_ROWS, bd.product)}
        ${note("Multi-tagged deals count toward each product — won't sum to the total above.")}
      </div>
      <div>
        <h4 style="font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:14px 0 6px">By pipeline <span style="text-transform:none;font-weight:400;letter-spacing:0">— ${bd.label}</span></h4>
        ${pgBreakdownTable(PG_PIPELINE_ROWS, bd.pipeline)}
        ${note("District, School, and New Business Sales pipelines only — Awareness (never reaches Closed Won), Renewal (retention, not new growth), Account Growth, and Partnerships are excluded from this goal.")}
      </div>
    </div>` : `<p class="cap">Full segment / product / district-school breakdown lives on the Monthly Digest tab.</p>`}
  </div>`;
}

function renderWeekly(d) {
  charts.forEach((c) => c.destroy()); charts.length = 0;
  const w = d.weeks || [], last = w[w.length - 1] || {}, prev = w[w.length - 2] || {};
  const labels = w.map((x) => x.label);
  const f = (o, s) => (o && o.funnel) ? o.funnel[s] : null;
  const conv = w.map((x) => rate(f(x, "sql"), f(x, "mql")));
  const pipe = d.pipeline || {};

  // baseline = prior 8 complete weeks (excludes the latest week)
  const base = w.slice(-9, -1);
  const avg = (s) => base.length ? base.reduce((a, x) => a + (f(x, s) || 0), 0) / base.length : null;
  const avgD = (k) => { const b = base.filter((x) => x.disposition && x.disposition[k] != null); return b.length ? b.reduce((a, x) => a + x.disposition[k], 0) / b.length : null; };
  const baseConv = base.length ? rate(base.reduce((a, x) => a + (f(x, "sql") || 0), 0), base.reduce((a, x) => a + (f(x, "mql") || 0), 0)) : null;
  const lastConv = rate(f(last, "sql"), f(last, "mql"));
  const spk = (s) => w.slice(-9).map((x) => f(x, s));
  const tile = (s, label, hero) => {
    const a = avg(s), v = rdVsAvg(f(last, s), a);
    return rdKpi({ label, value: fmtN(f(last, s)), hero, st: v.st, stLbl: v.lbl, delta: v.html, cmp: a != null ? `avg ${a.toFixed(1)}` : "", spark: `rdW_${s}` });
  };
  const convPts = lastConv != null && baseConv != null ? lastConv - baseConv : null;
  const convSt = convPts == null ? ["watch", "—"] : convPts >= 3 ? ["good", "Up"] : convPts <= -3 ? ["bad", "Down"] : ["watch", "Flat"];

  // breakdowns
  const bp = last.by_product || {}, bpp = prev.by_product || {}, bs = last.by_segment || {}, bsp = prev.by_segment || {};
  const g = (o, k, s) => o[k] ? o[k][s] : null;
  const tagged = (o, rows, s) => rows.reduce((a, [k]) => a + (g(o, k, s) || 0), 0);
  const segHihAllZero = RD_SEG.every(([k]) => !g(bs, k, "hih"));
  const segTbl = RD_SEG.map(([k, l, c]) => `<tr><td><span class="dot" style="background:${c}"></span>${l}</td>${["mql", "sql", "opp"].map((s) => `<td>${fmtN(g(bs, k, s))}${rdRaw(g(bs, k, s), g(bsp, k, s))}</td>`).join("")}<td>${rate(g(bs, k, "sql"), g(bs, k, "mql")) != null ? rate(g(bs, k, "sql"), g(bs, k, "mql")) + "%" : "—"}</td></tr>`).join("")
    + `<tr class="untagged"><td>Unassigned</td>${["mql", "sql", "opp"].map((s) => `<td>${fmtN(Math.max(0, (f(last, s) || 0) - tagged(bs, RD_SEG, s)))}</td>`).join("")}<td></td></tr>`;
  const prodTbl = RD_PROD.map(([k, l, c]) => `<tr><td><span class="dot" style="background:${c}"></span>${l}</td>${["hih", "mql", "sql", "opp"].map((s) => `<td>${fmtN(g(bp, k, s))}${rdRaw(g(bp, k, s), g(bpp, k, s))}</td>`).join("")}</tr>`).join("")
    + `<tr class="untagged"><td>Untagged</td>${["hih", "mql", "sql", "opp"].map((s) => `<td>${fmtN(Math.max(0, (f(last, s) || 0) - tagged(bp, RD_PROD, s)))}</td>`).join("")}</tr>`;

  // HIH contact drill-down (IDs only; opens the side drawer)
  const drillHih = (last.drill && last.drill.hih) || [];

  // top converting pieces
  const pieces = last.top_pieces || null, ce = rdLatestCE(w);
  const piecesTbl = pieces && pieces.length
    ? pieces.map((p) => { const nm = p.offer || p.tag || "—"; return `<tr><td><b>${escapeHtml(nm)}</b></td><td>${p.type || rdPieceType(nm)}</td><td>${p.product || rdPieceProd(nm)}</td><td><b>${fmtN(p.fills)}</b></td><td>${p.avg8 != null ? rdVsAvg(p.fills, p.avg8).html : "—"}</td><td>${fmtN(p.new_contacts)}</td><td>${fmtN(p.to_hih)}</td><td>${fmtN(p.to_mql)}</td></tr>`; }).join("")
    : ((ce && ce.top_content_tags) || []).map((t) => `<tr><td><b>${t.tag}</b><span class="rd-rt">${fmtN(t.count)} running total</span></td><td>${rdPieceType(t.tag)}</td><td>${rdPieceProd(t.tag)}</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>`).join("");

  // open pipeline (active pipelines only; legacy District/School hidden)
  // stage detail: prefer `active` (with weekly movement), else fall back to the plain by_stage counts
  const bst = pipe.by_stage || {};
  const act = pipe.active || (RD_PIPES.some(([k]) => (bst[k] || []).length) ? Object.fromEntries(RD_PIPES.map(([k]) => [k, { stages: bst[k] || [] }])) : null);
  const hasMove = !!pipe.active;
  const normStage = (n) => String(n || "").toLowerCase().replace(/[^a-z]/g, "");
  const stageRows = (p) => {
    const byName = {}; ((p && p.stages) || []).forEach((s) => { byName[normStage(s.stage)] = s; });
    const cell = (s, k, fmt) => s && s[k] != null ? (fmt ? fmt(s[k]) : fmtN(s[k])) : "—";
    const rows = RD_STAGES.map((n, i) => { const s = byName[normStage(n)]; return `<tr${i === 0 ? ' class="untagged"' : ""}><td>${n}${i === 0 ? ' <span class="rd-pill">not pipeline</span>' : i === 1 ? ' <span class="rd-pill">pipeline starts</span>' : ""}</td><td>${cell(s, "count")}</td><td>${cell(s, "amount", fmt$)}</td><td>${cell(s, "entered")}</td><td>${cell(s, "forward")}</td><td>${cell(s, "back")}</td></tr>`; }).join("");
    const inPipe = ((p && p.stages) || []).filter((s) => s.stage !== "Sales Qualified");
    const sum = (k) => inPipe.length ? inPipe.reduce((a, s) => a + (s[k] || 0), 0) : null;
    return rows + `<tr style="font-weight:900"><td>Total in pipeline</td><td>${fmtN(sum("count"))}</td><td>${sum("amount") != null ? fmt$(sum("amount")) : "—"}</td><td>${fmtN(sum("entered"))}</td><td>${fmtN(sum("forward"))}</td><td>${fmtN(sum("back"))}</td></tr>`;
  };
  const moved = pipe.moved_deals || null, actProd = pipe.active_by_product || null;
  const movedBody = (moved && moved.length
      ? `<div class="tscroll"><table class="bd"><thead><tr><th>Deal</th><th>Pipeline</th><th>From → to</th><th>Amount</th><th>Company size</th><th>Last-touch converting campaign (before open)</th></tr></thead><tbody>${moved.map((x) => `<tr><td><a class="lnk" href="${x.url}" target="_blank" rel="noopener">${escapeHtml(x.name)} ↗</a></td><td>${x.pipeline || "—"}</td><td>${x.from || "—"} → ${x.to || "—"}</td><td>${fmt$(x.amount)}</td><td>${x.segment || "—"}</td><td>${escapeHtml(x.last_touch_campaign || "—")}</td></tr>`).join("")}</tbody></table></div>`
      : `<p class="data-empty">One row per deal that changed stage in the ISO week, linking to the HubSpot deal. ${moved ? "No deals moved this week." : "Fills in once the new pull runs."}</p>`)
    + `<p class="cap">The campaign comes from the deal's primary contact (last touch converting campaign as of the deal's create date). UTMs don't pass lead→deal today, so this is the working stand-in until attribution work lands.</p>`;
  const movedDz = rdDz("Deals that moved this week", moved ? `<b>${moved.length}</b> deals changed stage` : "stage change + last-touch campaign before the deal opened", movedBody, { cls: "inner" });
  const prodBody = actProd
    ? `<div class="tscroll"><table class="bd"><thead><tr><th>Product</th><th>Open deals</th><th>$ open</th></tr></thead><tbody>${RD_PROD.map(([k, l, c]) => `<tr><td><span class="dot" style="background:${c}"></span>${l}</td><td>${fmtN((actProd[k] || {}).count)}</td><td>${fmt$((actProd[k] || {}).amount)}</td></tr>`).join("")}<tr class="untagged"><td>Untagged</td><td>${fmtN((actProd.untagged || {}).count)}</td><td>${fmt$((actProd.untagged || {}).amount)}</td></tr></tbody></table></div><p class="cap">Deals tagged with more than one product count toward each.</p>`
    : `<p class="data-empty">Re-pulled for New Business, Account Growth and Renewal once the new pull runs.</p>`;
  const prodDz = rdDz("Open deals by product", "active pipelines only", prodBody, { cls: "inner" });
  const disp = last.disposition || {}, dispPrev = prev.disposition || {};
  const reasonTbl = (rows, k) => rows && rows.length
    ? (() => { const tot = rows.reduce((a, r) => a + r.count, 0); return rows.map((r) => `<tr><td>${r.reason}</td><td>${fmtN(r.count)}</td><td>${tot ? Math.round(r.count / tot * 100) + "%" : "—"}</td><td>${r.avg8 != null ? rdVsAvg(r.count, r.avg8).html : "—"}</td></tr>`).join(""); })()
    : `<tr class="untagged"><td colspan="4">Grouped by the ${k} reason on the lead. Top reasons first.</td></tr>`;
  const dqAvg = avgD("dq"), nuAvg = avgD("nurture");

  document.getElementById("view").innerHTML = `
    <div class="rd">
    <div class="rd-row" style="margin-bottom:2px"><span class="cap" style="margin:0">Compares to the prior ${base.length}-week average (${base.length ? `${base[0].label} – ${base[base.length - 1].label}` : "—"}) · <a href="#" class="lnk" id="rdToMonthly">Pipeline vs goal lives on Monthly ›</a></span></div>
    <p class="cap" style="margin:0 0 4px">${rdNeeds()} marks sections the weekly skill doesn't collect yet. Those show the layout only, with no numbers.</p>

    ${rdTier(1, "The read", "Written by the digest skill each run")}
    ${rdRead(last.read) || (last.note ? rdCtx(`Data note · ${last.label}`, last.note) : `<p class="cap">No summary for ${last.label || "this week"} yet.</p>`)}
    <div class="rd-grid g5" style="margin-top:12px">
      ${tile("hih", "HIH new", true)}${tile("mql", "MQLs")}${tile("sql", "SQLs")}${tile("opp", "Opps")}
      ${rdKpi({ label: "MQL → SQL", value: lastConv != null ? lastConv + "%" : "—", st: convSt[0], stLbl: convSt[1], delta: rdPts(lastConv, baseConv, ""), cmp: baseConv != null ? `avg ${baseConv}%` : "", spark: "rdW_conv" })}
    </div>

    <div id="sec-whih">${rdTier(1, "HIH this week", "Who's showing high intent")}</div>
    <div class="rd-grid g2">
      <div class="rd-card"><div class="rd-row"><div class="eyebrow">HIH by product · vs last week</div>${rdCov("Primary product per contact")}</div>
        ${rdBars(RD_PROD.map(([k, l, c]) => [l, g(bp, k, "hih"), c, g(bpp, k, "hih")]).sort((a, b) => (b[1] || 0) - (a[1] || 0)))}</div>
      <div class="rd-card"><div class="rd-row"><div class="eyebrow">HIH by company size · vs last week</div>${segHihAllZero ? rdCov("Not captured this run") : ""}</div>
        ${rdBars(RD_SEG.map(([k, l, c]) => [l, g(bs, k, "hih"), c, g(bsp, k, "hih")]))}
        ${segHihAllZero ? `<p class="cap">This run didn't record company size for HIH, so every row shows 0.</p>` : ""}</div>
    </div>
    <details class="rd-dz" id="rdHihDrill"><summary><span class="dt">HIH contacts this week</span><span class="ds"><b>${fmtN(f(last, "hih"))}</b> contacts · ${drillHih.length ? "open to see each HubSpot record" : "list not stored this run"}</span></summary>
      <div class="dbody">
        <p class="cap" style="margin-top:0">One row per contact: HubSpot record (access-gated), company size, source, product. No names or emails, because the repo is public.</p>
        ${drillHih.length ? `<div class="tscroll"><table><thead><tr><th>HubSpot record</th><th>Company size</th><th>Source</th><th>Product</th></tr></thead><tbody>${drillHih.map((r) => `<tr><td><a class="lnk" href="https://app.hubspot.com/contacts/4451852/record/0-1/${r[0]}" target="_blank" rel="noopener">Open contact ↗</a></td><td>${r[1] || '<span class="cap">untagged</span>'}</td><td>${r[2] || "—"}</td><td>${r[3] || "—"}</td></tr>`).join("")}</tbody></table></div>`
          : `<p class="data-empty">The ${last.label} run didn't store the contact list. It fills in on the next run.</p>`}
      </div></details>

    ${rdTier(2, "Trend", `Last ${w.length} weeks`)}
    <div class="rd-grid g2">
      <div class="rd-card"><div class="eyebrow">Funnel by week</div><div class="chartbox" style="height:230px"><canvas id="wFunnel"></canvas></div><p class="cap">HIH shaded, MQL and SQL as lines.</p></div>
      <div class="rd-card"><div class="eyebrow">MQL→SQL by week</div><div class="chartbox" style="height:230px"><canvas id="wConvRates"></canvas></div><p class="cap">Dashed line = ${base.length}-week average. Within-week stage entries, so read it as direction, not a cohort rate.</p></div>
    </div>

    <div id="sec-wseg">${rdTier(2, "By company size &amp; product", "This week · raw change vs last week")}</div>
    <div class="rd-grid g2">
      <div class="rd-card"><div class="rd-row"><div class="eyebrow">By company size</div>${rdCov(`Covers ${fmtN(tagged(bs, RD_SEG, "mql"))} of ${fmtN(f(last, "mql"))} MQLs`)}</div>
        <div class="tscroll"><table class="bd"><thead><tr><th>Segment</th><th>MQL</th><th>SQL</th><th>Opp</th><th>MQL→SQL</th></tr></thead><tbody>${segTbl}</tbody></table></div>
        <div class="chartbox" style="height:170px;margin-top:10px"><canvas id="wSegChart"></canvas></div></div>
      <div class="rd-card"><div class="rd-row"><div class="eyebrow">By product</div>${rdCov(`Covers ${fmtN(tagged(bp, RD_PROD, "mql"))} of ${fmtN(f(last, "mql"))} MQLs`)}</div>
        <div class="tscroll"><table class="bd"><thead><tr><th>Product</th><th>HIH</th><th>MQL</th><th>SQL</th><th>Opp</th></tr></thead><tbody>${prodTbl}</tbody></table></div>
        <div class="chartbox" style="height:170px;margin-top:10px"><canvas id="wProdChart"></canvas></div></div>
    </div>
    ${rdAbout("How these are counted", "Each contact counts under one primary product (priority Inkwell → IJ → World History → Great First 8). Company size is partially populated: unassigned contacts are excluded from the rows but included in the headline totals. Changes show as raw counts because weekly bases are small.")}

    <div id="sec-wtop">${rdTier(2, "Top converting pieces", "Form fills by offer this week", pieces ? "" : rdNeeds())}</div>
    <div class="rd-card">
      <div class="tscroll"><table class="bd"><thead><tr><th>Offer / form</th><th>Type</th><th>Product</th><th>Fills</th><th>vs 8-wk avg</th><th>New contacts</th><th>Became HIH</th><th>Became MQL</th></tr></thead><tbody>${piecesTbl || `<tr class="untagged"><td colspan="8">No offers yet.</td></tr>`}</tbody></table></div>
      ${pieces ? "" : `<p class="cap">Offer names come from the HubSpot content tags the skill already reads${ce ? ` (as of ${ce.as_of})` : ""}. Weekly counts fill in once the new pull runs.</p>`}
      ${rdAbout("Definition", "A fill is a HubSpot form submission in the ISO week, grouped by the offer's content tag. Became HIH / MQL counts fillers whose intent tier or lifecycle stage changed in the same week. Page-level conversion rates stay on the Content Performance tab.")}
    </div>

    <div id="sec-wpipe">${rdTier(2, "Open pipeline", `Active pipelines · snapshot ${pipe.as_of || ""} + movement this week`, hasMove ? "" : rdNeeds())}</div>
    <div class="rd-card">
      <div class="toolbar" style="margin:0 0 10px">${RD_PIPES.map(([k, l], i) => `<button class="chip ${i === 0 ? "on" : ""}" data-pipe="${k}">${l}</button>`).join("")}</div>
      ${RD_PIPES.map(([k, l], i) => `<div class="rd-pipe" data-pipe-body="${k}"${i ? " hidden" : ""}><div class="tscroll"><table class="bd"><thead><tr><th>${l} stage</th><th>Open deals</th><th>$ open</th><th>Entered this week</th><th>Moved forward</th><th>Moved back / lost</th></tr></thead><tbody>${stageRows(act && act[k])}</tbody></table></div></div>`).join("")}
      <p class="cap">Stages follow the RevOps source of truth. Sales Qualified is a booked meeting, not pipeline. Legacy District / School pipelines are hidden while RevOps finishes the migration.</p>
      ${movedDz}
      ${prodDz}
    </div>

    <div id="sec-wdisp">${rdTier(3, "Lead disposition", "Contacts leaving the active funnel this week")}</div>
    <div class="rd-card">
      <div class="rd-grid g2">
        ${rdMini("Disqualified (DQ)", fmtN(disp.dq), `${rdVsAvg(disp.dq, dqAvg, true).html} <span class="cmp">${dqAvg != null ? "avg " + Math.round(dqAvg) : ""}</span>`, "", "rdW_dq")}
        ${rdMini("Sent to nurture", fmtN(disp.nurture), `${rdVsAvg(disp.nurture, nuAvg).html} <span class="cmp">${nuAvg != null ? "avg " + Math.round(nuAvg) : ""}</span>`, "", "rdW_nu")}
      </div>
      ${rdDz("DQ reasons", disp.dq_reasons ? `top: <b>${escapeHtml((disp.dq_reasons[0] || {}).reason || "—")}</b>` : rdNeeds(), `<div class="tscroll"><table class="bd"><thead><tr><th>Reason</th><th>Contacts</th><th>Share</th><th>vs 8-wk avg</th></tr></thead><tbody>${reasonTbl(disp.dq_reasons, "disqualification")}</tbody></table></div>`, { cls: "inner" })}
      ${rdDz("Nurture reasons", disp.nurture_reasons ? `top: <b>${escapeHtml((disp.nurture_reasons[0] || {}).reason || "—")}</b>` : rdNeeds(), `<div class="tscroll"><table class="bd"><thead><tr><th>Reason</th><th>Contacts</th><th>Share</th><th>vs 8-wk avg</th></tr></thead><tbody>${reasonTbl(disp.nurture_reasons, "nurture")}</tbody></table></div>`, { cls: "inner" })}
      ${disp.by_product ? rdDz("DQ &amp; nurture by product", "product-tagged subset", dispositionProductTable(last) + `<p class="cap">Coverage runs lower here than on the funnel metrics, so these won't sum to the totals.</p>`, { cls: "inner" }) : ""}
      ${rdAbout("About disposition", "Disposition reflects lifecycle stage exits: contacts removed from active funnel consideration this week. High DQ weeks can point to list quality or targeting issues.")}
    </div>

    <div id="sec-wbrand">${rdTier(3, "Brand lift", "Google Search Console · how often people find us by searching")}</div>
    ${rdBrandBlock(d.brand_lift, "WoW", "wBrandLift")}

    <div id="sec-wref">${rdTier(4, "Reference", "")}</div>
    ${ce ? rdDz("Content engagement", `intent tiers + top content tags · as of ${ce.as_of || "—"}`, contentEngagementSection(ce)) : ""}
    ${rdDz("Weekly detail", `last ${w.length} weeks`, `<div class="tscroll"><table><thead><tr><th>Week of</th><th>HIH</th><th>MQL</th><th>SQL</th><th>Opp</th><th>MQL→SQL</th><th>DQ</th><th>Nurture</th></tr></thead><tbody>
      ${w.map((x, i) => `<tr${x.note ? ' class="has-note"' : ""}><td>${x.label}${x.note ? ` <span class="week-note-flag" title="${x.note.replace(/"/g, "&quot;")}">⚠</span>` : ""}</td><td>${fmtN(f(x, "hih"))}</td><td>${fmtN(f(x, "mql"))}</td><td>${fmtN(f(x, "sql"))}</td><td>${fmtN(f(x, "opp"))}</td><td>${conv[i] != null ? conv[i] + "%" : "—"}</td><td>${x.disposition ? fmtN(x.disposition.dq) : "—"}</td><td>${x.disposition ? fmtN(x.disposition.nurture) : "—"}</td></tr>`).join("")}
      </tbody></table></div>`)}
    ${rdDz("Data notes", `${last.label || ""} run note + method`, `${last.note ? `<p class="cap"><strong>${last.label}:</strong> ${last.note}</p>` : ""}${d.notes ? `<p class="cap">${d.notes}</p>` : ""}`)}
    </div>`;

  const toM = document.getElementById("rdToMonthly"); if (toM) toM.onclick = (e) => { e.preventDefault(); switchToTab("monthly"); };
  document.querySelectorAll(".chip[data-pipe]").forEach((b) => b.onclick = () => {
    document.querySelectorAll(".chip[data-pipe]").forEach((x) => x.classList.toggle("on", x === b));
    document.querySelectorAll("[data-pipe-body]").forEach((el) => { el.hidden = el.dataset.pipeBody !== b.dataset.pipe; });
  });

  buildJumpRail([
    { id: "sec-whih", label: "HIH" },
    { id: "sec-wseg", label: "Segments" },
    { id: "sec-wtop", label: "Top pieces" },
    { id: "sec-wpipe", label: "Pipeline" },
    { id: "sec-wdisp", label: "Disposition" },
    { id: "sec-wbrand", label: "Brand lift" },
    { id: "sec-wref", label: "Reference" },
  ]);

  const grid = { color: "rgba(20,71,69,0.08)" };
  ["hih", "mql", "sql", "opp"].forEach((s) => rdSpark(`rdW_${s}`, spk(s), s === "sql" ? PLUM : IJ));
  rdSpark("rdW_conv", w.slice(-9).map((x) => rate(f(x, "sql"), f(x, "mql"))), IJ);
  rdSpark("rdW_dq", w.slice(-9).map((x) => x.disposition ? x.disposition.dq : null), "#b3261e");
  rdSpark("rdW_nu", w.slice(-9).map((x) => x.disposition ? x.disposition.nurture : null), PLUM);

  rdBrandChart(d.brand_lift, "wBrandLift");

  mkChart("wFunnel", { type: "line", data: { labels, datasets: [
      { label: "HIH", data: w.map((x) => f(x, "hih")), borderColor: "#B1E0BB", backgroundColor: "rgba(177,224,187,0.35)", fill: true, borderWidth: 1.5, tension: 0.3, pointRadius: 0 },
      { label: "MQL", data: w.map((x) => f(x, "mql")), borderColor: IJ, borderWidth: 2.5, tension: 0.3, pointRadius: 2 },
      { label: "SQL", data: w.map((x) => f(x, "sql")), borderColor: PLUM, borderWidth: 2.5, tension: 0.3, pointRadius: 2 } ] },
    options: { maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { boxWidth: 10 } } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid, ticks: { maxTicksLimit: 5 } } } } });

  mkChart("wConvRates", { type: "line", data: { labels, datasets: [
      { data: conv, borderColor: IJ, backgroundColor: "rgba(20,71,69,0.08)", fill: true, borderWidth: 2.5, tension: 0.3, spanGaps: true, pointRadius: 3, pointBackgroundColor: IJ },
      rdBand(w.length, baseConv) ] },
    options: { maintainAspectRatio: false, layout: { padding: { top: 16 } }, plugins: { legend: { display: false }, rdLabels: { on: true, fmt: (v) => v + "%", hi: [w.length - 1] } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, max: 100, grid, ticks: { callback: (v) => v + "%", maxTicksLimit: 5 } } } } });

  const hbar = (id, rows, src) => mkChart(id, { type: "bar", data: { labels: rows.map(([, l]) => l), datasets: [
      { label: "MQL", data: rows.map(([k]) => g(src, k, "mql") || 0), backgroundColor: IJ },
      { label: "SQL", data: rows.map(([k]) => g(src, k, "sql") || 0), backgroundColor: PLUM } ] },
    options: { indexAxis: "y", maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { boxWidth: 10 } } }, scales: { x: { beginAtZero: true, grid, ticks: { maxTicksLimit: 5 } }, y: { grid: { display: false }, ticks: { autoSkip: false } } } } });
  hbar("wSegChart", RD_SEG, bs); hbar("wProdChart", RD_PROD, bp);
}

// ---- campaign tab ----
const GROUP_COLORS = { "Inquiry Journeys": IJ, "Inkwell": PLUM, "Always-on / brand": "#6B7B79", "Re-engagement / ABM": AMBER, "Great First Eight": ROSE };
const gColor = (g) => GROUP_COLORS[g] || "#6B7B79";

function renderCampaign(d) {
  charts.forEach((c) => c.destroy()); charts.length = 0;
  const months = d.months || [];
  if (!months.length) {
    document.getElementById("view").innerHTML = `
      <div class="panel"><h3>Campaign Health — awaiting first run</h3>
        <p class="insight">This tab populates on the next <strong>campaign-analytics-report</strong> run (monthly).</p>
        <p style="font-size:14px;color:#3a3a3a">Strategic groups tracked: ${(d.strategic_groups || []).map((g) => `<strong style="color:${gColor(g)}">${g}</strong>`).join(" · ")}.</p>
      </div>`;
    return;
  }

  const RAG_ORDER = { red: 0, amber: 1, green: 2, grey: 3 };
  const RAG_LABEL = { red: "Needs attention", amber: "Watching", green: "On track", grey: "Insufficient data" };
  const CHAN_ICON  = { content: "ti-book", event: "ti-presentation", paid: "ti-ad", nurture: "ti-mail", reengage: "ti-refresh", abm: "ti-target", social: "ti-antenna-bars-5", email: "ti-mail" };
  const CHAN_LABEL = { content: "Content", event: "Event", paid: "Paid", nurture: "Nurture", reengage: "Re-engage", abm: "ABM", social: "Social", email: "Email" };

  function campRag(c) {
    if ((c.total || 0) < 10) return "grey";
    const pct = c.hih_pct != null ? c.hih_pct : rate(c.hih, c.total);
    if (pct == null) return "grey";
    if (pct >= 20) return "green";
    if (pct >= 10) return "amber";
    return "red";
  }

  function campCard(c, benchPct) {
    const rag = campRag(c);
    const pct = c.hih_pct != null ? c.hih_pct : (rate(c.hih, c.total) ?? 0);
    const barW = Math.min(pct, 100).toFixed(1);
    const benchW = Math.min(benchPct, 100).toFixed(1);
    const icon = CHAN_ICON[c.channel_type] || "ti-chart-bar";
    const chanLbl = CHAN_LABEL[c.channel_type] || "";
    const flags = c.flags || [];
    const flagHtml = flags.length
      ? `<div class="cc-flag ${rag === "red" ? "red" : ""}">${flags.join(" · ")}</div>`
      : "";
    return `<div class="cc-card cc-${rag}">
      <div class="cc-status cc-status-${rag}"><span class="cc-dot cc-dot-${rag}"></span>${RAG_LABEL[rag]}</div>
      <div class="cc-head">
        <i class="ti ${icon} cc-icon" aria-hidden="true"></i>
        <span class="cc-name">${c.name}</span>
        ${chanLbl ? `<span class="cc-type-tag">${chanLbl}</span>` : ""}
      </div>
      ${rag !== "grey" ? `
      <div class="cc-hih-block">
        <div class="cc-hih-top">
          <div><span class="cc-hih-num">${fmtN(c.hih)}</span> <span class="cc-hih-sub">HIH leads</span></div>
          <span class="cc-hih-pct cc-hih-pct-${rag}">${pct.toFixed(1)}% HIH</span>
        </div>
        <div class="cc-bar-wrap">
          <div class="cc-bar-fill cc-bar-${rag}" style="width:${barW}%"></div>
          <div class="cc-bench" style="left:${benchW}%" title="${benchPct.toFixed(0)}% portfolio avg"></div>
        </div>
      </div>` : ""}
      <div class="cc-foot">
        <span><i class="ti ti-users" aria-hidden="true" style="font-size:12px;vertical-align:-1px;margin-right:3px"></i>${fmtN(c.total)} contacts${(c.total || 0) < 10 ? " · small" : ""}</span>
        <span>${fmtN(c.mql)} MQL ${deltaHTML(c.mql, c.mql_prior)}</span>
      </div>
      ${flagHtml}
    </div>`;
  }

  const last = months[months.length - 1], labels = months.map((m) => m.label);
  const groups = last.groups || [];
  const t = last.total || {};
  const grpTotal = (k) => groups.reduce((s, g) => s + (g[k] || 0), 0);
  const benchPct = t.hih_pct ?? rate(t.hih ?? grpTotal("hih"), t.contacts ?? grpTotal("contacts")) ?? 21;

  const camps = (last.campaigns || []).slice().sort((a, b) => RAG_ORDER[campRag(a)] - RAG_ORDER[campRag(b)]);
  const intentCamps = camps.filter((c) => c.intent && (c.total || 0) >= 100);

  const ragCounts = { red: 0, amber: 0, green: 0, grey: 0 };
  camps.forEach((c) => ragCounts[campRag(c)]++);

  const ragStrip = ["red", "amber", "green", "grey"].map((r) => ragCounts[r]
    ? `<div class="cc-pill cc-pill-${r}"><span class="cc-dot cc-dot-${r}"></span>${ragCounts[r]} ${RAG_LABEL[r]}</div>`
    : "").join("");

  document.getElementById("view").innerHTML = `
    ${last.verdict ? note("<strong>Verdict:</strong> " + last.verdict) : ""}
    <div class="cards">
      ${card("Active campaigns", fmtN(t.active_campaigns ?? camps.length))}
      ${card("Contacts touched", fmtN(t.contacts ?? grpTotal("contacts")))}
      ${card("HIH leads", fmtN(t.hih ?? grpTotal("hih")), "", "high-intent handraisers")}
      ${card("HIH share", (t.hih_pct ?? rate(t.hih ?? grpTotal("hih"), t.contacts ?? grpTotal("contacts"))) + "%")}
      ${card("MQLs", fmtN(t.mql ?? grpTotal("mql")), deltaHTML(t.mql, t.mql_prior, {label:"MoM"}))}
    </div>
    <div class="section-label">Status at a glance</div>
    <div class="cc-strip">${ragStrip}</div>
    ${groups.length ? `
    <div class="section-label">By strategic group — ${last.label}</div>
    <div class="panel" style="padding:0;overflow:auto">
      <table class="bd">
        <thead><tr><th>Group</th><th>Contacts</th><th>HIH</th><th>HIH%</th><th>MQL</th></tr></thead>
        <tbody>${groups.map((g) => {
          const gpct = g.hih_pct != null ? g.hih_pct : rate(g.hih, g.contacts);
          const grag = gpct == null ? "" : gpct >= 20 ? "cc-thr-green" : gpct >= 10 ? "cc-thr-amber" : "cc-thr-red";
          return `<tr>
            <td><span class="dot" style="background:${gColor(g.group)};display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px"></span>${g.group}</td>
            <td>${fmtN(g.contacts)}</td>
            <td>${fmtN(g.hih)}</td>
            <td><span class="${grag}" style="font-weight:600">${gpct != null ? gpct.toFixed(1) + "%" : "—"}</span></td>
            <td>${fmtN(g.mql)}</td>
          </tr>`;
        }).join("")}</tbody>
      </table>
    </div>` : ""}
    <div class="section-label">Campaign health — ${last.label}</div>
    <div class="cc-grid">${camps.map((c) => campCard(c, benchPct)).join("")}</div>
    <div class="cc-threshold">
      <strong>RAG thresholds (HIH% of contacts touched):</strong>
      <span class="cc-thr-green">Green ≥ 20%</span> ·
      <span class="cc-thr-amber">Amber 10–19%</span> ·
      <span class="cc-thr-red">Red &lt;10%</span> ·
      <span class="cc-thr-grey">Grey &lt;10 contacts</span> —
      benchmark line = ${benchPct.toFixed(0)}% portfolio average (${last.label})
    </div>
    <div class="grid2">
      <div class="panel"><h3>MQL trend <span class="muted">(all campaigns)</span></h3><div class="chartbox"><canvas id="cTrend"></canvas></div></div>
      ${intentCamps.length ? `<div class="panel"><h3>Intent distribution <span class="muted">(lists ≥100 contacts)</span></h3><div class="chartbox"><canvas id="cIntent"></canvas></div>
        ${note("High / Medium / Low intent tier per campaign. A list skewing High is a bright spot; skewing Low flags targeting or asset-tagging issues.")}</div>` : ""}
    </div>`;

  const noLeg = { plugins: { legend: { display: false } }, maintainAspectRatio: false };
  const botLeg = { plugins: { legend: { position: "bottom" } }, maintainAspectRatio: false };
  mkChart("cTrend", { type: "line", data: { labels, datasets: [{ label: "MQL", data: months.map((m) => m.total && m.total.mql), borderColor: IJ, backgroundColor: IJ_FADE, fill: true, tension: 0.25 }] }, options: { ...noLeg } });
  if (intentCamps.length) {
    mkChart("cIntent", { type: "bar", data: { labels: intentCamps.map((c) => c.name), datasets: [
        { label: "High", data: intentCamps.map((c) => c.intent.high), backgroundColor: IJ, stack: "i" },
        { label: "Medium", data: intentCamps.map((c) => c.intent.medium), backgroundColor: PLUM, stack: "i" },
        { label: "Low", data: intentCamps.map((c) => c.intent.low), backgroundColor: GREY, stack: "i" } ] },
      options: { ...botLeg, indexAxis: "y", scales: { x: { stacked: true, beginAtZero: true }, y: { stacked: true } } } });
  }
}

// ---- content performance tab ----
function renderContentPerformance(d) {
  charts.forEach((c) => c.destroy()); charts.length = 0;
  const weeks = d.weeks || [];
  if (!weeks.length) {
    document.getElementById("view").innerHTML = `
      <div class="panel"><h3>Content Performance: awaiting first run</h3>
        <p class="insight">This tab populates on the next weekly Dash refresh.</p>
      </div>`;
    return;
  }
  const last = weeks[weeks.length - 1];
  const pages = last.pages || [];
  const t = last.totals || {};
  const FLAG_LABEL = { gap: "Conversion gap", watch: "Watch", healthy: "Healthy" };
  const FLAG_CLASS = { gap: "cc-thr-red", watch: "cc-thr-amber", healthy: "cc-thr-green" };
  const TYPE_LABEL = { landing_page: "Landing page", blog_post: "Blog post", site_page: "Site page" };

  document.getElementById("view").innerHTML = `
    ${last.verdict ? note("<strong>Verdict:</strong> " + last.verdict) : ""}
    <div class="cards">
      ${card("Pages tracked", fmtN(t.pages_tracked))}
      ${card("Conversion gaps", fmtN(t.gap_count), "", "views ≥ " + fmtN(d.min_views_threshold) + ", under 0.5% conversion")}
      ${card("Watch", fmtN(t.watch_count), "", "0.5 to 2% conversion")}
      ${card("Healthy", fmtN(t.healthy_count), "", "2%+ conversion")}
    </div>
    <div class="section-label">Ranked by conversion rate. ${last.label}</div>
    <div class="panel" style="padding:0;overflow:auto">
      <table class="bd">
        <thead><tr><th>Page</th><th>Type</th><th>Views</th><th>Contacts</th><th>Conversion</th><th>Bounce</th><th>Status</th></tr></thead>
        <tbody>${pages.map((p) => `
          <tr>
            <td><a href="${p.url}" target="_blank" rel="noopener">${p.title}</a></td>
            <td>${TYPE_LABEL[p.content_type] || p.content_type}</td>
            <td>${fmtN(p.raw_views)}</td>
            <td>${fmtN(p.contacts)}</td>
            <td><span class="${FLAG_CLASS[p.flag]}">${p.conversion_rate_pct.toFixed(2)}%</span></td>
            <td>${p.bounce_rate_pct.toFixed(0)}%</td>
            <td><span class="${FLAG_CLASS[p.flag]}">${FLAG_LABEL[p.flag] || p.flag}</span></td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
    <div class="cc-threshold">
      <strong>Thresholds (contacts / views):</strong>
      <span class="cc-thr-red">Gap under 0.5%</span> ·
      <span class="cc-thr-amber">Watch 0.5-2%</span> ·
      <span class="cc-thr-green">Healthy 2%+</span>.
      Pages under ${fmtN(d.min_views_threshold)} views excluded as noise. ${d.excluded_note || ""}
    </div>`;
}

// ---- definitions tab ----
function renderDefinitions(d) {
  charts.forEach((c) => c.destroy()); charts.length = 0;
  document.getElementById("view").innerHTML = `
    ${renderPipelineStructure(d.pipeline_structure)}
    <div class="panel glossary">
      ${d.intro ? `<p class="insight">${d.intro}</p>` : ""}
      ${(d.sections || []).map((s) => `<h3>${s.heading}</h3><dl>${s.terms.map((t) => `<dt>${t.term}</dt><dd>${t.def}</dd>`).join("")}</dl>`).join("")}
    </div>`;
}

// ---- Pipeline & CRM Structure — visual Source of Truth (Definitions tab) ----
function poStageSVG(stages) {
  if (!stages || !stages.length) return "";
  const w = 148, h = 64, gap = 10, pad = 16;
  const totalW = stages.length * w + (stages.length - 1) * gap + pad * 2;
  const boxes = stages.map((s, i) => {
    const x = pad + i * (w + gap);
    const active = s.in_pipeline !== false;
    const fill = active ? "var(--iq-green)" : "var(--surface)";
    const stroke = active ? "var(--iq-green)" : "var(--line)";
    const textFill = active ? "#fff" : "var(--muted)";
    const label = s.name.length > 14 ? s.name.replace(" / ", " /\n") : s.name;
    const lines = label.split("\n");
    const lineY = lines.length > 1 ? [h/2 - 6, h/2 + 10] : [h/2 + 5];
    const textEls = lines.map((ln, li) => `<text x="${x + w/2}" y="${lineY[li]}" text-anchor="middle" font-size="12" font-weight="700" fill="${textFill}" font-family="var(--font)">${ln}</text>`).join("");
    const arrow = i < stages.length - 1 ? `<text x="${x + w + gap/2}" y="${h/2 + 5}" text-anchor="middle" font-size="16" fill="var(--muted)">→</text>` : "";
    const startFlag = s.start ? `<text x="${x + w/2}" y="${h + 16}" text-anchor="middle" font-size="10" font-weight="700" fill="var(--iq-green)">▲ pipeline starts</text>` : "";
    return `<g>
      <rect x="${x}" y="0" width="${w}" height="${h}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-dasharray="${active ? "0" : "4,3"}" />
      ${textEls}
      ${arrow}
      ${startFlag}
    </g>`;
  }).join("");
  return `<div class="po-stage-scroll"><svg viewBox="0 0 ${totalW} 90" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block;min-width:340px;">${boxes}</svg></div>`;
}

function poPipelineCard(p, kind) {
  return `<div class="po-card po-card-${kind}">
    <div class="po-card-name">${p.name}</div>
    <div class="po-card-id">${p.id}</div>
    <div class="po-card-note">${p.note || ""}</div>
  </div>`;
}

function renderPipelineStructure(ps) {
  if (!ps) return "";
  const pl = ps.pipelines || {};
  const fp = ps.forecast_plan || {};
  return `
  <div class="panel po-panel">
    <h3>📍 Pipeline &amp; CRM structure — Source of Truth <span class="muted" style="font-weight:400;font-size:12px;">(per RevOps · confirmed ${ps.updated || ""})</span></h3>
    <div class="po-overview">${ps.overview || ""}</div>

    <div class="po-subhead">Deal stages — where "pipeline" actually starts</div>
    ${poStageSVG(ps.stages)}

    <div class="po-subhead">Pipelines</div>
    <div class="po-legend">
      <span class="po-dot po-dot-active"></span> Active — counted in every marketing pipeline/revenue query
      <span class="po-dot po-dot-legacy"></span> Legacy — being retired, kept for historical continuity
      <span class="po-dot po-dot-excluded"></span> Excluded — never part of marketing pipeline reporting
    </div>
    <div class="po-pipelines">
      <div class="po-col">
        <div class="po-col-label po-col-label-active">Active</div>
        ${(pl.active || []).map((p) => poPipelineCard(p, "active")).join("")}
      </div>
      <div class="po-col">
        <div class="po-col-label po-col-label-legacy">Legacy — being retired</div>
        ${(pl.legacy || []).map((p) => poPipelineCard(p, "legacy")).join("")}
      </div>
      <div class="po-col">
        <div class="po-col-label po-col-label-excluded">Excluded</div>
        ${(pl.excluded || []).map((p) => poPipelineCard(p, "excluded")).join("")}
      </div>
    </div>

    <div class="po-subhead">Pipeline targets — where they'll come from</div>
    <div class="po-timeline">
      <div class="po-tl-step"><div class="po-tl-dot"></div><div class="po-tl-label">Today</div><div class="po-tl-text">${fp.today || ""}</div></div>
      <div class="po-tl-arrow">→</div>
      <div class="po-tl-step"><div class="po-tl-dot po-tl-dot-future"></div><div class="po-tl-label">~Nov 2026</div><div class="po-tl-text">${fp.next || ""}</div></div>
    </div>
    ${fp.future_model ? `${note(fp.future_model)}` : ""}

    ${ps.weighting_note ? note(ps.weighting_note) : ""}
    <p class="cap" style="margin-top:10px;">Source: ${ps.source || ""}</p>
  </div>`;
}

// ---- Account Pulse (MQA) tab ----
function renderAccountPulse(d) {
  charts.forEach(function(c) { c.destroy(); }); charts.length = 0;

  var fc = d.funnel_counts || {};
  var s1 = d.section1 || [];
  var s2 = d.section2 || [];
  var s3 = d.section3 || [];
  var s4 = d.section4 || [];
  var s5 = d.section5 || {};
  var hist = d.history || [];
  var hasHistory = hist.length >= 2;

  var weekOnePill = '<span class="delta flat">Week 1</span>';
  var weekOneOrDelta = function(cur, prev) {
    return (hasHistory && prev != null) ? deltaHTML(cur, prev, {label: 'WoW'}) : weekOnePill;
  };

  var hsLink = function(url, name) {
    return '<a href="' + url + '" target="_blank" rel="noopener" class="hs-link">' + name + '</a>';
  };
  var metaSmall = function(t) { return '<span class="meta-small">' + t + '</span>'; };

  // Section 1 rows
  var s1RowsHtml = function(rows) {
    return rows.map(function(r) {
      var stageBadge = r.stage + (r.stage_new ? ' <span class="badge-new">new</span>' : '');
      return '<tr><td>' + hsLink(r.hs_url, r.name) + metaSmall(r.segment + ' · ' + r.state + ' · ' + r.owner) + '</td>'
        + '<td>' + stageBadge + metaSmall(r.signal) + '</td>'
        + '<td>' + metaSmall(r.why) + '</td></tr>';
    }).join('');
  };

  // Section 2 cohort helper
  var cohortHtml = function(label, predicate, color) {
    var rows = s2.filter(predicate);
    if (!rows.length) return '';
    var rowsHtml = rows.map(function(r) {
      var coldStr = r.days_cold == null ? '<strong>never</strong>' : ('~' + fmtN(r.days_cold));
      var lastCampaign = r.last_campaign
        ? r.last_campaign
        : '<span class="placeholder-cell">—</span>';
      var dealContext = r.deal_context
        ? r.deal_context
        : '<span class="placeholder-cell">—</span>';
      return '<tr><td>' + hsLink(r.hs_url, r.name) + metaSmall(r.segment + ' · ' + r.state + ' · ' + r.owner) + '</td>'
        + '<td>' + metaSmall(r.signal) + '</td>'
        + '<td style="text-align:right;font-weight:700">' + coldStr + '</td>'
        + '<td>' + lastCampaign + '</td>'
        + '<td>' + dealContext + '</td></tr>';
    }).join('');
    return '<div class="pulse-cohort-hdr" style="border-left:3px solid ' + color + '">'
      + '<strong>' + label + '</strong> <span class="badge-count">' + rows.length + ' accounts</span> ' + weekOneOrDelta(rows.length, null)
      + '</div>'
      + '<table class="pulse-table"><thead><tr>'
      + '<th>District</th>'
      + '<th>Signal</th>'
      + '<th style="text-align:right">Days cold</th>'
      + '<th>Last campaign touched <span class="source-badge hs">HubSpot</span></th>'
      + '<th>Deal context / notes <span class="source-badge" style="background:rgba(106,62,154,0.09);color:#6a3e9a;border-color:rgba(106,62,154,0.2)">Starbridge</span></th>'
      + '</tr></thead>'
      + '<tbody>' + rowsHtml + '</tbody></table>';
  };

  // Section 3 rows with days bar
  var s3MaxDays = Math.max.apply(null, s3.map(function(r) { return r.days_engaged || 0; }).concat([1]));
  var s3RowsHtml = s3.map(function(r) {
    var pct = Math.round((r.days_engaged || 0) / s3MaxDays * 100);
    return '<tr><td>' + hsLink(r.hs_url, r.name) + metaSmall(r.segment + ' · ' + r.state) + '</td>'
      + '<td>' + metaSmall(r.signals) + '</td>'
      + '<td><div class="days-bar-wrap"><div class="days-bar" style="width:' + pct + '%"></div></div>' + metaSmall(r.days_engaged + ' days') + '</td>'
      + '<td>' + metaSmall(r.action) + '</td></tr>';
  }).join('');

  // Section 4 rows with bar + batch flag
  var BATCH_DATE = '2025-11-17';
  var batchCount = s4.filter(function(r) { return r.first_mqa_date === BATCH_DATE; }).length;
  var s4MaxDays = Math.max.apply(null, s4.map(function(r) { return r.days_mqa || 0; }).concat([1]));
  var s4RowsHtml = s4.map(function(r) {
    var pct = Math.round((r.days_mqa || 0) / s4MaxDays * 100);
    var isBatch = r.first_mqa_date === BATCH_DATE;
    var batchTag = isBatch ? ' <span class="batch-badge">11/17 batch</span>' : '';
    return '<tr' + (isBatch ? ' class="batch-row"' : '') + '>'
      + '<td>' + hsLink(r.hs_url, r.name) + metaSmall(r.segment + ' · ' + r.state + ' · last contact ' + r.last_contact) + batchTag + '</td>'
      + '<td>' + metaSmall(r.signal || '(no signal recorded)') + '</td>'
      + '<td style="text-align:right"><div class="days-bar-wrap"><div class="days-bar stale-bar" style="width:' + pct + '%"></div></div><strong>' + r.days_mqa + '</strong></td></tr>';
  }).join('');

  // Section 5 action cards
  var s5Html = '';
  if (s5.cmo) s5Html += '<div class="pulse-action-card"><div class="pulse-action-role" style="color:#0a7c4a">Marketing</div><div class="pulse-action-body">' + s5.cmo + '</div></div>';
  if (s5.sales) s5Html += '<div class="pulse-action-card"><div class="pulse-action-role" style="color:#c2540a">Sales</div><div class="pulse-action-body">' + s5.sales + '</div></div>';
  if (s5.marketing_ops) s5Html += '<div class="pulse-action-card"><div class="pulse-action-role" style="color:#0a5dc2">Marketing Ops</div><div class="pulse-action-body">' + s5.marketing_ops + '</div></div>';

  // Batch callout
  var batchCallout = batchCount >= 3
    ? '<div class="batch-callout">⚠️ <strong>' + batchCount + ' accounts share a first_mqa_date of ' + BATCH_DATE + '</strong> — likely a backfill or import event, not organic signal. These are highlighted below. Recommend: audit MQA scoring rules + tie to November import if one exists.</div>'
    : '';

  // Owner filter chips
  var owners = [];
  s1.forEach(function(r) { if (owners.indexOf(r.owner) === -1) owners.push(r.owner); });
  var ownerChips = owners.map(function(o) {
    return '<button class="chip" data-pf="owner" data-val="' + o + '">' + o.split(' ')[0] + '</button>';
  }).join('');

  var sectionHdr = function(label, color) {
    return '<div class="section-label" style="border-left:3px solid ' + color + ';padding-left:8px">' + label + '</div>';
  };

  var openDecisions = '<div class="open-decisions">'
    + '<div class="open-decision">'
    + '<div class="open-decision-icon">🔌</div>'
    + '<div class="open-decision-body">'
    + '<div class="open-decision-label">Open integration</div>'
    + '<strong>Starbridge not yet connected.</strong> This tab currently pulls from a static JSON snapshot. Once the Starbridge MCP is wired in, the page will pull live HubSpot account data on load — stages, signals, owner, last contact — without a manual skill run each week. Kelsey is working on getting the Starbridge MCP download working locally.'
    + '</div></div>'
    + '<div class="open-decision">'
    + '<div class="open-decision-icon">🗂️</div>'
    + '<div class="open-decision-body">'
    + '<div class="open-decision-label">Open decision</div>'
    + '<strong>MQA definition needs revisiting.</strong> The current Aware / Engaged / MQA stage logic was built by Nick and lives in HubSpot lists — but the scoring criteria haven\'t been revalidated to reflect how we think about account intent today. Before this dashboard becomes a GTM tool, marketing + Kelsey need to audit the list rules, confirm which signals belong at each stage, and decide whether Starbridge or GA4 signals should supplement or replace the current HubSpot-only scoring. Tim is the HubSpot list owner.'
    + '</div></div>'
    + '<div class="open-decision">'
    + '<div class="open-decision-icon">🪣</div>'
    + '<div class="open-decision-body">'
    + '<div class="open-decision-label">Needs validation</div>'
    + '<strong>Account buckets need spot-checking before we act on them.</strong> The Hot+Cold, Warming, and Stale MQA buckets are signal-based but haven\'t been validated against actual account activity and history. Before using these buckets to drive outreach or demotion decisions, we should pull a sample from each and check HubSpot activity logs, deal history, and sequence enrollment to confirm the bucketing logic holds up in practice.'
    + '</div></div>'
    + '<div class="open-decision">'
    + '<div class="open-decision-icon">🤝</div>'
    + '<div class="open-decision-body">'
    + '<div class="open-decision-label">Needs workshopping</div>'
    + '<strong>Marketing vs. Sales action ownership on accounts is unresolved.</strong> The "Three Things" section and suggested actions throughout this dashboard assign work to Marketing or Sales — but we haven\'t aligned as a team on who owns what at each stage, when marketing hands off vs. supports, or how to avoid duplicate outreach. This needs a collaborative session before we move into execution.'
    + '</div></div>'
    + '</div>';

  document.getElementById('view').innerHTML =
    openDecisions

    // Trend strip
    + sectionHdr('★ This week at a glance <span class="muted">(WoW Δ collects after 2+ snapshots)</span>', '#0a7c4a')
    + '<div class="cards">'
    + card('New MQAs (7d)', fmtN(fc.new_mqa_7d), weekOneOrDelta(fc.new_mqa_7d, null), 'MQA stage reached this week')
    + card('Hot + Cold flagged', fmtN(fc.hot_cold_flagged), weekOneOrDelta(fc.hot_cold_flagged, null), 'MQA + high-intent + 60d+ cold')
    + card('Warming accounts', fmtN(fc.warming_2plus_signals), weekOneOrDelta(fc.warming_2plus_signals, null), 'Engaged + 2+ signals')
    + card('Stale MQAs (120d+)', fmtN(fc.stale_mqa_120d_no_opp), weekOneOrDelta(fc.stale_mqa_120d_no_opp, null), 'MQA, no opp, 120+ days')
    + '</div>'

    // Section 1
    + sectionHdr('1. What Changed This Week <span class="muted">(last 7 days · ' + s1.length + ' accounts)</span>', '#0a7c4a')
    + '<div class="panel">'
    + '<div class="pulse-filter-bar">'
    + '<span class="tlabel">Stage:</span>'
    + '<button class="chip on" data-pf="stage" data-val="all">All</button>'
    + '<button class="chip" data-pf="stage" data-val="MQA">New MQA</button>'
    + '<button class="chip" data-pf="stage" data-val="Engaged">New Engaged</button>'
    + '<span class="tlabel" style="margin-left:10px">Owner:</span>'
    + '<button class="chip on" data-pf="owner" data-val="all">All</button>'
    + ownerChips
    + '</div>'
    + note('📍 All ' + s1.length + ' movers are NJ/NY/MN districts owned by <b>Anne Matz</b>. Two are net-new MQAs; ten are Engaged-stage triggers from one DL fire on 4/25. Pressure-test: pull the source DL and check unique vs. repeat opens before reading this as broad pipeline growth.')
    + '<table class="pulse-table"><thead><tr><th style="width:40%">District</th><th style="width:28%">Stage / Signal</th><th>Why it matters</th></tr></thead>'
    + '<tbody id="s1Tbody">' + s1RowsHtml(s1) + '</tbody></table>'
    + '</div>'

    // Section 2
    + sectionHdr('2. Hot Signal + Cold Outreach <span class="muted">(top 15 of ' + fmtN(fc.hot_cold_flagged) + ' flagged)</span>', '#c2540a')
    + '<div class="panel">'
    + note('⚠️ MQA-stage accounts with high-intent signals and 60+ days since last contact. Sorted by days cold, descending. +14 more accounts in HubSpot (60–125 days cold).')
    + cohortHtml('Never contacted', function(r) { return r.days_cold == null; }, '#b3261e')
    + cohortHtml('› 365 days cold — multi-year', function(r) { return r.days_cold != null && r.days_cold >= 365; }, '#c2540a')
    + cohortHtml('180–365 days cold', function(r) { return r.days_cold != null && r.days_cold >= 180 && r.days_cold < 365; }, '#f59e0b')
    + cohortHtml('60–180 days cold', function(r) { return r.days_cold != null && r.days_cold >= 60 && r.days_cold < 180; }, '#1C2660')
    + '</div>'

    // Section 3
    + sectionHdr('3. Warming Accounts <span class="muted">(Engaged + 2+ signals · ' + s3.length + ' accounts)</span>', '#0a5dc2')
    + '<div class="panel">'
    + note('One signal away from MQA. Marketing should accelerate, not wait. Bar = relative days in Engaged — longer = more urgency.')
    + '<table class="pulse-table"><thead><tr><th style="width:32%">District</th><th style="width:26%">Signals</th><th style="width:16%">Days Engaged</th><th>Suggested action</th></tr></thead>'
    + '<tbody>' + s3RowsHtml + '</tbody></table>'
    + '</div>'

    // Section 4
    + sectionHdr('4. Stale MQAs <span class="muted">(120+ days, no opp · ' + s4.length + ' accounts)</span>', '#6a3e9a')
    + '<div class="panel">'
    + note('These have been MQA for a long time — should they be demoted, re-engaged, or escalated?')
    + batchCallout
    + '<table class="pulse-table"><thead><tr><th style="width:44%">District</th><th style="width:32%">Signal</th><th style="text-align:right">Days MQA</th></tr></thead>'
    + '<tbody>' + s4RowsHtml + '</tbody></table>'
    + '</div>'

    // Section 5
    + sectionHdr('5. Three Things to Do This Week', '#0a7c4a')
    + '<div class="pulse-actions">' + s5Html + '</div>'

    + '<p class="flag" style="margin-top:4px">'
    + 'Source: HubSpot portal 4451852 · '
    + (hist.length >= 1 ? 'History: ' + hist.length + ' snapshot' + (hist.length > 1 ? 's' : '') + ' — WoW Δ appears after 2 snapshots.' : 'Week 1 of history — WoW Δ will appear next week after the pulse-history-tracker skill runs.')
    + '</p>';

  // Wire filter pills
  var pulseFilter = { stage: 'all', owner: 'all' };
  document.querySelectorAll('[data-pf]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var dim = btn.getAttribute('data-pf');
      var val = btn.getAttribute('data-val');
      pulseFilter[dim] = val;
      document.querySelectorAll('[data-pf="' + dim + '"]').forEach(function(b) {
        b.classList.toggle('on', b.getAttribute('data-val') === val);
      });
      var filtered = s1.filter(function(r) {
        return (pulseFilter.stage === 'all' || r.stage === pulseFilter.stage)
          && (pulseFilter.owner === 'all' || r.owner === pulseFilter.owner);
      });
      document.getElementById('s1Tbody').innerHTML = s1RowsHtml(filtered);
    });
  });
}

// ---- State Signal (MQA) tab ----
const SS_FIPS = {"01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT","10":"DE","11":"DC","12":"FL","13":"GA","15":"HI","16":"ID","17":"IL","18":"IN","19":"IA","20":"KS","21":"KY","22":"LA","23":"ME","24":"MD","25":"MA","26":"MI","27":"MN","28":"MS","29":"MO","30":"MT","31":"NE","32":"NV","33":"NH","34":"NJ","35":"NM","36":"NY","37":"NC","38":"ND","39":"OH","40":"OK","41":"OR","42":"PA","44":"RI","45":"SC","46":"SD","47":"TN","48":"TX","49":"UT","50":"VT","51":"VA","53":"WA","54":"WV","55":"WI","56":"WY"};
const SS_LABELS = {ij:"Inquiry Journeys", inkwell:"Inkwell", gf8:"Great First 8"};
const SS_COLORS = {ij:"#144745", inkwell:"#5B5A9E", gf8:"#F99792"};
const SS_TIER_LABELS = {act_now:"High", watch:"Medium", low_priority:"Low"};
const SS_TIER_MAP_OPACITY = {act_now:0.9, watch:0.45, low_priority:0.18};
let SS_TOPO_CACHE = null;
function ssLoadUsTopo() {
  if (SS_TOPO_CACHE) return Promise.resolve(SS_TOPO_CACHE);
  return fetch("data/us-states-albers-10m.json", { cache: "no-store" }).then((r) => r.json()).then((topo) => {
    const fc = topojson.feature(topo, topo.objects.states);
    const ringPath = (ring) => "M" + ring.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join("L") + "Z";
    const geomPath = (g) => g.type === "Polygon" ? g.coordinates.map(ringPath).join(" ")
      : g.type === "MultiPolygon" ? g.coordinates.map((poly) => poly.map(ringPath).join(" ")).join(" ") : "";
    SS_TOPO_CACHE = fc.features.map((f) => ({ abbr: SS_FIPS[f.id], name: f.properties.name, d: geomPath(f.geometry) })).filter((f) => f.abbr);
    return SS_TOPO_CACHE;
  });
}

function renderStateSignal(d) {
  charts.forEach(function(c) { c.destroy(); }); charts.length = 0;
  let ssProduct = "all";
  let ssSortMkt = "score"; // 'score' (priority score, desc) | 'alpha'
  let ssSortSales = "actionable"; // 'actionable' (desc) | 'alpha'

  // Actioned / Not Interested triage decisions, keyed "STATE-product" (e.g. "CA-inkwell").
  // Fetched once per tab load from the Decisions Airtable (via a Netlify function proxy)
  // and merged client-side onto the top_states/watch_states rows — never written on load,
  // only read. Shared across everyone who opens the dashboard (not localStorage).
  let decisionsMap = {};
  const ssDecisionKey = (state, product) => `${state}-${product}`;

  function decisionBadge(state, product) {
    const rec = decisionsMap[ssDecisionKey(state, product)];
    const dec = rec && rec.decision;
    if (dec === 'Actioned') return `<span class="ss-dec-badge ss-dec-badge-actioned"${rec.notes ? ` title="${escapeHtml(rec.notes)}"` : ''}>✓ Actioned</span>`;
    if (dec === 'Not Interested') return `<span class="ss-dec-badge ss-dec-badge-not"${rec.notes ? ` title="${escapeHtml(rec.notes)}"` : ''}>✕ Not interested</span>`;
    return '<span class="meta-small">—</span>';
  }

  function refreshAllDecisionBadges() {
    document.querySelectorAll('#view .ss-dec-cell[data-dec-key]').forEach((cell) => {
      const key = cell.getAttribute('data-dec-key');
      const sep = key.indexOf('-');
      cell.innerHTML = decisionBadge(key.slice(0, sep), key.slice(sep + 1));
    });
  }

  function decisionControlHtml(state, product) {
    const rec = decisionsMap[ssDecisionKey(state, product)] || {};
    const dec = rec.decision || '';
    const notes = rec.notes || '';
    const savedLine = rec.decidedAt ? `<span class="ss-dec-meta">Last set ${rec.decidedAt}${rec.decidedBy ? ' · ' + escapeHtml(rec.decidedBy) : ''}</span>` : '';
    return `<div class="ss-dec-panel" data-dec-state="${state}" data-dec-product="${product}">`
      + `<div class="ss-dec-label">Triage — ${state} × ${SS_LABELS[product] || product}</div>`
      + `<div class="ss-dec-btns">`
      + `<button type="button" class="ss-dec-btn ss-dec-btn-actioned${dec === 'Actioned' ? ' on' : ''}" data-dec-action="Actioned">✓ Actioned</button>`
      + `<button type="button" class="ss-dec-btn ss-dec-btn-not${dec === 'Not Interested' ? ' on' : ''}" data-dec-action="Not Interested">✕ Not interested</button>`
      + `<button type="button" class="ss-dec-btn ss-dec-btn-clear" data-dec-action="">Clear</button>`
      + `<span class="ss-dec-status" data-dec-status></span>`
      + `</div>`
      + `<textarea class="ss-dec-notes" data-dec-notes placeholder="Notes (optional) — why actioned / not interested, who followed up, etc.">${escapeHtml(notes)}</textarea>`
      + savedLine
      + `</div>`;
  }

  function wireDecisionPanel(container, state, product) {
    const panel = container.querySelector('.ss-dec-panel');
    if (!panel) return;
    const statusEl = panel.querySelector('[data-dec-status]');
    const notesEl = panel.querySelector('[data-dec-notes]');

    function setStatus(text, isErr) {
      statusEl.textContent = text;
      statusEl.style.color = isErr ? 'var(--down)' : 'var(--muted)';
    }

    async function saveDecision(decision) {
      setStatus('Saving…');
      try {
        const res = await fetch('/.netlify/functions/set-decision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state, product, decision, notes: notesEl.value })
        });
        if (!res.ok) throw new Error('save failed: ' + res.status);
        const row = await res.json();
        decisionsMap[ssDecisionKey(state, product)] = row;
        panel.querySelectorAll('.ss-dec-btn').forEach((b) => b.classList.remove('on'));
        const activeBtn = panel.querySelector(`[data-dec-action="${decision}"]`);
        if (activeBtn) activeBtn.classList.add('on');
        refreshAllDecisionBadges();
        setStatus('Saved ✓');
      } catch (e) {
        setStatus('Could not save — try again', true);
      }
    }

    panel.querySelectorAll('[data-dec-action]').forEach((btn) => {
      btn.addEventListener('click', () => saveDecision(btn.getAttribute('data-dec-action')));
    });
    notesEl.addEventListener('blur', () => {
      const currentDec = (decisionsMap[ssDecisionKey(state, product)] || {}).decision || '';
      saveDecision(currentDec);
    });
  }

  function loadDecisions() {
    fetch('/.netlify/functions/get-decisions', { cache: 'no-store' })
      .then((r) => r.json())
      .then((payload) => {
        (payload.decisions || []).forEach((row) => { decisionsMap[ssDecisionKey(row.state, row.product)] = row; });
        refreshAllDecisionBadges();
      })
      .catch(() => { /* triage badges just stay blank — everything else on the tab still works */ });
  }

  const nt = d.national_totals || {};
  const topStates = d.top_states || [];
  const watchStates = d.watch_states || [];
  const accountsByState = d.accounts_by_state || {};
  const policyByState = d.policy_context || {};
  const pastCampaigns = d.past_campaigns || [];
  const flags = d.data_flags || [];

  const warmByState = d.warm_signals_by_state || {};

  const ssDot = (prod) => `<span class="ss-dot" style="background:${SS_COLORS[prod] || '#999'}"></span>${SS_LABELS[prod] || prod || '—'}`;
  const hsLink = (url, name) => `<a href="${url}" target="_blank" rel="noopener" class="hs-link">${name || '(unnamed record)'}</a>`;
  const metaSmall = (t) => `<span class="meta-small">${t}</span>`;
  const sectionHdr = (label, color) => `<div class="section-label" style="border-left:3px solid ${color};padding-left:8px">${label}</div>`;
  const srcLinks = (sources) => (sources || []).map((s) => `<a href="${s.url}" target="_blank" rel="noopener">${s.title} ↗</a>`).join(' · ');

  // Warm Signals (Starbridge board-meeting bridges) — shared rendering for a single entry
  function warmEntryHtml(w) {
    const statusClass = (w.status || '').toLowerCase();
    const relevance = (w.relevance || []).map((r) => `<li>${r}</li>`).join('');
    return `<div class="ss-warm-block">`
      + `<div class="ss-warm-head"><span class="ss-warm-label">📋 Board meeting signal — ${SS_LABELS[w.product] || w.product}</span>`
      + `<span class="ss-warm-score">Score ${w.score}</span></div>`
      + `<div class="ss-warm-meeting">${w.meeting || ''}</div>`
      + `<div class="ss-warm-date">${w.posted_date ? 'meeting posted ' + w.posted_date : ''} <span class="ss-warm-status ${statusClass}">${w.status}</span></div>`
      + (relevance ? `<div class="ss-warm-sub">Summarized relevance</div><ul>${relevance}</ul>` : '')
      + (w.talking_points ? `<div class="ss-warm-sub">Sales talking points</div><div class="ss-warm-talk">${w.talking_points}</div>` : '')
      + `<div class="ss-warm-cite">Source: Starbridge bridge <code>${w.source_bridge}</code>, pulled live via listBridgeRows on 2026-09-22 (Status New/Saved, Meeting Score ≥ 10 — displayed as-is).</div>`
      + `</div>`;
  }

  // The state-level "beyond accounts" Warm Signals block — only shows rows not already
  // surfaced by an account-level match, so a state's drawer never repeats the same signal twice.
  function warmStateBlockHtml(state, alreadyShownBuyers) {
    const w = warmByState[state];
    if (!w || !w.top || !w.top.length) return '';
    const extra = w.top.filter((row) => !alreadyShownBuyers.has(row.buyer));
    if (!extra.length) return '';
    return `<div class="ss-warm-state-block"><div class="ss-wa-label">Board activity flagged via Warm Signals — ${extra.length} district${extra.length > 1 ? 's' : ''} not yet on the account list above</div>`
      + extra.map(warmEntryHtml).join('')
      + `</div>`;
  }

  function draftEmail(acct, policy, product) {
    const prodLabel = SS_LABELS[product] || product;
    const why = acct.signal ? acct.signal.replace(/;/g, ', ') : 'recent engagement with ' + prodLabel;
    const policyLine = policy ? ` ${policy.headline}` : '';
    const subject = `Following up — ${prodLabel} at ${acct.name}`;
    const body = `Hi [Name],\n\nI saw ${acct.name} has an active signal on ${prodLabel} (${why}).${policyLine ? '\n\n' + policyLine.trim() : ''}\n\nDo you have 20 minutes this week or next to talk through what your team needs?\n\nBest,\n[Sales rep name]\ninquirED`;
    return {subject, body};
  }

  function usMapSvg(product, features) {
    const topSet = {}; topStates.forEach((s) => { topSet[s.state] = s; });
    // Only states that actually render a row in the Marketing table right now (Act now / Watch
    // tier) get highlighted — a Low priority watch state has no row below it, so it renders as
    // "no signal yet" gray, same as any other state with nothing to show.
    const watchSet = {}; watchStates.filter((s) => marketingTierOk(s.priority_tier)).forEach((s) => { watchSet[s.state] = s; });
    const paths = features.map((f) => {
      const top = topSet[f.abbr], watch = watchSet[f.abbr];
      let fill = "var(--line)", opacity = 1, title = f.name + ": no state policy signal identified yet";
      if (top && (product === "all" || top.product === product)) {
        fill = SS_COLORS[top.product] || "#999"; opacity = 1;
        title = `${f.name}: sales-ready signal (${SS_LABELS[top.product]}) - #${top.rank}, ${top.actionable} actionable accounts`;
      } else if (watch && (product === "all" || watch.product === product)) {
        fill = SS_COLORS[watch.product] || "#999";
        opacity = SS_TIER_MAP_OPACITY[watch.priority_tier] ?? 0.45;
        title = `${f.name}: ${SS_TIER_LABELS[watch.priority_tier] || "state to watch"} (${SS_LABELS[watch.product]}) - signal since ${watch.since}, ${watch.actionable} actionable accounts already in HubSpot`
          + (watch.starbridge_open_rfps > 0 ? `, ${watch.starbridge_open_rfps} open Starbridge RFP${watch.starbridge_open_rfps > 1 ? "s" : ""}` : "");
      }
      return `<path class="ss-us-state" data-state="${f.abbr}" d="${f.d}" fill="${fill}" fill-opacity="${opacity}"><title>${title}</title></path>`;
    }).join("");
    return `<svg viewBox="0 0 960 600" style="width:100%;height:auto;display:block;">${paths}</svg>`;
  }

  // A state only counts toward the Marketing table (and the map highlight) if it's Act now or
  // Watch tier — Low priority is dropped from both, per the redesign (41 -> 14 rows).
  function marketingTierOk(tier) { return tier === 'act_now' || tier === 'watch'; }
  function marketingRows(product) {
    return watchStates.filter((s) => (product === 'all' || s.product === product) && marketingTierOk(s.priority_tier));
  }

  function topStatesTable(product, sortMode) {
    let rows = topStates.filter((s) => product === 'all' || s.product === product);
    if (!rows.length) return '<p class="insight">No state policy signal identified for this product yet.</p>';
    rows = rows.slice().sort((a, b) => sortMode === 'alpha' ? a.state.localeCompare(b.state) : b.actionable - a.actionable);
    const body = rows.map((s) => `<tr class="ss-rank" data-state="${s.state}" data-product="${s.product}"><td>${s.state}</td><td>${ssDot(s.product)}</td><td style="text-align:right">${fmtN(s.qualified)}</td><td style="text-align:right"><strong>${fmtN(s.actionable)}</strong></td><td class="ss-dec-cell" data-dec-key="${ssDecisionKey(s.state, s.product)}">${decisionBadge(s.state, s.product)}</td></tr><tr class="ss-drawer-row"><td colspan="5"></td></tr>`).join('');
    return `<table class="ss-dash"><thead><tr><th>State</th><th>Strongest signal</th><th>Qualified</th><th>Actionable</th><th>Decision</th></tr></thead><tbody id="ssTopBody">${body}</tbody></table>`;
  }

  function watchStatesTable(product, sortMode) {
    let rows = marketingRows(product);
    if (!rows.length) return '<p class="insight">No watch-list state identified for this product yet.</p>';
    rows = rows.slice().sort((a, b) => sortMode === 'alpha' ? a.state.localeCompare(b.state) : b.priority_score - a.priority_score);
    const body = rows.map((s) => {
      const rfpBadge = s.starbridge_open_rfps > 0 ? `<span class="ss-rfp-badge">${s.starbridge_open_rfps} open RFP${s.starbridge_open_rfps > 1 ? 's' : ''}</span>` : '<span class="meta-small">—</span>';
      const tierBadge = s.priority_tier ? `<span class="ss-tier-badge ss-tier-${s.priority_tier}">${SS_TIER_LABELS[s.priority_tier] || s.priority_tier}</span>` : '<span class="meta-small">—</span>';
      return `<tr class="ss-rank ss-watch-row" data-wstate="${s.state}" data-product="${s.product}"><td>${s.state}</td><td>${tierBadge}</td><td>${ssDot(s.product)}</td><td style="text-align:right">${fmtN(s.qualified)}</td><td style="text-align:right">${fmtN(s.actionable)}</td><td style="text-align:right">${rfpBadge}</td><td>${s.since}</td><td class="ss-dec-cell" data-dec-key="${ssDecisionKey(s.state, s.product)}">${decisionBadge(s.state, s.product)}</td></tr><tr class="ss-drawer-row"><td colspan="8"></td></tr>`;
    }).join('');
    return `<table class="ss-dash"><thead><tr><th>State</th><th>Priority</th><th>Product</th><th>Qualified</th><th>Actionable</th><th>Starbridge</th><th>Signal since</th><th>Decision</th></tr></thead><tbody id="ssWatchBody">${body}</tbody></table>`;
  }

  function stateDetailHtml(s) {
    const policy = policyByState[s.state];
    const accts = accountsByState[s.state] || [];
    let html = decisionControlHtml(s.state, s.product);
    if (policy) {
      html += `<div class="ss-state-ctx"><div class="ss-sc-label">State policy signal: ${s.state}</div>`
        + `<div class="ss-sc-item">→ ${policy.headline} <span class="ss-sc-src">(${policy.since})</span></div>`
        + `<div class="ss-sc-item" style="color:var(--muted)">${policy.detail || ''}</div>`
        + `<div class="ss-sc-item">Sources: ${srcLinks(policy.sources)}</div></div>`;
    }
    const shownBuyers = new Set();
    if (!accts.length) {
      html += '<p class="insight" style="margin:10px 16px">No account-level drill-down pulled for this state.</p>';
    } else {
      html += accts.map((a) => {
        const em = draftEmail(a, policy, s.product);
        const warmBadge = a.warm_signal ? '<span class="ss-warm-badge">🔥 warm signal</span>' : '';
        if (a.warm_signal) shownBuyers.add(a.warm_signal.buyer);
        return `<details class="ss-drill"><summary>${a.name} — ${a.stage}, ${a.last_contacted ? 'no contact since ' + a.last_contacted : 'never contacted'}${warmBadge}</summary>`
          + `<div class="ss-contact-row">${hsLink(a.hs_url, 'HubSpot record')}<span class="ss-cwhy">${(a.segment || '—')} · ${a.owner} · ${a.signal || '(no signal recorded)'}</span></div>`
          + (a.warm_signal ? warmEntryHtml(a.warm_signal) : '')
          + `<div class="ss-email-draft"><div class="ss-em-label">Drafted starting point — personalize before sending</div>`
          + `<div class="ss-em-subject">Subject: ${em.subject}</div><div class="ss-em-body">${em.body}</div></div></details>`;
      }).join('');
    }
    html += warmStateBlockHtml(s.state, shownBuyers);
    return html;
  }

  function watchDetailHtml(s) {
    const policy = watchStates.find((w) => w.state === s.state) || s;
    const sb = (d.starbridge_by_state || {})[s.state];
    let html = decisionControlHtml(s.state, s.product);
    html += `<div class="ss-state-ctx"><div class="ss-sc-label">State context: ${s.state}</div>`
      + `<div class="ss-sc-item">→ ${policy.headline} <span class="ss-sc-src">(since ${policy.since})</span></div>`
      + `<div class="ss-sc-item">Sources: ${srcLinks(policy.sources)}</div></div>`;
    if (sb && sb.open_rfps_total > 0) {
      html += `<div class="ss-watch-action"><div class="ss-wa-label">Starbridge — ${sb.open_rfps_total} open RFP${sb.open_rfps_total > 1 ? 's' : ''} right now</div>`
        + sb.top.map((r) => `<p style="margin:4px 0;font-size:12.5px"><strong>${r.buyer || 'Unnamed buyer'}</strong> (${SS_LABELS[r.product] || r.product}, match ${r.score}/5, due ${r.due || 'n/a'}) — ${r.summary || ''} ${r.url ? `<a href="${r.url}" target="_blank" rel="noopener">source ↗</a>` : ''}</p>`).join('')
        + '</div>';
    }
    html += warmStateBlockHtml(s.state, new Set());
    html += `<div class="ss-watch-action"><div class="ss-wa-label">Existing HubSpot footprint</div>`
      + `<p style="margin:0;font-size:12.5px">${fmtN(s.qualified)} qualified / ${fmtN(s.actionable)} actionable accounts already in the CRM for ${s.state} — this reads as an expansion play (existing relationship to build on), not a cold start.</p></div>`;
    html += `<div class="ss-watch-action"><div class="ss-wa-label">Marketing action needed, before Sales has anyone to call on ${SS_LABELS[s.product]}</div><ol>`
      + (d.outreach_playbook || []).map((a) => `<li>${a}</li>`).join('') + '</ol></div>';
    return html;
  }

  function campaignsTable() {
    if (!pastCampaigns.length) return '<p class="insight">No measured account-driven campaigns on record yet.</p>';
    const body = pastCampaigns.map((c) => `<tr>`
      + `<td>${c.state_label}</td><td>${ssDot(c.product)}</td><td>${c.campaign_date}</td>`
      + `<td>${c.open_rate}</td><td>${c.ctr}</td>`
      + `<td><ul>${(c.deal_metrics || []).map((m) => `<li>${m}</li>`).join('')}</ul></td>`
      + `<td><ul>${(c.takeaways || []).map((t) => `<li>${t}</li>`).join('')}</ul></td></tr>`).join('');
    return `<table class="ss-dash" style="font-size:12.5px"><thead><tr><th style="text-align:left">State</th><th style="text-align:left">Product</th><th style="text-align:left">Campaign date</th><th style="text-align:left">Open rate</th><th style="text-align:left">CTR</th><th style="text-align:left">Deal metrics</th><th style="text-align:left">Key takeaways</th></tr></thead><tbody>${body}</tbody></table>`;
  }

  // Opens/closes the inline drawer row directly beneath `row` (its very next sibling <tr>),
  // reusing whichever detail-html builder + Decision panel belongs to that table. Shared by
  // both a direct row click and a map click on the same state, so there is exactly one drawer
  // per row no matter how you trigger it. Returns true if the drawer is now open.
  function toggleRowDrawer(row, findRec, buildHtml, stateAttr) {
    const tbody = row.closest('tbody');
    const wasOpen = row.classList.contains('open');
    tbody.querySelectorAll('tr.ss-rank').forEach((r) => r.classList.remove('open'));
    tbody.querySelectorAll('tr.ss-drawer-row').forEach((r) => { r.classList.remove('on'); const c = r.querySelector('td'); if (c) c.innerHTML = ''; });
    if (wasOpen) return false;
    row.classList.add('open');
    const st = row.getAttribute(stateAttr);
    const pr = row.getAttribute('data-product');
    const rec = findRec(st, pr);
    const dr = row.nextElementSibling;
    const td = dr.querySelector('td');
    td.innerHTML = buildHtml(rec);
    dr.classList.add('on');
    wireDecisionPanel(td, rec.state, rec.product);
    return true;
  }

  function wireTableDrawers(tbodyId, findRec, buildHtml, stateAttr) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    tbody.querySelectorAll('tr.ss-rank').forEach((row) => {
      row.addEventListener('click', () => toggleRowDrawer(row, findRec, buildHtml, stateAttr));
    });
  }

  // Map click -> same shared drawer as clicking the row directly. If the clicked state has no
  // row in either table right now (Low priority, or genuinely no signal), show an inline note
  // instead of doing nothing.
  function ssHandleMapClick(abbr) {
    const infoBox = document.getElementById('ssMapInfo');
    if (infoBox) infoBox.innerHTML = '';
    const product = ssProduct;

    const topRec = topStates.find((s) => s.state === abbr && (product === 'all' || s.product === product));
    if (topRec) {
      const row = document.querySelector(`#ssTopBody tr.ss-rank[data-state="${abbr}"][data-product="${topRec.product}"]`);
      if (row) {
        if (!row.classList.contains('open')) toggleRowDrawer(row, (st, pr) => topStates.find((s) => s.state === st && s.product === pr), stateDetailHtml, 'data-state');
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }

    const watchRec = marketingRows(product).find((s) => s.state === abbr);
    if (watchRec) {
      const row = document.querySelector(`#ssWatchBody tr.ss-rank[data-wstate="${abbr}"][data-product="${watchRec.product}"]`);
      if (row) {
        if (!row.classList.contains('open')) toggleRowDrawer(row, (st, pr) => watchStates.find((s) => s.state === st && s.product === pr), watchDetailHtml, 'data-wstate');
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }

    const feat = (SS_TOPO_CACHE || []).find((f) => f.abbr === abbr);
    const label = feat ? feat.name : abbr;
    if (infoBox) infoBox.innerHTML = note(`No active signal for ${label} right now — see Methodology below for how a state qualifies.`);
  }

  function renderBody(product) {
    ssProduct = product;
    const filteredTop = topStates.filter((s) => product === 'all' || s.product === product);
    const filteredWatch = watchStates.filter((s) => product === 'all' || s.product === product);
    const mktRows = marketingRows(product);
    const topActionable = filteredTop.reduce((sum, s) => sum + s.actionable, 0);
    const topQualified = filteredTop.reduce((sum, s) => sum + s.qualified, 0);
    const ai = d.ai_summary;
    const aiVisible = ai && (product === 'all' || ai.product === product);

    document.getElementById('view').innerHTML =
      '<div class="chiprow" style="margin-bottom:14px">'
      + '<span class="meta-small" style="margin-right:6px">Product:</span>'
      + ['all', 'ij', 'inkwell', 'gf8'].map((p) => `<button class="chip${p === product ? ' on' : ''}" data-ssp="${p}">${p === 'all' ? 'All products' : SS_LABELS[p]}</button>`).join('')
      + '</div>'

      + (aiVisible ? `<div class="ss-ai-summary"><div class="ss-ai-label">✨ Most actionable state to watch</div>`
        + `<p><strong>${ai.state}</strong> (${SS_LABELS[ai.product]}) — ${ai.headline} ${fmtN((watchStates.find(w=>w.state===ai.state)||{}).qualified)} qualified / ${fmtN((watchStates.find(w=>w.state===ai.state)||{}).actionable)} actionable accounts already in HubSpot`
        + (ai.starbridge_open_rfps > 0 ? `, plus <strong>${ai.starbridge_open_rfps} open Starbridge RFP${ai.starbridge_open_rfps > 1 ? 's' : ''}</strong> right now.` : '.') + `</p>`
        + `<div class="ss-ai-note">${ai.note}</div></div>` : '')

      + '<div class="cards">'
      + card('States to watch', fmtN(filteredWatch.length), '', 'policy signal, real citations')
      + card('States with signal', fmtN(product === 'all' ? filteredTop.length : filteredTop.length), '', product === 'all' ? fmtN(nt.states_with_signal) + ' states have ≥1 qualified account nationally' : 'of ' + filteredTop.length + ' ranked for this product')
      + card('Qualified accounts', fmtN(product === 'all' ? nt.qualified : topQualified), '', product === 'all' ? 'MQA + Engaged, all states' : 'top-10 states shown for this product')
      + card('Actionable now', fmtN(product === 'all' ? nt.actionable : topActionable), '', 'no sales contact in 60+ days')
      + card('Warm signals (90d)', fmtN(d.warm_signals_90d_total || 0), '', 'board-meeting rows, Status New/Saved, Meeting Score ≥10, added last 90 days — Starbridge, live pull 2026-09-22')
      + '</div>'

      // Map, made prominent — full-width panel above the tables (Option 1: map as primary
      // navigation tool), not squeezed into a grid2 half-column beside a table panel.
      + '<div class="panel">'
      + '<h3>Where the signal is <span class="muted">— click a state</span></h3>'
      + '<div class="ss-tilemap-wrap" id="ssMapWrap"><div class="loading">Loading map…</div></div>'
      + '<div id="ssMapInfo"></div>'
      + '<div class="ss-map-legend">'
      + '<span class="ss-lg-item"><span class="ss-lg-dot" style="background:#144745"></span>Inquiry Journeys</span>'
      + '<span class="ss-lg-item"><span class="ss-lg-dot" style="background:#5B5A9E"></span>Inkwell</span>'
      + '<span class="ss-lg-item"><span class="ss-lg-dot" style="background:#F99792"></span>Great First 8</span>'
      + '<span class="ss-lg-item"><span class="ss-lg-dot ss-lg-watch" style="background:#5B5A9E"></span>States to watch (darker = higher priority tier)</span>'
      + '<span class="ss-lg-item"><span class="ss-lg-dot" style="background:var(--line)"></span>No signal yet</span>'
      + '</div></div>'

      // One Marketing table, above Sales (swapped per Kelsey's call) — filtered to Act now +
      // Watch only (41 -> 14), sortable, drawer opens inline right below the clicked row.
      + '<div class="panel">'
      + `<h3>Top states to work (Marketing) <span class="muted">(${fmtN(mktRows.length)} states, High + Medium priority only)</span></h3>`
      + note('All 50 states + DC scanned for real, cited policy activity (state legislation, standards revisions, adoption cycles) outside the top-10 sales states, cross-referenced against live Starbridge RFP data where available. A marketing signal, not yet a sales one — no dedicated account drill-down here.')
      + note('Sorted by a priority score (0-100) by default — see Methodology at the bottom of this tab for the full point breakdown and sources. High ≥56 pts, Medium 32-55, Low <32 (dropped from this table).')
      + '<div class="chiprow" style="margin:12px 0 10px">'
      + '<span class="meta-small" style="margin-right:6px">Sort:</span>'
      + `<button class="chip${ssSortMkt === 'score' ? ' on' : ''}" data-sort-mkt="score">Priority score</button>`
      + `<button class="chip${ssSortMkt === 'alpha' ? ' on' : ''}" data-sort-mkt="alpha">Alphabetical</button>`
      + '</div>'
      + watchStatesTable(product, ssSortMkt)
      + '</div>'

      // One Sales table, below Marketing — same treatment, real account-level drawer + Decision panel.
      + '<div class="panel">'
      + '<h3>Top states to work (Sales) <span class="muted">(ranked by actionable)</span></h3>'
      + note('Actionable = at MQA or Engaged stage, no logged sales contact (call/email/meeting) in 60+ days. Product = the state\'s real, cited policy signal — not yet which product a specific account cares about (see flags below). Click a state for its policy context, real accounts, and a draft outreach starting point.')
      + '<div class="chiprow" style="margin:12px 0 10px">'
      + '<span class="meta-small" style="margin-right:6px">Sort:</span>'
      + `<button class="chip${ssSortSales === 'actionable' ? ' on' : ''}" data-sort-sales="actionable">Actionable count</button>`
      + `<button class="chip${ssSortSales === 'alpha' ? ' on' : ''}" data-sort-sales="alpha">Alphabetical</button>`
      + '</div>'
      + topStatesTable(product, ssSortSales)
      + '</div>'

      + sectionHdr('Past MQA campaigns', '#6a3e9a')
      + '<div class="panel">'
      + campaignsTable()
      + (d.past_campaigns_note ? note(d.past_campaigns_note) : '')
      + '</div>'

      + sectionHdr('What this tab doesn\'t do yet', '#c2540a')
      + '<div class="panel">' + flags.map((f) => note(f)).join('') + '</div>'

      + sectionHdr('Methodology', '#5B5A9E')
      + '<div class="panel">'
      + '<p style="font-size:13px;color:var(--ink);line-height:1.55;margin:0 0 14px">The <b>priority score</b> (0-100) ranks the 41 "States to watch" into High / Medium / Low priority tiers above. It only applies to that table — the 10 "Top states to work" are ranked simply by actionable-account count, no scoring needed there since HubSpot already tells you who to call. Recomputed by <code>scripts/score_watch_states.py</code> on every refresh; rebalanced 2026-09-22 to add the Starbridge Warm Signals ingredient.</p>'
      + '<table class="ss-dash"><thead><tr><th>Ingredient</th><th>Max</th><th>Tiers</th><th>Source &amp; how it\'s pulled</th></tr></thead><tbody>'
      + '<tr><td>Open RFP right now</td><td style="text-align:right">30</td><td>0 → 0 · 1 → 18 · 2-3 → 24 · 4+ → 30</td><td>Starbridge RFP bridges (ELA/IJ/GF8), live via <code>listBridgeRows</code>, Status New or Saved only</td></tr>'
      + '<tr><td>Starbridge signal for upcoming adoption</td><td style="text-align:right">30</td><td>0 → 0 · 1 → 18 · 2-3 → 24 · 4+ → 30</td><td>Starbridge Warm Signals bridges (GFE/IJ/Inkwell), live via <code>listBridgeRows</code>. Counted only if Meeting Score ≥10 and Status is New or Saved — anything scored lower or marked Not Interested is dropped before it reaches this table</td></tr>'
      + '<tr><td>Policy news recency</td><td style="text-align:right">20</td><td>≤6mo → 20 · ≤12mo → 16 · ≤24mo → 12 · ≤36mo → 8 · ≤60mo → 4 · older → 1</td><td>WebSearch, re-run roughly monthly (not every refresh) — every claim needs a real, dated source URL or it doesn\'t get a since-date at all</td></tr>'
      + '<tr><td>Existing HubSpot footprint</td><td style="text-align:right">20</td><td>20+ accounts → 20 · 12+ → 15 · 6+ → 10 · 3+ → 5 · fewer → 2</td><td>HubSpot portal 4451852 — MQA/Engaged company count, no sales contact in 60+ days</td></tr>'
      + '</tbody></table>'
      + note('Tiers: High priority ≥56 pts · Medium 32-55 pts · Low <32 pts. A state only shows up in "States to watch" at all if it has a real, cited policy signal outside the top-10 sales states — no policy citation, no row, regardless of score.')
      + note('Account-level matching (which specific district a Warm Signal belongs to, inside the state drill-downs above) uses an exact join: HubSpot\'s <code>starbridge_id</code> company property against the Starbridge bridge row\'s <code>buyerId</code> — not name/state fuzzy-matching.')
      + '</div>'

      + `<p class="flag" style="margin-top:4px">Source: HubSpot portal 4451852 (mqa_lifecycle_stage, notes_last_contacted, state_st) + verified policy research (WebSearch, cited per state) + Starbridge (RFP and Warm Signals bridges, live) · ${d.cadence || ''}</p>`;

    document.querySelectorAll('[data-ssp]').forEach((btn) => btn.addEventListener('click', () => renderBody(btn.getAttribute('data-ssp'))));
    document.querySelectorAll('[data-sort-mkt]').forEach((btn) => btn.addEventListener('click', () => { ssSortMkt = btn.getAttribute('data-sort-mkt'); renderBody(ssProduct); }));
    document.querySelectorAll('[data-sort-sales]').forEach((btn) => btn.addEventListener('click', () => { ssSortSales = btn.getAttribute('data-sort-sales'); renderBody(ssProduct); }));

    // One table, one drawer, opening inline right below the clicked row — reuses the exact
    // same detail-html + Decision panel the map click path uses.
    wireTableDrawers('ssTopBody', (st, pr) => topStates.find((s) => s.state === st && s.product === pr), stateDetailHtml, 'data-state');
    wireTableDrawers('ssWatchBody', (st, pr) => watchStates.find((s) => s.state === st && s.product === pr), watchDetailHtml, 'data-wstate');

    ssLoadUsTopo().then((features) => {
      const wrap = document.getElementById('ssMapWrap');
      if (wrap) {
        wrap.innerHTML = usMapSvg(product, features);
        wrap.querySelectorAll('.ss-us-state[data-state]').forEach((path) => {
          path.addEventListener('click', () => ssHandleMapClick(path.getAttribute('data-state')));
        });
      }
    }).catch(() => {
      const wrap = document.getElementById('ssMapWrap');
      if (wrap) wrap.innerHTML = '<p class="insight">Could not load the US map.</p>';
    });
  }

  renderBody('all');
  loadDecisions();
}

function renderCompetitiveIntel() {
  const upEl = document.getElementById("updated"); if (upEl) upEl.textContent = "";
  const view = document.getElementById("view");
  view.style.cssText = "padding:0;max-width:none;margin:0;";
  view.innerHTML = `<iframe src="competitive-intel.html" style="width:100%;height:calc(100vh - 110px);border:none;display:block;" title="Competitive Intel Dashboard"></iframe>`;
}

function renderTeacherNurture() {
  const upEl = document.getElementById("updated"); if (upEl) upEl.textContent = "";
  const view = document.getElementById("view");
  view.style.cssText = "padding:0;max-width:none;margin:0;";
  view.innerHTML = `<iframe src="teacher-nurture.html" style="width:100%;height:calc(100vh - 110px);border:none;display:block;" title="Teacher Nurture"></iframe>`;
}

function renderNurturePrograms() {
  const upEl = document.getElementById("updated"); if (upEl) upEl.textContent = "";
  const view = document.getElementById("view");
  view.style.cssText = "padding:0;max-width:none;margin:0;";
  view.innerHTML = `<iframe src="nurture-programs.html" style="width:100%;height:calc(100vh - 110px);border:none;display:block;" title="Nurture Programs"></iframe>`;
}

// Parse a run date. Every data file stamps `updated` as YYYY-MM-DD; anything
// else returns null so callers can fall back instead of printing "Invalid Date".
function parseRunDate(v) {
  if (!v || v === "—") return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? v + "T12:00:00Z" : v);
  return isNaN(d) ? null : d;
}
function formatRunDate(v) {
  const d = parseRunDate(v);
  if (!d) return v || "—"; // show the raw string rather than "Invalid Date"
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function nextRunLabel(cadence, lastRun) {
  if (!lastRun || lastRun === "—") return "—";
  if (cadence === "Weekly · Mondays") {
    // compute next Monday after lastRun
    const d = parseRunDate(lastRun);
    if (!d) return null; // unparseable — fall back to meta.next
    const day = d.getUTCDay(); // 0=Sun, 1=Mon
    const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7;
    d.setUTCDate(d.getUTCDate() + daysUntilMonday);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  }
  return null; // use hardcoded meta.next for non-weekly tabs
}

function renderTabMeta(tab, lastRun, nextOverride) {
  const el = document.getElementById("tab-meta");
  if (!tab.meta) { el.hidden = true; } else {
    const { desc, cadence, next } = tab.meta;
    const computedNext = nextOverride || nextRunLabel(cadence, lastRun) || next;
    el.hidden = false;
    const lastRunFormatted = formatRunDate(lastRun);
    el.innerHTML = `
      <div class="tab-meta-name">${tab.label}</div>
      <div class="tab-meta-desc">${desc}</div>
      <div class="tab-meta-item"><div class="tab-meta-label">Cadence</div><div class="tab-meta-value">${cadence}</div></div>
      <div class="tab-meta-item"><div class="tab-meta-label">Last Run</div><div class="tab-meta-value">${lastRunFormatted}</div></div>
      <div class="tab-meta-item"><div class="tab-meta-label">Next</div><div class="tab-meta-value">${computedNext}</div></div>`;
  }
  renderTabSourcesFooter(tab);
}

function renderTabSourcesFooter(tab) {
  const el = document.getElementById("tab-sources-footer");
  const sources = tab.meta && tab.meta.sources;
  if (!sources || !sources.length) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<b>Data sources — ${tab.label}:</b> ${sources.join(" · ")}`;
}

// ---- shell ----
async function loadTab(tab) {
  charts.forEach((c) => c.destroy()); charts.length = 0; PRODUCT = "all"; closeDrawer();
  document.getElementById("view").style.cssText = "";
  const rail = document.getElementById("jump-rail");
  if (rail) { rail.hidden = true; rail.innerHTML = ""; }
  if (tab.static) {
    // Static tabs render their own HTML, but their freshness stamp still comes
    // from a data file so this banner can never drift from the page it frames.
    if (tab.metaFile) {
      try {
        const res = await fetch(tab.metaFile, { cache: "no-store" });
        const meta = await res.json();
        renderTabMeta(tab, meta.updated || "—", meta.next_full_run);
      } catch (e) { renderTabMeta(tab, "—"); }
    } else {
      renderTabMeta(tab, "—");
    }
    tab.render();
    return;
  }
  document.getElementById("view").innerHTML = '<div class="loading">Loading…</div>';
  try {
    const res = await fetch(tab.data, { cache: "no-store" });
    DATA = await res.json();
    const lastRun = DATA.updated || "—";
    const upEl = document.getElementById("updated"); if (upEl) upEl.textContent = DATA.updated ? "Updated " + DATA.updated : "";
    renderTabMeta(tab, lastRun);
    tab.render(DATA);
  } catch (e) { document.getElementById("view").innerHTML = `<div class="loading">Could not load ${tab.data} — ${e}</div>`; }
}
function switchToTab(id) {
  const btn = document.querySelector(`.tabs-btns button[data-tabid="${id}"]`);
  if (btn) btn.click();
}
function init() {
  const nav = document.getElementById("tabs-btns");
  TABS.forEach((tab, i) => {
    const b = document.createElement("button"); b.textContent = tab.label;
    b.setAttribute("data-tabid", tab.id);
    if (i === 0) b.classList.add("active");
    b.onclick = () => { document.querySelectorAll(".tabs-btns button").forEach((x) => x.classList.remove("active")); b.classList.add("active"); loadTab(tab); };
    nav.appendChild(b);
  });
  if (TABS.length) loadTab(TABS[0]);
}
init();
