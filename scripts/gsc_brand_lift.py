#!/usr/bin/env python3
"""Brand lift (GSC) — weekly WoW updater for the dashboard.

Pulls Google Search Console Search Analytics data and updates the two
weekly-owned brand_lift blocks in place:

  - data/weekly-digest.json  → brand_lift.series[]  (Weekly tab trend)
  - data/overview.json       → brand_lift.metrics[] (Overview tiles)

It NEVER touches data/monthly-digest.json (monthly digest owns that block).

Channels (see DASH_ROUTINE.md PHASE 2.5 / weekly-marketing-digest SKILL):
  branded    — clicks/impressions on branded queries, inquired.com property
               (query contains: inquired / inquiry journeys / inkwell /
                great first eight / gf8)
  youtube    — totals for the YouTube GSC Social Signals property
  instagram  — totals for the Instagram GSC Social Signals property

Auth: OAuth 2.0 refresh token (user account — Workspace policy blocks
service accounts, same reason as GA4). Env vars:

  GSC_CLIENT_ID      OAuth client ID (the GA4 OAuth client works — add the
                     webmasters.readonly scope and re-run consent)
  GSC_CLIENT_SECRET  OAuth client secret for the same client
  GSC_REFRESH_TOKEN  refresh token minted WITH scope
                     https://www.googleapis.com/auth/webmasters.readonly

Behavior per run: upserts the TWO most recently completed ISO weeks
(Mon–Sun, UTC dates). Re-pulling the prior week each run finalizes GSC's
fresh-data revisions, so the latest week can be written on Monday morning
without waiting out the 2–3 day reporting lag.

No backfill rule: social properties were verified 2026-07-30, so social
channels are only queried for weeks starting 2026-08-03 or later; earlier
weeks get null (never a fabricated zero). The branded inquired.com property
predates that and is queried for every week.

Exit codes (DASH_ROUTINE.md maps these to the checklist line):
  0  data written        — stdout JSON summary lists weeks + flags
  2  deferred / no-op    — env vars missing; blocks left untouched
  1  hard error          — auth or API failure; blocks left untouched

Never prints token values. Stdlib only — no pip installs needed.
"""

import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, timedelta

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEEKLY_PATH = os.path.join(REPO_ROOT, "data", "weekly-digest.json")
OVERVIEW_PATH = os.path.join(REPO_ROOT, "data", "overview.json")

TOKEN_URL = "https://oauth2.googleapis.com/token"
SITES_URL = "https://www.googleapis.com/webmasters/v3/sites"
QUERY_URL = "https://www.googleapis.com/webmasters/v3/sites/{site}/searchAnalytics/query"

# Branded-query rule — keep in sync with weekly-marketing-digest SKILL.md
# and the monthly digest's Brand SEO-topic rule.
BRANDED_TERMS = ["inquired", "inquiry journeys", "inkwell", "great first eight", "gf8"]

# Social Signals collection start (verified 2026-07-30; no backfill).
# First fully-covered social week is the one starting Mon 2026-08-03.
SOCIAL_FIRST_WEEK_MONDAY = date(2026, 8, 3)

SERIES_CAP = 13  # weeks kept in series[] and spark[]

# GSC finalizes Search Analytics data 2-3 days late. The routine runs Monday
# and reports the week that ended Sunday, so the newest week ALWAYS has its
# last 1-2 days under-reported. Weeks whose end date is not yet this old are
# marked provisional, and their WoW is computed on an aligned settled-day
# window instead of the depressed full-week total (which manufactures a
# spurious decline, e.g. -26% on the 2026-08-17 week when settled days were
# +15%). Full-week values still self-heal on the next run.
GSC_LAG_DAYS = 3

