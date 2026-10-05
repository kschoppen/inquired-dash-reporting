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

**HIH is list-based, with exclusions (added 2026-09-28).** Don't use the `total` for HIH. Page the full current-window HIH list (`limit: 200`; properties `hs_email_domain`, `company`, `segment__company_`, `product_interest`, `hs_analytics_source`) and drop:
- **internal:** `hs_email_domain` = `inquired.com`
- **competitor:** domain equals or ends in `.`+ any of `amplify.com`, `greatminds.org`, `imaginelearning.com`, `mheducation.com`, `hmhco.com`, `teachtci.com`, `teachingstrategies.com`, `savvas.com`, `benchmarkeducation.com`, `highscope.org`, `cengage.com`
- **higher_ed:** never when `segment__company_` is a K-12 size (Single Site / Small / Medium / Large / Enterprise District). Otherwise: `company` matches `/\b(universit|college)/i`, OR domain ends in `.edu` and `company` doesn't match `/school|district|education|academy|public/i`. K-12 bodies use `.edu` too (Chicago Public Schools is `cps.edu`, the Bureau of Indian Education is `bie.edu`), so both guards are required.

Also emit `by_product.untagged = {hih, mql, sql, opp}`: contacts with no `product_interest` per stage (the GROUP BY "Unassigned" row). MQL/SQL/Opp product counts are multi-tag, so the tab can't derive untagged by subtraction. `funnel.hih` = the count left after exclusions. Emit `funnel.hih_excluded = {internal, higher_ed, competitor}` counts. Build HIH `by_product` (primary product per contact, Inkwell > IJ > WH > GF8, mutually exclusive), HIH `by_segment`, and `drill.hih` **from this same filtered list**. Don't run the per-product / per-segment HIH count queries, since one list gives all three. Never write null HIH by-product when the list pulled: an empty product is 0. The prior window's HIH comes from the run log (it already uses the same rule from 2026-09-28 on). Do the list pull and write the HIH fields into the week entry **before** the MQL/SQL/Opp breakdowns, so they survive if the run runs long.

**YoY (added 2026-09-28).** Pull MQL / SQL / Opp totals (`limit: 1`, `total`) for the **same ISO week last year** (Monday of the current window minus 364 days, through the following Sunday). Emit on the week entry: `"yoy": {"period": "<LY Monday>", "label": "<Mon D, YYYY>", "mql": N, "sql": N, "opp": N, "hih": null, "hih_note": "No HIH YoY: HIH uses the current intent tier, so a year-old cohort has had 12 months to reach High and isn't comparable."}`. HIH YoY is always null. The tiles show "No YoY data" for any null.

### Product segmentation (add `product_interest EQ "<value>"` to each metric × window query)

| Product | `product_interest` value |
|---|---|
| IJ (Inquiry Journeys) | `Elementary Social Studies Curriculum` |
| Inkwell | `Elementary ELA` |
| WH (World History) | `Middle School Social Studies Curriculum` |
| GF8 | `TK/Pre-K Curriculum` |

All four products are mandatory every run (32 queries: 4 metrics × 2 windows × 4 products) — no volume threshold, no omission. A product with zero activity reports 0, not null. (The prior ≥5-threshold gate on WH/GF8 was retired 2026-08-31.)

### Account segment breakouts (add `segment__company_ EQ "<value>"` to each metric × window query)

Values: `Single Site`, `Small District`, `Medium District`, `Large District`, `Enterprise District`. Exclude `Other`. 5 segments × 4 metrics × 2 windows = up to 40 queries.

**Small-sample skip:** if a metric's headline total (current + prior summed) < 10, skip segment pulls for that metric — record as null in outputs and note in data_flags.

### Lead disposition (objectType: contacts)

| Metric | Filter |
|---|---|
| Disqualified | `hs_latest_disqualified_lead_date IN window` |
| Entered Nurture | `nurture_reason_last_updated IN window` |

Run each for current + prior windows. Also run each, current window only, with `product_interest EQ "<value>"` added for all four products (8 more queries) — simple `EQ` membership, not mutually exclusive. This is the per-product disposition breakdown.

