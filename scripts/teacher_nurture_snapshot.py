#!/usr/bin/env python3
"""Weekly Teacher Nurture snapshot (Mailchimp) -> data/teacher-nurture-snapshot.json.

Mirrors what netlify/functions/teacher-nurture.mjs returns live, so teacher-nurture.html can
render either one, and appends a history row so the tab can show week-over-week phase movement.

Needs MAILCHIMP_API_KEY in the environment (datacenter read from the "-usXX" suffix). The key is
never printed. Standard library only. Exit codes: 0 ok, 2 missing key, 3 Mailchimp error.

Run from the repo root:  python3 scripts/teacher_nurture_snapshot.py
"""
import base64, json, os, re, sys, urllib.parse, urllib.request
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

AUDIENCE_ID = "20beb95bf5"
OUT = "data/teacher-nurture-snapshot.json"
REGISTRY = "data/teacher-nurture.json"
SINCE = "2026-09-01T00:00:00+00:00"  # flow step emails are created after this; same as the function
CODE_RE = re.compile(r"^(T\d+[ab]?(?:-K2|-3-5)?|H\d)\s*[:_]")
HISTORY_MAX = 26

key = os.environ.get("MAILCHIMP_API_KEY") or os.environ.get("MAILCHIMP_KEY") or os.environ.get("MC_API_KEY")
if not key or "-" not in key:
    print("ERROR: MAILCHIMP_API_KEY is not set (or has no -usXX suffix).", file=sys.stderr)
    sys.exit(2)
BASE = f"https://{key.rsplit('-', 1)[1]}.api.mailchimp.com/3.0"
AUTH = "Basic " + base64.b64encode(f"dash:{key}".encode()).decode()


def mc(path):
    req = urllib.request.Request(BASE + path, headers={"Authorization": AUTH})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = json.load(e).get("detail", "")
        except Exception:
            pass
        print(f"ERROR: Mailchimp {e.code} on {path.split('?')[0]}: {detail}", file=sys.stderr)
        sys.exit(3)


reg = json.load(open(REGISTRY))
prefix = reg["segment_prefix"]
wanted = {p["key"]: p["segment"] for p in reg["phases"]}
wanted.update({s["key"]: s["segment"] for s in reg.get("extra_segments", [])})

segs = mc(f"/lists/{AUDIENCE_ID}/segments?type=saved&count=1000&fields=segments.id,segments.name,segments.member_count,segments.updated_at")
by_name = {s["name"]: s for s in segs.get("segments", [])}

phases, missing = {}, []
for k, name in wanted.items():
    s = by_name.get(name)
    if not s:
        missing.append(name)
        continue
    # A saved segment's member_count is cached by Mailchimp (it can be days old). The members
    # endpoint's total_items is computed at request time, so use it as the count.
    live = mc(f"/lists/{AUDIENCE_ID}/segments/{s['id']}/members?count=1&fields=total_items")
    phases[k] = {"count": live.get("total_items"), "segment_id": s["id"],
                 "cached_count": s.get("member_count"), "cached_as_of": s.get("updated_at")}

camp = mc("/campaigns?count=1000&since_create_time=" + urllib.parse.quote(SINCE) +
          "&fields=campaigns.id,campaigns.web_id,campaigns.type,campaigns.status,campaigns.emails_sent,"
          "campaigns.settings.title,campaigns.settings.subject_line,campaigns.report_summary")
emails = []
for c in camp.get("campaigns", []):
    title = (c.get("settings") or {}).get("title") or ""
    m = CODE_RE.match(title)
    if not m or c.get("type") == "regular":
        continue
    rs = c.get("report_summary") or {}
    e = {"code": m.group(1), "title": title, "subject": c["settings"].get("subject_line", ""),
         "web_id": c.get("web_id"), "type": c.get("type"), "status": c.get("status"),
         "sent": c.get("emails_sent") or 0, "opens": rs.get("unique_opens"), "open_rate": rs.get("open_rate"),
         "clicks": rs.get("subscriber_clicks"), "click_rate": rs.get("click_rate")}
    if e["sent"] > 0:
        r = mc(f"/reports/{c['id']}?fields=unsubscribed,bounces")
        e["unsubs"] = r.get("unsubscribed")
        b = r.get("bounces") or {}
        e["bounces"] = (b.get("hard_bounces") or 0) + (b.get("soft_bounces") or 0)
    emails.append(e)

now = datetime.now(timezone.utc)
today = now.astimezone(ZoneInfo("America/New_York")).date().isoformat()
prev = {}
try:
    prev = json.load(open(OUT))
except (FileNotFoundError, json.JSONDecodeError):
    pass

def sent_by_code(es):
    out = {}
    for e in es:
        out[e["code"]] = out.get(e["code"], 0) + (e.get("sent") or 0)
    return out


