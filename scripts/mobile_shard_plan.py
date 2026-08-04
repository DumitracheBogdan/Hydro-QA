"""
Partition the mobile Maestro flows into shards that can run in parallel
without breaking each other.

The flows are NOT all independent, so a naive "split the sorted list into N"
silently corrupts the suite. Two real constraints, both derived from the flow
files themselves (never a hand-maintained list, so a new flow can't quietly
land in the wrong shard):

  1. Shared-fixture flows. 29 of the 61 flows drive the SAME dev visit
     ("QA test", via _shared/open_qa_test_visit.yaml), and several of them
     write to it (fill + submit, signature, delete-action, unsaved-data) while
     others tap an inspection card positionally (`index: 0`). Run two of those
     concurrently and they fight over one visit. They all go in ONE shard, in
     their original order, exactly as they run today.

  2. Sequential pairs. Flows sharing a numeric base (62a draft then 62b
     restore) are one story split across two files: same shard, in order.

Everything left is fixture-free and round-robins across the remaining shards.

Emits the matrix JSON consumed by post-deploy-regression-mobile.yml. Each entry
carries the comma-separated flow numbers for FLOWS_FILTER:

  [{"shard": 0, "name": "fixture", "flows": "05,15,16,...", "count": 29}, ...]

Fails loud (exit 1) if the partition is not a perfect cover of the live flow
list - every flow exactly once, nothing invented.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# A flow belongs to the shared-fixture group when it reaches the "QA test"
# visit. Matching the subflow include OR the literal anchor text catches both
# the _shared/ path and the inline History search some flows use.
FIXTURE_MARKERS = ("open_qa_test_visit", "QA test")


def flow_number(path: Path) -> str:
    """`27_inspection_start.yaml` > `27`; `62a_process_death_draft` > `62a`."""
    return path.name.split("_", 1)[0]


def numeric_base(number: str) -> str:
    """`62a` > `62` so sequential pairs group together; `27` > `27`."""
    m = re.match(r"(\d+)", number)
    return m.group(1) if m else number


def touches_fixture(path: Path) -> bool:
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        # Unreadable flow: treat as fixture-bound. Serialising a flow is always
        # safe; parallelising one wrongly is not.
        return True
    return any(marker in text for marker in FIXTURE_MARKERS)


def build_plan(flows_dir: Path, shards: int) -> list[dict]:
    flows = sorted(flows_dir.glob("*.yaml"), key=lambda p: p.name)
    if not flows:
        raise SystemExit(f"no flows found under {flows_dir}")

    # Group by numeric base first so 62a/62b are one indivisible unit.
    groups: dict[str, list[Path]] = {}
    for f in flows:
        groups.setdefault(numeric_base(flow_number(f)), []).append(f)

    fixture: list[Path] = []
    free: list[list[Path]] = []
    for _, members in sorted(groups.items(), key=lambda kv: int(kv[0]) if kv[0].isdigit() else 0):
        if any(touches_fixture(m) for m in members):
            fixture.extend(members)          # whole group is fixture-bound
        else:
            free.append(members)             # keep the group together

    # Shard 0 carries the fixture-bound set, serialised as it runs today.
    buckets: list[list[Path]] = [list(fixture)]
    spare = max(1, shards - 1)
    rest: list[list[Path]] = [[] for _ in range(spare)]

    # Longest-group-first round robin, so the free shards come out even.
    for i, members in enumerate(sorted(free, key=len, reverse=True)):
        rest[i % spare].extend(members)
    buckets.extend(b for b in rest if b)

    plan = []
    for idx, bucket in enumerate(buckets):
        ordered = sorted(bucket, key=lambda p: p.name)
        plan.append({
            "shard": idx,
            "name": "fixture" if idx == 0 else f"free{idx}",
            "flows": ",".join(flow_number(p) for p in ordered),
            "count": len(ordered),
        })

    # Perfect-cover check: every live flow assigned exactly once.
    assigned = [n for entry in plan for n in entry["flows"].split(",") if n]
    expected = [flow_number(f) for f in flows]
    if sorted(assigned) != sorted(expected):
        missing = sorted(set(expected) - set(assigned))
        extra = sorted(set(assigned) - set(expected))
        dupes = sorted({n for n in assigned if assigned.count(n) > 1})
        raise SystemExit(
            "shard plan is not a perfect cover of the flow list "
            f"(missing={missing} extra={extra} duplicated={dupes})")
    return plan


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Plan mobile flow shards.")
    p.add_argument("--flows-dir", default="mobile-flows-v2")
    p.add_argument("--shards", type=int, default=3,
                   help="total shards including the fixture shard (default 3)")
    p.add_argument("--format", choices=["json", "human"], default="json")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    plan = build_plan(Path(args.flows_dir), args.shards)
    if args.format == "human":
        total = sum(e["count"] for e in plan)
        for e in plan:
            print(f"shard {e['shard']} ({e['name']}): {e['count']} flows")
            print(f"  {e['flows']}")
        print(f"total: {total} flows across {len(plan)} shards")
    else:
        print(json.dumps(plan, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
