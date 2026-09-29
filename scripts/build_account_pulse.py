#!/usr/bin/env python3
"""Build data/account-pulse.json for the Account Pulse (MQA) tab.

No network calls. The Monday routine (PULSE_ROUTINE.md) runs the HubSpot MCP
queries, saves each raw tool result into one folder, and then runs this script,
which does all the counting, scoring and history bookkeeping. Keeping the math
here means the numbers are reproducible and the routine's context stays small.

Usage:
  python3 scripts/build_account_pulse.py --raw /tmp/pulse --today 2026-09-29

Raw folder (one file per query, the MCP result saved verbatim):
  mqa_open.json     open MQA accounts (rows)
  mqa_ever.json     every account with a first_mqa_date (rows)
  opp_since.json    accounts whose first_mqa_opportunity_date >= 2025-10-01 (rows)
  engaged_7d.json   Engaged accounts that entered Engaged in the last 7 days (rows)
  stage_totals.json COUNT(*) GROUP BY mqa_lifecycle_stage (aggregate)
  owners.json       {"<owner id>": "<name>", ...}  (optional; merged into data/hubspot-owners.json)

Also reads, when present:
  data/account-pulse.json    previous output, for history[]
  data/pulse-decisions.json  Airtable decision log snapshot, for follow-up flags
"""
import argparse, json, os, re, statistics, sys
from datetime import date, timedelta

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, "data", "account-pulse.json")
OWNERS = os.path.join(REPO, "data", "hubspot-owners.json")
DECISIONS = os.path.join(REPO, "data", "pulse-decisions.json")

PORTAL = "4451852"
SEGMENTS = ["Medium District", "Large District", "Enterprise District"]
BACKFILL = "2025-11-17"   # HubSpot MQA stage dates were backfilled on this day at launch
STALE_DAYS = 120          # MQA with no re-MQA in this many days = stale
PASS_WINDOW = 120         # Pass to Sales covers MQAs inside this window
ORIGIN_WINDOW = 90
HISTORY_KEEP = 26
MIN_SIGNAL_SAMPLE = 10

SIGNAL_SHORT = {
    'Marked "Yes, Reviewing"': "Yes, Reviewing",
    "Clicked Email or 5+ Clicks": "Clicked email / 5+ clicks",
    "2+ DL's w Form Submissions": "2+ DL form fills",
    "DL attended TL Webinar": "DL attended webinar",
}


def hs_url(cid):
    return f"https://app.hubspot.com/contacts/{PORTAL}/record/0-2/{cid}"


def load_raw(path):
    """Return (rows, tsv_rows) from an MCP query_crm_data result saved verbatim."""
    if not os.path.exists(path):
        return None, None
    txt = open(path, encoding="utf-8").read().strip()
    try:
        d = json.loads(txt)
    except json.JSONDecodeError:
        sys.exit(f"ERROR: {path} is not the JSON the HubSpot tool returned")
    if isinstance(d, dict) and isinstance(d.get("rows"), list):
        return d["rows"], None  # compact form: {"rows": [{property: value, ...}]}
    if isinstance(d, dict) and isinstance(d.get("tsv"), list):
        return None, d["tsv"]   # compact aggregate: {"tsv": [["MQA", "99"], ...]}
    if isinstance(d, dict) and "results" not in d:
        return d, None  # plain dict (owners.json)
    rows, tsv = [], None
    for r in d.get("results", []):
        c = r.get("content", "")
        if c.startswith("{"):
            rows.append(json.loads(c).get("properties", {}))
        elif "Dataset TSV:" in c:
            lines = c.split("Dataset TSV:", 1)[1].strip().split("\n")
            tsv = [l.split("\t") for l in lines[1:] if l.strip()]
    return rows, tsv


def iso(p, key):
    v = p.get(key + "_iso") or ""
    if v:
        return v[:10]
    raw = p.get(key)
    if raw and str(raw).isdigit():  # epoch ms
        return date.fromtimestamp(int(raw) / 1000).isoformat()
    return None


def days_between(a, b):
    return (date.fromisoformat(b) - date.fromisoformat(a)).days


def signals_of(p):
    raw = p.get("mqa_signal") or ""
    return [s.strip() for s in raw.split(";") if s.strip()]


def short(s):
    return SIGNAL_SHORT.get(s, s)


