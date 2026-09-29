# Monday Account Pulse Update — Routine Instructions

Run UNATTENDED every Monday at 7:30am ET. Complete ALL steps in order. NEVER ask questions. NEVER fabricate data. America/New_York for all dates.

This routine owns the **Account Pulse (MQA)** tab. It writes exactly three files and nothing else:
- `data/account-pulse.json` (built by `scripts/build_account_pulse.py`, never hand-written)
- `data/pulse-decisions.json` (snapshot of the Airtable decision log)
- `data/hubspot-owners.json` (owner ID → name cache)

`account-pulse.html` renders every number from the JSON, so **never edit the HTML**. Never touch State Signal, Nurture or any other tab's files.

Repo in workspace: `kschoppen/inquired-dash-reporting` → inquired-marketing-dash.netlify.app. HubSpot portal `4451852`. Universe: companies with `segment` in Medium District, Large District, Enterprise District.

There is no Healthchecks check for this routine (the Healthchecks plan is full). The page shows "Data is N days old" once the JSON is more than 8 days old, and the DM in STEP 5 is the run receipt.

---

## STEP 0: Setup

```bash
git config --global user.email k.schoppen@inquired.com
git config --global user.name 'Account Pulse (cloud routine)'
TODAY=$(TZ=America/New_York date +%F)
WEEK_AGO=$(TZ=America/New_York date -d "$TODAY -7 days" +%F)
RAW=/tmp/pulse && rm -rf $RAW && mkdir -p $RAW
echo "$TODAY $WEEK_AGO"
```

Don't read `data/account-pulse.json` or `account-pulse.html`. The script handles history and the page. Don't pre-check environment variables.

---

## STEP 1: HubSpot pulls (HubSpot MCP `query_crm_data`, `verbosityLevel: "LOW"`)

Five queries. Put `<TODAY>` and `<WEEK_AGO>` in as literal dates. Always use `BETWEEN` for date ranges (`>=` on dates has returned 503s). If a call returns 503, wait a few seconds and retry, up to 3 times.

**How to save each result into `$RAW`:** when the tool says the output was saved to a file, `cp` that file to `$RAW/<name>.json` unchanged. When the result comes back inline and is small, write it to `$RAW/<name>.json` in the compact form `{"rows": [{...properties...}]}`, one object per record, copying `hs_object_id`, `name`, `segment`, `state_st`, `hubspot_owner_id`, `mqa_signal` and each date as `<property>_iso` (YYYY-MM-DD). For the aggregate query use `{"tsv": [["MQA","99"], ...]}`. Never retype a large result by hand.

1. `mqa_open`:
```sql
SELECT hs_object_id, name, segment, state_st, mqa_signal, hubspot_owner_id, notes_last_contacted, first_mqa_date, recent_mqa_date FROM COMPANY WHERE mqa_lifecycle_stage = 'MQA' AND segment IN ('Medium District','Large District','Enterprise District') ORDER BY recent_mqa_date DESC LIMIT 500
```
2. `mqa_ever`:
```sql
SELECT hs_object_id, mqa_signal, first_mqa_date, first_mqa_opportunity_date FROM COMPANY WHERE first_mqa_date IS NOT NULL AND segment IN ('Medium District','Large District','Enterprise District') LIMIT 1000
```
3. `opp_since`:
```sql
SELECT hs_object_id, name, segment, state_st, hubspot_owner_id, first_mqa_date, first_mqa_engaged_date, first_mqa_opportunity_date FROM COMPANY WHERE first_mqa_opportunity_date BETWEEN '2025-10-01' AND '<TODAY>' AND segment IN ('Medium District','Large District','Enterprise District') LIMIT 1000
```
4. `engaged_7d`:
```sql
SELECT hs_object_id, name, segment, state_st, hubspot_owner_id, mqa_signal, notes_last_contacted, recent_mqa_engaged_date FROM COMPANY WHERE mqa_lifecycle_stage = 'Engaged' AND recent_mqa_engaged_date BETWEEN '<WEEK_AGO>' AND '<TODAY>' AND segment IN ('Medium District','Large District','Enterprise District') LIMIT 500
```
5. `stage_totals`:
```sql
SELECT mqa_lifecycle_stage, COUNT(*) FROM COMPANY WHERE mqa_lifecycle_stage IS NOT NULL AND segment IN ('Medium District','Large District','Enterprise District') GROUP BY mqa_lifecycle_stage
```