LIVE_NOTE_WEEKLY = (
    "These are Google Search numbers, not social engagement — how often our "
    "brand and channels surface when people search. Branded search covers "
    "branded queries on the inquired.com property. YouTube and Instagram are "
    "Search Console platform properties: they exist in the Search Console UI "
    "but are not returned by the Search Analytics API, so those two channels "
    "cannot be filled automatically and stay blank. LinkedIn has no GSC "
    "connector at all: it's owned by Microsoft and isn't integrated with "
    "Google."
)
LIVE_NOTE_OVERVIEW = (
    "These are Google Search numbers, not social engagement — how often our "
    "brand and channels surface when people search. YouTube and Instagram are "
    "Search Console platform properties, visible in the Search Console UI but "
    "not exposed by the Search Analytics API, so those tiles stay blank rather "
    "than showing a fabricated zero. LinkedIn has no GSC connector — it's "
    "owned by Microsoft and isn't integrated with Google."
)
# Appended to the note when the newest week is still inside the GSC lag.
PROVISIONAL_NOTE = (
    " ⏳ The week of %s is still provisional: Google has finalized only %d of "
    "its 7 days, so its full-week total (%s) is understated and will revise "
    "upward on the next run. The %s figure shown compares the same %d settled "
    "days in each week, which is the like-for-like read; the full-week "
    "comparison would be misleading until the week settles."
)

flags = []


def summary_exit(code, status, **extra):
    out = {"status": status, "flags": flags}
    out.update(extra)
    print(json.dumps(out, ensure_ascii=False))
    sys.exit(code)


def http_json(url, payload=None, token=None, form=None):
    headers = {}
    data = None
    if form is not None:
        data = urllib.parse.urlencode(form).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    elif payload is not None:
        data = json.dumps(payload).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode())


def http_error_detail(e):
    """One readable line from a Google API HTTPError body.

    Consumes the error body (readable only once). Recognizes the
    API-not-enabled 403 — a one-time project setup gap rather than an auth
    or code problem — and returns the fix instead of a truncated JSON dump.
    """
    raw = e.read().decode(errors="replace")
    try:
        err = (json.loads(raw) or {}).get("error", {})
        msg = err.get("message") or ""
        details = err.get("errors")
        reasons = {d.get("reason", "") for d in details
                   if isinstance(d, dict)} if isinstance(details, list) else set()
    except (ValueError, AttributeError):
        return " ".join(raw.split())[:300]
    if not msg:
        return " ".join(raw.split())[:300]
    if e.code == 403 and ("accessNotConfigured" in reasons
                          or "has not been used in project" in msg
                          or "it is disabled" in msg):
        m = re.search(r"project (\d+)", msg)
        enable_url = ("https://console.cloud.google.com/apis/library/"
                      "searchconsole.googleapis.com")
        where = "the Google Cloud project behind GSC_CLIENT_ID"
        if m:
            where = "Google Cloud project " + m.group(1)
            enable_url += "?project=" + m.group(1)
        return (
            "Search Console API (searchconsole.googleapis.com) is not enabled "
            "in %s. One-time fix: enable it at %s, then re-run (allow a few "
            "minutes to propagate). The refresh token and its "
            "webmasters.readonly scope are fine — this is a project API "
            "toggle, not a credential problem." % (where, enable_url))
    return " ".join(msg.split())[:300]


def get_access_token():
    missing = [v for v in ("GSC_CLIENT_ID", "GSC_CLIENT_SECRET", "GSC_REFRESH_TOKEN")
               if not os.environ.get(v)]
    if missing:
        flags.append("GSC not wired — env var(s) not set: " + ", ".join(missing))
        summary_exit(2, "deferred")
    try:
        tok = http_json(TOKEN_URL, form={
            "client_id": os.environ["GSC_CLIENT_ID"],
            "client_secret": os.environ["GSC_CLIENT_SECRET"],
            "refresh_token": os.environ["GSC_REFRESH_TOKEN"],
            "grant_type": "refresh_token",
        })
    except urllib.error.HTTPError as e:
        body = http_error_detail(e)
        flags.append(
            "OAuth token exchange failed (HTTP %d): %s — if invalid_grant/"
            "invalid_scope, re-run the OAuth consent for the GA4 client WITH "
            "the webmasters.readonly scope and update GSC_REFRESH_TOKEN."
            % (e.code, body))
        summary_exit(1, "error")
    scope = tok.get("scope", "")
    if scope and "webmasters" not in scope:
        flags.append(
            "Access token lacks the webmasters.readonly scope (got: %s). "
            "Re-run OAuth consent with the scope added." % scope)
        summary_exit(1, "error")
    return tok["access_token"]


