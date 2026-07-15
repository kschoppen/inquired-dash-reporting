# Monday Dash Update — Routine Instructions

Run UNATTENDED every Monday at 6am ET. Complete ALL steps in order, then send ONE Slack DM to Kelsey. NEVER ask questions. NEVER fabricate data. America/Detroit for all dates.

Repos in workspace:
- `kschoppen/inquired-dash-reporting` → inquired-marketing-dash.netlify.app
- `kschoppen/html-pages` → inquired-marketing-hub.netlify.app

---

## STEP 0: Healthchecks start

```bash
curl -fsS -m 10 --retry 3 https://hc-ping.com/185dbee2-de71-4115-9ef3-dfa94ba44a3c/start || true
git config --global user.email k.schoppen@inquired.com
git config --global user.name 'Dash Update (cloud routine)'
```

---

## PHASE 1: HubSpot data → update dash JSONs

Pull via HubSpot MCP:
- **1a.** HIH Pool: contacts with active high-intent engagement last 90 days — total count
- **1b.** Weekly funnel velocity (prior Mon–Sun): new MQL entries, new SQL entries, new Opp entries, MQL→SQL rate
- **1c.** Open pipeline: total value + deal count (active stages: Proposal, Contract Sent, etc.)
- **1d.** Closed-won MTD: total value + count
- **1e.** Latest 3 closed-lost deals: pull reason field for competitive mentions

Write to `inquired-dash-reporting`:
- `data/weekly-digest.json`: prepend this week's entry to `weeks` array, keep last 10
- `data/overview.json`: update `weekly_signal` (week_label, updated YYYY-MM-DD, narrative) and `kpis` entries for HIH / MQL→SQL / closed-won revenue

Preserve all other JSON fields — do not delete or restructure.

---

## PHASE 2: Competitive intel scan

### Part A — Signal check (WebFetch)

WebFetch each of these 6 competitor sites. Note any obvious new content: new product pages, press releases, major messaging changes, new pricing, new partnerships.

- Amplify CKLA: `amplify.com/ela`
- Great Minds Wit & Wisdom: `greatminds.org/english`
- Great Minds Arts & Letters: `greatminds.org`
- Benchmark Education: `benchmarkeducation.com`
- TCI (Social Studies): `teachtci.com`
- National Geographic Learning (SS): `ngl.cengage.com/k12`

Update `competitive-intel.html` in `inquired-dash-reporting` — DRAWER JS object:
- Prepend any new signals to each competitor's `signals` array, keep max 5. Format: `[Finding] — [implication for inquirED]`
- If nothing new, leave unchanged
- Do NOT change threat levels, messaging themes, AI summaries, or keywords — signals only

### Part B — Keyword refresh (SEMrush)

Pull fresh organic keyword data from SEMrush for each of these 11 domains. Get top 6–8 non-branded organic keywords they rank for, plus any paid keywords they bid on. Skip keywords that are just the company or product name.

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

---

## PHASE 3: Push inquired-dash-reporting → Netlify

```bash
cd inquired-dash-reporting
git add data/weekly-digest.json data/overview.json competitive-intel.html
git commit -m "Weekly dash update — $(date +%Y-%m-%d)"
git push origin main
git fetch origin && git log --oneline -2 origin/main
```

If push fails, record the exact error — treat as F1 for this phase.

---

## PHASE 4: Asana → HTML sync → push html-pages → Netlify

```bash
cd html-pages
python3 -m pip install --user requests beautifulsoup4
# ASANA_TOKEN is provided in the routine prompt — set it here, never echo it
export ASANA_TOKEN=$ASANA_TOKEN
python3 scripts/sync_asana.py          # dry run — capture N changes
python3 scripts/sync_asana.py --apply  # apply
git fetch origin && git log --oneline -2 origin/main
# If script committed but didn't push:
git push origin HEAD:main
```

ASANA_TOKEN is SECRET — never echo into Slack, commits, or logs.

---

## STEP 5: Compose + send Slack DM

Send ONE DM to Kelsey (user ID `U06QR3G0CCA`) as the Clawrence bot. The Slack bot token (`$SLACK_TOKEN`) and Asana token (`$ASANA_TOKEN`) are provided in the routine prompt — never echo them.

Open DM channel:
```bash
CH=$(curl -sS -X POST https://slack.com/api/conversations.open \
  -H "Authorization: Bearer $SLACK_TOKEN" \
  -H 'Content-type: application/json; charset=utf-8' \
  -d '{"users":"U06QR3G0CCA"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["channel"]["id"])')
```

Message format (Slack mrkdwn), two parts:

**PART A — AI narrative:**
```
*📊 inquirED Reporting — Week of [Mon date]*

*[1-sentence headline: the week's most important signal — specific, not generic]*

[2–3 sentences: what moved, seasonal vs. structural, what to watch. Use actual numbers.]

↑ [win] — only if genuinely true
⚠ [flag/risk] — be specific
👀 [watch item]

🔗 inquired-marketing-dash.netlify.app
```

**PART B — Update checklist:**
```
---
*Updated this run:*
• [✓/✗] Weekly overview + funnel data → data/overview.json + data/weekly-digest.json [N records]
• [✓/✗] Competitor signals refreshed → competitive-intel.html [N scanned, N new signals]
• [✓/✗] Competitor keywords refreshed → competitive-intel.html [N domains via SEMrush]
• [✓/✗] Reporting dash deployed → inquired-marketing-dash.netlify.app [SHA]
• [✓/✗] Asana→HTML sync → html-pages [N changes / no drift]
• [✓/✗] Marketing hub deployed → inquired-marketing-hub.netlify.app [SHA or 'no changes']
```

Use ✓ for success, ✗ for failure. If a step failed, say why.

Slack bot token = `$SLACK_TOKEN` (provided in routine prompt). Never echo into logs or commits.

---

## STEP 6: Healthchecks final ping

- **Success** (Phases 1+3 pushed AND Slack DM ok:true):
  `curl -fsS -m 10 --retry 3 https://hc-ping.com/185dbee2-de71-4115-9ef3-dfa94ba44a3c`
- **Any failure**:
  `curl -fsS -m 10 --retry 3 https://hc-ping.com/185dbee2-de71-4115-9ef3-dfa94ba44a3c/fail`

Never ping success on a partial run.
