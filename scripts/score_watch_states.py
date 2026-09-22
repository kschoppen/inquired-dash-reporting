"""
Score and tier data/state-signal.json's `watch_states` list into a workable
shortlist for Marketing/Sales, instead of a flat 41-state list.

Combines four signals already present on each watch_states entry (or
computed from warm_signals_by_state):
  - starbridge_open_rfps: a district actively shopping right now (RFP live)
  - warm_signals_by_state[state].by_product[product]: a live Starbridge
    Warm Signals board-meeting hit for this state+product (Meeting_Score>=10,
    Status New/Saved) -- a district planning an upcoming adoption, distinct
    from an already-open RFP
  - since: how recent the state policy/legislative signal is
  - actionable: existing HubSpot footprint (MQA/Engaged accounts ready for outreach)

Adds `priority_score` (0-100) and `priority_tier` (act_now / watch / low_priority)
to each watch_states entry, then sorts the list by score descending.

Rebalanced 2026-09-22 (Kelsey-confirmed) to make room for the new Warm
Signals ingredient: Open RFP right now max dropped 50 to 30, Policy news
recency max dropped 30 to 20, both proportionally rescaled from their prior
tiers (not re-derived from scratch) so the relative shape is unchanged --
just compressed to fit the new 30-point ceiling. Existing HubSpot footprint
is untouched at max 20. Total ceiling stays 100, so the act_now/watch tier
cutoffs below did not need to move.

Rerun this after any refresh that changes watch_states' `actionable`,
`since`, `starbridge_open_rfps`, or `warm_signals_by_state` values (see
DASH_ROUTINE.md Phase 1.5).
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
    """Max 30 (was 50) -- proportionally rescaled by 0.6 from the prior
    0/30/40/50 tiers to free 20 points for the new warm-signal ingredient."""
    if n >= 4:
        return 30
    if n >= 2:
        return 24
    if n == 1:
        return 18
    return 0


def warm_signal_score(n: int) -> int:
    """Max 30 (new). Same shape as rfp_score on purpose -- both are
    'how many live Starbridge signals exist for this state+product' counts,
    just from different bridges (RFP vs. Warm Signals/board-meeting)."""
    if n >= 4:
        return 30
    if n >= 2:
        return 24
    if n == 1:
        return 18
    return 0


def recency_score(months: int | None) -> int:
    """Max 20 (was 30) -- proportionally rescaled by 2/3 from the prior
    30/24/18/12/6/2 tiers."""
    if months is None:
        return 0
    if months <= 6:
        return 20
    if months <= 12:
        return 16
    if months <= 24:
        return 12
    if months <= 36:
        return 8
    if months <= 60:
        return 4
    return 1


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
    warm_by_state = d.get("warm_signals_by_state", {})

    for w in d["watch_states"]:
        ma = months_ago(w["since"], today)
        warm_n = warm_by_state.get(w["state"], {}).get("by_product", {}).get(w["product"], 0)
        rfp_pts = rfp_score(w.get("starbridge_open_rfps", 0))
        warm_pts = warm_signal_score(warm_n)
        recency_pts = recency_score(ma)
        footprint_pts = footprint_score(w["actionable"])
        score = rfp_pts + warm_pts + recency_pts + footprint_pts
        w["priority_score"] = score
        w["priority_tier"] = tier_for(score)
        w["priority_breakdown"] = {
            "open_rfp": rfp_pts,
            "warm_signal": warm_pts,
            "policy_recency": recency_pts,
            "hubspot_footprint": footprint_pts,
        }

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