def list_sites(token):
    try:
        return http_json(SITES_URL, token=token).get("siteEntry", [])
    except urllib.error.HTTPError as e:
        flags.append("GSC sites.list failed (HTTP %d): %s"
                     % (e.code, http_error_detail(e)))
        summary_exit(1, "error")


def pick_property(sites, needle, prefer=None):
    urls = [s.get("siteUrl", "") for s in sites
            if s.get("permissionLevel") != "siteUnverifiedUser"]
    if prefer and prefer in urls:
        return prefer
    for u in urls:
        if needle in u.lower():
            return u
    return None


def sa_query(token, site, body):
    url = QUERY_URL.format(site=urllib.parse.quote(site, safe=""))
    return http_json(url, payload=body, token=token)


def branded_week(token, site, start, end):
    """Sum clicks/impressions over branded queries for one week."""
    clicks = impressions = 0
    start_row = 0
    while True:
        body = {"startDate": start.isoformat(), "endDate": end.isoformat(),
                "dimensions": ["query"], "rowLimit": 25000,
                "startRow": start_row, "dataState": "all"}
        rows = sa_query(token, site, body).get("rows", [])
        for r in rows:
            q = (r.get("keys") or [""])[0].lower()
            if any(t in q for t in BRANDED_TERMS):
                clicks += r.get("clicks", 0)
                impressions += r.get("impressions", 0)
        if len(rows) < 25000:
            break
        start_row += 25000
    return {"clicks": int(round(clicks)), "impressions": int(round(impressions))}


def totals_week(token, site, start, end):
    """Whole-property totals for one week (Social Signals properties)."""
    body = {"startDate": start.isoformat(), "endDate": end.isoformat(),
            "dataState": "all"}
    rows = sa_query(token, site, body).get("rows", [])
    if not rows:
        return {"clicks": 0, "impressions": 0}
    return {"clicks": int(round(rows[0].get("clicks", 0))),
            "impressions": int(round(rows[0].get("impressions", 0)))}


def channel_totals(token, prop, channel, start, end):
    """Clicks/impressions for one channel over an arbitrary date range."""
    if channel == "branded":
        return branded_week(token, prop, start, end)
    return totals_week(token, prop, start, end)


def settled_days(start, end, today):
    """How many of this week's 7 days GSC has finalized (0-7)."""
    settled_through = today - timedelta(days=GSC_LAG_DAYS)
    if settled_through < start:
        return 0
    if settled_through >= end:
        return 7
    return (settled_through - start).days + 1


def completed_weeks(today):
    """The two most recently completed ISO weeks as (monday, sunday)."""
    this_monday = today - timedelta(days=today.weekday())
    cur = this_monday - timedelta(days=7)
    prior = this_monday - timedelta(days=14)
    return [(prior, prior + timedelta(days=6)), (cur, cur + timedelta(days=6))]


def detect_indent(text):
    for line in text.splitlines():
        if line.startswith(" "):
            return len(line) - len(line.lstrip(" "))
    return 2


def load_json(path):
    with open(path, encoding="utf-8") as f:
        text = f.read()
    return json.loads(text), detect_indent(text)


def save_json(path, data, indent):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=indent)
        f.write("\n")


def merge_entry(existing, fresh):
    """Channel-wise merge: never overwrite real data with null."""
    for k in ("branded", "youtube", "instagram"):
        if fresh.get(k) is not None:
            existing[k] = fresh[k]
        elif k not in existing:
            existing[k] = None
    existing["label"] = fresh["label"]
    # a re-pulled week can go provisional -> settled; always take the fresher
    for k in ("settled_days", "provisional"):
        if k in fresh:
            existing[k] = fresh[k]
    return existing


