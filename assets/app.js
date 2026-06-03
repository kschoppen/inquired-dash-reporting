// inquirED Reporting Dashboard — data-driven shell.
// Each reporting skill drops a JSON in /data and registers a tab here.
const TABS = [
  { id: "monthly", label: "Monthly Funnel & Revenue", data: "data/monthly-digest.json", render: renderMonthly },
  // future: { id:"weekly", label:"Weekly Funnel", data:"data/weekly-digest.json", render: renderWeekly },
  // future: { id:"campaigns", label:"Campaign Analytics", data:"data/campaign-analytics.json", render: renderCampaigns },
];

const IJ = "#4B7774", IJ_FADE = "rgba(75,119,116,0.35)", ROSE = "#B02660", PLUM = "#4F164C";
const charts = [];

// ---------- helpers ----------
const fmtN = (n) => n == null ? "—" : Number(n).toLocaleString("en-US");
const fmt$ = (n) => n == null ? "—" : "$" + Math.round(n).toLocaleString("en-US");
const fmt$k = (n) => n == null ? "—" : "$" + (Math.round(n / 100) / 10).toLocaleString("en-US") + "k";

function deltaHTML(cur, prev, opts = {}) {
  if (cur == null || prev == null || prev === 0) return '<span class="delta flat">—</span>';
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  const goodUp = opts.lowerIsBetter ? pct < 0 : pct > 0;
  const cls = Math.abs(pct) < 0.5 ? "flat" : (goodUp ? "up" : "down");
  const arrow = pct > 0 ? "▲" : (pct < 0 ? "▼" : "→");
  const label = opts.label ? ` <span class="sub">${opts.label}</span>` : "";
  return `<span class="delta ${cls}">${arrow} ${Math.abs(pct).toFixed(0)}%${label}</span>`;
}

function card(label, value, deltas = "") {
  return `<div class="card"><div class="label">${label}</div><div class="value">${value}</div><div>${deltas}</div></div>`;
}

function mkChart(canvasId, config) {
  const el = document.getElementById(canvasId);
  if (el) charts.push(new Chart(el, config));
}

