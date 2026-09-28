#!/usr/bin/env python3
"""GA4 backfill for the Monthly tab (stdlib only, same pattern as gsc_brand_lift.py).

Fills two things in data/monthly-digest.json:
  - months[<YYYY-MM>].web.top_conversion_pages  (monthly skill Step 3d report 10)
  - top-level web_trend, rebuilt so its last label is the newest month in the file (report 9)

Usage:  python3 scripts/ga4_monthly_backfill.py 2026-07 2026-08
Creds:  GA4_CLIENT_ID, GA4_CLIENT_SECRET, GA4_REFRESH_TOKEN (env vars; never printed).
Exit:   0 = updated, 2 = creds not set (file untouched), 1 = API error (file untouched).
"""
import calendar
import json
import os
import sys
import urllib.parse
import urllib.request

PROPERTY = "326695663"
DATA = os.path.join(os.path.dirname(__file__), "..", "data", "monthly-digest.json")
MACRO_EVENTS = ["download_form_thank_you", "resource_download_click", "webinar_signup_success",
                "contact_thank_you", "curriculum_review_guide_conversion", "inquiry_journy_download"]
MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def token():
    body = urllib.parse.urlencode({
        "client_id": os.environ["GA4_CLIENT_ID"],
        "client_secret": os.environ["GA4_CLIENT_SECRET"],
        "refresh_token": os.environ["GA4_REFRESH_TOKEN"],
        "grant_type": "refresh_token",
    }).encode()
    with urllib.request.urlopen("https://oauth2.googleapis.com/token", body, timeout=30) as r:
        return json.load(r)["access_token"]


def run_report(tok, req):
    url = f"https://analyticsdata.googleapis.com/v1beta/properties/{PROPERTY}:runReport"
    r = urllib.request.Request(url, json.dumps(req).encode(), {
        "Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=60) as resp:
        return json.load(resp).get("rows", [])


def month_range(ym):
    y, m = map(int, ym.split("-"))
    return f"{ym}-01", f"{ym}-{calendar.monthrange(y, m)[1]:02d}"


def page_type(path):
    p = path.lower()
    if "/webinar" in p:
        return "webinar signup"
    if "thank-you" in p or "/download" in p:
        return "download"
    if "/contact" in p or "demo" in p:
        return "hand-raise"
    return "resource"


def top_conversion_pages(tok, ym):
    start, end = month_range(ym)
    rows = run_report(tok, {
        "dateRanges": [{"startDate": start, "endDate": end}],
        "dimensions": [{"name": "pagePath"}],
        "metrics": [{"name": "eventCount"}],
        # Macro conversions only (same list as Step 3d report 8). keyEvents alone also counts
        # engagement key events (viewed_3__pages, time_on_site), which ranks the homepage first.
        "dimensionFilter": {"filter": {"fieldName": "eventName",
                                       "inListFilter": {"values": MACRO_EVENTS}}},
        "orderBys": [{"metric": {"metricName": "eventCount"}, "desc": True}],
        "limit": 12,
    })
    out = []
    for r in rows:
        path, n = r["dimensionValues"][0]["value"], round(float(r["metricValues"][0]["value"]))
        if n > 0 and path != "(not set)" and len(out) < 10:
            out.append({"path": path, "completions": n, "type": page_type(path)})
    return out


def web_trend(tok, last_ym):
    y, m = map(int, last_ym.split("-"))
    first_y, first_m = (y - 2, m + 1) if m < 12 else (y - 1, 1)
    start = f"{first_y}-{first_m:02d}-01"
    _, end = month_range(last_ym)
    rows = run_report(tok, {
        "dateRanges": [{"startDate": start, "endDate": end}],
        "dimensions": [{"name": "yearMonth"}],
        "metrics": [{"name": "sessions"}],
        "orderBys": [{"dimension": {"dimensionName": "yearMonth"}}],
        "limit": 30,
    })
    by = {r["dimensionValues"][0]["value"]: int(r["metricValues"][0]["value"]) for r in rows}
    months = []
    yy, mm = first_y, first_m
    for _ in range(24):
        months.append(f"{yy}{mm:02d}")
        mm += 1
        if mm > 12:
            yy, mm = yy + 1, 1
    prior, current = [by.get(k, 0) for k in months[:12]], [by.get(k, 0) for k in months[12:]]
    labels = [MON[int(k[4:]) - 1] for k in months[12:]]
    ct, pt = sum(current), sum(prior)
    return {"labels": labels, "current": current, "prior": prior, "current_total": ct,
            "prior_total": pt, "yoy_pct": round((ct - pt) / pt * 100, 1) if pt else None}


def main(argv):
    if not all(os.environ.get(k) for k in ("GA4_CLIENT_ID", "GA4_CLIENT_SECRET", "GA4_REFRESH_TOKEN")):
        print(json.dumps({"status": "deferred", "flag": "GA4 env vars not set"}))
        return 2
    wanted = argv[1:]
    try:
        tok = token()
        d = json.load(open(DATA))
        months = {x["period"][:7]: x for x in d["months"]}
        filled = {}
        for ym in wanted:
            if ym not in months:
                raise SystemExit(f"{ym} not in monthly-digest.json")
            pages = top_conversion_pages(tok, ym)
            months[ym].setdefault("web", {})["top_conversion_pages"] = pages
            filled[ym] = len(pages)
        newest = max(months)
        d["web_trend"] = web_trend(tok, newest)
    except Exception as e:  # API/auth failure: leave the file untouched
        print(json.dumps({"status": "error", "flag": f"{type(e).__name__}: {e}"[:300]}))
        return 1
    with open(DATA, "w") as f:
        json.dump(d, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(json.dumps({"status": "ok", "top_conversion_pages": filled,
                      "web_trend_through": newest, "yoy_pct": d["web_trend"]["yoy_pct"]}))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
