// "Data methodology and sources" section, shared by every dash tab.
// Content lives in data/methodology.json (one entry per tab id); each tab's owning skill keeps
// its entry current. Used by the shell (assets/app.js) and by the iframed pages
// (account-pulse.html, nurture-programs.html, teacher-nurture.html, competitive-intel.html).
(function () {
  const CSS = `
  .mth { margin: 28px 0 8px; font-family: inherit; }
  .mth-hdr { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #144745; font-weight: 900; border-left: 3px solid #5B5A9E; padding-left: 8px; margin: 0 0 10px; }
  .mth-panel { background: #fff; border: 1px solid #E3E6E5; border-radius: 12px; padding: 16px; }
  .mth-owner { display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 12.5px; color: #515151; margin-bottom: 10px; }
  .mth-owner b { color: #144745; }
  .mth-owner code, .mth code { font-size: 11.5px; background: #F3F5F4; padding: 0 4px; border-radius: 4px; }
  .mth-intro { font-size: 13px; line-height: 1.55; color: #1f2a29; margin: 0 0 14px; max-width: 95ch; }
  .mth-sub { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #757575; font-weight: 700; margin: 16px 0 6px; }
  .mth-scroll { overflow-x: auto; }
  table.mth-t { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  .mth table.mth-t th { text-align: left; color: #757575; font-weight: 700; font-size: 10.5px; text-transform: uppercase; letter-spacing: .3px; padding: 7px 9px; border-bottom: 1px solid #E3E6E5; }
  .mth table.mth-t td { padding: 8px 9px; border-bottom: 1px solid #EEF0EF; vertical-align: top; line-height: 1.45; text-align: left; font-weight: 400; color: #1f2a29; }
  .mth table.mth-t td:first-child { font-weight: 700; color: #144745; min-width: 9rem; }
  .mth table.mth-t td.num { text-align: right; white-space: nowrap; }
  .mth-limits { margin: 0; padding-left: 18px; font-size: 12.5px; line-height: 1.5; color: #515151; }
  .mth-limits li { margin: 3px 0; }
  .mth-err { font-size: 12px; color: #757575; }`;

  let cache = null;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");

  function ensureCss() {
    if (document.getElementById("mth-css")) return;
    const st = document.createElement("style");
    st.id = "mth-css"; st.textContent = CSS;
    document.head.appendChild(st);
  }

  function table(head, rows) {
    return `<div class="mth-scroll"><table class="mth-t"><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
  }

  function html(m, updated) {
    const b = m.built_by || {};
    const owner = `<div class="mth-owner"><span><b>Built by</b> ${b.skill && !/^none/i.test(b.skill) ? b.skill.split(/,\s*/).map((s) => `<code>${esc(s)}</code>`).join(" + ") : esc(b.skill || "")}</span>`
      + (b.routine ? `<span><b>Refreshed</b> ${fmt(b.routine)}</span>` : "")
      + (b.instructions ? `<span><b>Steps</b> ${fmt(b.instructions)}</span>` : "") + `</div>`;
    const score = (m.score_table || []).length ? `<div class="mth-sub">Priority score</div>` + table(["Ingredient", "Max", "Tiers", "Source and how it's pulled"],
      m.score_table.map((r) => `<tr><td>${fmt(r.ingredient)}</td><td class="num">${esc(r.max)}</td><td>${fmt(r.tiers)}</td><td>${fmt(r.source)}</td></tr>`)) : "";
    const sources = (m.sources || []).length ? `<div class="mth-sub">Where the data comes from</div>` + table(["Source", "What", "How it's pulled"],
      m.sources.map((r) => `<tr><td>${fmt(r.source)}</td><td>${fmt(r.what)}</td><td>${fmt(r.how)}</td></tr>`)) : "";
    const choices = (m.choices || []).length ? `<div class="mth-sub">Choices the skill makes</div>` + table(["Rule", "Current value", "Why"],
      m.choices.map((r) => `<tr><td>${fmt(r.rule)}</td><td>${fmt(r.value)}</td><td>${fmt(r.why)}</td></tr>`)) : "";
    const limits = (m.limits || []).length ? `<div class="mth-sub">What it can't see</div><ul class="mth-limits">${m.limits.map((l) => `<li>${fmt(l)}</li>`).join("")}</ul>` : "";
    return `<section class="mth" aria-label="Data methodology and sources"><div class="mth-hdr">Data methodology and sources</div><div class="mth-panel">${owner}${m.intro ? `<p class="mth-intro">${fmt(m.intro)}</p>` : ""}${score}${sources}${choices}${limits}</div></section>`;
  }

  // Renders the section for `tabId` into `el` (replacing its contents).
  window.renderMethodology = async function (el, tabId) {
    if (!el) return;
    ensureCss();
    try {
      if (!cache) cache = await fetch("data/methodology.json", { cache: "no-store" }).then((r) => r.json());
      const m = (cache.tabs || {})[tabId];
      if (!m) { el.innerHTML = ""; el.hidden = true; return; }
      el.hidden = false;
      el.innerHTML = html(m, cache.updated);
    } catch (e) {
      el.hidden = false;
      el.innerHTML = `<p class="mth-err">Couldn't load data/methodology.json.</p>`;
    }
  };
})();
