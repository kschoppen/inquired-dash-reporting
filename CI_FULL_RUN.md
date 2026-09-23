# Competitive Intel Full Run — Routine Instructions

Runs UNATTENDED on the 10th of every odd month (Jan, Mar, May, Jul, Sep, Nov) at 14:00 UTC
(10am EDT / 9am EST). Cloud routine `trig_01RJHYmJgqxWDud9KueHManw`.
Complete ALL steps in order. NEVER ask questions. NEVER fabricate data — an unknown stays
unknown. America/Detroit for all dates.

This is the bi-monthly **full run** that owns everything on the Competitive Intel tab except
keywords: threat levels, ad activity, positioning, latest signals, messaging, AI summaries,
the AI Overview block, stat tiles, and Strategic Opportunities. The Monday Dash routine
(DASH_ROUTINE.md PHASE 2) only prepends weekly signals and refreshes keywords between runs.

Repo in workspace: `kschoppen/inquired-dash-reporting` → inquired-marketing-dash.netlify.app.
`inquired-miles/inquired-marketing-skills` is also checked out (it holds `scripts/ci-screenshot.js`).

inquirED products: **Inkwell** (K–2 integrated ELA + SS; structured inquiry + knowledge-building),
**Inquiry Journeys / IJ** (K–8 inquiry-based SS), **Great First Eight / GF8** (Pre-K/TK).

---

## STEP 0: Healthchecks start + git identity

```bash
curl -fsS -m 10 --retry 3 https://hc-ping.com/430e85bb-7d4f-48bd-b539-a7431d9be837/start || true
git config --global user.email k.schoppen@inquired.com
git config --global user.name 'CI Full Run (cloud routine)'
TODAY=$(TZ=America/Detroit date +%F)
mkdir -p /tmp/ci
```

Read `data/competitive-intel.json`. `full_run` is the previous run's date — the "since" date
for every step below.

---

## STEP 1: Baseline

Read `competitive-intel.html`. For each of the 17 competitors, note its `.comp-card`
(threat badge, ad-activity bars + title, positioning quote, "Latest signal" date + text) and its
`const DRAWER = {` entry (threat, siteUrl, messaging, aiSummary, signals). The card names
(`.comp-name` innerHTML, entities included) are the keys for everything below:

| Lane (output file) | Competitors |
|---|---|
| Knowledge-building ELA → `/tmp/ci/lane-knowledge-ela.json` | `Amplify CKLA`, `Great Minds · Wit &amp; Wisdom`, `Great Minds · Arts &amp; Letters`, `EL Education · Kiddom`, `Fishtank Learning`, `Bookworms K–5 (Open Up Resources)` |
| Basal ELA → `/tmp/ci/lane-basal-ela.json` | `Benchmark Education`, `McGraw-Hill Emerge`, `HMH Into Reading`, `Imagine Learning · Dragonfly`, `Savvas · myView Literacy` |
| Social studies → `/tmp/ci/lane-social-studies.json` | `Teachers' Curriculum Institute`, `Studies Weekly`, `McGraw-Hill IMPACT` |
| Pre-K / GF8 → `/tmp/ci/lane-prek.json` | `Teaching Strategies`, `Frog Street`, `HighScope` |

If the page's card list no longer matches this table, follow the page (it's the source of
truth) and note the mismatch in the DM.

---

## STEP 2: Research each competitor

Work lane by lane. For each competitor:

1. **Website.** Competitor sites usually block cloud IPs (403), so start with WebSearch for the
   product's current headline and messaging; WebFetch only if it works. Capture the current
   positioning line and 4 short messaging lines, verbatim, under ~15 words each.
2. **Ads.** Try the headless screenshot helper once at the start of the run:
   ```bash
   cd inquired-marketing-skills && npm install --silent && npx playwright install chromium --with-deps
   node scripts/ci-screenshot.js "<url>" "/tmp/ci/<slug>-<platform>-ads.png" 4000
   ```
   - LinkedIn: `https://www.linkedin.com/ad-library/search?accountOwner=<Company Name URL-encoded>` (a company name, not a slug; try 1–2 variants on "No results found")
   - Meta: `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&q=<name>`
   - Google: `https://adstransparency.google.com/?region=US&query=<name>`

   Read each PNG and record only what is visible. **If Chromium won't install or captures fail
   (this happened in July 2026), don't retry per competitor.** Use SEMrush paid data
   (`paid_search_research` → `get_report_schema` → `execute_report`, database `us`) as the ad
   signal instead, and **omit `ad_activity.level`** for any competitor you couldn't observe, so
   the card keeps its last observed level rather than showing a guess.
3. **News since `full_run`.** WebSearch for launches, state/district adoptions, pricing,
   partnerships, awards, efficacy studies. Real, dated, sourced findings only. Skip anything
   already in that competitor's DRAWER signals.
4. **Threat to inquirED** (`high` / `med` / `low`), with a one-line rationale. The card badge and
   DRAWER threat must end up as one value.

Keep product attributions straight: Emerge and IMPACT are McGraw-Hill's, Dragonfly is Imagine
Learning's, myView is Savvas's, Into Reading is HMH's, Arts & Letters and Wit & Wisdom are both
Great Minds'.

Write each lane file as a JSON array, one object per competitor:

