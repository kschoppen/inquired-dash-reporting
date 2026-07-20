# Monday Dash Update — Routine Instructions

Run UNATTENDED every Monday at 6am ET. Complete ALL steps in order. NEVER ask questions. NEVER fabricate data. America/Detroit for all dates.

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

## PHASE 1: HubSpot data pulls

### Date windows

- **Current window:** most recently completed ISO week — Mon 00:00 UTC → Sun 23:59 UTC
- **Prior window:** the ISO week before that
- Convert both to Unix milliseconds for HubSpot date filters.

### Read prior run log

Fetch `data/run-logs/weekly-marketing-digest-run-log.json` from `kschoppen/inquired-dash-reporting` (GitHub raw URL). Parse the array. From run #2 onward, use the most recent entry's stored numbers for the prior-week column instead of re-pulling — more accurate and self-consistent. If absent (first run), treat as empty history and re-pull prior window normally.

Also read `acknowledged_events` from the run log — array of `{week, event, confirmed_by, confirmed_at}`. If the prior week appears here, suppress WoW comparison for flagged metrics (compare to prior-prior instead, or note the anomaly in data_flags).

### Funnel totals (HubSpot MCP — `search_crm_objects`, objectType: contacts)

Run each metric twice (current + prior windows) for WoW. Use `limit: 1` — only `total` matters.

| Metric | Filter |
|---|---|
| HIH (High Intent Handraisers) | `marketing_intent_tier EQ "High" AND createdate IN window` |
| MQL | `hs_v2_date_entered_marketingqualifiedlead IN window` |
| SQL | `hs_v2_date_entered_salesqualifiedlead IN window` |
| Entered Opp | `hs_v2_date_entered_opportunity IN window` |

Spell out "High Intent Handraisers [HIH]" on first mention in any Slack post; use "HIH" thereafter.

### Product segmentation (add `product_interest EQ "<value>"` to each metric × window query)

| Product | `product_interest` value |
|---|---|
| IJ (Inquiry Journeys) | `Elementary Social Studies Curriculum` |
| Inkwell | `Elementary ELA` |
| WH (World History) | `Middle School Social Studies Curriculum` |
| GF8 | `TK/Pre-K Curriculum` |

Always pull IJ + Inkwell (16 queries). For WH and GF8: do a single current-window spot-check first per product — only include if any of {HIH, MQL, SQL, Opp} ≥ 5 for current OR prior week. If below threshold, set to null in outputs.

### Account segment breakouts (add `segment__company_ EQ "<value>"` to each metric × window query)

Values: `Single Site`, `Small District`, `Medium District`, `Large District`, `Enterprise District`. Exclude `Other`. 5 segments × 4 metrics × 2 windows = up to 40 queries.

**Small-sample skip:** if a metric's headline total (current + prior summed) < 10, skip segment pulls for that metric — record as null in outputs and note in data_flags.

### Lead disposition (objectType: contacts)

| Metric | Filter |
|---|---|
| Disqualified | `hs_latest_disqualified_lead_date IN window` |
| Entered Nurture | `nurture_reason_last_updated IN window` |

Run each for current + prior windows.

### Pipeline snapshots (objectType: deals)

| Metric | Filter |
|---|---|
| District open deals | `pipeline EQ "40953415" AND hs_is_closed EQ "false"` |
| School open deals | `pipeline EQ "41400400" AND hs_is_closed EQ "false"` |

Pull `dealname` for test-deal exclusion. Exclude deals matching (case-insensitive): `Ashley Test`, `Tim Test`, `Testacct`, `^District Ashley`, `^School Ashley`.

Also pull: open pipeline total VALUE + deal count (active stages), closed-won MTD (value + count), and latest 3 closed-lost deals (pull `reason` field — scan for competitive mentions to include in Kelsey DM context).

### HIH pool (overview KPI only — separate from funnel HIH above)

Contacts with `marketing_intent_tier EQ "High"` — total count (90-day rolling pool, no window filter). Used only for the `overview.json` KPIs block — do not mix with the windowed HIH funnel metric.

### Compute: coverage, thresholds, flags, narrative

**Coverage per stage:**
- Product coverage = sum(IJ + Inkwell + WH/GF8 if included) / total
- Segment coverage = sum(5 segments) / total
- Flag in data_flags if either < 30% on any stage.

