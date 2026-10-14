# Tuesday Nurture Update — Routine Instructions

Run UNATTENDED every Tuesday at 7am ET. Complete ALL steps in order. NEVER ask questions. NEVER fabricate data. America/Detroit for all dates.

This routine owns the **Nurture Programs** tab: it rewrites `data/nurture-programs.json` and nothing else on the page. `nurture-programs.html` renders every number and note from that file (joined with `data/nurture-workflows.json`), so **never edit the HTML**. It never touches the Teacher Nurture tab (its own Tuesday 7:30am routine, TEACHER_NURTURE_ROUTINE.md, writes the snapshot it reads) or any file another routine owns.

Repo in workspace: `kschoppen/inquired-dash-reporting` → inquired-marketing-dash.netlify.app. HubSpot portal `4451852`.

---

## STEP 0: Setup

```bash
git config --global user.email k.schoppen@inquired.com
git config --global user.name 'Nurture Update (cloud routine)'
curl -fsS -m 10 --retry 3 https://hc-ping.com/a65c75b3-5ab3-4eed-862f-77192d4efe5d/start || true
```

Read these three files in full before pulling anything:
- `data/nurture-workflows.json`: the registry. The active workflows, each with `flow_id`, `nurture_property_value`, `product`, enrollment list. Use it as-is. You cannot ask Kelsey whether the set changed, so the DM (STEP 5) asks her to reconfirm instead.
- `data/nurture-programs.json`: last run's output. This is the **schema you must reproduce**: same keys, same shapes. Keep every key, even ones you can't refresh.
- `nurture-programs.html`: read the `render*` functions once so you know which fields feed which section. Don't edit it.

`launch_date` in the JSON (Aug 18, 2026) is the confirmed start of the Fall 2026 program, used for the email window and the intro. Lifecycle movement is NOT measured from it: it is measured from each contact's own enrollment date (see PHASE B).

Write the JSON after Phase A, then again after Phase B, so a Phase B failure never costs Phase A's data.

---

## HubSpot traps that fail silently (zero rows, no error)

1. **`role` stores internal values, not labels.** Use `teacher`, `school leader`, `district leader`; some are capitalized (`Coach/Specialist`, `Other`). Check with `get_properties` before filtering on any enumeration.
2. **The `nurture_track*` tag is NOT the enrolled population.** It is written only when a contact completes the full workflow, so it misses nearly everyone in the program (as of Oct 13: 416 Inquiry Journeys and 108 Inkwell contacts carry `Active`, against 6,124 enrollments). Never count enrollment, movement, role or source from it.
3. **Never use `is none of` tag filters to find exits.** Exits are contacts who completed a workflow or were enrolled and are no longer active in it (mostly removed by a suppression list). Read the lists in the registry instead.

---

## PHASE A: Email performance (HubSpot marketing email)

### A1. Find the emails

```
search_crm_objects(objectType: "MARKETING_EMAIL",
  filterGroups: [{ filters: [{ propertyName: "nurture", operator: "IN", values: [<every nurture_property_value in the registry>] }] }],
  properties: ["hs_object_id", "hs_name", "hs_email_type", "nurture", "product", "hs_createdate"])
```

Use the `nurture` property, never a name search (names are inconsistent across seasons). Map each email to its program via `nurture` → registry `product`. Program keys: `ij` Inquiry Journeys, `inkwell` Inkwell, `gf8` Great First 8, `agnostic` inquirED General, `wh` World History.

### A2. Pull analytics

`get_marketing_email_analytics`, `OVERVIEW` mode, `dimensions: ["MARKETING_EMAIL_OBJECT_ID"]`, `frequency: "TOTAL"`, from the earliest `hs_createdate` in the batch to today. Batch IDs into as few calls as possible. If the result is saved to a file, aggregate it with `python3` rather than paging through it. Use the `*ExcludingBots` open and click fields.

### A3. Fill the JSON

- `programs[]`: one entry per registry workflow, in the existing order. Refresh `delivered`, `suppressed`, `open_rate`, `click_rate`, `unsub_rate` (fractions, e.g. `0.244`), `emails_sending` (emails with 20+ delivered; 1-2 sends are tests), `emails_total`. Rewrite `badge` and `note_html` from the data (rules below). Leave `flow_id`, `key`, `label`, `status_label` alone. Rates are `null` when delivered is 0.
- `emails.rows[]`: **every** email with 20+ delivered (set `emails.min_delivered` to 20). Fields: `program`, `code` (the bracket code from `hs_name`, e.g. `NE-IJ-LT-1`, without brackets), `subject`, `url` (`https://app.hubspot.com/email/4451852/details/<id>/performance`), `track` (`CT` or `LT` from the code, else omit), `delivered`, `opened`, `open_rate`, `clicks`, `unsubs`, `ctor` (clicks ÷ opens). Rewrite `emails.callout_html` with the one comparison that matters most this week, or `""` if nothing clears the volume bar.
- `portfolio.tiles[]`: keep 4 tiles. Total delivered (with week-over-week change vs. the previous `history` entry), portfolio unique open rate (with click and unsubscribe rates in the cap), emails that have sent out of emails registered, and the most important red flag. Rewrite `portfolio.note_html`.
- `top_content.cards[]`: one per program. Best `opened`, best `clicked`, highest-unsubscribe `exit` email, among emails with 20+ delivered. For those emails only, call `manage_marketing_email` `GET_EMAIL_DETAILS` for the subject and `previewText`. Same email twice → second tile gets `"same_as": "Opened"` (or "Clicked") instead of a subject. A metric with no data anywhere in the program → `{"type": "...", "none": true, "none_sub": "<one-line reason>"}`. A program with nothing sent → `"empty_text"` and no `metrics`. Set `as_of_label` to today ("Sep 29, 2026").
- `email_window` → `{ "start": <earliest hs_createdate>, "end": <today> }`.

