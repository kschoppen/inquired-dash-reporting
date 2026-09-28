# Monday Signals Update — Routine Instructions

Run UNATTENDED every Monday at 8am ET, after the Dash routine (6am, `DASH_ROUTINE.md`). Complete ALL steps in order. NEVER ask questions. NEVER fabricate data. America/Detroit for all dates.

Split out of `DASH_ROUTINE.md` on 2026-09-28 because one session couldn't hold the funnel digest plus these three refreshes. The 9/28 run lost funnel breakdowns to context compaction. This routine owns the **State Signal (MQA)**, **Competitive Intel** (weekly signals + keywords), and **Content Performance** tabs. It never touches `weekly-digest.json`, `overview.json`, or the weekly run log (the Dash routine owns those), and it posts nothing to channels.

Repo in workspace: `kschoppen/inquired-dash-reporting` → inquired-marketing-dash.netlify.app

---

## STEP 0: Setup

```bash
git config --global user.email k.schoppen@inquired.com
git config --global user.name 'Signals Update (cloud routine)'
[ -n "$HC_SIGNALS_URL" ] && curl -fsS -m 10 --retry 3 "$HC_SIGNALS_URL/start" || true
```

Do each phase, then write its file(s) straight away. A later phase failing must never cost an earlier phase's data.

---

## PHASE A: State Signal (MQA) — actionable accounts by state

Powers the **State Signal (MQA)** tab — ranks states by count of MQA/Engaged
accounts with no sales contact in 60+ days, so marketing + sales can see where
to focus outreach this week.

**Cutoff:** today minus 60 days (`YYYY-MM-DD`).

### Step 1 — national totals by state (HubSpot MCP — `query_crm_data`, objectType COMPANY)

Run three GROUP BY queries:

```sql
SELECT state_st, COUNT(*) FROM COMPANY WHERE mqa_lifecycle_stage IN ('MQA','Engaged') GROUP BY state_st
SELECT state_st, COUNT(*) FROM COMPANY WHERE mqa_lifecycle_stage IN ('MQA','Engaged') AND notes_last_contacted < '<cutoff>' GROUP BY state_st
SELECT state_st, COUNT(*) FROM COMPANY WHERE mqa_lifecycle_stage IN ('MQA','Engaged') AND notes_last_contacted IS NULL GROUP BY state_st
```

For each state, `actionable = (query 2 count) + (query 3 count)`. Sum the first
query's counts for `national_totals.qualified`; sum `actionable` across all
states for `national_totals.actionable`. `Unassigned` (no `state_st` set) and
`International` are real buckets — keep them in `history[].states` but exclude
them from `top_states` ranking.

### Step 2 — rank + pick top 10

Sort all states by `actionable` descending, excluding `Unassigned` /
`International`. Take the top 10 for `top_states` (fields: `rank`, `state`,
`qualified`, `actionable`). **This list can reshuffle week to week** — a state
that drops out of the top 10 loses its `accounts_by_state` entry; a state that
enters gets a fresh pull (Step 3).

### Step 3 — account drill-down for each top-10 state

For each of the 10 states, one query:

```sql
SELECT hs_object_id, name, segment, mqa_lifecycle_stage, mqa_signal, notes_last_contacted, hubspot_owner_id, recent_mqa_date
FROM COMPANY
WHERE mqa_lifecycle_stage IN ('MQA','Engaged') AND state_st = '<state>'
  AND (notes_last_contacted < '<cutoff>' OR notes_last_contacted IS NULL)
ORDER BY recent_mqa_date DESC
LIMIT 10
```

**Do not** sort by `recent_mqa_date` alone without the actionability filter in
the WHERE clause — the most-recently-MQA'd accounts are often the ones sales
just worked, which inflates the list with accounts that are NOT actually
actionable. The filter must be in the query, not applied after.

Resolve `hubspot_owner_id` → name via `search_owners` (batch all unique owner
IDs across the 10 states in one call). Build each account row:

```json
{ "id": <hs_object_id, int>, "name": "...", "segment": "...", "stage": "MQA|Engaged",
  "signal": "<mqa_signal or null if empty>", "owner": "<resolved name>",
  "last_contacted": "YYYY-MM-DD or null", "hs_url": "https://app.hubspot.com/contacts/4451852/record/0-2/<id>" }
```

District/school names are shown (not scrubbed to ID-only) — matches this
dashboard's existing Account Pulse (MQA) tab convention (institutional names,
not personal contact names, are fine in this public repo).

