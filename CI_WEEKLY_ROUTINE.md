# Monday Competitive Intel (weekly) — Routine Instructions

Run UNATTENDED every Monday at 9am ET, after the Dash (6am) and Signals (8am) routines. Complete ALL steps in order. NEVER ask questions. NEVER fabricate data. America/Detroit for all dates.

Split out of `SIGNALS_ROUTINE.md` on 2026-09-28 so each Monday routine fits in one session. This routine owns only the weekly refresh of `competitive-intel.html` (competitor `signals` + `keywords` in the DRAWER object) and `updated` in `data/competitive-intel.json`. The bi-monthly full run (`CI_FULL_RUN.md`, its own routine) owns everything else on that page.

Repo in workspace: `kschoppen/inquired-dash-reporting` → inquired-marketing-dash.netlify.app

---

## STEP 0: Setup

```bash
git config --global user.email k.schoppen@inquired.com
git config --global user.name 'CI Weekly (cloud routine)'
curl -fsS -m 10 --retry 3 https://hc-ping.com/7728ae78-073b-43b6-a15c-c1119fa75b4c/start || true
```

Write `competitive-intel.html` after Part A, then again after Part B, so a Part B failure never loses Part A's signals.

---

## PHASE 1: Competitive intel scan

### Part A — Signal check (WebSearch)

Do NOT use WebFetch — competitor sites block cloud IPs with 403s. Use WebSearch instead.

For each of these 6 competitors, run a WebSearch for recent news, product updates, press releases, pricing changes, or partnerships from the past 7 days. Search query pattern: `"[company/product name]" (announcement OR launch OR update OR pricing OR partnership) after:YYYY-MM-DD` (use the date 7 days ago).

- Amplify CKLA: search `"Amplify CKLA" OR "Amplify ELA" site:amplify.com OR news`
- Great Minds Wit & Wisdom: search `"Wit & Wisdom" OR "Great Minds ELA"`
- Great Minds Arts & Letters: search `"Great Minds" curriculum announcement`
- Benchmark Education: search `"Benchmark Education" curriculum`
- TCI (Social Studies): search `"TCI" OR "TeachTCI" social studies curriculum`
- National Geographic Learning (SS): search `"National Geographic Learning" social studies`

Note any obvious new content: new product pages, press releases, major messaging changes, new pricing, new partnerships. If a search returns nothing newsworthy from the past week, skip — no update needed.

Update `competitive-intel.html` in `inquired-dash-reporting` — DRAWER JS object:
- Prepend any new signals to each competitor's `signals` array, keep max 5. Format: `[Finding] — [implication for inquirED]`
- If nothing new, leave unchanged
- Do NOT change threat levels, messaging themes, AI summaries, or keywords — signals only

### Part B — Keyword refresh (SEMrush)

Pull fresh organic keyword data from SEMrush for each of these 10 domains. Get top 6–8 non-branded organic keywords they rank for, plus any paid keywords they bid on. Skip keywords that are just the company or product name.

Domains:
`amplify.com`, `greatminds.org`, `imaginelearning.com`, `mheducation.com`, `hmhco.com`,
`teachtci.com`, `teachingstrategies.com`, `savvas.com`, `benchmarkeducation.com`, `highscope.org`

Update the `keywords` field for each matching competitor in the DRAWER object in `competitive-intel.html`. Exact DRAWER entry names to update:

```
'Amplify CKLA'
'Great Minds · Wit &amp; Wisdom'
'Great Minds · Arts &amp; Letters'
'Imagine Learning · Dragonfly'
'HMH Into Reading'
'McGraw-Hill Emerge'
'Teachers\' Curriculum Institute'
'Teaching Strategies'
'Savvas · myView Literacy'
'Benchmark Education'
'HighScope'
```

Each keywords field structure:
```js
keywords: {
  paid: ['keyword 1', 'keyword 2'],
  organic: ['keyword 1', 'keyword 2']
}
```

Replace the entire keywords object with fresh data. `greatminds.org` covers both Great Minds entries — use the same data for both. If SEMrush returns no paid data for a domain, set `paid: []`.

**String safety:** keyword strings are written into single-quoted JS literals. Before writing, replace any apostrophe (`'`) in a keyword with a double-quoted wrapper — i.e. use `"keyword with apostrophe's"` instead of `'keyword with apostrophe's'`. Unescaped apostrophes break the entire script block and silently disable the page's expand buttons.

### Part C — Stamp the refresh date (REQUIRED whenever Part A or B changed anything)

Set `updated` in `data/competitive-intel.json` to today's date (`YYYY-MM-DD`). Leave `full_run`
alone — that one belongs to the bi-monthly full run (its own routine, instructions in
`CI_FULL_RUN.md`), and the page shows the two separately. The AI Overview block, stat tiles,
and Strategic Opportunities also belong to the full run; don't rewrite them here.

This is not optional bookkeeping. That field feeds the freshness strip on the page, the "Last
Run" stamp on the dash tab banner, and the green "Current" / amber "N days old" pill. Skip it
and the tab reports itself as stale even though you just refreshed it, which is exactly how the
page ended up looking abandoned in August 2026. If Part A and Part B both came back with
nothing to change, leave `updated` as it was — the date means "when the page last changed," not
"when we last looked."

Never hardcode a date into `competitive-intel.html` itself. Every date the page shows is read
from this JSON at load time.

---

## PHASE 2: Push

```bash
cd inquired-dash-reporting
git pull --rebase origin main
git add competitive-intel.html data/competitive-intel.json
git commit -m "Weekly competitive intel — $(date +%Y-%m-%d)"
git push origin HEAD:main
git fetch origin && git log --oneline -2 origin/main
```

After pushing, sanity-check the page script: `node -e "const s=require('fs').readFileSync('competitive-intel.html','utf8'); const m=[...s.matchAll(/<script>([\\s\\S]*?)<\/script>/g)]; m.forEach(x=>new Function(x[1])); console.log('scripts ok')"`. If it throws, revert your edit, push the revert, and report ✗. An unescaped apostrophe breaks every expand button on the page.

---

## STEP 3: DM Kelsey (checklist only)

One DM to Kelsey (user ID `U06QR3G0CCA`) as the Clawrence bot using `$CLAWRENCE_BOT_TOKEN` (`conversations.open`, then `chat.postMessage`; never echo tokens):

```
*🔭 Competitive intel (weekly) — [Mon D]*
• [✓/✗] Competitor signals → competitive-intel.html [N searched, N new]
• [✓/✗] Competitor keywords → competitive-intel.html [N domains]
• [✓/✗] CI refresh date → data/competitive-intel.json [YYYY-MM-DD or unchanged]
• [✓/✗] Deployed → inquired-marketing-dash.netlify.app [SHA]
```

## STEP 4: Healthchecks final ping

Healthchecks check "Reporting – weekly competitive intel" (cron `0 9 * * 1` America/New_York, 3h grace).

- **Success** (both parts written, pushed, script check passed): `curl -fsS -m 10 --retry 3 https://hc-ping.com/7728ae78-073b-43b6-a15c-c1119fa75b4c`
- **Any failure:** `curl -fsS -m 10 --retry 3 https://hc-ping.com/7728ae78-073b-43b6-a15c-c1119fa75b4c/fail`

Never ping success on a partial run.
