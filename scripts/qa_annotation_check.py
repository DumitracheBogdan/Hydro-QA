#!/usr/bin/env python3
"""
Annotation QA for the mobile regression Excel. Verifies that every flow's
screenshot gets a "what was tested" annotation and that the report is in a
sensible login-to-last order.

Given the per-flow uiautomator dumps from a run (--artifacts-dir), for each
flow it:
  - confirms a '# CIRCLE:' hint exists,
  - resolves each hinted element in the flow's dump and counts how many
    circles will actually be drawn,
  - flags any flow that would show NO circle (hint element not on the
    captured screen) so it can be fixed (add a hint element that is present,
    or make the flow end on the tested element).

It also checks the flows enumerate in order (01..65), i.e. login first,
last test last - so the Excel rows are not chaotic.

Exit codes: 0 = every flow annotated + ordered; 1 = one or more gaps.
Use --warn-only to report without failing (for report-only lanes).
"""
from __future__ import annotations
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from generate_mobile_regression_excel import derive_circle_targets, find_node_bounds  # noqa: E402

# flows that legitimately cannot be circled in-app: they hand off to a SYSTEM
# UI (Android camera permission dialog / gallery picker), which is not the
# app's own surface. Documented, not a failure.
SYSTEM_DIALOG_FLOWS = {"34_camera_permission", "35_gallery_picker"}


def flow_order_ok(flows: list[str]) -> bool:
    """The list should already be in ascending flow order."""
    def key(f):
        num = f.split("_", 1)[0]
        try:
            return (int("".join(c for c in num if c.isdigit())), num)
        except ValueError:
            return (9999, num)
    return flows == sorted(flows, key=key)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--flows-dir", default=str(ROOT / "mobile-flows-v2"))
    ap.add_argument("--artifacts-dir", default="", help="dir with test/ui-dumps/*.xml from a run")
    ap.add_argument("--warn-only", action="store_true")
    args = ap.parse_args()

    flows_dir = Path(args.flows_dir)
    dumps = Path(args.artifacts_dir) / "test" / "ui-dumps" if args.artifacts_dir else None

    flow_ids = [p.stem for p in sorted(flows_dir.glob("[0-9]*.yaml"))]
    problems: list[str] = []

    if not flow_order_ok(flow_ids):
        problems.append("[ORDER] flows do not enumerate login-to-last in order")

    no_hint, no_circle, ok = [], [], []
    for fid in flow_ids:
        targets = derive_circle_targets(flows_dir, fid)
        if not targets:
            (no_hint if fid not in SYSTEM_DIALOG_FLOWS else ok).append(fid)
            if fid not in SYSTEM_DIALOG_FLOWS:
                problems.append(f"[HINT] {fid}: no '# CIRCLE:' hint")
            continue
        if dumps is not None:
            dump = dumps / f"{fid}.xml"
            found = sum(1 for t in targets if find_node_bounds(dump, t))
            if found == 0 and fid not in SYSTEM_DIALOG_FLOWS:
                no_circle.append(fid)
                problems.append(f"[CIRCLE] {fid}: 0/{len(targets)} hint elements on the captured screen "
                                f"(hint: {', '.join(targets)})")
            else:
                ok.append(f"{fid} ({found} circle{'s' if found != 1 else ''})")
        else:
            ok.append(f"{fid} (hint set)")

    print(f"flows: {len(flow_ids)} | annotated ok: {len(ok)} | "
          f"no-hint: {len(no_hint)} | no-circle-on-screen: {len(no_circle)} | "
          f"system-dialog (n/a): {len(SYSTEM_DIALOG_FLOWS)}")
    if dumps is not None:
        for line in ok:
            print("  ok:", line)
    if problems:
        print("\nGAPS:")
        for p in problems:
            print("  " + p)
        if args.warn_only:
            print("\n(warn-only: not failing)")
            return 0
        return 1
    print("\nAll flows annotated + ordered login-to-last.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