// ---------- monthly tab ----------
function renderMonthly(d) {
  const m = d.months, last = m[m.length - 1], prev = m[m.length - 2] || {};
  const labels = m.map((x) => x.label);
  const view = document.getElementById("view");

  const seasonLine = d.seasonality ? `<div class="season">🗓️ ${d.seasonality.note}</div>` : "";
  const yoy = last.web && last.web.yoy;

  view.innerHTML = `
    <div class="verdict">
      <strong>${last.label}</strong> — closed-won <strong>${fmt$(last.revenue.total_won)}</strong>
      ${last.revenue.nb_won != null ? `(<strong>${fmt$(last.revenue.nb_won)}</strong> new business)` : ""}.
      Web sessions ${fmtN(last.web && last.web.sessions)}.
      ${last.revenue.win_rate_count_pct != null ? `Win rate (marketing actuals) ${last.revenue.win_rate_count_pct}% by count / ${last.revenue.win_rate_dollar_pct}% by $ — official rate via RevOps.` : ""}
      ${seasonLine}
    </div>

    <div class="cards">
      ${card("Closed-won", fmt$(last.revenue.total_won), deltaHTML(last.revenue.total_won, prev.revenue && prev.revenue.total_won, {label:"MoM"}))}
      ${card("New business", fmt$(last.revenue.nb_won), "")}
      ${card("Sessions", fmtN(last.web && last.web.sessions),
          deltaHTML(last.web && last.web.sessions, prev.web && prev.web.sessions, {label:"MoM"}) +
          (yoy ? " " + deltaHTML(last.web.sessions, yoy.sessions, {label:"YoY"}) : ""))}
      ${card("MQL → SQL", fmtN(last.funnel.mql) + " → " + fmtN(last.funnel.sql),
          deltaHTML(last.funnel.sql, prev.funnel && prev.funnel.sql, {label:"SQL MoM"}))}
      ${card("Keywords top 10", fmtN(last.seo && last.seo.top10) + (last.seo && last.seo.tracked ? " / " + last.seo.tracked : ""),
          '<span class="delta flat">baseline</span>')}
    </div>

    <div class="grid2">
      <div class="panel"><h3>Closed-won revenue (District + School)</h3><canvas id="cRev"></canvas></div>
      <div class="panel"><h3>Funnel by stage</h3><canvas id="cFunnel"></canvas></div>
    </div>
    <div class="grid2">
      <div class="panel"><h3>Web sessions (GA4)</h3><canvas id="cWeb"></canvas></div>
      <div class="panel"><h3>${last.label} — won vs lost $ by segment</h3><canvas id="cSeg"></canvas></div>
    </div>

    <div class="panel"><h3>Monthly detail</h3>
      <table><thead><tr>
        <th>Month</th><th>HIH</th><th>MQL</th><th>SQL</th><th>Opp</th><th>Wins</th><th>Closed-won</th><th>Sessions</th>
      </tr></thead><tbody>
      ${m.map((x) => `<tr>
        <td>${x.label}</td><td>${fmtN(x.funnel.hih)}</td><td>${fmtN(x.funnel.mql)}</td>
        <td>${fmtN(x.funnel.sql)}</td><td>${fmtN(x.funnel.opp)}</td><td>${fmtN(x.revenue.wins)}</td>
        <td>${fmt$(x.revenue.total_won)}</td><td>${fmtN(x.web && x.web.sessions)}</td></tr>`).join("")}
      </tbody></table>
      <p class="flag">Funnel & web history backfills as runs accumulate; SEO baseline starts ${last.label}. Win rate excludes test + RFP deals.</p>
    </div>`;

  const noLeg = { plugins: { legend: { display: false } }, maintainAspectRatio: false };
  const botLeg = { plugins: { legend: { position: "bottom" } }, maintainAspectRatio: false };

  mkChart("cRev", { type: "bar", data: { labels, datasets: [
      { label: "District", data: m.map((x) => x.revenue.district_won), backgroundColor: IJ, stack: "r" },
      { label: "School", data: m.map((x) => x.revenue.school_won), backgroundColor: ROSE, stack: "r" } ] },
    options: { ...botLeg, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } } });

  mkChart("cFunnel", { type: "line", data: { labels, datasets: [
      { label: "MQL", data: m.map((x) => x.funnel.mql), borderColor: IJ, spanGaps: true },
      { label: "SQL", data: m.map((x) => x.funnel.sql), borderColor: PLUM, spanGaps: true },
      { label: "Opp", data: m.map((x) => x.funnel.opp), borderColor: ROSE, spanGaps: true } ] },
    options: { ...botLeg } });

  mkChart("cWeb", { type: "bar", data: { labels, datasets: [
      { label: "Sessions", data: m.map((x) => x.web && x.web.sessions), backgroundColor: IJ } ] },
    options: { ...noLeg } });

  const seg = (last.revenue && last.revenue.by_segment) || {};
  const segKeys = Object.keys(seg);
  mkChart("cSeg", { type: "bar", data: { labels: segKeys.map((k) => k.replace("_", "/")), datasets: [
      { label: "Won $", data: segKeys.map((k) => seg[k].won), backgroundColor: IJ },
      { label: "Lost $", data: segKeys.map((k) => seg[k].lost), backgroundColor: "rgba(176,38,96,0.8)" } ] },
    options: { ...botLeg, scales: { y: { beginAtZero: true } } } });
}

// ---------- shell ----------
async function loadTab(tab) {
  charts.forEach((c) => c.destroy()); charts.length = 0;
  document.getElementById("view").innerHTML = '<div class="loading">Loading…</div>';
  try {
    const res = await fetch(tab.data, { cache: "no-store" });
    const data = await res.json();
    document.getElementById("updated").textContent = data.updated ? "Updated " + data.updated : "";
    tab.render(data);
  } catch (e) {
    document.getElementById("view").innerHTML = `<div class="loading">Could not load ${tab.data} — ${e}</div>`;
  }
}

function init() {
  const nav = document.getElementById("tabs");
  TABS.forEach((tab, i) => {
    const b = document.createElement("button");
    b.textContent = tab.label;
    if (i === 0) b.classList.add("active");
    b.onclick = () => {
      document.querySelectorAll(".tabs button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active"); loadTab(tab);
    };
    nav.appendChild(b);
  });
  if (TABS.length) loadTab(TABS[0]);
}
init();
