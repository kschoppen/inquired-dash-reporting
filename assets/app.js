// inquirED Reporting Dashboard — data-driven shell.
// Each reporting skill drops a JSON in /data and registers a tab here.
const TABS = [
  { id: "monthly", label: "Monthly Funnel & Revenue", data: "data/monthly-digest.json", render: renderMonthly },
  // future: { id:"weekly", label:"Weekly Funnel", data:"data/weekly-digest.json", render: renderWeekly },
];

const IJ = "#4B7774", IJ_FADE = "rgba(75,119,116,0.35)", ROSE = "#B02660", PLUM = "#4F164C", AMBER = "#C77D29";
const charts = [];

// ---------- helpers ----------
const fmtN = (n) => n == null ? "—" : Number(n).toLocaleString("en-US");
const fmt$ = (n) => n == null ? "—" : "$" + Math.round(n).toLocaleString("en-US");
const pct = (sql, mql) => (mql && sql != null) ? +(sql / mql * 100).toFixed(1) : null;

function deltaHTML(cur, prev, opts = {}) {
  if (cur == null || prev == null || prev === 0) return '<span class="delta flat">—</span>';
  const p = ((cur - prev) / Math.abs(prev)) * 100;
  const goodUp = opts.lowerIsBetter ? p < 0 : p > 0;
  const cls = Math.abs(p) < 0.5 ? "flat" : (goodUp ? "up" : "down");
  const arrow = p > 0 ? "▲" : (p < 0 ? "▼" : "→");
  const label = opts.label ? ` <span class="sub">${opts.label}</span>` : "";
  return `<span class="delta ${cls}">${arrow} ${Math.abs(p).toFixed(0)}%${label}</span>`;
}
function card(label, value, deltas = "") {
  return `<div class="card"><div class="label">${label}</div><div class="value">${value}</div><div>${deltas}</div></div>`;
}
function mkChart(id, config) { const el = document.getElementById(id); if (el) charts.push(new Chart(el, config)); }