**Disposition reasons (added 2026-09-25, Weekly tab drawers; field names verified live 2026-09-25).**
- **DQ reasons live on the LEAD object, not the contact** (there is no contact-level reason field; `disqualified_lead` is just a yes/no flag). `query_crm_data`: `SELECT hs_lead_disqualification_reason, COUNT(*) FROM LEAD WHERE hs_v2_date_entered_unqualified_stage_id_1675714327 >= '<Mon>' AND < '<next Mon>' GROUP BY hs_lead_disqualification_reason`. This counts LEADs that entered "7 - Disqualified", which runs far below the contact-level DQ count (58 vs 275 for the Sep 14 week), so also emit `dq_reasons_note` stating both numbers.
- **Nurture reasons are on the contact:** `SELECT nurture_reason, COUNT(*) FROM CONTACT WHERE nurture_reason_last_updated IN window GROUP BY nurture_reason`. Emit the top 8 reasons by count, blank/null reason as `"(no reason set)"`. `avg8` per reason = its mean count over the prior 8 runs in the run log (omit when fewer than 3 prior runs carry reasons).

### Pipeline snapshots (objectType: deals)

| Metric | Filter |
|---|---|
| New Business open deals | `pipeline EQ "912820790" AND hs_is_closed EQ "false"` — active, mandatory |
| Account Growth open deals | `pipeline EQ "907963407" AND hs_is_closed EQ "false"` — active |
| Renewal open deals | `pipeline EQ "42174628" AND hs_is_closed EQ "false"` — active (~290 open deals) |
| District open deals | `pipeline EQ "40953415" AND hs_is_closed EQ "false"` — legacy, keep pulling until RevOps confirms the migration |
| School open deals | `pipeline EQ "41400400" AND hs_is_closed EQ "false"` — legacy, same |

Active pipelines per RevOps (2026-09-16) are New Business, Account Growth and Renewal. The Weekly tab shows only those three; District/School stay in the data (and in `district_open`/`school_open`) but are hidden from the display. Awareness and Partnerships are never pulled.

Pull the full list (not just a count) with `dealname`, `dealstage`, `product_s_`, `amount_in_home_currency`. Exclude deals whose `dealname` matches (case-insensitive): `Ashley Test`, `Tim Test`, `Testacct`, `^District Ashley`, `^School Ashley`.

**Stage movement this week (active pipelines only, added 2026-09-25).** Stage-entry properties are `hs_v2_date_entered_<stageId>`. Stage IDs verified 2026-09-25 — New Business / Account Growth: Sales Qualified `1386756096` (AG also `1378710642`), Interest `1386756097` (AG also `1378710643`), Consideration `1386756098`, Conviction `1386756099`, Desire `1386756100`, Validation/Approval `1386756101`, Closed Lost `1386756103`. **Renewal uses its own stages:** Nurture `89682804`, Engaged `89682806`, Desire `89682807`, Closed Won `89682809`; don't force it into the New Business stage list. Per stage: `SELECT pipeline, dealstage, COUNT(*) FROM DEAL WHERE hs_v2_date_entered_<id> IN window GROUP BY pipeline, dealstage` shows where those deals sit now. Add a `Closed Lost` / `Closed Won` stage row carrying the week's exits (`closedate IN window AND hs_is_closed_lost/won`). For each of the three active pipelines, find deals whose current stage was entered during the current window. For each such deal, `from` = the stage with the latest `hs_v2_date_entered_*` before the current one (null for brand-new deals), `to` = current stage label. Classify vs the RevOps stage order (Sales Qualified → Interest → Consideration → Conviction → Desire → Validation / Approval → Closed): new deal or later stage = `forward`, earlier stage or Closed Lost = `back`. Per stage, count `entered` (deals now in that stage that entered it this window), `forward`, `back`. Last-touch campaign on moved deals is off for now (Kelsey, 2026-09-25): the contact field is a mostly-blank campaign GUID and UTMs don't pass lead→deal. Don't pull it. Cap `moved_deals` at 60 rows. Deal names are company names, not personal data, so they're fine in the public repo; never add contact names/emails.