def quarter(d):
    y, m = int(d[:4]), int(d[5:7])
    return f"Q{(m - 1) // 3 + 1} {y}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True)
    ap.add_argument("--today", default=date.today().isoformat())
    a = ap.parse_args()
    today = a.today
    t = lambda n: (date.fromisoformat(today) - timedelta(days=n)).isoformat()

    mqa_open, _ = load_raw(os.path.join(a.raw, "mqa_open.json"))
    mqa_ever, _ = load_raw(os.path.join(a.raw, "mqa_ever.json"))
    opp_since, _ = load_raw(os.path.join(a.raw, "opp_since.json"))
    engaged_7d, _ = load_raw(os.path.join(a.raw, "engaged_7d.json"))
    _, totals_tsv = load_raw(os.path.join(a.raw, "stage_totals.json"))
    missing = [n for n, v in [("mqa_open", mqa_open), ("mqa_ever", mqa_ever), ("opp_since", opp_since),
                              ("engaged_7d", engaged_7d), ("stage_totals", totals_tsv)] if v is None]
    if missing:
        sys.exit("ERROR: missing raw files: " + ", ".join(missing))

    owners = json.load(open(OWNERS)) if os.path.exists(OWNERS) else {}
    new_owners, _ = load_raw(os.path.join(a.raw, "owners.json"))
    if isinstance(new_owners, dict):
        owners.update({str(k): v for k, v in new_owners.items() if v and v.strip()})
    unknown_owners = set()

    def owner(p):
        oid = str(p.get("hubspot_owner_id") or "")
        if not oid:
            return "Unassigned"
        if oid in owners:
            return owners[oid]
        unknown_owners.add(oid)
        return f"Owner {oid}"

    stage_totals = {r[0]: int(r[1]) for r in totals_tsv if len(r) >= 2 and r[1].isdigit()}

    # ---- signal conversion (all accounts that ever hit MQA) ----
    sig_n, sig_opp, cohorts = {}, {}, {}
    for p in mqa_ever:
        fm, fo = iso(p, "first_mqa_date"), iso(p, "first_mqa_opportunity_date")
        if not fm:
            continue
        q = quarter(fm)
        c = cohorts.setdefault(q, {"quarter": q, "start": fm[:4] + "-%02d" % ((int(fm[5:7]) - 1) // 3 * 3 + 1), "mqa": 0, "opp": 0})
        c["mqa"] += 1
        c["opp"] += 1 if fo else 0
        for s in signals_of(p) or ["No signal recorded"]:
            sig_n[s] = sig_n.get(s, 0) + 1
            sig_opp[s] = sig_opp.get(s, 0) + (1 if fo else 0)
    signal_rows = sorted(
        [{"signal": short(s), "raw": s, "mqa": n, "opp": sig_opp[s], "rate": round(sig_opp[s] / n, 3),
          "small_sample": n < MIN_SIGNAL_SAMPLE} for s, n in sig_n.items()],
        key=lambda r: (r["small_sample"], -r["rate"]))
    rated = [r for r in signal_rows if not r["small_sample"] and r["raw"] != "No signal recorded"]
    top_rate = max([r["rate"] for r in rated] or [0.01])
    sig_points = {r["raw"]: max(10, round(50 * r["rate"] / top_rate)) for r in rated}
    DEFAULT_SIG = 20
    for r in signal_rows:
        r["points"] = sig_points.get(r["raw"], DEFAULT_SIG if r["raw"] != "No signal recorded" else 10)
    cohort_rows = sorted(cohorts.values(), key=lambda c: c["start"])
    for c in cohort_rows:
        c["rate"] = round(c["opp"] / c["mqa"], 3) if c["mqa"] else None
        c["includes_backfill"] = c["start"] == "2025-10"
        del c["start"]
    ever_total = sum(c["mqa"] for c in cohort_rows)
    ever_opp = sum(c["opp"] for c in cohort_rows)

    # ---- where new opportunities came from + time to opportunity ----
    origin = {"mqa_first": 0, "engaged_first": 0, "no_stage": 0, "ambiguous": 0}
    origin_90 = dict(origin)
    lag_mqa, lag_eng = [], []
    moved = []
    for p in opp_since:
        o = iso(p, "first_mqa_opportunity_date")
        if not o or o == BACKFILL:
            continue
        m, e = iso(p, "first_mqa_date"), iso(p, "first_mqa_engaged_date")
        if m and m < o and m != BACKFILL:
            kind = "mqa_first"; lag_mqa.append(days_between(m, o))
        elif e and e < o and e != BACKFILL:
            kind = "engaged_first"; lag_eng.append(days_between(e, o))
        elif not m and not e:
            kind = "no_stage"
        else:
            kind = "ambiguous"
        origin[kind] += 1
        if o >= t(ORIGIN_WINDOW):
            origin_90[kind] += 1
        if o >= t(7):
            moved.append({"id": p.get("hs_object_id"), "name": p.get("name") or "(no name in HubSpot)",
                          "segment": (p.get("segment") or "").replace(" District", ""), "state": p.get("state_st") or "",
                          "owner": owner(p), "move": "New Opportunity", "date": o, "signal": "",
                          "hs_url": hs_url(p.get("hs_object_id"))})
    opp_total = sum(origin.values())
    opp_rows_90 = sum(origin_90.values())
    warmed = origin["mqa_first"] + origin["engaged_first"]
    warmed_90 = origin_90["mqa_first"] + origin_90["engaged_first"]

    # ---- open MQAs: Pass to Sales + Stale ----
    decisions = json.load(open(DECISIONS)).get("entries", []) if os.path.exists(DECISIONS) else []
    latest = {}
    for d in sorted(decisions, key=lambda x: x.get("decidedAt", "")):
        latest[str(d.get("companyId"))] = d

    def recency_pts(days):
        return 30 if days <= 30 else 25 if days <= 60 else 15 if days <= 100 else 5

    def contact_pts(dsc):
        return 20 if dsc is None else 15 if dsc > 60 else 8 if dsc > 30 else 0

    pass_rows, stale_rows, cold_60 = [], [], 0
    for p in mqa_open:
        cid = str(p.get("hs_object_id"))
        rm, fm, lc = iso(p, "recent_mqa_date"), iso(p, "first_mqa_date"), iso(p, "notes_last_contacted")
        days_mqa = days_between(rm, today) if rm else None
        dsc = days_between(lc, today) if lc else None
        if dsc is None or dsc > 60:
            cold_60 += 1
        sigs = signals_of(p)
        base = {"id": cid, "name": p.get("name") or "(no name in HubSpot)",
                "segment": (p.get("segment") or "").replace(" District", ""), "state": p.get("state_st") or "",
                "owner": owner(p), "signals": [short(s) for s in sigs], "recent_mqa_date": rm, "first_mqa_date": fm,
                "days_mqa": days_mqa, "last_contacted": lc, "days_since_contact": dsc, "hs_url": hs_url(cid)}
        dec = latest.get(cid)
        if dec and dec.get("decision") and dec["decision"] != "Cleared":
            flag = None
            da = (dec.get("decidedAt") or "")[:10]
            if dec["decision"] == "Demote" and rm and da and rm > da:
                flag = "Hit MQA again after it was demoted on " + da
            elif dec["decision"] == "Escalate" and da and days_between(da, today) >= 30:
                flag = "Escalated %d days ago, still no Opportunity" % days_between(da, today)
            elif dec["decision"] == "Recycle":
                flag = "Recycled on " + da + ": re-check this week"
            base["followup"] = flag
        if rm and fm == BACKFILL and rm == BACKFILL:
            base["backfill"] = True
        if days_mqa is not None and days_mqa > STALE_DAYS:
            stale_rows.append(base)
            continue
        sp = sorted([sig_points.get(s, DEFAULT_SIG) for s in sigs], reverse=True)
        s_pts = min(50, (sp[0] if sp else 10) + 5 * (len(sp) - 1))
        r_pts = recency_pts(days_mqa if days_mqa is not None else 999)
        c_pts = contact_pts(dsc)
        base.update({"score": s_pts + r_pts + c_pts, "breakdown": {"signal": s_pts, "recency": r_pts, "contact": c_pts}})
        pass_rows.append(base)
    pass_rows.sort(key=lambda r: (-r["score"], r["days_mqa"] or 0))
    stale_rows.sort(key=lambda r: -(r["days_mqa"] or 0))

    new_mqa = [p for p in mqa_open if (iso(p, "recent_mqa_date") or "") >= t(7)]
    for p in new_mqa:
        moved.append({"id": p.get("hs_object_id"), "name": p.get("name") or "(no name in HubSpot)",
                      "segment": (p.get("segment") or "").replace(" District", ""), "state": p.get("state_st") or "",
                      "owner": owner(p), "move": "New MQA", "date": iso(p, "recent_mqa_date"),
                      "signal": ", ".join(short(s) for s in signals_of(p)), "hs_url": hs_url(p.get("hs_object_id"))})
    for p in engaged_7d:
        moved.append({"id": p.get("hs_object_id"), "name": p.get("name") or "(no name in HubSpot)",
                      "segment": (p.get("segment") or "").replace(" District", ""), "state": p.get("state_st") or "",
                      "owner": owner(p), "move": "New Engaged", "date": iso(p, "recent_mqa_engaged_date"),
                      "signal": ", ".join(short(s) for s in signals_of(p)), "hs_url": hs_url(p.get("hs_object_id"))})
    order = {"New Opportunity": 0, "New MQA": 1, "New Engaged": 2}
    moved.sort(key=lambda r: r["date"] or "", reverse=True)
    moved.sort(key=lambda r: order[r["move"]])
    new_opp_7d = sum(1 for r in moved if r["move"] == "New Opportunity")

    tiles = {
        "mqa_total": stage_totals.get("MQA"), "engaged_total": stage_totals.get("Engaged"),
        "opportunity_total": stage_totals.get("Opportunity"),
        "new_mqa_7d": len(new_mqa), "new_engaged_7d": len(engaged_7d), "new_opp_7d": new_opp_7d,
        "mqa_cold_60d": cold_60, "stale_mqa": len(stale_rows), "pass_to_sales": len(pass_rows),
        "warmed_share": {"pct": round(warmed / opp_total, 3) if opp_total else None,
                         "warmed": warmed, "of": opp_total, "since": BACKFILL,
                         "last_90d": {"warmed": warmed_90, "of": opp_rows_90}},
    }

    prev = json.load(open(OUT)) if os.path.exists(OUT) else {}
    hist = [h for h in prev.get("history", []) if h.get("date") != today and "mqa_total" in h]
    hist.append({"date": today, **{k: tiles[k] for k in ["mqa_total", "engaged_total", "opportunity_total", "new_mqa_7d",
                                                         "new_engaged_7d", "new_opp_7d", "mqa_cold_60d", "stale_mqa"]},
                 "warmed_share": tiles["warmed_share"]["pct"]})
    hist = sorted(hist, key=lambda h: h["date"])[-HISTORY_KEEP:]

    out = {
        "updated": today,
        "stale_after_days": 8,
        "universe": "Medium, Large and Enterprise districts (HubSpot company Segment)",
        "source_line": f"HubSpot portal {PORTAL} · company records",
        "backfill_date": BACKFILL,
        "tiles": tiles,
        "history": hist,
        "pass_to_sales": {
            "window_days": PASS_WINDOW,
            "rows": pass_rows,
            "scoring": {
                "signal_points": [{"signal": r["signal"], "points": r["points"], "rate": r["rate"], "mqa": r["mqa"],
                                   "small_sample": r["small_sample"]} for r in signal_rows if r["raw"] != "No signal recorded"],
                "extra_signal_points": 5, "signal_cap": 50,
                "recency": [["0 to 30 days", 30], ["31 to 60 days", 25], ["61 to 100 days", 15], ["101 to 120 days", 5]],
                "contact": [["Never contacted", 20], ["Over 60 days", 15], ["31 to 60 days", 8], ["30 days or less", 0]],
            },
        },
        "impact": {
            "ever_mqa": ever_total, "ever_opp": ever_opp,
            "ever_rate": round(ever_opp / ever_total, 3) if ever_total else None,
            "cohorts": cohort_rows,
            "signals": [r for r in signal_rows if r["raw"] != "No signal recorded" or r["mqa"] >= MIN_SIGNAL_SAMPLE],
            "origin": {"since": BACKFILL, "total": opp_total, **origin,
                       "last_90d": {"window_days": ORIGIN_WINDOW, "total": opp_rows_90, **origin_90}},
            "median_days": {"mqa_to_opp": statistics.median(lag_mqa) if lag_mqa else None, "mqa_n": len(lag_mqa),
                            "engaged_to_opp": statistics.median(lag_eng) if lag_eng else None, "engaged_n": len(lag_eng),
                            "mqa_within_100": sum(1 for x in lag_mqa if x <= 100)},
        },
        "moved": moved,
        "stale": {"threshold_days": STALE_DAYS, "rows": stale_rows},
        "decisions_snapshot": {"entries": len(decisions),
                               "as_of": (json.load(open(DECISIONS)).get("as_of") if os.path.exists(DECISIONS) else None)},
        "unknown_owner_ids": sorted(unknown_owners),
    }
    json.dump(out, open(OUT, "w"), indent=1, ensure_ascii=False)
    open(OUT, "a").write("\n")
    if new_owners:
        json.dump(dict(sorted(owners.items())), open(OWNERS, "w"), indent=1, ensure_ascii=False)
    print(json.dumps({"ok": True, "tiles": tiles, "pass_rows": len(pass_rows), "stale_rows": len(stale_rows),
                      "moved": len(moved), "history": len(hist), "unknown_owner_ids": sorted(unknown_owners)}))
    print("PULSE_BUILD_OK")


if __name__ == "__main__":
    main()