### Step 4 — write `data/state-signal.json`

- `updated` → run date.
- `national_totals` → from Step 1.
- `history[]` → append `{period: run date, states: [...]}` (all states incl.
  Unassigned/International), cap at 13 entries oldest-dropped-first, matching
  `weekly-digest.json`'s pattern.
- `top_states` → from Step 2.
- `accounts_by_state` → **replace entirely** with this run's 10 states from
  Step 3 (don't merge with last run's — a state that fell out of the top 10
  should lose its stale account list).
- `data_flags` → recompute the "Unassigned" % flag with this run's numbers.
  Leave the `product_interest` (CONTACT-only) and `policy_context` /
  `outreach_templates` caveats as static text until one of those is built.
- Leave `policy_context`, `outreach_templates`, `watch_states` alone — not
  wired yet (see the tab's own "What this tab doesn't do yet" section). Do
  not fabricate policy citations here.

### Step 5 — recompute watch-state priority tiers

`watch_states` entries carry a `priority_score` (0-100) and `priority_tier`
(`act_now` / `watch` / `low_priority`) that tier the list for Marketing/Sales
instead of a flat 41-state dump. Whenever a watch state's `actionable`,
`since`, or `starbridge_open_rfps` changes, rerun:

```
python3 scripts/score_watch_states.py
```

This recomputes both fields and re-sorts `watch_states` by score descending.
See the script's docstring for the scoring formula (RFP presence weighted
heaviest, then policy recency, then existing HubSpot footprint).

### Step 6 — Warm Signals refresh (board-meeting bridges, every run)

