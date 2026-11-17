#!/usr/bin/env python3
"""Content Performance tab: GA4 views + HubSpot contacts per inquired.com page, last 90 days.

Conversion = GA4 form_submit events / GA4 views on the page. HubSpot contacts are a reference column only.

Usage:  python3 scripts/content_performance.py <hubspot.json>
  <hubspot.json>  the saved response of HubSpot get_content_analytics_report (mode TOTALS, includeMetadata,
                  search "inquired.com", sortMetric CONTACTS, limit 200, start/end = the same 90-day window).
Creds:  GA4_CLIENT_ID, GA4_CLIENT_SECRET, GA4_REFRESH_TOKEN (env vars; never printed).
Writes: upserts this run into data/content-performance.json weeks[] (keyed by period, cap 8).
Exit:   0 = written, 2 = GA4 creds not set (file untouched), 1 = API or input error (file untouched).

Why (Kelsey, 2026-11-17): the tab used to rank HubSpot's all-time views, which only HubSpot-hosted pages have
(the old inquired.org site and learn.inquired.com landers), so today's site never showed and Inkwell and
Great First Eight barely appeared. GA4 counts every inquired.com page view; HubSpot still owns contacts.
"""
import datetime
import json
import os
import re
import sys
import urllib.parse
import urllib.request

PROPERTY = "326695663"
ROOT = os.path.join(os.path.dirname(__file__), "..")
DATA = os.path.join(ROOT, "data", "content-performance.json")
WINDOW_DAYS = 90
MIN_VIEWS = 50          # pages under this many views in the window are noise
TODAY = datetime.date.today()
END = TODAY - datetime.timedelta(days=1)
START = END - datetime.timedelta(days=WINDOW_DAYS - 1)
MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

# Paths that aren't content to judge: thank-you and system pages, corporate pages, form plumbing.
EXCLUDE = re.compile(r"(^/(thank-you|submit|401|404|careers|about-us|our-team|search)(/|$))|thank-you|^/contact-thank-you$")
LANDER = re.compile(r"^/(learn|webinar-series|webinar-sign-up)/|-demo(-|$)|-lesson$|sample-lesson|scope-sequence|ppc-|interactive-demo|step-into-inquiry|/reviewer|early-(access|adopter)")


def token():
    body = urllib.parse.urlencode({
        "client_id": os.environ["GA4_CLIENT_ID"], "client_secret": os.environ["GA4_CLIENT_SECRET"],
        "refresh_token": os.environ["GA4_REFRESH_TOKEN"], "grant_type": "refresh_token"}).encode()
    with urllib.request.urlopen("https://oauth2.googleapis.com/token", body, timeout=30) as r:
        return json.loads(r.read())["access_token"]


