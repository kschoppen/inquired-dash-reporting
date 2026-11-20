# Tuesday Teacher Nurture Snapshot: Routine Instructions

Healthchecks: the ping URL is `${HC_TEACHER_NURTURE_URL}`, a cloud environment variable (Marketing Automation). Use it only inside the curl pings below and never print it. If it is empty, skip the pings and say so in the run's report.

Run UNATTENDED every Tuesday at 7:30am ET, after the Nurture Programs routine (7am). Complete ALL steps in order. NEVER ask questions. NEVER fabricate data. America/New_York for all dates.

This routine owns `data/teacher-nurture-snapshot.json`, which the **Teacher Nurture** tab renders (it only falls back to the live Netlify function when the snapshot is missing). It never edits the HTML, the registry (`data/teacher-nurture.json`) or any other file.

Repo in workspace: `kschoppen/inquired-dash-reporting` → inquired-marketing-dash.netlify.app. Mailchimp audience `20beb95bf5`.

Secrets come from the environment: `MAILCHIMP_API_KEY`, and the Slack bot token as `$CLAWRENCE_BOT_TOKEN`. Never print either.

---

## STEP 0: Setup

```bash
curl -fsS -m 10 --retry 3 ${HC_TEACHER_NURTURE_URL}/start || true
```


## STEP 1: Pull the snapshot

```bash
python3 scripts/teacher_nurture_snapshot.py
```

Run it as written. Don't check or echo environment variables first; the script reports a missing key itself. It prints one JSON line. Exit `2` = the key isn't in the environment. Exit `3` = Mailchimp refused a call (the error line says which). On either, don't commit anything: go to STEP 4 with the error, then send the fail ping in STEP 5.

## STEP 2: Read what changed

Open `data/teacher-nurture-snapshot.json` and `data/teacher-nurture.json`. Compare the newest `history` row with the newest row at least 6 days older (skip same-week test runs), and note:
- Phase movement: each phase's count vs last week. The program's goal is moving teachers from Awareness to Discovery to Activation, so lead with Discovery, Adopt and Sustained.
- Flows sending: a flow is sending only when one of its emails has `sent > 0`. Mailchimp reports every journey step as `"sending"` even when paused, so ignore `status`.
- Flags: the script computes them and writes `flags` (and `entry_check`) into the snapshot. Read them, don't recompute. Each has a level, `alert` or `watch`. They compare this run with the newest earlier history row at least 6 days old (`checks_base_date`); with no such row it is the baseline week and only the single-run checks (unsubscribes, bounces, missing segments) can fire. Don't force verdicts on thin data. The checks:
  - `entry` (alert): a flow's trigger population grew by 100+ since the base date but its first email sent 0 more. The trigger may not be firing. Cause unconfirmed until Kelsey checks the flow in Mailchimp;
  - `flat` (watch): a flow that had sends has none since the base date;
  - `unsub` (watch): an email with 50+ sent and unsubscribes over 1%;
  - `bounce`: an email with 50+ sent and bounces over 2% (watch) or over 5% (alert);
  - `swing` (watch): a phase moved by 200+ and more than 25% since the base date. Likely a Gainsight sync change, so check it before trusting the numbers;
  - `segment` (alert): `segments_missing` is not empty.
  Also, if the registry still has a `data_quality` note, mention it in one line (don't remove it, that's a human call).

## STEP 3: Commit and push

```bash
git checkout main && git pull --rebase origin main
git add data/teacher-nurture-snapshot.json
git -c user.email=k.schoppen@inquired.com -c user.name='Teacher Nurture (cloud routine)' commit -m "Teacher Nurture snapshot <YYYY-MM-DD>"
git push origin main
git ls-remote origin main
```

Only ever commit `data/teacher-nurture-snapshot.json`. On a rebase conflict in that file, take your version (this routine is its only writer). Any other conflict: abort, don't push, and report it in the DM.

## STEP 4: Slack DM to Kelsey

**Where it goes (Kelsey, 2026-11-19: #kelsey-command-center is retired; Eddie DMs her only when she's needed).** If every item is ✓ and the message asks nothing of her, post nothing; the Healthchecks success ping is the all-clear. DM her as described here only when something is ✗, the run failed, or she has to fix or decide something (an expired token to renew, a question only she can answer). Only `alert` flags make it a DM; `watch` flags alone don't. A DM returning `"ok":true` counts as the DM for the Healthchecks step, and a clean run with nothing to send counts as delivered.

One DM to Kelsey (`U06QR3G0CCA`) with the Web API, as the bot, never the Slack MCP:

```bash
TOKEN="$CLAWRENCE_BOT_TOKEN"
curl -sS -X POST https://slack.com/api/chat.postMessage -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json; charset=utf-8" -d @/tmp/dm.json
```

Message (mrkdwn, no em or en dashes):

```
🍎 *Teacher Nurture snapshot* (<date>)
• Discovery <N> (<+/-N>) · Adopt <N> (<+/-N>) · Sustained <N> (<+/-N>) · Holding <N>
• Flows sending: <N> of 6 · <total sent> emails sent so far
• Alerts: <alert flags, one line each>
• Watch: <watch flags, or "nothing new">
🔗 https://inquired-marketing-dash.netlify.app/ → Teacher Nurture
[✓/✗] snapshot · [✓/✗] pushed <SHA>
```

No row 6+ days older yet: skip the week-over-week numbers and say it's the baseline week. On a failed run, the DM says what failed and that the tab still shows last week's snapshot.

## STEP 5: Healthchecks

Success = snapshot pushed to `main` AND the DM returned `"ok":true`:

```bash
curl -fsS -m 10 --retry 3 ${HC_TEACHER_NURTURE_URL} || true
```

On a handled failure: `${HC_TEACHER_NURTURE_URL}/fail`. Never ping success when nothing was pushed.