Mirrors the `state-signal-refresh` skill's Step 3 — keep the two in sync if either changes.
Separate from any Starbridge RFP pull: Warm Signals are board-meeting-derived buying signals
(a district's own board minutes/LCAP/agenda), not posted RFPs.

**Bridges** (`listBridges` to reconfirm current IDs): `[MASTER] Warm Signals (GFE) > 1.5k` →
`gf8`, `[MASTER] Warm Signals (IJ) > 1.5k` → `ij`, `[MASTER] Warm Signals (Inkwell) > 1.5k` →
`inkwell`.

**Threshold:** `Status` in (`New`, `Saved`) AND the `Meeting Score and Relevance` column's
`Meeting_Score` sub-field `>= 10`, displayed as-is (uncapped — don't normalize). Do not confuse
`Meeting_Score` with the separate `Match Score`/`Match reasoning` column pair (bridge-scope
confidence, not lead quality) — only `Meeting_Score` filters/displays here.

**Filtering:** `Meeting_Score` lives in an object-typed column and can't be filtered
server-side (confirmed — filters on it silently return 0 rows). Filter server-side on what you
can (`Status` via `getBridgeColumnMetadata`'s real `columnId`, `Buyer State Code`, `Added to
Bridge` for a recency cutoff) and apply the `Meeting_Score` cut client-side after fetching. Scope
to the same 10 `top_states` + `watch_states` already in `top_states`/`watch_states` — never page
through a full bridge (each holds ~4,000-10,500 rows).

**No personal contact data** — `Contact Name - Document`/`Contact Name - Web` never get rendered
on the dashboard, same no-PII convention as the rest of this tab.

**Per-account matching:** HubSpot COMPANY `starbridge_id` = a bridge row's top-level `buyerId`
(exact UUID match, not time-boxed to any window). Batch-fetch `starbridge_id` for the accounts
already pulled in Step 3 above (`search_crm_objects`, `hs_object_id IN [...]`), then check which
UUIDs appear as a qualifying row's `buyerId` (`listBridgeRows` filtered `buyerId Any [...]` per
bridge, batched — never one call per account). Write the highest-scoring match onto that account
as `warm_signal`.

**Write:** `warm_signals_by_state[state]` (top 3-5 by score, sparse — only states with a real
qualifying row, same convention as `starbridge_by_state`), `accounts_by_state[state][].warm_signal`
for matched accounts, and `warm_signals_90d_total` (Status + `Added to Bridge` in the last 90
days, `Meeting_Score >= 10`, counted across all three bridges — page through that bounded 90-day
window since the score can't be filtered server-side, this is the one exception to "never page a
full bridge" because the window itself is server-filtered and bounded). Append a `data_flags`
line noting the pull date and that the KPI's 90-day window is a display scope decision, not a
limit on what counts as a real signal (the per-account match above isn't time-boxed).

Write `data/state-signal.json` (pushed in PHASE C).

---

## PHASE B: Competitive intel scan

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

## PHASE B2: Content performance (HubSpot content analytics)

Powers the **Content Performance** tab — ranks pages, blog posts, and landing pages by
view to contact conversion, so the tab surfaces high-traffic content with no working CTA.

**Pull:** HubSpot MCP `get_content_analytics_report`, `mode: "TOTALS"`, `sortMetric:
"rawViews"`, `sortDirection: "DESC"`, `includeMetadata: true`, `limit: 40`. All-time
totals (this report has no native weekly window) — the tab still refreshes weekly so the
ranking stays current as pages accrue traffic.

**Exclude before ranking (do not include these rows at all):**
- Any `contentId`/`url` under `share.hsforms.com` (form embeds, not content)
- Thank-you / confirmation pages (title contains "Thank You" or "TY_", or url contains
  "thank-you")
- Non-marketing corporate pages: `/careers`, `/our-team`, `/about-us`

**Never fabricate a title or url.** If HubSpot returns a row with no `title` and no
`url` (an unresolved contentId), drop that row rather than invent one — this bit Claude
on the first build (a placeholder url was almost shipped for one row). If a row's
`title` is missing but it has a `url`, derive a readable title from the url's last path
segment (title-case, dashes to spaces) rather than leaving the raw slug or contentId.

**Threshold:** drop rows with `rawViews` under 2,000 (noise). For everything else,
compute `conversion_rate_pct = contacts / rawViews * 100` and flag:
- `gap` — under 0.5%
- `watch` — 0.5% to 2%
- `healthy` — 2%+

Sort ascending by `conversion_rate_pct` (worst gap first).

**Write `data/content-performance.json`:** upsert this run into `weeks[]`, keyed by
`period` (this run's date, `YYYY-MM-DD`), replace if present else append, cap at 8
entries (oldest dropped first). Full entry shape:

```json
{ "period": "YYYY-MM-DD", "label": "Mon D, YYYY",
  "totals": { "pages_tracked": N, "gap_count": N, "watch_count": N, "healthy_count": N },
  "verdict": "1-2 sentence headline naming the worst gap by raw_views and the best-converting lander, no emoji, no em dash",
  "pages": [ { "contentId": "...", "title": "...", "url": "...",
    "content_type": "landing_page|blog_post|site_page", "raw_views": N, "contacts": N,
    "conversion_rate_pct": N, "bounce_rate_pct": N, "flag": "gap|watch|healthy" }, … ] }
```

Also refresh top-level `updated` (run date) and `min_views_threshold` (leave at 2000
unless traffic volume has changed enough to warrant revisiting). Preserve
`excluded_note`. This tab's JSON is pushed in PHASE C.

---

## PHASE C: Push

```bash
cd inquired-dash-reporting
git pull --rebase origin main
git add data/state-signal.json competitive-intel.html data/competitive-intel.json data/content-performance.json
git commit -m "Weekly signals update — $(date +%Y-%m-%d)"
git push origin HEAD:main
git fetch origin && git log --oneline -2 origin/main
```

`git pull --rebase` first: the Dash routine pushes earlier the same morning. On a rebase conflict, keep the remote version of every file this routine doesn't own.

---

## STEP D: DM Kelsey (checklist only)

One DM to Kelsey (user ID `U06QR3G0CCA`) as the Clawrence bot using `$SLACK_TOKEN` (open the DM with `conversations.open`, then `chat.postMessage`; never echo tokens):

```
*🛰️ Signals update — [Mon D]*
• [✓/✗] State Signal (MQA) → data/state-signal.json [top state + actionable count, N states]
• [✓/✗] Warm Signals → data/state-signal.json [N matched accounts]
• [✓/✗] Competitor signals → competitive-intel.html [N searched, N new]
• [✓/✗] Competitor keywords → competitive-intel.html [N domains]
• [✓/✗] CI refresh date → data/competitive-intel.json [YYYY-MM-DD or unchanged]
• [✓/✗] Content performance → data/content-performance.json [N pages, N gaps]
• [✓/✗] Deployed → inquired-marketing-dash.netlify.app [SHA]
```

If a step failed, say why in brackets.

## STEP E: Healthchecks final ping

If `$HC_SIGNALS_URL` is set: success (every phase written and pushed) → `curl -fsS -m 10 --retry 3 "$HC_SIGNALS_URL"`; any failure → `"$HC_SIGNALS_URL/fail"`. Never ping success on a partial run.