def pct_delta(cur, prev):
    if cur is None or prev is None or prev == 0:
        return None
    return (cur - prev) / abs(prev) * 100.0


def delta_fields(cur, prev):
    """(delta string, delta_dir) with standard emoji thresholds.

    Small-sample rule: no emoji when prior base < 5."""
    p = pct_delta(cur, prev)
    if p is None:
        return None, "flat"
    txt = "%+d%% WoW" % round(p)
    if prev >= 5:
        if p >= 50:
            txt += " 🔥"
        elif p <= -25:
            txt += " 🚨"
        elif p <= -10:
            txt += " ⚠️"
    return txt, ("up" if p > 0.5 else "down" if p < -0.5 else "flat")


def main():
    today = date.today()
    token = get_access_token()
    sites = list_sites(token)

    prop = {
        "branded": pick_property(sites, "inquired.com", prefer="sc-domain:inquired.com"),
        "youtube": pick_property(sites, "youtube.com"),
        "instagram": pick_property(sites, "instagram.com"),
    }
    if not prop["branded"]:
        flags.append(
            "inquired.com property not visible to this Google account via "
            "the API — check property access in Search Console.")
        summary_exit(1, "error")
    for k in ("youtube", "instagram"):
        if not prop[k]:
            flags.append(
                "%s is a Search Console platform property — visible in the "
                "Search Console UI but not returned by the Search Analytics "
                "API's sites.list, so it cannot be queried. Channel left null "
                "(never a fabricated zero). Not fixable with credentials or "
                "extra API enablement; needs Google to expose platform "
                "properties via the API." % k)

    weeks_written = []
    fresh_entries = []
    weeks = completed_weeks(today)
    for start, end in weeks:
        sd = settled_days(start, end, today)
        entry = {"period": start.isoformat(),
                 "label": "%s %d" % (start.strftime("%b"), start.day),
                 "branded": None, "youtube": None, "instagram": None,
                 "settled_days": sd, "provisional": sd < 7}
        try:
            entry["branded"] = branded_week(token, prop["branded"], start, end)
        except urllib.error.HTTPError as e:
            flags.append("branded query failed for %s (HTTP %d): %s"
                         % (start, e.code, http_error_detail(e)))
        for k in ("youtube", "instagram"):
            if not prop[k]:
                continue
            if start < SOCIAL_FIRST_WEEK_MONDAY:
                # collection began 2026-07-30 — a zero here would be fabricated
                continue
            try:
                entry[k] = totals_week(token, prop[k], start, end)
            except urllib.error.HTTPError as e:
                flags.append("%s totals failed for %s (HTTP %d): %s"
                             % (k, start, e.code, http_error_detail(e)))
        if any(entry[k] is not None for k in ("branded", "youtube", "instagram")):
            fresh_entries.append(entry)
            weeks_written.append(entry["period"])

    if not fresh_entries:
        flags.append("no channel returned data for either week — nothing written")
        summary_exit(1, "error")

    # --- like-for-like window when the newest week is still provisional ---
    # Compare the SAME settled days in each week. Without this, the depressed
    # partial total is diffed against a complete week and invents a decline.
    latest_start, latest_end = weeks[-1]
    prior_start, prior_end = weeks[-2]
    sd_latest = settled_days(latest_start, latest_end, today)
    comparable = None
    if 0 < sd_latest < 7:
        comparable = {"days": sd_latest,
                      "window": "first %d day%s of each week"
                                % (sd_latest, "" if sd_latest == 1 else "s"),
                      "channels": {}}
        for ch in ("branded", "youtube", "instagram"):
            if not prop[ch]:
                continue
            if ch != "branded" and latest_start < SOCIAL_FIRST_WEEK_MONDAY:
                continue
            try:
                cur = channel_totals(token, prop[ch], ch, latest_start,
                                     latest_start + timedelta(days=sd_latest - 1))
                pre = channel_totals(token, prop[ch], ch, prior_start,
                                     prior_start + timedelta(days=sd_latest - 1))
            except urllib.error.HTTPError as e:
                flags.append("%s like-for-like window failed (HTTP %d): %s"
                             % (ch, e.code, http_error_detail(e)))
                continue
            comparable["channels"][ch] = {
                "current": cur["clicks"], "previous": pre["clicks"]}

    def wow(ch, full_cur, full_prev):
        """(delta text, dir, basis) — aligned window while provisional."""
        if comparable and ch in comparable["channels"]:
            c = comparable["channels"][ch]
            txt, dirn = delta_fields(c["current"], c["previous"])
            return txt, dirn, comparable["window"]
        txt, dirn = delta_fields(full_cur, full_prev)
        return txt, dirn, "full week"

    # --- data/weekly-digest.json → brand_lift.series[] -------------------
    weekly, w_indent = load_json(WEEKLY_PATH)
    bl_w = weekly.setdefault("brand_lift", {})
    series = bl_w.get("series") or []
    by_period = {e["period"]: e for e in series}
    for fresh in fresh_entries:
        if fresh["period"] in by_period:
            merge_entry(by_period[fresh["period"]], fresh)
        else:
            by_period[fresh["period"]] = fresh
    series = sorted(by_period.values(), key=lambda e: e["period"])[-SERIES_CAP:]
    bl_w["series"] = series
    bl_w["status"] = "live"
    bl_w["updated"] = today.isoformat()
    bl_w["lag_days"] = GSC_LAG_DAYS
    bl_w["unavailable"] = [k for k in ("youtube", "instagram") if not prop[k]]
    if comparable:
        bl_w["comparable"] = comparable
    else:
        bl_w.pop("comparable", None)

    last = series[-1] if series else {}
    prev = series[-2] if len(series) > 1 else {}
    clk = lambda e, ch: (e.get(ch) or {}).get("clicks") if e.get(ch) else None

    note_w = LIVE_NOTE_WEEKLY
    note_o = LIVE_NOTE_OVERVIEW
    if comparable:
        full_txt = clk(last, "branded")
        prov = PROVISIONAL_NOTE % (
            last.get("label", latest_start.isoformat()), sd_latest,
            "%s branded clicks" % full_txt if full_txt is not None else "partial",
            "WoW", sd_latest)
        note_w += prov
        note_o += prov
    bl_w["note"] = note_w
    save_json(WEEKLY_PATH, weekly, w_indent)

    # --- data/overview.json → brand_lift.metrics[] ------------------------
    overview, o_indent = load_json(OVERVIEW_PATH)
    bl_o = overview.setdefault("brand_lift", {})
    channel_of = {"branded_search": "branded", "youtube": "youtube",
                  "instagram": "instagram"}
    for m in bl_o.get("metrics", []):
        ch = channel_of.get(m.get("key"))
        if not ch:
            continue
        cur_v, prev_v = clk(last, ch), clk(prev, ch)
        m["value"] = cur_v
        m["delta"], m["delta_dir"], basis = wow(ch, cur_v, prev_v)
        m["delta_basis"] = basis
        m["provisional"] = bool(last.get("provisional")) and cur_v is not None
        m["unavailable"] = not prop[ch]
        m["spark"] = [c for c in (clk(e, ch) for e in series) if c is not None][-SERIES_CAP:]
    bl_o["status"] = "live"
    bl_o["updated"] = today.isoformat()
    bl_o["lag_days"] = GSC_LAG_DAYS
    bl_o["unavailable"] = [k for k in ("youtube", "instagram") if not prop[k]]
    bl_o["note"] = note_o
    save_json(OVERVIEW_PATH, overview, o_indent)

    if len(series) < 2:
        flags.append("baseline building — WoW deltas start once a second "
                     "week is in the series")
    if comparable:
        flags.append(
            "newest week (%s) is provisional — %d/7 days settled; WoW shown "
            "on the aligned %d-day window, full-week totals revise next run."
            % (last.get("label", ""), sd_latest, sd_latest))
    summary_exit(0, "updated", weeks_upserted=weeks_written,
                 provisional_days_settled=sd_latest,
                 properties={k: bool(v) for k, v in prop.items()})


if __name__ == "__main__":
    main()
