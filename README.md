# inquirED Reporting Dashboard

A single Netlify site that hosts month-over-month reporting for every marketing reporting skill, each on its own tab. Slack stays a lightweight "here's the headline → go look" nudge; the dense charts/tables live here.

**Live:** Netlify (password-protected). Deploys on push to `main`.

## How it works (data-driven)
- **Each reporting skill emits a JSON history file** into `/data/` (e.g. `data/monthly-digest.json`). This is the month-over-month store — append a new entry each run.
- **The shell renders it.** `index.html` + `assets/app.js` fetch each tab's JSON and draw charts (Chart.js) + tables, with MoM / YoY deltas and seasonality framing. No chart logic lives in the skills.
- **Add a skill = drop a JSON + add one entry** to the `TABS` array in `assets/app.js`.

## Data contract (per `/data/<skill>.json`)
```jsonc
{
  "skill": "...", "title": "Tab label", "updated": "YYYY-MM-DD",
  "fiscal_year_start_month": 7,            // for YoY / FY framing
  "seasonality": { "note": "..." },         // optional, shown as a banner
  "months": [                               // append-only, oldest → newest
    { "period": "YYYY-MM", "label": "Mon YYYY",
      "funnel":  { "hih":n, "mql":n, "sql":n, "opp":n },
      "revenue": { "district_won":$, "school_won":$, "total_won":$, "nb_won":$, "wins":n,
                   "win_rate_count_pct":n, "win_rate_dollar_pct":n,
                   "by_segment": { "single_small": {"won":$,"lost":$}, ... } },
      "web":     { "sessions":n, "users":n, "views":n, "yoy": {"sessions":n,...} },
      "seo":     { "tracked":n, "top10":n, "avg_position":n } }
  ]
}
```
Use `null` for metrics not available in a given month — the dashboard renders gaps gracefully and fills them as history accrues. The shared contract is mirrored in `inquired-marketing/skills/_reporting-pattern/REFERENCE.md`.

## Tabs
- **Monthly Funnel & Revenue** — `monthly-marketing-digest` (live)
- _planned:_ Weekly Funnel · Campaign Analytics · Competitor · SEO

## Local preview
Open `index.html` in a browser, or `python3 -m http.server` from the repo root (needed so `fetch()` can read `/data`). The site is password-protected on Netlify, so deploys can't be curl-verified — verify locally before pushing.
