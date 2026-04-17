"""
HydroCert UI Change Detector - Main Orchestrator
Entry point that ties scanner, reporter, and alerter together.

Usage:
    python run_detector.py [--quick] [--no-alert] [--baseline PATH] [--output DIR]

Scheduling with Windows Task Scheduler (daily at 08:00):
    1. Open Task Scheduler (taskschd.msc)
    2. Create Task > Name: "HydroCert Change Detector"
    3. Trigger > New > Daily, Start at 08:00
    4. Action > New > Start a program
         Program: python
         Arguments: run_detector.py
         Start in: C:\\Users\\Coca-Cola\\Hydro-QA-work\\exploration-2026-04-12\\change-detector
    5. Conditions > uncheck "Start only if on AC power" (for laptops)
    6. Settings > check "Run task as soon as possible after a scheduled start is missed"

    Alternatively, from an elevated command prompt:
        schtasks /create /tn "HydroCert Change Detector" ^
            /tr "python C:\\Users\\Coca-Cola\\Hydro-QA-work\\exploration-2026-04-12\\change-detector\\run_detector.py" ^
            /sc daily /st 08:00
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

# Ensure the script's own directory is on the import path so sibling
# modules (scanner, reporter, alerter) are found regardless of cwd.
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)

from reporter import generate_report, generate_diff_summary
from alerter import send_alerts


# ANSI helpers
_RESET = "\033[0m"
_BOLD = "\033[1m"
_CYAN = "\033[96m"
_GREEN = "\033[92m"
_RED = "\033[91m"
_DIM = "\033[2m"


def _print_banner():
    print()
    print(f"{_CYAN}{_BOLD}{'=' * 60}{_RESET}")
    print(f"{_CYAN}{_BOLD}  HydroCert UI Change Detector{_RESET}")
    print(f"{_CYAN}{_BOLD}  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}{_RESET}")
    print(f"{_CYAN}{_BOLD}{'=' * 60}{_RESET}")
    print()


def main():
    parser = argparse.ArgumentParser(
        description="HydroCert UI Change Detector - scan, report, alert.",
    )
    parser.add_argument(
        "--quick",
        action="store_true",
        help="Quick scan (first 3 screens only).",
    )
    parser.add_argument(
        "--ci",
        action="store_true",
        help="CI mode: skip screens that require real device hardware, use env var credentials.",
    )
    parser.add_argument(
        "--no-alert",
        action="store_true",
        help="Skip alerts; just scan and generate the report.",
    )
    parser.add_argument(
        "--baseline",
        type=str,
        default=os.path.join(_SCRIPT_DIR, "baseline.json"),
        help="Path to baseline.json (default: ./baseline.json).",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=os.path.join(_SCRIPT_DIR, "reports"),
        help="Output directory for reports (default: ./reports).",
    )
    parser.add_argument(
        "--screens",
        type=str,
        default=None,
        help="Comma-separated list of screen IDs to scan (overrides --quick). "
             "Example: --screens priority_picker,delete_dialog. Requires the "
             "listed screens' nav helpers to be self-contained from cold start.",
    )
    args = parser.parse_args()

    _print_banner()

    screenshots_dir = os.path.join(_SCRIPT_DIR, "screenshots")

    # ------------------------------------------------------------------
    # Step 1 - Run the scan
    # ------------------------------------------------------------------
    print(f"{_BOLD}[1/4] Running scan...{_RESET}")
    t0 = time.time()

    try:
        from scanner import scan_all_screens, save_scan_results
    except ImportError:
        print(f"{_RED}[error]{_RESET} Could not import scanner module.")
        print(f"       Make sure scanner.py exists in {_SCRIPT_DIR}")
        sys.exit(1)

    # scan_all_screens(device, quick, ci_mode) returns {screen_id: [new_elements]}
    # It loads baseline.json internally via load_baseline().
    ci_mode = args.ci or bool(os.environ.get("GITHUB_ACTIONS"))
    only_screens: list[str] | None = None
    if args.screens:
        only_screens = [s.strip() for s in args.screens.split(",") if s.strip()]
    # Allow CI to pass a filter via env var without CLI changes.
    env_filter = os.environ.get("DETECTOR_SCREENS")
    if only_screens is None and env_filter:
        only_screens = [s.strip() for s in env_filter.split(",") if s.strip()]
    raw_results = scan_all_screens(
        quick=args.quick, ci_mode=ci_mode, only_screens=only_screens
    )

    elapsed_scan = time.time() - t0
    total_new = sum(len(data["new"]) if isinstance(data, dict) else len(data) for data in raw_results.values())
    total_removed = sum(len(data.get("removed", [])) if isinstance(data, dict) else 0 for data in raw_results.values())

    print(
        f"  Scanned {len(raw_results)} screen(s) in {elapsed_scan:.1f}s "
        f"-- {total_new} new, {total_removed} removed element(s) found."
    )
    print()

    # ------------------------------------------------------------------
    # Step 2 - Save raw results
    # ------------------------------------------------------------------
    # save_scan_results(results, output_dir) wraps the raw dict into the
    # full JSON payload ({scan_timestamp, screens, summary}) and writes it.
    # It accepts output_dir as a Path and returns the written file Path.
    print(f"{_BOLD}[2/4] Saving scan results...{_RESET}")
    output_path = Path(args.output)
    output_path.mkdir(parents=True, exist_ok=True)
    results_file = save_scan_results(raw_results, output_path)
    results_path = str(results_file)

    print(f"  Results saved to: {results_path}")
    print()

    # ------------------------------------------------------------------
    # Step 3 - Generate HTML report
    # ------------------------------------------------------------------
    # generate_report reads the saved JSON (which has the wrapped format)
    print(f"{_BOLD}[3/4] Generating HTML report...{_RESET}")
    report_path = generate_report(results_path, screenshots_dir, args.output)
    print()

    # ------------------------------------------------------------------
    # Step 4 - Send alerts (unless --no-alert)
    # ------------------------------------------------------------------
    # Load the wrapped results for reporter/alerter (they expect the
    # {screens: {name: {new_elements: [...]}}} format).
    with open(results_path, "r", encoding="utf-8") as f:
        wrapped_results = json.load(f)

    if args.no_alert:
        print(f"{_DIM}[4/4] Alerts skipped (--no-alert).{_RESET}")
        # Still print the diff summary to console
        print()
        print(generate_diff_summary(wrapped_results))
    else:
        print(f"{_BOLD}[4/4] Sending alerts...{_RESET}")
        send_alerts(wrapped_results, report_path)

    # ------------------------------------------------------------------
    # Done
    # ------------------------------------------------------------------
    print()
    print(f"{_GREEN}{_BOLD}Done.{_RESET} Report: {report_path}")
    print()

    # ------------------------------------------------------------------
    # Optional CI gate (feature-flagged, OFF by default)
    # ------------------------------------------------------------------
    # When FAIL_ON_NEW_ELEMENTS=1 is set, exit non-zero if any screen has
    # new_element_count > 0. Off by default so in-progress navigation work
    # on other branches isn't blocked by noisy diffs.
    if os.environ.get("FAIL_ON_NEW_ELEMENTS") == "1":
        screens = wrapped_results.get("screens", {})
        offending = [
            s for s, info in screens.items()
            if info.get("new_element_count", 0) > 0 or info.get("removed_element_count", 0) > 0
        ]
        if offending:
            print(
                f"{_RED}{_BOLD}FAIL_ON_NEW_ELEMENTS=1:{_RESET} "
                f"{len(offending)} screen(s) with new elements: "
                f"{', '.join(offending)}"
            )
            sys.exit(1)


if __name__ == "__main__":
    main()