If a query returns exactly as many rows as its LIMIT, the LIMIT cut it off: page with `offset` and merge the `results` arrays before saving. Check with `python3 -c "import json;print(len(json.load(open('$RAW/mqa_open.json'))['results']))"`-style counts that each file is complete.

If any of the five pulls fails after retries, stop: don't run the script, don't commit, and send the failure DM (STEP 5).

---

## STEP 2: Decision log snapshot (Airtable MCP)

`list_records_for_table` on base `apprP4OjHNI918JlX`, table `tblksZcY1lzbWKh8C` (the Account Decisions table; page through every record). Only rows with a `CompanyId` and `DecidedAt` count; ignore the table's other default columns (Name, Notes, Assignee, Status, Attachments). Never create, edit or delete tables or records. Write `data/pulse-decisions.json`:

```json
{ "as_of": "<TODAY>", "entries": [ { "companyId": "...", "companyName": "...", "decision": "Demote|Recycle|Escalate|Cleared", "note": "...", "decidedBy": "...", "decidedAt": "<ISO timestamp>", "daysMqa": 316 } ] }
```

Sorted by `decidedAt`, oldest first. Copy the values exactly. If the table is empty, write `"entries": []`. If the Airtable tool fails, leave the existing file untouched and say so in the DM (the page still reads the log live; only the follow-up flags go a week stale).

---

## STEP 3: Build

```bash
python3 scripts/build_account_pulse.py --raw $RAW --today $TODAY
```

It must print `PULSE_BUILD_OK`. If its JSON line lists `unknown_owner_ids`, resolve them through the HubSpot Users object (more reliable than `search_owners`):

```sql
SELECT hs_object_id, hs_searchable_calculated_name, hubspot_owner_id FROM USER LIMIT 500
```

Write `$RAW/owners.json` as `{"<hubspot_owner_id>": "<hs_searchable_calculated_name>"}` for every row, then run the script again (it merges them into `data/hubspot-owners.json`). IDs still unresolved stay as "Owner <id>"; list them in the DM.

Any `ERROR:` exit means a raw file is missing or malformed: fix the file from STEP 1 and rerun. Never edit `data/account-pulse.json` by hand.

---

## STEP 4: Commit and push

```bash
git checkout main && git pull --rebase origin main
git add data/account-pulse.json data/pulse-decisions.json data/hubspot-owners.json
git commit -m "Account Pulse <TODAY>: <N> open MQAs, <N> to pass to Sales, <N> stale"
git push origin main
git ls-remote origin main
```

Only ever commit those three files. On a rebase conflict in one of them, take your version (this routine is their only writer). Any other conflict: abort, don't push, report it in the DM. Confirm the pushed SHA is `main` (the live site is password protected, so curling it proves nothing).

---

## STEP 5: Slack DM to Kelsey

One DM to Kelsey (user ID `U06QR3G0CCA`) as the Clawrence bot using `$CLAWRENCE_BOT_TOKEN` from the environment (`conversations.open`, then `chat.postMessage`). Never echo tokens. Numbers come from the script's JSON line and `data/account-pulse.json`.

```
📇 *Account Pulse refreshed* (<date>)
• <N> open MQAs · <N> new MQA / <N> new Engaged / <N> new Opp this week
• Pass to Sales: top 3 are <name (owner, score)>, <...>, <...>
• Marketing warmed first: <x%> of <N> new Opportunities since Nov 17
• Stale MQAs: <N> · decisions logged: <N> · follow-ups: <N flagged, or none>
🔗 https://inquired-marketing-dash.netlify.app/ → Account Pulse (MQA)
[✓/✗] HubSpot pulls · [✓/✗] decision log · [✓/✗] pushed <SHA>
```

Follow-ups = rows in `pass_to_sales.rows` or `stale.rows` with a `followup` field. No em or en dashes in the message. On a failed run, send the same header with `❌` and the step that failed instead of the bullets.