```json
{"name": "<exact card name>", "threat": "high|med|low",
 "ad_activity": {"level": 0, "title": "Ad activity: <short> (<level>/4)"},
 "positioning_quote": "verbatim, short",
 "latest_signal": {"date_label": "Nov 2026", "html": "1–3 sentences, <strong> ok, & as &amp;"},
 "messaging": ["\"quote\"", "\"quote\"", "\"quote\"", "\"quote\""],
 "aiSummary": "2–3 sentences ending with <strong>Opportunity:</strong> or <strong>Watch:</strong> + one sentence",
 "new_signals": ["[Finding] — [implication for inquirED]"],
 "drop_signals": ["first words of an existing signal that is now wrong"],
 "site_url": "only if the DRAWER siteUrl is broken or moved",
 "sources": ["urls"]}
```

Any key you leave out stays as it is on the page.

---

## STEP 3: Apply to the page

```bash
cd inquired-dash-reporting
python3 scripts/apply_ci_full_run.py --date "$TODAY" --next "<Mon YYYY two months out, e.g. Jan 2027>" /tmp/ci/lane-*.json
```

The script updates cards and DRAWER entries, and stamps `full_run`, `updated`, and
`next_full_run`. If it prints `NOT WRITTEN`, fix the named keys in the lane files and re-run.
Never hand-edit dates into the HTML.

---

## STEP 4: Internal signals (HubSpot)

`search_crm_objects`, objectType `DEAL`: `hs_is_closed_lost = true` AND `closedate >= full_run`.
Properties: `dealname, closedate, amount_in_home_currency, closed_lost_reason,
closed_lost_category, product_s_, dealtype`. Page through all results and check `total`.

- **Exclude bulk cleanups.** Batches of old deals closed within the same few minutes (typically
  "SQL Call Booked" deals, category `Uninterested`, no product) are pipeline hygiene, not
  losses. Count them separately and say so; never mix them into loss totals.
- From the real losses: count and total $, the share of $ by `closed_lost_category`, and every
  reason that names or implies a competitor (quote the district, $ and product).

---

## STEP 5: Rewrite the synthesis blocks in `competitive-intel.html`

Edit these by hand from STEPS 2–4. Every number must come from this run:

1. **AI Overview** (`<!-- ── AI Overview ── -->` through `<!-- /overview-section -->`): the
   narrative paragraph (per product: external pressure, then internal loss story), 5 alert chips,
   the Competitive Pressure by Product badges, "Where to focus this cycle" (3 items, one per
   product), and 6 Top Signals to Watch. Keep the existing markup and ids (`ov-date`, `ov-pill`,
   `ov-sources`).
2. **Stat tiles:** leave `stat-competitors` alone (it's counted at load). Update the other two
   tiles' numbers and labels.
3. **Strategic Opportunities · By Product:** one card each for Inkwell, IJ, and GF8. Rewrite the
   title, body, and tag if the landscape moved. Keep the ones that still hold.

Then in `data/competitive-intel.json` set `overview_updated` to `$TODAY` and `overview_sources`
to `Data: HubSpot <N> closed-lost deals (<since>–<today>) · competitor sites + ad libraries · SEMrush`.

---

## STEP 6: Validate, then push

```bash
node -e "const s=require('fs').readFileSync('competitive-intel.html','utf8');for(const m of s.matchAll(/<script>([\s\S]*?)<\/script>/g))new Function(m[1]);console.log('js ok')"
python3 -c "import json;json.load(open('data/competitive-intel.json'));print('json ok')"
```

Both must print ok. A broken script block silently disables every drawer on the page. Also
grep the HTML for the old run's month label in the Overview and fix any leftovers.

```bash
git add competitive-intel.html data/competitive-intel.json
git commit -m "Competitive Intel full run — $TODAY"
git push origin HEAD:main || { git pull --rebase origin main && git push origin HEAD:main; }
git fetch origin && git log --oneline -1 origin/main
```

Push failure = hard fail (the run's only deliverable is the page). Go to STEP 8 with `/fail`.

---

## STEP 7: DM Kelsey

One DM to Kelsey (user ID `U06QR3G0CCA`) as the Clawrence bot using `$SLACK_TOKEN`. Never
echo tokens.

```bash
CH=$(curl -sS -X POST https://slack.com/api/conversations.open \
  -H "Authorization: Bearer $SLACK_TOKEN" -H 'Content-type: application/json; charset=utf-8' \
  -d '{"users":"U06QR3G0CCA"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["channel"]["id"])')
```

Message (Slack mrkdwn):

```
*🔭 Competitive Intel full run — [Mon D, YYYY]*

*[1-sentence headline: the most important shift since the last run]*

• Inkwell — [pressure level + the one thing that moved]
• Inquiry Journeys — [same]
• GF8 — [same]

Threat changes: [list, or "none"]
Closed-lost since [date]: [N] real losses, $[X] ([top category] [share]%) · [M] bulk cleanups excluded
Ads: [captured N/51 screenshots | SEMrush fallback — screenshots failed]

🔗 inquired-marketing-dash.netlify.app (Competitive Intel tab)
```

After `chat.postMessage` returns `ok:true`, print exactly `<<<CI_DM_OK ts=<ts>>>>`.

---

## STEP 8: Healthchecks final ping

- **Success** (push landed on `origin/main` AND DM `ok:true`):
  `curl -fsS -m 10 --retry 3 https://hc-ping.com/430e85bb-7d4f-48bd-b539-a7431d9be837`
- **Anything else:**
  `curl -fsS -m 10 --retry 3 https://hc-ping.com/430e85bb-7d4f-48bd-b539-a7431d9be837/fail`

Never ping success on a partial run.