Write the file now (STEP 3's validation, commit and push). Then continue.

---

## PHASE B: Enrollment, lifecycle + audience (HubSpot CRM contacts, read through lists)

**Population = contacts ever enrolled in a program's workflow**, not the `nurture_track` tag. Each registry workflow has `ever_enrolled_list_id` (contact list: "Workflow status has been enrolled in [workflow]") and, except World History, `active_list_id` ("is currently active in [workflow]"). Read them with `query_crm_data` and `hs_crm_search.ilsListIds`. The contact property `nurture_enrollment_date` (date picker) is set by a step at the top of each workflow and was backfilled from the workflow history exports on Oct 14, 2026. `nurture_stage_at_enrollment` and `nurture_enrollment_form` fill in only for contacts enrolled after the workflow steps went live.

### B1. Counts per program

```sql
SELECT COUNT(*) FROM CONTACT WHERE hs_crm_search.ilsListIds = '<ever_enrolled_list_id>'
SELECT COUNT(*) FROM CONTACT WHERE hs_crm_search.ilsListIds = '<active_list_id>'
SELECT COUNT(*) FROM CONTACT WHERE hs_crm_search.ilsListIds = '<ever_enrolled_list_id>' AND nurture_enrollment_date IS NULL
```

`enrolled` = first count, `in_progress` = second (World History: 0), `no_longer_active` = enrolled minus in_progress (removed by a suppression list, or completed). Third count = contacts with no enrollment date: report it in `lifecycle.coverage.html` and in a `data_flags` entry. List 10585 (any product) should equal the sum of the four `in_progress` counts.

### B2. Movement after enrollment

For each program, run four queries, one per stage, and page with `OFFSET` while 500 rows come back:

```sql
SELECT hs_object_id, nurture_enrollment_date, lifecyclestage,
  hs_v2_date_entered_marketingqualifiedlead, hs_v2_date_entered_salesqualifiedlead,
  hs_v2_date_entered_opportunity, hs_v2_date_entered_customer
FROM CONTACT WHERE hs_crm_search.ilsListIds = '<ever_enrolled_list_id>'
  AND <one stage-entry property> >= '2026-08-06' ORDER BY hs_object_id ASC LIMIT 500
```

Results over the size limit are saved to a file: parse with `python3 -I` (they are JSON, one `content` string per row). Merge rows by `hs_object_id`, then classify each contact once:

- **Moved** = at least one stage entry strictly after the enrollment day (stage timestamp at or after the enrollment date plus one day, UTC). Contacts enrolled in the Aug 31 bulk run (enrollment date 2026-08-31) were enrolled at 16:05 ET, so for them count stage entries after 20:05Z that day.
- **Same day**: a stage entry on the enrollment day itself that cannot be ordered against the enrollment. Not counted as moved. Report the count in the tile caption.
- **Before enrollment only**: the contact entered a stage between Aug 6 and enrolling, and nothing after. New contacts are often enrolled because they converted on a piece of content, and some of that content makes them MQL, so reaching MQL is not a nurture result for these contacts.
- No enrollment date: skip and count in B1.

`lifecycle.by_program[]`: `enrolled`, `in_progress`, `no_longer_active`, `moved` (unique contacts), `moved_note` (MQL versus SQL, Opportunity or Customer-only counts; say if several movers are at one school, which looks like a sales close), `tracking: "good"`, `tracking_label: "By enrollment"`. `lifecycle.tiles[]`: 4 tiles, headline first: total moved after enrollment, total enrolled with in progress and no longer active, the per-program move rates and which cohort dates they come from, and the count who had already entered a stage before enrolling. Cohort age matters: say which bulk dates dominate. Rewrite `lifecycle.coverage.html` to match this week.

Once `nurture_stage_at_enrollment` is filled for most recent enrollees, split movement by it (Lead-stage enrollees: moved to MQL; MQL-stage enrollees: moved to SQL) and add that to the tiles.

### B3. Audience

`audience.roles[]` and `audience.sources[]` come from `GROUP BY` queries on each program's ever-enrolled list (`GROUP BY` works with a list filter):

```sql
SELECT role, COUNT(*) FROM CONTACT WHERE hs_crm_search.ilsListIds = '<ever_enrolled_list_id>' GROUP BY role
SELECT hs_analytics_source, COUNT(*) FROM CONTACT WHERE hs_crm_search.ilsListIds = '<ever_enrolled_list_id>' GROUP BY hs_analytics_source
```

Roles: Teacher (`cls: "teacher"`), Admin / Leadership (School Leader + District Leader + Coach/Specialist), Other / Unassigned (`cls: "other"`, everything else). Store counts and `total`; every group must sum to `total`. Skip programs with 0 enrolled.

`audience.movement.value`: contacts enrolled in more than one workflow. Lists cannot show this, so carry the last value forward and say which history exports it came from, unless fresh History exports from the workflows were supplied.

If a Phase B query fails, keep last week's values for that block and add a `data_flags` entry. Never zero it out.

---

## Writing rules (all prose fields: `*_html`, `cap`, `label`, `moved_note`, `open_items`)

- **Current state only, never a change log.** Don't write "previously reported", "corrected", "this run". Week-over-week movement is fine ("5,940 delivered, up from 2,832").
- **No em or en dashes.** Commas, colons, full stops. Ranges: "Jul 30 to Sep 29".
- **No verdicts on thin data.** Under ~30 sends, or under ~4 weeks since an email started, say volume is too low to read.
- Flags: a program with zero sends → badge `flag` "Not sending" (say the cause is unconfirmed: empty audience or workflow off). `suppressed` at or above `delivered` → badge `watch` "Check suppression" with the numbers. A step-to-step volume cliff (>5x) → mention it, cause unconfirmed. Unsubscribe over 1% on 50+ sends → call it out. Everything else → `good` or `pending` badge with a short factual label.
- Never state a workflow is enabled or paused. That isn't readable via API.
- `open_items[]` (`level`: `red`, `amber` or `grey`): rewrite from this week's data. Keep an item only while it's still true. Keep the Tim reporting-rebuild item only if it's still open per the previous run's text (you can't check Asana); update its "weeks overdue" count.
- `intro_html` and `footnote_html`: update the dates. `updated` = today. `flows_linked` = registry workflow count. Leave `stale_after_days` at 14.

---

## STEP 3: Validate, commit, push

```bash
python3 - <<'EOF'
import json
d = json.load(open("data/nurture-programs.json"))
need = ["updated","programs","lifecycle","portfolio","emails","top_content","audience","open_items","footnote_html"]
missing = [k for k in need if k not in d]
assert not missing, missing
assert len(d["programs"]) == len(json.load(open("data/nurture-workflows.json"))["workflows"])
bad = [k for k, v in d.items() if isinstance(v, str) and ("—" in v or "–" in v)]
print("OK", d["updated"], "dash check:", bad or "clean")
EOF
```

Fix anything that fails, then scan every string (nested too) for `—` or `–` and replace them. Append one entry to `history[]` (create the array if missing): `{ "date": today, "delivered": {<key>: N}, "moved": {<key>: N or null}, "open_rate": <portfolio> }`. Keep at most 26 entries. If anything was skipped, add `"data_flags": ["<what, why>"]` (remove the key when empty).

```bash
git checkout main && git pull --rebase origin main
git add data/nurture-programs.json
git commit -m "Nurture refresh <YYYY-MM-DD>: <one-line headline>"
git push origin main
```

Only ever commit `data/nurture-programs.json`. On a rebase conflict in that file, take your version (this routine is its only writer). Any other conflict: abort, don't push, report it in the DM.

---

## STEP 4: Confirm the deploy

The live site is password protected, so a curl of the page proves nothing. Confirm with `git ls-remote origin main` that your commit SHA is `main`. Netlify builds from `main` in under a minute.

---

## STEP 5: Slack DM to Kelsey

One DM to Kelsey (user ID `U06QR3G0CCA`) as the Clawrence bot using `$CLAWRENCE_BOT_TOKEN` from the environment (`conversations.open`, then `chat.postMessage`). Never echo tokens.

```
🌿 *Nurture Programs refreshed* (<date>)
• Enrollment: <N> enrolled (<in progress>), <N> moved to a new stage after enrolling (<per program>)
• Delivered: <N> total, <+N> this week · open <x%> · click <x%>
• Watch: <the 1-3 flags that matter>
• Still the same <N> workflows? Reply if the active set changed and I'll update the registry.
🔗 https://inquired-marketing-dash.netlify.app/ → Nurture Programs
[✓/✗] Phase A email · [✓/✗] Phase B CRM · [✓/✗] pushed <SHA>
```

No em or en dashes in the message.

---

## STEP 6: Healthchecks

Success = JSON pushed to `main` AND the DM returned `ok:true`:

```bash
curl -fsS -m 10 --retry 3 https://hc-ping.com/a65c75b3-5ab3-4eed-862f-77192d4efe5d || true
```

On a handled failure (push failed, or both phases failed): `https://hc-ping.com/a65c75b3-5ab3-4eed-862f-77192d4efe5d/fail`. Never ping success on a partial run where nothing was pushed.