**Deal product field is `product_s_`, not `product_interest`** — the latter is contact-only and does not exist on deals. `product_s_` ("Product(s)") is a multi-select enum with exactly `Inquiry Journeys` / `Inkwell` / `World History` / `Great First 8`, semicolon-joined when multi-tagged; coverage on open deals ran ~66% as of 2026-08-31 (`entry_product` looked like the intended single-value field but had ~0% coverage when checked — don't use it). `dealstage` IDs are shared across pipelines — always resolve labels in the context of their own `pipeline` (e.g. `query_crm_data` with `GROUP BY pipeline, dealstage`).

After test-deal exclusion, aggregate:
- **By product:** count + sum `amount_in_home_currency` per product (membership via `;`-split on `product_s_`; a multi-tagged deal counts toward each). Untagged deals roll into an `untagged` count/amount. Emit it twice: `by_product` across all five pulled pipelines (existing field) and `active_by_product` across the three active pipelines only (what the Weekly tab shows).
- **By stage:** count + amount grouped by `(pipeline, dealstage)`, one list per pipeline (`new_business`, `account_growth`, `renewal`, `district`, `school`).

### Form fills by offer — "Top converting pieces" (added 2026-09-25)

`query_crm_data` over contacts with `recent_conversion_date IN current window`, `GROUP BY recent_conversion_event_name` → `fills`. For each of the top 10 offers by fills, also count within that group: `new_contacts` (`createdate IN window`), `to_hih` (`marketing_intent_tier = 'High'`), `to_mql` (`hs_v2_date_entered_marketingqualifiedlead IN window`).

**`query_crm_data` returns a 400 when an aggregate query filters on two date ranges at once** (verified 2026-09-25). Put one date in the WHERE and bucket the other: `new_contacts` = `WHERE createdate IN window GROUP BY recent_conversion_event_name, DATE_TRUNC('WEEK', recent_conversion_date)` and keep the row for this week's Monday; `to_mql` = `WHERE hs_v2_date_entered_marketingqualifiedlead IN window GROUP BY recent_conversion_event_name, DATE_TRUNC('WEEK', recent_conversion_date)`, same. `to_hih` is a single date filter plus `marketing_intent_tier = 'High'`, so it works directly. Shorten event names for `offer` (keep the content-tag part, e.g. "ELA-DL: Inkwell K-2 Sample Lesson"). Label each offer with its content tag when the event name maps cleanly to one (e.g. `IJ-DL: Scope & Sequence`); otherwise use the event name as-is. `avg8` = the offer's mean `fills` over the prior 8 runs in the run log (omit with fewer than 3). Known limit: this counts each contact's most recent conversion only, so repeat fills by one contact in the same week count once; note it in the run log's data_flags on the first run.

**Piece type comes from the event name, not the page title** (fix 2026-09-28: the W39 run labelled an `ss-dl:` download as a Webinar). `-dl:` → Download, `-webinars:` / `-web:` / `webinars:` → Webinar, `[hih]` contact / demo / pilot forms → Hand-raise, else Form. Product from the tag prefix: `ela-`/`iw-` → Inkwell, `ss-`/`ij-` → Inquiry Journeys (including `ss-webinars`), `wh-` → World History, `gf8-`/`ece_gf8`/`great first eight` → Great First 8. `fills` is the `GROUP BY recent_conversion_event_name` count exactly. Don't merge or rename rows before counting.

### First vs last touch + HIH from existing contacts (added 2026-09-28)

**`content_touch`** — for this week's MQLs: `SELECT first_conversion_event_name, COUNT(*) FROM CONTACT WHERE hs_v2_date_entered_marketingqualifiedlead IN window GROUP BY first_conversion_event_name`, and the same with `recent_conversion_event_name`. Group variants of one piece into one row (e.g. every "[HIH] Lead Gen Form: Contact Sales" page → "Contact Sales form (website)", all SS thought-leadership webinar series → one row, all `Meetings Link:` → "Meetings link (sales rep)"). Drop rows under 2 in both columns. Emit `{"population": "Contacts who became MQL this week", "total": N, "unassigned": N, "rows": [{"piece","product","first","last"}], "note": "<keep the 9/28 wording>"}`, sorted by `last` desc, then `first`.

**`hih_existing`** — `search_crm_objects` contacts with `marketing_intent_tier EQ High` AND `recent_conversion_date IN window` AND `createdate LT window start` (properties `hs_email_domain`, `company`, `segment__company_`, `product_interest`, `recent_conversion_event_name`). Apply the same HIH exclusions. Emit `{"count": N, "excluded": {internal, higher_ed, competitor}, "by_piece": [{"piece","count"}], "drill": [[id, segShort, prodShort, piece]], "note": "<keep the 9/28 wording>"}`. HubSpot stores no date for an intent-tier change, so this is a proxy and the note says so. Never add names or emails.

### Content engagement (running totals, added 2026-09-28)

Two `query_crm_data` pulls, no window: `SELECT marketing_intent_tier, COUNT(*) FROM CONTACT GROUP BY marketing_intent_tier` and `SELECT content_tags, COUNT(*) FROM CONTACT WHERE content_tags IS NOT NULL GROUP BY content_tags ORDER BY COUNT(*) DESC` (strip the parenthetical label from each tag). Write to the week entry: `"content_engagement": {"as_of": "<run date>", "prior_as_of": "<previous snapshot's as_of>", "intent_tier": {"high","medium","low"}, "intent_tier_prior": {…}, "top_content_tags": [{"tag","count","delta"}]}` (top 12, `delta` = count minus the previous snapshot's count for that tag, null if the tag is new). The Weekly tab's Brand & content lift section reads the latest entry that has one.

### Drill product + "The read" (added 2026-09-25)

- Add a 4th element to every `drill` row: primary product short (`IJ` / `Inkwell` / `WH` / `GF8` / `""`), same Inkwell > IJ > WH > GF8 priority as the dashboard `by_product` emit.
- Compose `read` for the week entry: three short sentences, `up` / `down` / `watch`, built from the same facts as the verdict, bright spots and watch items above. Compare to the prior 8-week average (not WoW) to match the dashboard tiles. Rates move in points, counts in % or "× avg". Wrap the key number in `<b>`. No em dashes. Never state a number that isn't in this run's pulls.

Also pull: open pipeline total VALUE + deal count (active stages), closed-won MTD (value + count), and latest 3 closed-lost deals (pull `reason` field — scan for competitive mentions to include in Kelsey DM context).

### Pipeline vs. school-year goal (objectType: deals — `data/goals.json` config)

Fetch `data/goals.json` from GitHub first — it holds this year's target config: `field` (the deal property to filter on, currently `deal_start_year`), `field_value` (currently `"27-28"`), `pipelines` (the 3 pipeline IDs keyed by name), `pipeline_goal` ($ target for "generated"), `closed_won_goal` ($ target for closed-won), `hubspot_list_url`, and a `reference_year` block (last full closed school year's actuals — **static/historical, already closed out; carry it forward byte-for-byte, never recompute it**). Edit `goals.json` directly (not this routine) when the target changes.

Pull the full deal list: `search_crm_objects`, objectType `DEAL`, filter `<field> EQ "<field_value>"` AND `pipeline IN` the 3 IDs from `goals.json`. Properties: `pipeline`, `dealstage`, `segment`, `product_s_`, `amount_in_home_currency`, `hs_is_closed_won`, `hs_is_closed_lost`, `dealname`. Apply the same test-deal `dealname` exclusion as the Pipeline snapshots section above.

Classify each remaining deal by `hs_is_closed_won` / `hs_is_closed_lost` (not by `dealstage` label — the same label maps to different stage IDs per pipeline, see note above) into `won` / `lost` / else `open`, then aggregate `amount_in_home_currency`:
- **`actual`**: `{open, lost, won}` summed across all matched deals. ("Generated" = open+lost+won combined — lost deals count on purpose, since the goal implies a target win rate.)
- **`by_segment`**: bucket `segment` → `single_small` (Single Site + Small District) / `medium` (Medium District) / `large` (Large District) / `enterprise` (Enterprise District); sum `{open,lost,won}` per bucket. Deals with `segment` = `Other`/blank are excluded from this breakdown only (still counted in `actual` and `by_pipeline`).
- **`by_product`**: multi-tag membership via `;`-split on `product_s_` → `ij` (Inquiry Journeys) / `inkwell` / `wh` (World History) / `gf8` (Great First 8); a multi-tagged deal counts toward each. Untagged deals roll into `untagged`.
- **`by_pipeline`**: bucket by which of the 3 `goals.json` pipeline IDs → `district` / `school` / `new_business`; sum `{open,lost,won}`.

`goal.generated` = `goals.json.pipeline_goal`; `goal.closed_won` = `goals.json.closed_won_goal`. `as_of` = this run's date.

### HIH pool (overview KPI only — separate from funnel HIH above)

Contacts with `marketing_intent_tier EQ "High"` — total count (no window filter; 2,380 on 2026-09-25). Used only for the `overview.json` KPIs block — do not mix with the windowed HIH funnel metric. ⚠️ This is NOT the same number as the monthly digest's `funnel.hih_pool_active` (the 90-day active pool from HubSpot list 10586, 374 in May). Two definitions share the "HIH pool" name; don't copy one into the other.

### Compute: coverage, thresholds, flags, narrative

**Coverage per stage:**
- Product coverage = sum(IJ + Inkwell + WH + GF8) / total
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

## PHASES 1.5 / 2 / 2.6 moved to `SIGNALS_ROUTINE.md` (2026-09-28)

State Signal (MQA) and Content Performance run in `SIGNALS_ROUTINE.md` (Monday 8am), and the weekly Competitive Intel refresh runs in `CI_WEEKLY_ROUTINE.md` (Monday 9am), so this one has room to finish the funnel digest. Don't do them here.

---

## PHASE 2.5: Brand lift metrics (GSC)

Wired via **`scripts/gsc_brand_lift.py`** (stdlib-only, no pip installs). It pulls the GSC Search Analytics API and updates BOTH weekly-owned blocks in place: `brand_lift.metrics` in `data/overview.json` (Overview tiles: value = latest-week clicks, WoW delta with standard emoji thresholds, spark capped at 13) and `brand_lift.series[]` in `data/weekly-digest.json` (Weekly tab trend, upserted by `period` = week Monday, capped at 13 weeks). These measure how our brand and channels surface in **Google Search**, NOT social engagement. The Monthly tab's block in `data/monthly-digest.json` belongs to the monthly digest — never touch it here (the script doesn't).

