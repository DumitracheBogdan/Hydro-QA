"""
End-to-end smoke test for the UI Change Detector — no device required.

Simulates a full scan pipeline against a synthetic UI hierarchy and the real
baseline.json shipped with the repo. Validates five phases:

    [1/5] import scanner + baseline loads
    [2/5] extract_elements on a synthetic hierarchy
    [3/5] dynamic-content filter strips dates/times/IDs/counters
    [4/5] compare_with_baseline produces stable results (no false positives
          for dynamic text, real new buttons still flagged)
    [5/5] save_scan_results writes a valid JSON payload with new_element_count

Run:
    python3 exploration-2026-04-12/change-detector/tests/test_e2e_with_real_scan.py

Exits non-zero if any phase fails.
"""

import json
import os
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

_HERE = os.path.dirname(os.path.abspath(__file__))
_PARENT = os.path.dirname(_HERE)
if _PARENT not in sys.path:
    sys.path.insert(0, _PARENT)


def _fail(phase: str, msg: str) -> None:
    print(f"  FAIL [{phase}]: {msg}")
    sys.exit(1)


# ---------------------------------------------------------------------------
# Phase 1 — module import + baseline load
# ---------------------------------------------------------------------------
print("[1/5] Importing scanner and loading baseline...")
try:
    import scanner  # noqa: E402
    from scanner import (  # noqa: E402
        extract_elements,
        compare_with_baseline,
        save_scan_results,
        load_baseline,
        BASELINE_PATH,
    )
except Exception as e:
    _fail("1/5", f"import failed: {e}")

if not Path(BASELINE_PATH).exists():
    _fail("1/5", f"baseline.json not found at {BASELINE_PATH}")

try:
    baseline = load_baseline()
except Exception as e:
    _fail("1/5", f"load_baseline raised: {e}")

if not isinstance(baseline, dict) or not baseline:
    _fail("1/5", f"baseline empty or wrong type: {type(baseline).__name__}")
print(f"  PASS [1/5] baseline loaded with {len(baseline)} screen(s)")


# ---------------------------------------------------------------------------
# Phase 2 — extract_elements on a synthetic hierarchy
# ---------------------------------------------------------------------------
print("[2/5] Extracting elements from synthetic hierarchy...")
HIERARCHY_XML = """
<hierarchy>
  <node package="com.hydrocert.app" class="android.widget.TextView"
        text="VISITS" content-desc="" clickable="false"
        resource-id="" bounds="[0,0][100,50]" />
  <node package="com.hydrocert.app" class="android.widget.TextView"
        text="15.04.2026" content-desc="" clickable="false"
        resource-id="" bounds="[0,60][100,110]" />
  <node package="com.hydrocert.app" class="android.widget.TextView"
        text="07:00 -&gt; 09:30" content-desc="" clickable="false"
        resource-id="" bounds="[0,120][100,170]" />
  <node package="com.hydrocert.app" class="android.widget.TextView"
        text="#VN011710" content-desc="" clickable="false"
        resource-id="" bounds="[0,180][100,230]" />
  <node package="com.hydrocert.app" class="android.widget.TextView"
        text="INSPECTIONS (4)" content-desc="" clickable="false"
        resource-id="" bounds="[0,240][100,290]" />
  <node package="com.hydrocert.app" class="android.widget.EditText"
        text="user.typed@x.com" content-desc="Email field" clickable="true"
        resource-id="com.hydrocert.app:id/email" bounds="[0,300][100,350]" />
  <node package="com.hydrocert.app" class="android.widget.Button"
        text="real new button" content-desc="" clickable="true"
        resource-id="" bounds="[0,360][100,410]" />
  <node package="com.android.systemui" class="android.widget.TextView"
        text="9:00" content-desc="" clickable="false"
        resource-id="" bounds="[0,0][50,30]" />
</hierarchy>
"""
tree = ET.fromstring(HIERARCHY_XML)
elements = extract_elements(tree)
if len(elements) != 7:
    _fail("2/5", f"expected 7 elements (systemui filtered), got {len(elements)}: {[e.get('text') for e in elements]}")
print(f"  PASS [2/5] extracted {len(elements)} elements (systemui filtered out)")


