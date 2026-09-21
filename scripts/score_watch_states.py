"""
Score and tier data/state-signal.json's `watch_states` list into a workable
shortlist for Marketing/Sales, instead of a flat 41-state list.

Combines three signals already present on each watch_states entry:
  - starbridge_open_rfps (heaviest weight): a district actively shopping right now
  - since: how recent the state policy/legislative signal is
  - actionable: existing HubSpot footprint (MQA/Engaged accounts ready for outreach)

Adds `priority_score` (0-100) and `priority_tier` (act_now / watch / low_priority)
to each watch_states entry, then sorts the list by score descending.

Rerun this after any refresh that changes watch_states' `actionable`,
`since`, or `starbridge_open_rfps` values (see DASH_ROUTINE.md Phase 1.5).
"""
from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "state-signal.json"

ACT_NOW_MIN = 56
WATCH_MIN = 32


def months_ago(since: str, today: date) -> int | None:
    if since == "unknown":
        return None
    parts = since.split("-")
    year = int(parts[0])
    month = int(parts[1]) if len(parts) > 1 else 6
    return (today.year - year) * 12 + (today.month - month)


def rfp_score(n: int) -> int:
    if n >= 4:
        return 50
    if n >= 2:
        return 40
    if n == 1:
        return 30
    return 0


def recency_score(months: int | None) -> int:
    if months is None:
        return 0
    if months <= 6:
        return 30
    if months <= 12:
        return 24
    if months <= 24:
        return 18
    if months <= 36:
        return 12
    if months <= 60:
        return 6
    return 2


def footprint_score(actionable: int) -> int:
    if actionable >= 20:
        return 20
    if actionable >= 12:
        return 15
    if actionable >= 6:
        return 10
    if actionable >= 3:
        return 5
    return 2


def tier_for(score: int) -> str:
    if score >= ACT_NOW_MIN:
        return "act_now"
    if score >= WATCH_MIN:
        return "watch"
    return "low_priority"


def main():
    today = date.today()
    d = json.loads(DATA_PATH.read_text())

    for w in d["watch_states"]:
        ma = months_ago(w["since"], today)
        score = (
            rfp_score(w.get("starbridge_open_rfps", 0))
            + recency_score(ma)
            + footprint_score(w["actionable"])
        )
        w["priority_score"] = score
        w["priority_tier"] = tier_for(score)

    d["watch_states"].sort(key=lambda w: -w["priority_score"])

    DATA_PATH.write_text(json.dumps(d, indent=2, ensure_ascii=False) + "\n")

    counts = {"act_now": 0, "watch": 0, "low_priority": 0}
    for w in d["watch_states"]:
        counts[w["priority_tier"]] += 1
    print(f"Scored {len(d['watch_states'])} watch states -> "
          f"{counts['act_now']} act_now / {counts['watch']} watch / {counts['low_priority']} low_priority",
          file=sys.stderr)


if __name__ == "__main__":
    main()
