#!/usr/bin/env python3
"""Copy marketing-ops' weekly performance history into the dash (Kelsey, 2026-11-17).

  python3 scripts/content_from_ops.py <marketing-ops checkout>/performance-history.json

Writes data/content-performance.json: the same weeks as marketing-ops, plus `updated` (today) for the tab's
freshness stamp. The numbers are never recomputed here, so the dash and the GTM hub can't disagree.
Exit 2 when the file is missing or has no weeks (the tab keeps last week's data).
"""
import datetime
import json
import pathlib
import sys

src = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None
if not src or not src.exists():
    print("content_from_ops: performance-history.json not found", file=sys.stderr)
    sys.exit(2)
doc = json.loads(src.read_text())
weeks = [w for w in doc.get("weeks", []) if w.get("pages")]
if not weeks:
    print("content_from_ops: no weeks in the history", file=sys.stderr)
    sys.exit(2)
out = pathlib.Path(__file__).resolve().parent.parent / "data" / "content-performance.json"
updated = datetime.date.today().isoformat()
out.write_text(json.dumps({"updated": updated, "source": "InquirED-com/marketing-ops performance-history.json", "weeks": weeks}, indent=1) + "\n")
print(f"content-performance.json: {len(weeks)} week(s), latest {weeks[-1]['as_of']}, {len(weeks[-1]['pages'])} pages")