// ---------- monthly tab ----------
function renderMonthly(d) {
  const m = d.months, last = m[m.length - 1], prev = m[m.length - 2] || {};
  const labels = m.map((x) => x.label);
  const conv = m.map((x) => pct(x.funnel && x.funnel.sql, x.funnel && x.funnel.mql));
  const convLast = conv[conv.length - 1], convPrev = conv[conv.length - 2];
  const q = last.quality || {};
  const utm = q.utm_completeness_pct;
  const view = document.getElementById("view");
  const seasonLine = d.seasonality ? `<div class="season">🗓️ ${d.seasonality.note}</div>` : "";

  view.innerHTML = `
    <div class="verdict">
      <strong>${last.label} — marketing demand:</strong> ${fmtN(last.funnel.mql)} MQLs → ${fmtN(last.funnel.sql)} SQLs
      (${convLast != null ? `<strong>${convLast}% MQL→SQL</strong>` : "—"}). Attribution coverage ${utm != null ? `${utm}%` : "—"}${utm != null && utm < 30 ? " ⚠️" : ""} — ${utm != null && utm < 30 ? "source analysis is unreliable until this climbs." : "ok."}
      <div class="season">Lagging scoreboard: ${fmt$(last.revenue.total_won)} closed-won (sales outcome — $ pipeline + win rate live in RevOps). Revenue lags ~2 quarters in K-12, so it reflects demand generated last fall, not this month's work.</div>
      ${seasonLine}
    </div>

    <div class="section-label">▲ Leading — what marketing works off</div>
    <div class="cards">
      ${card("MQL → SQL", convLast != null ? convLast + "%" : "—", deltaHTML(convLast, convPrev, {label:"MoM"}))}
      ${card("SQLs", fmtN(last.funnel.sql), deltaHTML(last.funnel.sql, prev.funnel && prev.funnel.sql, {label:"MoM"}))}
      ${card("MQLs", fmtN(last.funnel.mql), deltaHTML(last.funnel.mql, prev.funnel && prev.funnel.mql, {label:"MoM"}))}
      ${card("HIH leads", fmtN(last.funnel.hih), deltaHTML(last.funnel.hih, prev.funnel && prev.funnel.hih, {label:"MoM"}))}
      ${card("Attribution (UTM)", utm != null ? utm + "%" : "—", utm != null && utm < 30 ? '<span class="delta down">below 30% target</span>' : '<span class="delta flat">—</span>')}
    </div>

    <div class="section-label">▽ Lagging — sales outcome (context; $ + win rate → RevOps)</div>
    <div class="cards">
      ${card("Closed-won", fmt$(last.revenue.total_won), deltaHTML(last.revenue.total_won, prev.revenue && prev.revenue.total_won, {label:"MoM"}))}
      ${card("New business", fmt$(last.revenue.nb_won), "")}
      ${card("Keywords top 10", fmtN(last.seo && last.seo.top10) + (last.seo && last.seo.tracked ? " / " + last.seo.tracked : ""), '<span class="delta flat">baseline</span>')}
    </div>

    <div class="grid2">
      <div class="panel"><h3>MQL → SQL conversion (%)</h3><div class="chartbox"><canvas id="cConv"></canvas></div></div>
      <div class="panel"><h3>Funnel by stage (MQL / SQL / Opp)</h3><div class="chartbox"><canvas id="cFunnel"></canvas></div></div>
    </div>
    <div class="grid2">
      <div class="panel"><h3>${last.label} — SQLs by source</h3><div class="chartbox"><canvas id="cSrc"></canvas></div></div>
      <div class="panel"><h3>Closed-won revenue <span style="color:#6b7280;font-weight:400">(lagging)</span></h3><div class="chartbox"><canvas id="cRev"></canvas></div></div>
    </div>

    <div class="panel"><h3>Monthly detail</h3>
      <table><thead><tr>
        <th>Month</th><th>HIH</th><th>MQL</th><th>SQL</th><th>MQL→SQL</th><th>Wins</th><th>Closed-won</th>
      </tr></thead><tbody>
      ${m.map((x, i) => `<tr>
        <td>${x.label}</td><td>${fmtN(x.funnel.hih)}</td><td>${fmtN(x.funnel.mql)}</td><td>${fmtN(x.funnel.sql)}</td>
        <td>${conv[i] != null ? conv[i] + "%" : "—"}</td><td>${fmtN(x.revenue.wins)}</td><td>${fmt$(x.revenue.total_won)}</td></tr>`).join("")}
      </tbody></table>
      <p class="flag">MQL→SQL = SQL stage-entries ÷ MQL stage-entries in the month (directional, not a true cohort rate). Attribution (UTM) gates source analysis — well below the 30% target. Revenue is lagging (long K-12 cycle); $ pipeline + official win rate → RevOps.</p>
    </div>`;

  const botLeg = { plugins: { legend: { position: "bottom" } }, maintainAspectRatio: false };
  const noLeg = { plugins: { legend: { display: false } }, maintainAspectRatio: false };

  mkChart("cConv", { type: "line", data: { labels, datasets: [
      { label: "MQL→SQL %", data: conv, borderColor: IJ, backgroundColor: IJ_FADE, fill: true, spanGaps: true, tension: 0.3 } ] },
    options: { ...noLeg, scales: { y: { beginAtZero: true, ticks: { callback: (v) => v + "%" } } } } });

  mkChart("cFunnel", { type: "line", data: { labels, datasets: [
      { label: "MQL", data: m.map((x) => x.funnel.mql), borderColor: IJ, spanGaps: true },
      { label: "SQL", data: m.map((x) => x.funnel.sql), borderColor: PLUM, spanGaps: true },
      { label: "Opp", data: m.map((x) => x.funnel.opp), borderColor: ROSE, spanGaps: true } ] },
    options: { ...botLeg } });

  const src = q.sql_by_source || [];
  mkChart("cSrc", { type: "bar", data: { labels: src.map((s) => s[0]), datasets: [
      { label: "SQLs", data: src.map((s) => s[1]), backgroundColor: IJ } ] },
    options: { ...noLeg, indexAxis: "y", scales: { x: { beginAtZero: true } } } });

  mkChart("cRev", { type: "bar", data: { labels, datasets: [
      { label: "District", data: m.map((x) => x.revenue.district_won), backgroundColor: IJ_FADE, stack: "r" },
      { label: "School", data: m.map((x) => x.revenue.school_won), backgroundColor: "rgba(176,38,96,0.35)", stack: "r" } ] },
    options: { ...botLeg, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } } });
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