history = [h for h in prev.get("history", []) if h.get("date") != today]
# The newest earlier row predates per-email history. If the previous snapshot is from that same day,
# its email list fills the gap so the first week-over-week comparison has a baseline.
if history and "sent_by_code" not in history[-1] and prev.get("updated") == history[-1].get("date"):
    history[-1]["sent_by_code"] = sent_by_code(prev.get("emails", []))
history.append({"date": today,
                "phases": {k: v["count"] for k, v in phases.items()},
                "sent_total": sum(e["sent"] for e in emails),
                "sent_by_code": sent_by_code(emails)})
history = history[-HISTORY_MAX:]

# ---- Checks: expected versus actual sends, flat flows, unsubscribes, bounces, segment sanity ----
ENTRY_MIN = 100        # a flow's trigger population must grow by this much before zero sends counts as a problem
SWING_PCT, SWING_MIN = 0.25, 200
MIN_SENT, UNSUB_MAX, BOUNCE_WATCH, BOUNCE_ALERT = 50, 0.01, 0.02, 0.05
# Which saved segment(s) feed each flow's trigger (Phase Status / Active User Flag / Activation Substate).
TRIGGER = {"awareness": ["awareness"], "discovery": ["discovery"], "activation": ["adopt", "sustained"],
           "adopt": ["active_users"], "sustained": ["sustained"], "holding": ["holding"]}
flags, entry_check = [], []


def flag(level, kind, text):
    flags.append({"level": level, "kind": kind, "text": text})


def first_step(f):
    codes = f["emails"]
    first = [codes[0]]
    if codes[0].endswith("-K2") and codes[0][:-3] + "-3-5" in codes:
        first.append(codes[0][:-3] + "-3-5")
    return first


base = None
for h in reversed(history[:-1]):
    if (datetime.fromisoformat(today) - datetime.fromisoformat(h["date"])).days >= 6:
        base = h
        break

if missing:
    flag("alert", "segment", f"{len(missing)} phase segment(s) missing in Mailchimp, so phase counts are incomplete.")

for e in emails:
    sent = e.get("sent") or 0
    if sent < MIN_SENT:
        continue
    if e.get("unsubs") is not None and e["unsubs"] / sent > UNSUB_MAX:
        flag("watch", "unsub", f"{e['code']}: {e['unsubs']} unsubscribes on {sent} sent ({e['unsubs'] / sent:.1%}).")
    if e.get("bounces") is not None and e["bounces"] / sent > BOUNCE_WATCH:
        rate = e["bounces"] / sent
        flag("alert" if rate > BOUNCE_ALERT else "watch", "bounce", f"{e['code']}: {e['bounces']} bounces on {sent} sent ({rate:.1%}).")

if base:
    for k, now_n in ((k, v["count"]) for k, v in phases.items() if k in {p["key"] for p in reg["phases"]}):
        was = (base.get("phases") or {}).get(k)
        if was and now_n is not None and abs(now_n - was) >= SWING_MIN and abs(now_n - was) / was > SWING_PCT:
            flag("watch", "swing", f"{k}: {was:,} to {now_n:,} since {base['date']}. Check the Gainsight sync before trusting it.")
    prior = base.get("sent_by_code")
    if prior is not None:
        now_sent = sent_by_code(emails)
        for f in reg["flows"]:
            keys = TRIGGER.get(f["key"], [])
            if not keys or any(x not in phases for x in keys):
                continue
            was_trig = sum((base.get("phases") or {}).get(x) or 0 for x in keys)
            grew = sum(phases[x]["count"] or 0 for x in keys) - was_trig
            first_sends = sum(now_sent.get(c, 0) - prior.get(c, 0) for c in first_step(f))
            flow_sends = sum(now_sent.get(c, 0) - prior.get(c, 0) for c in f["emails"])
            entry_check.append({"flow": f["key"], "trigger_population_change": grew,
                                "first_email_sends": first_sends, "all_flow_sends": flow_sends})
            if grew >= ENTRY_MIN and first_sends == 0:
                flag("alert", "entry", f"{f['name']}: {grew:,} more teachers in its trigger population since {base['date']}, but 0 first-email sends. The trigger may not be firing.")
            elif flow_sends == 0 and sum(prior.get(c, 0) for c in f["emails"]) > 0:
                flag("watch", "flat", f"{f['name']}: no new sends since {base['date']}.")

snap = {"ok": True, "source": "snapshot", "updated": today, "fetched_at": now.isoformat(timespec="seconds"),
        "stale_after_days": 8, "phases": phases, "segments_missing": missing, "emails": emails,
        "history": history, "flags": flags, "entry_check": entry_check,
        "checks_base_date": base["date"] if base else None}
with open(OUT, "w") as f:
    json.dump(snap, f, indent=1)
    f.write("\n")

sending = sorted({e["code"] for e in emails if e["sent"] > 0})
print(json.dumps({"ok": True, "updated": today,
                  "phases": {k: v["count"] for k, v in phases.items()},
                  "segments_missing": missing, "emails_found": len(emails),
                  "emails_sending": sending, "history_rows": len(history),
                  "checks_base_date": base["date"] if base else None, "flags": flags}))
