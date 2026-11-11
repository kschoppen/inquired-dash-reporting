# Monthly AEO Audit: Routine Instructions

Run UNATTENDED on the 8th of each month. Complete ALL steps in order. NEVER ask questions. NEVER fabricate data. America/Detroit for all dates.

This routine owns the **Site AEO audit** panel on the reporting dash. It rewrites `data/aeo-audit.json` and nothing else. `assets/app.js` (`aeoAuditSection`) renders the panel from that file, so never edit the HTML or JS. It replaces the old local task `monthly-aeo-audit`, which signed in to MKT1 from Kelsey's Mac and failed each month when that login expired (Oct and Nov 2026).

Repo in workspace: `kschoppen/inquired-dash-reporting`.

---

## STEP 1: Run the audit

Call the MKT1 connector tool `mkt1_aeo_audit` with `url` = `https://www.inquired.com`.

The audit's own instructions require a clean context: report only what the public site and public web show right now. Do NOT fill any gap from the repo, CLAUDE.md files, memory or training data. Do not read any file in this repo before the audit report is complete, except as STEP 2 says. A fresh cloud session already counts as clean for the "new empty folder" prompt, so do not stop to ask the clean-context question.

If the MKT1 tool returns an authentication error, or any error before the report is produced: do NOT touch `data/aeo-audit.json`. Go to STEP 4 (failure DM) and stop.

## STEP 2: Write `data/aeo-audit.json`

Read the current `data/aeo-audit.json` once, only to copy its shape. Rewrite it with the new results. Keep exactly these keys and shapes:

```
{
  "updated": "YYYY-MM-DD",            // today, America/Detroit
  "source": "mkt1_aeo_audit, clean-context run (cloud routine AEO_ROUTINE.md)",
  "site": "https://www.inquired.com",
  "pillars": [
    {"name": "Crawlable",       "checks": [{"check": "...", "status": "pass|partial|fail", "note": "..."}]},
    {"name": "Understandable",  "checks": [...]},
    {"name": "Citable",         "checks": [...]}
  ],
  "fixes": {"p0": ["..."], "p1": ["..."], "p2": ["..."]}
}
```

- One entry per row of the report card (Section 1 of the audit), in the same order and with the same check names as the previous file. Map ✅ to `pass`, ⚠️ to `partial`, ❌ to `fail`. A check that could not run is `partial` with the reason in `note`.
- `fixes.p0/p1/p2` are the audit's Fix List items as plain strings, specific page and element, no checkbox syntax. If P0 has nothing, use `[]` (the panel then says "No P0 fixes this run").
- No em or en dashes anywhere in the file.
- Validate: `python3 -c "import json;json.load(open('data/aeo-audit.json'))"` and confirm all three pillars have checks.

## STEP 3: Commit and push

Commit `data/aeo-audit.json` only, message `AEO audit <YYYY-MM-DD>`. Merge to `main` and push `main` (no pull request, per CLAUDE.md). If the push conflicts, stop and go to STEP 4 with the conflict as the reason.

## STEP 4: Slack DM to Kelsey

One DM to Kelsey (user ID `U06QR3G0CCA`) using `$CLAWRENCE_BOT_TOKEN` from the environment (`conversations.open`, then `chat.postMessage`). Never echo tokens. No em or en dashes.

Success:

```
🔎 *Site AEO audit refreshed* (<date>)
• Pillars: Crawlable <p/partial/f>, Understandable <...>, Citable <...>
• P0 fixes: <N> (<one line each>)  |  P1: <N>  |  P2: <N>
• Changed since <previous updated date>: <the 1-3 things that moved>
🔗 https://inquired-marketing-dash.netlify.app/ → AEO panel
Reply "make Asana tasks for the AEO fixes" to turn the fixes into Asana tasks.
```

Failure (auth error, tool error, push conflict):

```
⚠️ *Site AEO audit failed* (<date>)
Reason: <exact error text>
Nothing was written. The panel still shows <previous updated date>.
```