**Credentials (env vars, never echo):** `GSC_CLIENT_ID` / `GSC_CLIENT_SECRET` (the GA4 OAuth client) + `GSC_REFRESH_TOKEN` (refresh token minted with the `https://www.googleapis.com/auth/webmasters.readonly` scope).

**Project prerequisite (one-time):** the **Search Console API** (`searchconsole.googleapis.com`) must be enabled in the Google Cloud project that owns the OAuth client — project **68420228287**, the same project as GA4. Enabling GA4's API does *not* enable this one; each API is toggled separately. If it's off, every call 403s with `accessNotConfigured` and the script exits `1` with a flag naming the enable URL. Enable at [Search Console API in Cloud Console](https://console.cloud.google.com/apis/library/searchconsole.googleapis.com?project=68420228287) and re-run; allow a few minutes to propagate. This is distinct from a credential problem — a valid refresh token with the right scope still 403s while the API is off.

```bash
cd inquired-dash-reporting
python3 scripts/gsc_brand_lift.py   # edits the two data files in place; prints a JSON summary
```

**Exit codes → STEP 6 checklist line:**
- `0` = updated ✓ — stdout JSON lists `weeks_upserted` + `flags`; copy any flags into `data_flags`
- `2` = deferred — (env vars not set; blocks left untouched in their `"collecting"` state)
- `1` = error ✗ — auth/API failure; report the flag text; blocks left untouched. Do NOT hand-edit values in as a fallback — NEVER fabricate.

The script upserts the TWO most recently completed ISO weeks each run — re-pulling the prior week finalizes GSC's fresh-data revisions (2–3 day lag), so Monday-morning numbers self-heal a week later. Branded-query rule (in the script — keep in sync with the weekly digest skill): query contains inquired / inquiry journeys / inkwell / great first eight / gf8.

**Provisional weeks (`GSC_LAG_DAYS = 3`).** The routine runs Monday and reports the week that ended Sunday, so the newest week's last 1–2 days are always still being finalized and its full-week total is understated. Diffing that partial total against a complete week manufactures a decline — on the 2026-08-17 week it produced **−26% WoW 🚨** when the settled days were actually **+15%**. So the script marks any week with fewer than 7 settled days `provisional` (with `settled_days`), and publishes a `comparable` block holding a like-for-like comparison over the same settled days of each week. The Overview tile and the Weekly tab both render the aligned delta plus a `⏳ provisional, N/7 days final` caption; `assets/app.js` reads `comparable` rather than recomputing from `series`, so the two surfaces can't disagree. Full-week values stay in `series[]` (understated for a week, then corrected by the next run's re-pull). Nothing is fabricated — only the *comparison window* changes.

**YouTube / Instagram are not fillable via the API.** They are Search Console **platform properties** (the property type Google launched July 2026 for Instagram / TikTok / X / YouTube). They show in the Search Console UI — and inquirED has both connected — but `sites.list` returns only `sc-domain:inquired.com` and `https://www.inquired.org/`, so the Search Analytics API cannot query them. This is not a credential or API-enablement gap and more OAuth scopes will not fix it. The script auto-detects their absence, lists them in `unavailable`, leaves the channels null (never a fabricated zero), and both surfaces render "Not in API" with an explanation. Revisit if Google exposes platform properties through the API. First meaningful WoW is the Aug 17, 2026 run.

No extra git step: the two files are already in PHASE 3's `git add`.

---

## PHASE 3: Write data files + push inquired-dash-reporting → Netlify

### weekly-digest.json

Upsert the just-completed ISO week into `weeks[]`, keyed by `period` (that week's Monday, `YYYY-MM-DD`). Replace if present, else append. Keep sorted oldest→newest, cap to ~13 weeks. Full entry shape:

```json
{ "period": "YYYY-MM-DD", "label": "Mon D",
  "funnel": { "hih": N, "mql": N, "sql": N, "opp": N },
  "by_product": { "ij": {"hih":N,"mql":N,"sql":N,"opp":N}, "inkwell": {…}, "wh": {…}, "gf8": {…} },
  "by_segment": { "single_small": {"hih":N,"mql":N,"sql":N,"opp":N}, "medium": {…}, "large": {…}, "enterprise": {…} },
  "disposition": { "dq": N, "nurture": N, "by_product": { "ij": {"dq":N,"nurture":N}, "inkwell": {…}, "wh": {…}, "gf8": {…} },
    "dq_reasons": [ {"reason":"…","count":N,"avg8":N}, … ], "nurture_reasons": [ {"reason":"…","count":N,"avg8":N}, … ] },
  "top_pieces": [ {"offer":"IJ-DL: Scope & Sequence","type":"Download","product":"Inquiry Journeys","fills":N,"avg8":N,"new_contacts":N,"to_hih":N,"to_mql":N}, … ],
  "read": { "up": "…", "down": "…", "watch": "…" },
  "drill": { "hih": [[id, "SegShort", "SrcShort", "ProdShort"], …], "mql": [[…]], "sql": [[…]], "opp": [[…]] } }
```

`read`, `top_pieces`, `disposition.dq_reasons` / `nurture_reasons` and the 4th `drill` element were added 2026-09-25 for the redesigned Weekly tab (see Phase 1). The tab shows a "Needs new pull" placeholder for any of these that's missing, so omit a field rather than emitting zeros when its pull fails, and add a data flag. `type` on `top_pieces` = Download / Webinar / Hand-raise / Form; `product` from the tag prefix (IJ-/SS- → Inquiry Journeys, ELA- → Inkwell, GF8-/ECE- → Great First 8, WH- → World History, else "—").

`by_product` notes:
- For the dashboard emit only, assign each contact a **single PRIMARY product** (mutual exclusivity for stacking). Priority: **Inkwell > IJ > WH > GF8** via exclusion filters: `inkwell` = `product_interest = 'Elementary ELA'`; `ij` = `...Elementary Social Studies Curriculum AND != Elementary ELA`; `wh` = `...Middle School Social Studies Curriculum AND != Elementary ELA AND != Elementary Social Studies Curriculum`; `gf8` = `...TK/Pre-K Curriculum AND != Elementary ELA AND != Elementary Social Studies Curriculum AND != Middle School Social Studies Curriculum`.
- **All four products included every run** — no threshold gate. A product with zero primary-tagged contacts reports zeroes, not null. Set top-level `products_included` to `["ij","inkwell","wh","gf8"]` every run.

`disposition.by_product` notes:
- Simple `EQ`-membership counts per product (not mutually exclusive — unlike the funnel `by_product` above), current window only, from the Phase 1 per-product disposition pulls.

`drill` notes (powers the click-into-HubSpot drawer):
- For each stage, pull up to 60 contacts over the current-week window: properties `hs_object_id`, `segment__company_`, `hs_latest_source`.
- Emit as compact row `[hs_object_id (int), segment-short, source-short, product-short]`. **NEVER names or emails — the repo is public.**
- Always store the list for `hih` (the Weekly tab's HIH contacts drawer reads it). If a stage's pull fails, emit `[]` and add a data flag.
- Segment short: Single / Small / Medium / Large / Enterprise / Other / ""
- Source short: Direct / Paid / Organic / Email / Offline / Referral / Social / Campaign (`OTHER_CAMPAIGNS`)
- **HIH segment check:** the Sep 14 run wrote 0 HIH for every company-size bucket while 30 of that week's 55 HIH contacts had a segment. Cross-check `by_segment.*.hih` against the drill rows before writing; if the segment pulls return all zeros but the drill has segments, count from the drill and add a data flag.

Also refresh these top-level fields:
- `updated` — run date
- `pipeline` — point-in-time snapshot:
  ```json
  { "new_business_open": N, "account_growth_open": N, "renewal_open": N, "district_open": N, "school_open": N, "as_of": "YYYY-MM-DD", "note": "…",
    "by_product": { "ij": {"count":N,"amount":N}, "inkwell": {…}, "wh": {…}, "gf8": {…}, "untagged": {"count":N,"amount":N} },
    "active_by_product": { "ij": {"count":N,"amount":N}, …, "untagged": {…} },
    "by_stage": { "new_business": [ {"stage":"Interest","count":N,"amount":N}, … ], "account_growth": [ … ], "renewal": [ … ], "district": [ … ], "school": [ … ] },
    "active": { "new_business": { "stages": [ {"stage":"Interest","count":N,"amount":N,"entered":N,"forward":N,"back":N}, … ] }, "account_growth": {…}, "renewal": {…} },
    "moved_deals": [ {"name":"…","url":"https://app.hubspot.com/contacts/4451852/record/0-3/<id>","pipeline":"New Business","from":"Interest","to":"Consideration","amount":N,"segment":"Medium"}, … ] }
  ```
  `by_product`/`by_stage`/`active_by_product` from the Phase 1 deal-level aggregation; `active` and `moved_deals` from the Phase 1 stage-movement pull. `by_stage` only lists stages that actually have open deals — don't pad with zeros. Stage labels use the HubSpot label for that pipeline (e.g. "Validation/Approval"). If the stage-movement pull fails, omit `active`/`moved_deals` (the tab falls back to `by_stage` counts) and add a data flag.
- `segment_coverage` — `{ "hih": %, "mql": %, "sql": %, "opp": % }`
- `product_caveat` / `segment_caveat` — keep existing strings; update only if data reality changed
- `hih_exclusions` — the caption the tab shows under "HIH this week" (the tab appends this week's `funnel.hih_excluded` counts to it). Keep the existing string. Update it only when the HIH exclusion rules in Phase 1 change, and then make it describe exactly the same three exclusions (internal, competitor, higher-ed, plus the K-12 size guard).
- `hih_list_url` — the "View HIH list in HubSpot" link (list 10586). Keep unchanged unless the list ID changes.
- `drill_note` — keep the existing string (drill rows store only HubSpot record ID + segment + source, because the repo is public).
- `pipeline_goal` — see **pipeline_goal (shared)** below; write the identical object here and into `data/overview.json`

Preserve all other fields — do not delete or restructure.

### pipeline_goal (shared — weekly-digest.json + overview.json)

Write this **top-level** key (sibling of `weeks`/`summary`, not inside a per-week entry) into **both** `data/weekly-digest.json` and `data/overview.json`, identical object in each:

```json
{
  "school_year": "SY27-28", "as_of": "YYYY-MM-DD",
  "goal": { "generated": N, "closed_won": N },
  "actual": { "open": N, "lost": N, "won": N },
  "by_segment": { "single_small": {"open":N,"lost":N,"won":N}, "medium": {…}, "large": {…}, "enterprise": {…} },
  "by_product": { "ij": {"open":N,"lost":N,"won":N}, "inkwell": {…}, "wh": {…}, "gf8": {…}, "untagged": {…} },
  "by_pipeline": { "district": {"open":N,"lost":N,"won":N}, "school": {…}, "new_business": {…} },
  "reference_year": { "school_year": "SY25-26", "generated": N, "closed_won": N, "closed_lost": N, "win_rate_pct": N,
    "by_segment": {…}, "by_product": {…}, "by_pipeline": {…} },
  "note": "…", "hubspot_list_url": "…", "field_value": "27-28"
}
```

From the Phase 1 "Pipeline vs. school-year goal" pull. `reference_year` is static (SY25-26 is closed) — copy it forward unchanged from the previous run's file rather than recomputing. `goal`/`field_value`/`hubspot_list_url` come from `data/goals.json`; if `goals.json`'s target numbers changed since the last run, use the new ones. **`data/monthly-digest.json` also carries this same key but belongs to the monthly-marketing-digest skill — don't touch it here.**

`assets/app.js`'s `pipelineGoalSection()` renders this on the Weekly, Monthly, and Overview tabs (compact on Weekly/Overview, full breakdown on Monthly) — a missing or malformed `pipeline_goal` silently hides the card rather than breaking the tab, so a bad pull here won't surface as an error. Confirm the shape matches before pushing.

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
  "by_product": { "ij": {"hih":[cur,pri],"mql":[cur,pri],"sql":[cur,pri],"opp":[cur,pri]}, "inkwell": {…}, "wh": {…}, "gf8": {…} },
  "by_segment": { "single_small": {"hih":[cur,pri],…}, "medium": {…}, "large": {…}, "enterprise": {…} },
  "coverage_pct": { "product": {"hih":0,"mql":0,"sql":0,"opp":0}, "segment": {"hih":0,"mql":0,"sql":0,"opp":0} },
  "disposition": {
    "disqualified_current": 0, "disqualified_prior": 0, "entered_nurture_current": 0, "entered_nurture_prior": 0,
    "by_product_current": { "ij": {"disqualified":0,"entered_nurture":0}, "inkwell": {…}, "wh": {…}, "gf8": {…} }
  },
  "pipeline": {
    "new_business_open_deals": 0, "account_growth_open_deals": 0, "renewal_open_deals": 0, "district_open_deals": 0, "school_open_deals": 0,
    "by_product": { "ij": {"count":0,"amount":0}, "inkwell": {…}, "wh": {…}, "gf8": {…}, "untagged": {"count":0,"amount":0} },
    "by_stage": { "new_business": [ {"stage":"Interest","count":0,"amount":0} ], "account_growth": [ … ], "renewal": [ … ], "district": [ … ], "school": [ … ] }
  },
  "top_pieces": [ {"offer":"…","fills":0} ],
  "dq_reasons": [ {"reason":"…","count":0} ], "nurture_reasons": [ {"reason":"…","count":0} ],
  "list_event_detected": false,
  "acknowledged_events": [],
  "data_flags": []
}
```

`slack_message_ts` is blank at write time — update after PHASE 5 completes (soft-update: re-fetch, set the field, push a second minimal commit OR note it in data_flags if re-push is too costly).

### overview.json

Fetch current `data/overview.json` from GitHub. Update ONLY these keys — preserve everything else:

**Never write `summary` in overview.json.** It is the Overview's "AI Monthly Digest Summary" card and belongs to the monthly digest. The 2026-09-21 run overwrote it with a weekly narrative. The weekly talk-track goes in `weekly_signal` only.

**Never touch top-level `updated` or `monthly_summary_updated` in overview.json.** They drive the monthly card's "Generated · Data month of" stamp and belong to the monthly digest. The 2026-10-05 run bumped `updated` and made the card read October over August's text. Only `weekly_signal.current.updated` and `brand_lift.updated` carry the weekly date.

```json
"weekly_signal": {
  "current": {
    "week_label": "Week of Mon D",
    "updated": "YYYY-MM-DD",
    "narrative": "[the 2–4 sentence prose narrative composed in Phase 1]"
  },
  "previous": "[last run's `current` block, moved down verbatim]"
},
"kpis": {
  "hih_pool": N,
  "mql_to_sql_pct": N,
  "closed_won_mtd": "$N"
},
"pipeline_goal": "[see pipeline_goal (shared) above — same object written into weekly-digest.json]"
```

**Shape rules — the Overview tab renders straight off these keys:**
- `weekly_signal` rotates: this run's block becomes `current`, and the block that was
  `current` moves to `previous` verbatim. The Overview tab shows both cards. Writing a
  flat `weekly_signal` (no `current`/`previous`) still renders, but silently drops the
  prior week's card — don't.
- `kpis` must stay the flat three-key object above, or the rich tile array
  (`[{label, value, delta, delta_dir, sub, spark[]}, …]`). No other shape. `assets/app.js`
  normalizes both; anything else renders an empty KPI strip.
- After pushing, load https://inquired-marketing-dash.netlify.app/ and confirm the
  Overview tab renders (it fetches `data/overview.json` client-side — a bad shape shows
  "Could not load data/overview.json", not a build failure, so Netlify deploying green
  is not proof the tab works).

### Push

```bash
cd inquired-dash-reporting
git add data/weekly-digest.json data/overview.json data/run-logs/weekly-marketing-digest-run-log.json
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
# ASANA_TOKEN comes from the environment; never echo it
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
📆 Weekly Marketing Data Dash (Generated [Mon D, YYYY] · Data week of [Mon D, YYYY])

[1–2 sentences: what moved and why. Weave actual numbers in naturally — e.g. "47 High Intent Handraisers came in, up 8% vs last week and in line with July norms. MQL→SQL held at 22%, with IJ driving most lower-funnel movement."]

🔥 [Bright spot — only include if something crossed +50%. Omit line entirely if not.]
⚠️ [Watch item — only include if something dropped >10%. Omit line entirely if not.]

📊 Dashboard → https://inquired-marketing-dash.netlify.app/
```

**Formatting rules:**
- Title date: "Jul 14, 2026" format — full date, no ISO week notation
- Narrative: 1–2 sentences, prose only, no bullets, no tables, no thread reply
- Flag lines: omit entirely if the threshold wasn't crossed — no placeholder text
- Dashboard link is always last. All segment/product/disposition/pipeline detail lives there.

**Posting failure = hard stop.** If `chat.postMessage` returns non-`ok:true` or any HTTP error: STOP the run. Do NOT fall back to `slack_send_message` MCP — that posts as Kelsey, not Dash, breaking bot identity. Report the exact error and likely cause (`$DASH_BOT_TOKEN` not set / not in allowlist / token revoked). Nothing else should reach Slack on failure.

Capture `ts` from the response — store in run log as `slack_message_ts`.

---

## STEP 6: DM Kelsey

Send ONE DM to Kelsey (user ID `U06QR3G0CCA`) as the Clawrence bot using `$CLAWRENCE_BOT_TOKEN`. Never echo tokens.

Open DM channel:
```bash
CH=$(curl -sS -X POST https://slack.com/api/conversations.open \
  -H "Authorization: Bearer $CLAWRENCE_BOT_TOKEN" \
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
• [✓/—/✗] Brand lift (GSC) → data/overview.json + data/weekly-digest.json [N weeks upserted / deferred: creds not set / error]
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