def ga4_pages(tok):
    """{path: {views, sessions, engaged, engagement_sec, title}} for inquired.com, the window above."""
    out, offset = {}, 0
    while True:
        req = {
            "dateRanges": [{"startDate": START.isoformat(), "endDate": END.isoformat()}],
            "dimensions": [{"name": "pagePath"}, {"name": "pageTitle"}],
            "metrics": [{"name": "screenPageViews"}, {"name": "sessions"}, {"name": "engagedSessions"}, {"name": "userEngagementDuration"}],
            "dimensionFilter": {"filter": {"fieldName": "hostName", "inListFilter": {"values": ["inquired.com", "www.inquired.com"]}}},
            "limit": 10000, "offset": offset}
        r = urllib.request.Request(f"https://analyticsdata.googleapis.com/v1beta/properties/{PROPERTY}:runReport",
                                   json.dumps(req).encode(), {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
        with urllib.request.urlopen(r, timeout=60) as resp:
            d = json.loads(resp.read())
        rows = d.get("rows", [])
        for row in rows:
            path = norm(row["dimensionValues"][0]["value"])
            title = row["dimensionValues"][1]["value"]
            v, s, e, t = (float(m["value"]) for m in row["metricValues"])
            p = out.setdefault(path, {"views": 0, "sessions": 0, "engaged": 0, "engagement_sec": 0, "titles": {}})
            p["views"] += v; p["sessions"] += s; p["engaged"] += e; p["engagement_sec"] += t
            p["titles"][title] = p["titles"].get(title, 0) + v
        offset += len(rows)
        if not rows or offset >= int(d.get("rowCount", 0)):
            break
    # Form submits per page: GA4's enhanced-measurement form_submit event, which fires on the page where the
    # form is. HubSpot's page report misses most Webflow-embedded forms (the Inkwell PPC lander: 0 contacts
    # credited in HubSpot, 42 contacts converted on it), so submits are the conversion count.
    req = {"dateRanges": [{"startDate": START.isoformat(), "endDate": END.isoformat()}], "dimensions": [{"name": "pagePath"}],
           "metrics": [{"name": "eventCount"}], "limit": 10000,
           "dimensionFilter": {"andGroup": {"expressions": [
               {"filter": {"fieldName": "eventName", "stringFilter": {"value": "form_submit"}}},
               {"filter": {"fieldName": "hostName", "inListFilter": {"values": ["inquired.com", "www.inquired.com"]}}}]}}}
    r = urllib.request.Request(f"https://analyticsdata.googleapis.com/v1beta/properties/{PROPERTY}:runReport",
                               json.dumps(req).encode(), {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=60) as resp:
        for row in json.loads(resp.read()).get("rows", []):
            path = norm(row["dimensionValues"][0]["value"])
            if path in out:
                out[path]["submits"] = out[path].get("submits", 0) + int(row["metricValues"][0]["value"])
    return out


def norm(path_or_url):
    u = urllib.parse.urlsplit(path_or_url if "://" in path_or_url else "https://inquired.com" + path_or_url)
    return (u.path.rstrip("/") or "/").lower()


def hubspot_contacts(path):
    """{path: (contacts, submissions)} for inquired.com rows in the saved HubSpot response."""
    d = json.load(open(path))
    out = {}
    for row in d.get("breakdowns", []):
        url = row.get("url") or row.get("contentId") or ""
        if url and "://" not in url:
            url = "https://" + url  # without includeMetadata, HubSpot gives "inquired.com/path" as contentId
        if urllib.parse.urlsplit(url).netloc.lower().removeprefix("www.") != "inquired.com":
            continue
        m = row.get("metrics") or {}
        c, s = out.get(norm(url), (0, 0))
        out[norm(url)] = (c + int(m.get("contacts") or 0), s + int(m.get("submissions") or 0))
    return out


def product(path, title):
    p, t = path.lower(), title.lower()
    # Webinar series belong to the product their forms sell (marketing-ops form records: Lit Talk is Inkwell
    # pre-sales, Source Material is Inquiry Journeys pre-sales).
    if "lit-talk" in p or "lit talk" in t:
        return "Inkwell"
    if "source-material" in p or "source material" in t:
        return "Inquiry Journeys"
    if p.startswith("/integrated-ela") or "inkwell" in p or "inkwell" in t:
        return "Inkwell"
    if p.startswith("/early-childhood") or "great-first-eight" in p or "great first eight" in t:
        return "Great First Eight"
    if "middle-school" in p or "world-history" in p or "/wh-" in p or "world history" in t:
        return "World History"
    if p.startswith("/inquiry-based-social-studies") or "inquiry journeys" in t:
        return "Inquiry Journeys"
    if p.startswith("/post/") or p.startswith("/learn/"):
        ss = len(re.findall(r"social studies|civics|history|geography|primary source|inquiry", t))
        ela = len(re.findall(r"\bela\b|literacy|reading|writing|phonics|comprehension", t))
        if re.search(r"pre-?k\b|prek|early childhood|\btk\b", t):
            return "Great First Eight"
        if ss and ss >= ela:
            return "Inquiry Journeys"
        if ela:
            return "Inkwell"
    return "inquirED General"


def clean_title(path, titles):
    if path == "/":
        return "Homepage"
    t = max(titles, key=titles.get) if titles else ""
    t = re.sub(r"\s*\|\s*inquirED( Blog)?\s*$", "", t).strip()
    if not t or t == "(not set)":
        t = path.rsplit("/", 1)[-1].replace("-", " ").title() or "Home"
    return t


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    if not all(os.environ.get(k) for k in ("GA4_CLIENT_ID", "GA4_CLIENT_SECRET", "GA4_REFRESH_TOKEN")):
        print("GA4 credentials not set; content-performance.json left as it is.")
        return 2
    try:
        contacts = hubspot_contacts(sys.argv[1])
        views = ga4_pages(token())
    except Exception as e:  # noqa: never write a half-built week
        print(f"Failed: {str(e)[:200]}")
        return 1

    pages = []
    for path, g in views.items():
        if g["views"] < MIN_VIEWS or EXCLUDE.search(path):
            continue
        title = clean_title(path, g["titles"])
        c, subs = contacts.get(path, (0, 0))
        submits = int(g.get("submits", 0))
        conv = round(submits / g["views"] * 100, 3) if g["views"] else 0.0
        ctype = "blog_post" if path.startswith("/post/") else ("landing_page" if LANDER.search(path) else "site_page")
        engaged = g["engaged"] / g["sessions"] if g["sessions"] else 0
        pages.append({
            "contentId": "inquired.com" + path, "title": title, "url": "https://inquired.com" + ("" if path == "/" else path),
            "content_type": ctype, "product": product(path, title), "raw_views": int(g["views"]), "form_submits": submits, "contacts": c,
            "hubspot_submissions": subs, "conversion_rate_pct": conv, "bounce_rate_pct": round((1 - engaged) * 100, 1),
            "time_per_view_sec": round(g["engagement_sec"] / g["views"]) if g["views"] else None,
            "flag": "gap" if conv < 0.5 else ("watch" if conv < 2 else "healthy")})
    pages.sort(key=lambda p: p["conversion_rate_pct"])

    non_blog = [p for p in pages if p["content_type"] != "blog_post"]
    by_product = {}
    for p in pages:
        b = by_product.setdefault(p["product"], {"pages": 0, "views": 0, "form_submits": 0, "contacts": 0})
        b["pages"] += 1; b["views"] += p["raw_views"]; b["form_submits"] += p["form_submits"]; b["contacts"] += p["contacts"]
    best = max(non_blog, key=lambda p: p["form_submits"], default=None)
    gap = max((p for p in non_blog if p["flag"] == "gap"), key=lambda p: p["raw_views"], default=None)
    verdict = []
    if best and best["form_submits"]:
        verdict.append(f"{best['title']} drew the most form submits ({best['form_submits']:,}) from {best['raw_views']:,} views.")
    if gap:
        verdict.append(f"The busiest page that rarely converts is {gap['title']}: {gap['raw_views']:,} views, {gap['form_submits']} form submits.")

    entry = {
        "period": TODAY.isoformat(), "label": f"{MON[TODAY.month - 1]} {TODAY.day}, {TODAY.year}",
        "window": {"start": START.isoformat(), "end": END.isoformat(), "days": WINDOW_DAYS},
        "source": "GA4 views and form submits (inquired.com) + HubSpot contacts, same 90-day window",
        "totals": {"pages_tracked": len(pages), "gap_count": sum(p["flag"] == "gap" for p in non_blog),
                   "watch_count": sum(p["flag"] == "watch" for p in pages), "healthy_count": sum(p["flag"] == "healthy" for p in pages),
                   "by_product": by_product},
        "verdict": " ".join(verdict), "pages": pages}

    d = json.load(open(DATA))
    weeks = [w for w in d.get("weeks", []) if w.get("period") != entry["period"]] + [entry]
    d["weeks"] = weeks[-8:]
    d["updated"] = TODAY.isoformat()
    d["min_views_threshold"] = MIN_VIEWS
    d["excluded_note"] = ("Last 90 days on inquired.com. Conversion = GA4 form submits / GA4 views. Contacts are what HubSpot credits to the page, "
                          "which misses most Webflow-embedded forms, so they're shown for reference only. "
                          "Thank-you, system and corporate pages (careers, about) are left out. Before Nov 17, 2026 this tab ranked "
                          "HubSpot's all-time views, which only counted HubSpot-hosted and old inquired.org pages.")
    with open(DATA, "w") as f:
        json.dump(d, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"Wrote {len(pages)} pages ({len(non_blog)} non-blog, {entry['totals']['gap_count']} gaps) for {START} to {END}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
