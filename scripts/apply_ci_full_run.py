#!/usr/bin/env python3
"""Apply a competitive-intel full run to competitive-intel.html.

Reads one or more lane JSON files (the research output of a full run) and
rewrites, per competitor:
  - the card: threat badge, ad-activity bars + title, positioning quote,
    "Latest signal" date + text
  - the DRAWER entry: threat, messaging, aiSummary, signals (new ones
    prepended, capped at 5)
siteUrl and anything after signals (keywords) are left alone (keywords belong to the weekly routine).

Then stamps data/competitive-intel.json (full_run, updated, next_full_run).

Usage:
  python3 scripts/apply_ci_full_run.py --date 2026-09-23 --next "Nov 2026" lane1.json lane2.json ...

Lane JSON: an array of objects with keys name, threat (high|med|low),
ad_activity{level,title}, positioning_quote, latest_signal{date_label,html},
messaging[], aiSummary, new_signals[], drop_signals[] (prefixes of wrong
existing signals), site_url. Any missing key is left unchanged.
Stdlib only. Exits non-zero (and writes nothing) if a name matches no card
or no DRAWER entry.
"""
import argparse, html, json, re, sys

PAGE = "competitive-intel.html"
META = "data/competitive-intel.json"
BADGE = {"high": ("badge-threat-high", "High Threat"),
         "med": ("badge-threat-med", "Med Threat"),
         "low": ("badge-threat-low", "Lower Threat")}
JS_STR = r"'((?:[^'\\]|\\.)*)'"


def js(s):
    return "'" + s.replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ") + "'"


def unjs(s):
    return re.sub(r"\\(.)", r"\1", s)


def card_name(name):
    # Card names are HTML; DRAWER keys use the same HTML (e.g. &amp;).
    return name


def update_card(page, c, errors):
    name = c["name"]
    marker = '<div class="comp-name">' + card_name(name) + "</div>"
    i = page.find(marker)
    if i < 0:
        errors.append("no card for " + name)
        return page
    start = page.rfind('<div class="comp-card">', 0, i)
    end = page.find('<div class="comp-card">', i)
    if end < 0:
        end = page.find("</div><!-- /", i)
    block = page[start:end]
    if c.get("threat") in BADGE:
        cls, label = BADGE[c["threat"]]
        block = re.sub(r'<span class="badge badge-threat-[a-z]+">[^<]*</span>',
                       '<span class="badge %s">%s</span>' % (cls, label), block, count=1)
    ad = c.get("ad_activity") or {}
    if isinstance(ad.get("level"), int):
        lvl = max(0, min(4, ad["level"]))
        title = ad.get("title") or "Ad activity: (%d/4)" % lvl
        bars = "".join('\n          <div class="signal-bar%s"></div>' % (" active" if n < lvl else "")
                       for n in range(4))
        block = re.sub(r'<div class="signal-wrap" title="[^"]*">(?:\s*<div class="signal-bar[^"]*"></div>)+',
                       '<div class="signal-wrap" title="%s">%s' % (html.escape(title, quote=True), bars),
                       block, count=1)
    if c.get("positioning_quote"):
        q = c["positioning_quote"].strip().strip('"\u201c\u201d')
        block = re.sub(r'<div class="comp-positioning">.*?</div>',
                       lambda m: '<div class="comp-positioning">"%s"</div>' % html.escape(q, quote=False),
                       block, count=1, flags=re.S)
    ls = c.get("latest_signal") or {}
    if ls.get("date_label"):
        block = re.sub(r'<div class="signal-date">[^<]*</div>',
                       '<div class="signal-date">Latest signal · %s</div>' % html.escape(ls["date_label"]),
                       block, count=1)
    if ls.get("html"):
        block = re.sub(r'(<div class="signal-text">).*?(</div>)',
                       lambda m: m.group(1) + "\n            " + ls["html"].strip() + "\n          " + m.group(2),
                       block, count=1, flags=re.S)
    return page[:start] + block + page[end:]


def update_drawer(page, c, errors):
    key = js(c["name"])
    d0 = page.index("const DRAWER")
    i = page.find("\n  " + key + ": {", d0)
    if i < 0:
        errors.append("no DRAWER entry for " + c["name"])
        return page
    ends = [e for e in (page.find("\n  '", i + 5), page.find("\n};", i)) if e >= 0]
    j_end = min(ends)
    sig_end = re.search(r"signals:\[.*?\],?[ \t]*", page[i:j_end], re.S)
    if not sig_end:
        errors.append("DRAWER entry for %s has no signals array" % c["name"])
        return page
    j = i + sig_end.end()
    entry = page[i:j]
    site = re.search(r"siteUrl:" + JS_STR, entry)
    old_threat = re.search(r"threat:'([a-z]+)'", entry)
    sig_m = re.search(r"signals:\[(.*?)\]", entry, re.S)
    old_sigs = [unjs(s) for s in re.findall(JS_STR, sig_m.group(1))] if sig_m else []
    msg_m = re.search(r"messaging:\[(.*?)\]", entry, re.S)
    old_msgs = [unjs(s) for s in re.findall(JS_STR, msg_m.group(1))] if msg_m else []
    sum_m = re.search(r"aiSummary:" + JS_STR, entry)

    threat = c.get("threat") or (old_threat.group(1) if old_threat else "med")
    msgs = c.get("messaging") or old_msgs
    summary = c.get("aiSummary") or (unjs(sum_m.group(1)) if sum_m else "")
    seen = {s.lower()[:40] for s in old_sigs}
    new = [s for s in (c.get("new_signals") or []) if s.lower()[:40] not in seen]
    # "drop_signals": prefixes of existing signals that turned out wrong (replace, don't annotate).
    drops = [d.lower() for d in (c.get("drop_signals") or [])]
    old_sigs = [s for s in old_sigs if not any(s.lower().startswith(d) for d in drops)]
    sigs = (new + old_sigs)[:5]

    lines = ["\n  %s: {" % key, "    threat:%s," % js(threat)]
    site_url = c.get("site_url") or c.get("siteUrl") or (unjs(site.group(1)) if site else None)
    if site_url:
        lines.append("    siteUrl:%s," % js(site_url))
    lines.append("    messaging:[\n" + ",\n".join("      " + js(m) for m in msgs) + "\n    ],")
    lines.append("    aiSummary:%s," % js(summary))
    lines.append("    signals:[\n" + ",\n".join("      " + js(s) for s in sigs) + "\n    ],")
    tail = page[j:]
    return page[:i] + "\n".join(lines) + ("" if tail.startswith("\n") else " ") + tail


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", required=True, help="YYYY-MM-DD of this full run")
    ap.add_argument("--next", required=True, help='next_full_run label, e.g. "Nov 2026"')
    ap.add_argument("lanes", nargs="+")
    a = ap.parse_args()

    comps = []
    for f in a.lanes:
        comps += json.load(open(f))
    page = open(PAGE, encoding="utf-8").read()
    errors = []
    for c in comps:
        if c.get("name", "").endswith("(self)"):
            continue
        page = update_card(page, c, errors)
        page = update_drawer(page, c, errors)
    if errors:
        print("NOT WRITTEN:\n  " + "\n  ".join(errors), file=sys.stderr)
        sys.exit(1)
    open(PAGE, "w", encoding="utf-8").write(page)

    meta = json.load(open(META, encoding="utf-8"))
    meta["full_run"] = a.date
    meta["updated"] = a.date
    meta["next_full_run"] = a.next
    with open(META, "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    print("applied %d competitors; full_run=%s next=%s" % (len(comps), a.date, a.next))


if __name__ == "__main__":
    main()
