"""
Merge the per-shard mobile regression artifacts back into one bundle.

Each shard job uploads its own `qa-artifacts/mobile-v2/` tree (test/summary.json
plus screenshots/, ui-dumps/, logs/, results/). This rebuilds the single tree the
HTML generator and the Teams card expect, so downstream consumers cannot tell
the run was sharded.

Coverage is asserted against the shard plan, and any flow the plan promised but
no shard reported becomes an explicit SKIP entry with a `::error::` annotation.
The script ALWAYS exits 0: a merge problem must surface as data (visible SKIPs
and a red line in the job summary), never as a job failure, because a failed job
in the reusable workflow makes the nightly Teams card hide every mobile metric.
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

COPY_DIRS = ("screenshots", "ui-dumps", "logs", "results")


def load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def expected_from_plan(plan_json: str) -> list[str]:
    try:
        plan = json.loads(plan_json) if plan_json else []
    except Exception:
        return []
    out: list[str] = []
    for entry in plan:
        out.extend(n for n in str(entry.get("flows", "")).split(",") if n)
    return out


def flow_number(check_id: str) -> str:
    return str(check_id).split("_", 1)[0]


def merge(shards_dir: Path, out_dir: Path, plan_json: str) -> dict:
    out_test = out_dir / "test"
    out_test.mkdir(parents=True, exist_ok=True)

    # A shard bundle is any directory containing test/summary.json.
    summaries = sorted(shards_dir.glob("*/test/summary.json"))
    notes: list[str] = []
    checks: list[dict] = []
    seen: dict[str, str] = {}   # check id > shard dir name
    duplicates: list[str] = []
    mode = "test"

    for sp in summaries:
        shard_name = sp.parent.parent.name
        data = load_json(sp)
        if not isinstance(data, dict):
            notes.append(f"{shard_name}: summary.json unreadable")
            continue
        mode = data.get("mode") or mode
        for c in (data.get("checks") or []):
            cid = c.get("id")
            if not cid:
                continue
            if cid in seen:
                duplicates.append(f"{cid} (in {seen[cid]} and {shard_name})")
                continue
            seen[cid] = shard_name
            checks.append(c)

        # Copy this shard's evidence into the merged tree.
        for sub in COPY_DIRS:
            src = sp.parent / sub
            if src.is_dir():
                dst = out_test / sub
                dst.mkdir(parents=True, exist_ok=True)
                for item in src.iterdir():
                    if item.is_file():
                        try:
                            shutil.copy2(item, dst / item.name)
                        except Exception:
                            pass

    # Coverage: every flow the plan promised must have reported something.
    expected = expected_from_plan(plan_json)
    reported = {flow_number(c.get("id", "")) for c in checks}
    missing = [n for n in expected if n not in reported]
    for n in missing:
        checks.append({
            "id": f"{n}_(not reported)",
            "status": "SKIP",
            "details": "shard produced no result for this flow (shard crashed, "
                       "timed out, or was cancelled)",
        })

    checks.sort(key=lambda c: str(c.get("id", "")))
    totals = {
        "total": len(checks),
        "pass": sum(1 for c in checks if (c.get("status") or "").upper() == "PASS"),
        "fail": sum(1 for c in checks if (c.get("status") or "").upper() == "FAIL"),
        "skip": sum(1 for c in checks if (c.get("status") or "").upper() == "SKIP"),
    }

    merged = {
        "mode": mode,
        "sharded": True,
        "shards": len(summaries),
        "totals": totals,
        "checks": checks,
    }
    (out_test / "summary.json").write_text(
        json.dumps(merged, indent=2), encoding="utf-8")

    # Anomalies that must be loud but must not fail the job.
    if not summaries:
        print("::error::no shard summaries found - the mobile run produced nothing",
              file=sys.stderr)
    if duplicates:
        print(f"::error::duplicate check ids across shards: {'; '.join(duplicates[:10])}",
              file=sys.stderr)
    if missing:
        print(f"::error::{len(missing)} planned flow(s) never reported: {','.join(missing)}",
              file=sys.stderr)
    if expected and len(expected) != len({*expected}):
        print("::warning::shard plan contained duplicate flow numbers", file=sys.stderr)
    for n in notes:
        print(f"::warning::{n}", file=sys.stderr)

    return merged


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Merge sharded mobile regression artifacts.")
    p.add_argument("--shards-dir", required=True,
                   help="directory holding the downloaded per-shard bundles")
    p.add_argument("--output-dir", required=True,
                   help="merged qa-artifacts/mobile-v2 path to build")
    p.add_argument("--plan", default="",
                   help="shard plan JSON, used to assert full coverage")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    merged = merge(Path(args.shards_dir), Path(args.output_dir), args.plan)
    t = merged["totals"]
    print(f"MERGED shards={merged['shards']} total={t['total']} "
          f"pass={t['pass']} fail={t['fail']} skip={t['skip']}")
    return 0   # always succeed - anomalies are data, not job failures


if __name__ == "__main__":
    sys.exit(main())
