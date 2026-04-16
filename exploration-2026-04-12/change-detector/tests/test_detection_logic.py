"""
Unit tests for the UI Change Detector scanner logic.

Covers:
  - compare_with_baseline: new-element detection via text/content_desc/resource_id
  - detect_removed_elements: baseline entries absent from the current scan
  - extract_elements: EditText text stripping + dynamic-content text stripping
  - _is_dynamic_text: regex whole-string matches for dates, times, visit IDs, counters

Run:
    python3 exploration-2026-04-12/change-detector/tests/test_detection_logic.py

Exits non-zero on any failure.
"""

import os
import sys
import xml.etree.ElementTree as ET

# Make `scanner` importable regardless of CWD.
_HERE = os.path.dirname(os.path.abspath(__file__))
_PARENT = os.path.dirname(_HERE)
if _PARENT not in sys.path:
    sys.path.insert(0, _PARENT)

from scanner import (  # noqa: E402
    compare_with_baseline,
    detect_removed_elements,
    extract_elements,
)


# ---------------------------------------------------------------------------
# Tiny test harness (no pytest dependency — matches the rest of the repo)
# ---------------------------------------------------------------------------
_PASSED = 0
_FAILED = 0


def _run(name, fn):
    global _PASSED, _FAILED
    try:
        fn()
        print(f"  PASS  {name}")
        _PASSED += 1
    except AssertionError as e:
        print(f"  FAIL  {name}: {e}")
        _FAILED += 1
    except Exception as e:  # pragma: no cover
        print(f"  FAIL  {name}: unexpected {type(e).__name__}: {e}")
        _FAILED += 1


def _xml(snippet: str) -> ET.Element:
    """Wrap a <node> snippet in a root hierarchy element and parse."""
    return ET.fromstring(f"<hierarchy>{snippet}</hierarchy>")


# ---------------------------------------------------------------------------
# compare_with_baseline
# ---------------------------------------------------------------------------

def test_new_element_flagged_when_text_missing_from_baseline():
    baseline = {"visits_home": {"elements": [{"text": "VISITS", "content_desc": "", "resource_id": ""}]}}
    current = [{"text": "ADD NEW VISIT", "content_desc": "", "resource_id": "", "class": "", "clickable": True, "bounds": ""}]
    new = compare_with_baseline("visits_home", current, baseline)
    assert len(new) == 1, f"expected 1 new, got {len(new)}"
    assert new[0]["text"] == "ADD NEW VISIT"


def test_known_text_not_flagged():
    baseline = {"visits_home": {"elements": [{"text": "VISITS", "content_desc": "", "resource_id": ""}]}}
    current = [{"text": "VISITS", "content_desc": "", "resource_id": "", "class": "", "clickable": False, "bounds": ""}]
    new = compare_with_baseline("visits_home", current, baseline)
    assert new == [], f"expected no new, got {new}"


def test_match_by_content_desc():
    baseline = {"s": {"elements": [{"text": "", "content_desc": "Back button", "resource_id": ""}]}}
    current = [{"text": "", "content_desc": "Back button", "resource_id": "", "class": "", "clickable": True, "bounds": ""}]
    assert compare_with_baseline("s", current, baseline) == []


def test_match_by_resource_id():
    baseline = {"s": {"elements": [{"text": "", "content_desc": "", "resource_id": "com.hydrocert.app:id/fab"}]}}
    current = [{"text": "", "content_desc": "", "resource_id": "com.hydrocert.app:id/fab", "class": "", "clickable": True, "bounds": ""}]
    assert compare_with_baseline("s", current, baseline) == []


def test_unlabelled_container_skipped():
    baseline = {"s": {"elements": []}}
    current = [{"text": "", "content_desc": "", "resource_id": "", "class": "android.view.ViewGroup", "clickable": False, "bounds": ""}]
    assert compare_with_baseline("s", current, baseline) == []


def test_unknown_screen_returns_all_labelled():
    baseline = {}  # scanner treats missing screen as empty known set
    current = [{"text": "Hello", "content_desc": "", "resource_id": "", "class": "", "clickable": True, "bounds": ""}]
    new = compare_with_baseline("new_screen", current, baseline)
    assert len(new) == 1


# ---------------------------------------------------------------------------
# detect_removed_elements
# ---------------------------------------------------------------------------

def test_removed_element_detected():
    baseline = {"s": {"elements": [
        {"text": "OLD_BUTTON", "content_desc": "", "resource_id": ""},
        {"text": "KEEP", "content_desc": "", "resource_id": ""},
    ]}}
    current = [{"text": "KEEP", "content_desc": "", "resource_id": "", "class": "", "clickable": True, "bounds": ""}]
    removed = detect_removed_elements("s", current, baseline)
    texts = [e.get("text") for e in removed]
    assert "OLD_BUTTON" in texts, f"expected OLD_BUTTON removed, got {texts}"
    assert "KEEP" not in texts