# ---------------------------------------------------------------------------
# Phase 3 — dynamic-content filter strips dates/times/IDs/counters
# ---------------------------------------------------------------------------
print("[3/5] Verifying dynamic-content filter...")
by_bounds = {e["bounds"]: e for e in elements}

# Date element — text stripped
if by_bounds["[0,60][100,110]"]["text"] != "":
    _fail("3/5", f"date text not stripped: {by_bounds['[0,60][100,110]']['text']!r}")
# Time-range element — text stripped
if by_bounds["[0,120][100,170]"]["text"] != "":
    _fail("3/5", f"time range not stripped: {by_bounds['[0,120][100,170]']['text']!r}")
# Visit ID — text stripped
if by_bounds["[0,180][100,230]"]["text"] != "":
    _fail("3/5", f"visit id not stripped: {by_bounds['[0,180][100,230]']['text']!r}")
# Counter — text stripped
if by_bounds["[0,240][100,290]"]["text"] != "":
    _fail("3/5", f"counter not stripped: {by_bounds['[0,240][100,290]']['text']!r}")
# EditText — text stripped (pre-existing behavior)
if by_bounds["[0,300][100,350]"]["text"] != "":
    _fail("3/5", f"EditText not stripped: {by_bounds['[0,300][100,350]']['text']!r}")
# Regular label — preserved
if by_bounds["[0,0][100,50]"]["text"] != "VISITS":
    _fail("3/5", f"regular label lost: {by_bounds['[0,0][100,50]']['text']!r}")
# Real new button — preserved
if by_bounds["[0,360][100,410]"]["text"] != "real new button":
    _fail("3/5", f"real button lost: {by_bounds['[0,360][100,410]']['text']!r}")
print("  PASS [3/5] dynamic text stripped, static labels preserved")


# ---------------------------------------------------------------------------
# Phase 4 — compare_with_baseline
# ---------------------------------------------------------------------------
print("[4/5] Comparing against synthetic baseline...")
synthetic_baseline = {
    "visits_home": {
        "elements": [
            {"text": "VISITS", "content_desc": "", "resource_id": ""},
            {"text": "", "content_desc": "Email field", "resource_id": "com.hydrocert.app:id/email"},
        ]
    }
}
new_elements = compare_with_baseline("visits_home", elements, synthetic_baseline)
new_texts = [e.get("text") for e in new_elements]

# Dynamic-text elements must NOT appear as new — they were stripped and have
# no desc/resource_id, so compare_with_baseline skips them as unlabelled.
for forbidden in ("15.04.2026", "07:00 -> 09:30", "#VN011710", "INSPECTIONS (4)"):
    if forbidden in new_texts:
        _fail("4/5", f"dynamic text {forbidden!r} leaked into new elements")

# 'real new button' must be flagged.
if "real new button" not in new_texts:
    _fail("4/5", f"real new button missed; new_texts={new_texts}")

# Known 'VISITS' must NOT be flagged.
if "VISITS" in new_texts:
    _fail("4/5", f"known 'VISITS' wrongly flagged as new; new_texts={new_texts}")
print(f"  PASS [4/5] comparison produced {len(new_elements)} new element(s), all legitimate")


# ---------------------------------------------------------------------------
# Phase 5 — save_scan_results JSON roundtrip
# ---------------------------------------------------------------------------
print("[5/5] Writing scan results and validating payload...")
with tempfile.TemporaryDirectory() as td:
    results = {"visits_home": new_elements}
    out_path = save_scan_results(results, Path(td))
    if not out_path.exists():
        _fail("5/5", f"save_scan_results did not create {out_path}")
    with open(out_path, "r", encoding="utf-8") as fh:
        payload = json.load(fh)
    if "screens" not in payload or "summary" not in payload:
        _fail("5/5", f"payload missing keys: {list(payload.keys())}")
    screen_info = payload["screens"].get("visits_home")
    if screen_info is None:
        _fail("5/5", "visits_home missing from saved payload")
    if screen_info.get("new_element_count") != len(new_elements):
        _fail(
            "5/5",
            f"new_element_count mismatch: {screen_info.get('new_element_count')} != {len(new_elements)}",
        )
    if payload["summary"].get("total_new_elements") != len(new_elements):
        _fail("5/5", "summary.total_new_elements mismatch")
print(f"  PASS [5/5] saved payload validated (new_element_count={len(new_elements)})")


print()
print("All 5 phases PASS.")
sys.exit(0)