**WoW deltas + emoji thresholds** (skip if prior-period base < 5):
- 🔥 Δ ≥ +50%
- ⚠️ -25% < Δ ≤ -10%
- 🚨 Δ ≤ -25%
- Any |Δ| > 50% with non-trivial sample: add a one-sentence "why" (seasonality, cadence, or "needs investigation" — don't speculate)

**Segment display:** group Single Site + Small District → "Single/Small" for all Slack output. Keep five buckets in JSON.

**List event detection:**
Flag current week if: `Disqualified > 50` AND `(Disqualified + Nurture) > 2 × (HIH + MQL + SQL + Opp)`. With ≥3 runs of history, also flag if any metric exceeds 2.5× its rolling 8-week median. If flagged and not in `acknowledged_events`, note in verdict: "Possible list event detected — flagged in run log for confirmation."

**Compose the following before moving to Phase 2:**
- **Verdict line** (1 sentence — the week's most important signal, product-level when coverage is decent)
- **Bright spots** (max 3, 🔥 only) — append dominant segment in parens if ≥60% Single/Small
- **Watch items** (max 2, ⚠️/🚨 only) — include the one-sentence "why"
- **weekly_signal narrative** (2–4 sentences prose for `overview.json` — give the talk-track, not a metrics recitation; weave numbers in naturally)

---

## PHASE 2: Competitive intel scan

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

## PHASE 3: Write data files + push inquired-dash-reporting → Netlify

### weekly-digest.json

Upsert the just-completed ISO week into `weeks[]`, keyed by `period` (that week's Monday, `YYYY-MM-DD`). Replace if present, else append. Keep sorted oldest→newest, cap to ~13 weeks. Full entry shape:

```json
{ "period": "YYYY-MM-DD", "label": "Mon D",
  "funnel": { "hih": N, "mql": N, "sql": N, "opp": N },
  "by_product": { "ij": {"hih":N,"mql":N,"sql":N,"opp":N}, "inkwell": {…}, "wh": null_or_obj, "gf8": null_or_obj },
  "by_segment": { "single_small": {"hih":N,"mql":N,"sql":N,"opp":N}, "medium": {…}, "large": {…}, "enterprise": {…} },
  "disposition": { "dq": N, "nurture": N },
  "drill": { "hih": [[id, "SegShort", "SrcShort"], …], "mql": [[…]], "sql": [[…]], "opp": [[…]] } }
```

`by_product` notes:
- For the dashboard emit only, assign each contact a **single PRIMARY product** (mutual exclusivity for stacking). Priority: **Inkwell > IJ > WH > GF8** via exclusion filters: `inkwell` = `product_interest = 'Elementary ELA'`; `ij` = `...Elementary Social Studies Curriculum AND != Elementary ELA`; `wh` = `...Middle School Social Studies Curriculum AND != Elementary ELA AND != Elementary Social Studies Curriculum`.
- Include wh/gf8 only when they cleared the ≥5 relevance threshold. Set to null otherwise.

`drill` notes (powers the click-into-HubSpot drawer):
- For each stage, pull up to 60 contacts over the current-week window: properties `hs_object_id`, `segment__company_`, `hs_latest_source`.
- Emit as compact triple `[hs_object_id (int), segment-short, source-short]`. **NEVER names or emails — the repo is public.**
- Segment short: Single / Small / Medium / Large / Enterprise / Other / ""
- Source short: Direct / Paid / Organic / Email / Offline / Referral

Also refresh these top-level fields:
- `updated` — run date
- `pipeline` — `{ "district_open": N, "school_open": N, "as_of": "YYYY-MM-DD" }` (point-in-time snapshot)
- `segment_coverage` — `{ "hih": %, "mql": %, "sql": %, "opp": % }`
- `product_caveat` / `segment_caveat` — keep existing strings; update only if data reality changed

Preserve all other fields — do not delete or restructure.

### Run log JSON

Append this run's entry to the fetched run log array and write back to `data/run-logs/weekly-marketing-digest-run-log.json`. Create the `data/run-logs/` directory if it doesn't exist yet. Schema:

```json
{
  "run_date": "YYYY-MM-DD",
  "period_label": "YYYY-Www",
  "window_current": ["YYYY-MM-DD", "YYYY-MM-DD"],
  "window_prior": ["YYYY-MM-DD", "YYYY-MM-DD"],
  "slack_message_ts": "",
  "totals": { "hih_current": 0, "hih_prior": 0, "hih_wow_pct": 0, "mql_current": 0, "mql_prior": 0, "mql_wow_pct": 0, "sql_current": 0, "sql_prior": 0, "sql_wow_pct": 0, "opp_current": 0, "opp_prior": 0, "opp_wow_pct": 0 },
  "by_product": { "ij": {"hih":[cur,pri],"mql":[cur,pri],"sql":[cur,pri],"opp":[cur,pri]}, "inkwell": {…}, "wh": null, "gf8": null },
  "by_segment": { "single_small": {"hih":[cur,pri],…}, "medium": {…}, "large": {…}, "enterprise": {…} },
  "coverage_pct": { "product": {"hih":0,"mql":0,"sql":0,"opp":0}, "segment": {"hih":0,"mql":0,"sql":0,"opp":0} },
  "disposition": { "disqualified_current": 0, "disqualified_prior": 0, "entered_nurture_current": 0, "entered_nurture_prior": 0 },
  "pipeline": { "district_open_deals": 0, "school_open_deals": 0 },
  "list_event_detected": false,
  "acknowledged_events": [],
  "data_flags": []
}
```

`slack_message_ts` is blank at write time — update after PHASE 5 completes (soft-update: re-fetch, set the field, push a second minimal commit OR note it in data_flags if re-push is too costly).

### overview.json

Fetch current `data/overview.json` from GitHub. Update ONLY these keys — preserve everything else:

```json
"weekly_signal": {
  "updated": "YYYY-MM-DD",
  "week_label": "Week of Mon D",
  "narrative": "[the 2–4 sentence prose narrative composed in Phase 1]"
},
"kpis": {
  "hih_pool": N,
  "mql_to_sql_pct": N,
  "closed_won_mtd": "$N"
}
```

### Push

```bash
cd inquired-dash-reporting
git add data/weekly-digest.json data/overview.json data/run-logs/weekly-marketing-digest-run-log.json competitive-intel.html
git commit -m "Weekly dash update — $(date +%Y-%m-%d)"
git push origin main
git fetch origin && git log --oneline -2 origin/main
```

Push failure = soft-fail: record the exact error in the checklist and continue. A push failure never blocks the Slack posts.

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

## PHASE 5: Post to #marketing-reporting

Post as **Dash** to channel `C0AMQ22F9UY` (#marketing-reporting) using `$DASH_BOT_TOKEN`.

```bash
curl -sS -X POST https://slack.com/api/chat.postMessage \
  -H "Authorization: Bearer $DASH_BOT_TOKEN" \
  -H "Content-type: application/json; charset=utf-8" \
  -d '{"channel":"C0AMQ22F9UY","text":"<message>"}'
```

**Post format:**

```
📆 Weekly Marketing Data — [Mon D, YYYY]

[2–3 sentence narrative prose. Numbers woven in naturally — don't open with a raw number or a label. Give the talk-track: what the data means, not just what it says. If nothing unusual happened, "steady" IS the story — say so with the numbers that confirm it.]

[Flags block — only include lines that crossed a threshold. Omit entire block if nothing crossed. Max 3 lines total.]
🔥 [Bright spot: short label — one clause on why it matters]
⚠️ [Watch item: short label — one clause on what to track]

Dashboard: https://inquired-marketing-dash.netlify.app/
```

**Formatting rules:**
- Title date: "Jul 7, 2026" format — full date, no ISO week notation
- Narrative: prose only, no bullets, no tables, no charts, no thread reply
- Flags: only 🔥 (Δ ≥ +50%), ⚠️ (-10% to -25%), 🚨 (≤ -25%). Omit block entirely if none crossed.
- Dashboard link is always last. All segment/product/disposition/pipeline detail lives there.

**Posting failure = hard stop.** If `chat.postMessage` returns non-`ok:true` or any HTTP error: STOP the run. Do NOT fall back to `slack_send_message` MCP — that posts as Kelsey, not Dash, breaking bot identity. Report the exact error and likely cause (`$DASH_BOT_TOKEN` not set / not in allowlist / token revoked). Nothing else should reach Slack on failure.

Capture `ts` from the response — store in run log as `slack_message_ts`.

---

## STEP 6: DM Kelsey

Send ONE DM to Kelsey (user ID `U06QR3G0CCA`) as the Clawrence bot using `$SLACK_TOKEN`. Never echo tokens.

Open DM channel:
```bash
CH=$(curl -sS -X POST https://slack.com/api/conversations.open \
  -H "Authorization: Bearer $SLACK_TOKEN" \
  -H 'Content-type: application/json; charset=utf-8' \
  -d '{"users":"U06QR3G0CCA"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["channel"]["id"])')
```

**Message format (Slack mrkdwn), two parts:**

**PART A — AI narrative:**
```
*📊 inquirED Reporting — Week of [Mon date]*

*[1-sentence headline: the week's most important signal — specific, not generic]*

[2–3 sentences: what moved, seasonal vs. structural, what to watch. Actual numbers. Include closed-won MTD and any competitive signals from closed-lost deals if notable.]

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
• [✓/✗] Run log updated → data/run-logs/weekly-marketing-digest-run-log.json [run N]
• [✓/✗] Competitor signals refreshed → competitive-intel.html [N searched, N new signals]
• [✓/✗] Competitor keywords refreshed → competitive-intel.html [N domains via SEMrush]
• [✓/✗] Reporting dash deployed → inquired-marketing-dash.netlify.app [SHA]
• [✓/✗] #marketing-reporting posted → Weekly Marketing Data [ts]
• [✓/✗] Asana→HTML sync → html-pages [N changes / no drift]
• [✓/✗] Marketing hub deployed → inquired-marketing-hub.netlify.app [SHA or 'no changes']
```

Use ✓ for success, ✗ for failure. If a step failed, say why in brackets.

---

## STEP 7: Healthchecks final ping

- **Success** (Phases 1+3 pushed AND channel post ok:true AND Slack DM ok:true):
  `curl -fsS -m 10 --retry 3 https://hc-ping.com/185dbee2-de71-4115-9ef3-dfa94ba44a3c`
- **Any failure:**
  `curl -fsS -m 10 --retry 3 https://hc-ping.com/185dbee2-de71-4115-9ef3-dfa94ba44a3c/fail`

Never ping success on a partial run.