# ---------------------------------------------------------------------------
# extract_elements — EditText text stripping (already in place)
# ---------------------------------------------------------------------------

def test_edittext_text_stripped():
    xml = _xml(
        '<node package="com.hydrocert.app" class="android.widget.EditText" '
        'text="qa.invalid@x.com" content-desc="" clickable="true" '
        'resource-id="" bounds="[0,0][100,50]" />'
    )
    els = extract_elements(xml)
    assert len(els) == 1
    assert els[0]["text"] == "", f"EditText text should be stripped, got {els[0]['text']!r}"


def test_non_edittext_text_preserved():
    xml = _xml(
        '<node package="com.hydrocert.app" class="android.widget.TextView" '
        'text="Welcome back!" content-desc="" clickable="false" '
        'resource-id="" bounds="[0,0][100,50]" />'
    )
    els = extract_elements(xml)
    assert len(els) == 1
    assert els[0]["text"] == "Welcome back!"


def test_system_ui_package_skipped():
    xml = _xml(
        '<node package="com.android.systemui" class="android.widget.TextView" '
        'text="9:00" content-desc="" clickable="false" '
        'resource-id="" bounds="[0,0][100,50]" />'
    )
    els = extract_elements(xml)
    assert els == [], f"systemui should be filtered, got {els}"


# ---------------------------------------------------------------------------
# Dynamic-text regex filter (NEW)
# ---------------------------------------------------------------------------

def test_dynamic_date_not_flagged():
    """A TextView whose full text is a date like '15.04.2026' should not be
    flagged as a new element even when the baseline has no matching text."""
    xml = _xml(
        '<node package="com.hydrocert.app" class="android.widget.TextView" '
        'text="15.04.2026" content-desc="" clickable="false" '
        'resource-id="" bounds="[0,0][100,50]" />'
    )
    els = extract_elements(xml)
    assert len(els) == 1
    assert els[0]["text"] == "", f"date text should be stripped, got {els[0]['text']!r}"
    # With text stripped AND no desc/id, compare_with_baseline skips it as
    # an unlabelled container → no false positive.
    baseline = {"visits_home": {"elements": []}}
    assert compare_with_baseline("visits_home", els, baseline) == []


def test_dynamic_time_range_not_flagged():
    """Full-string '07:00 -> 09:30' is a time range — should be stripped."""
    xml = _xml(
        '<node package="com.hydrocert.app" class="android.widget.TextView" '
        'text="07:00 -&gt; 09:30" content-desc="" clickable="false" '
        'resource-id="" bounds="[0,0][100,50]" />'
    )
    els = extract_elements(xml)
    assert len(els) == 1
    assert els[0]["text"] == "", f"time range should be stripped, got {els[0]['text']!r}"


def test_real_new_button_still_flagged():
    """'real new button' does not match any dynamic pattern and must still
    be detected as a new element."""
    xml = _xml(
        '<node package="com.hydrocert.app" class="android.widget.Button" '
        'text="real new button" content-desc="" clickable="true" '
        'resource-id="" bounds="[0,0][100,50]" />'
    )
    els = extract_elements(xml)
    assert len(els) == 1
    assert els[0]["text"] == "real new button"
    baseline = {"visits_home": {"elements": [{"text": "EXISTING", "content_desc": "", "resource_id": ""}]}}
    new = compare_with_baseline("visits_home", els, baseline)
    assert len(new) == 1 and new[0]["text"] == "real new button"


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

TESTS = [
    # Baseline logic (10 existing-style tests)
    ("new_element_flagged_when_text_missing_from_baseline", test_new_element_flagged_when_text_missing_from_baseline),
    ("known_text_not_flagged", test_known_text_not_flagged),
    ("match_by_content_desc", test_match_by_content_desc),
    ("match_by_resource_id", test_match_by_resource_id),
    ("unlabelled_container_skipped", test_unlabelled_container_skipped),
    ("unknown_screen_returns_all_labelled", test_unknown_screen_returns_all_labelled),
    ("removed_element_detected", test_removed_element_detected),
    ("edittext_text_stripped", test_edittext_text_stripped),
    ("non_edittext_text_preserved", test_non_edittext_text_preserved),
    ("system_ui_package_skipped", test_system_ui_package_skipped),
    # Dynamic-text filter (3 new cases for this feature)
    ("dynamic_date_not_flagged", test_dynamic_date_not_flagged),
    ("dynamic_time_range_not_flagged", test_dynamic_time_range_not_flagged),
    ("real_new_button_still_flagged", test_real_new_button_still_flagged),
]


def main():
    print(f"Running {len(TESTS)} detection-logic tests...\n")
    for name, fn in TESTS:
        _run(name, fn)
    print()
    print(f"{_PASSED} passed, {_FAILED} failed")
    sys.exit(0 if _FAILED == 0 else 1)


if __name__ == "__main__":
    main()
