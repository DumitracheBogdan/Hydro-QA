"""
HydroCert Android App Change Detector
Scans com.hydrocert.app on emulator-5554, dumps UI hierarchy per screen,
extracts interactive elements, and diffs against baseline.json.

Covers 27 screens including dialogs, sub-screens, FAB, inspection forms,
signature dialog, camera/gallery pickers, login error state, logout dialog,
bottom nav, and all main tabs.
"""

import argparse
import json
import logging
import os
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

# ---------------------------------------------------------------------------
# Path setup – make sure adb is reachable
# ---------------------------------------------------------------------------
os.environ["PATH"] += os.pathsep + os.path.expanduser(
    "~/AppData/Local/Android/Sdk/platform-tools"
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
PACKAGE = "com.hydrocert.app"
MAIN_ACTIVITY = f"{PACKAGE}/.MainActivity"
DEFAULT_DEVICE = "emulator-5554"
SCRIPT_DIR = Path(__file__).resolve().parent
SCREENSHOTS_DIR = SCRIPT_DIR / "screenshots"
BASELINE_PATH = SCRIPT_DIR / "baseline.json"

# Credentials: CI uses env vars; local uses these fallbacks
LOGIN_EMAIL = os.environ.get("MAESTRO_APP_EMAIL", "qa-mobile@example.com")
LOGIN_PASSWORD = os.environ.get("MAESTRO_APP_PASSWORD", "***REMOVED***")

# Screens that require a real device photo to trigger — skip in CI
CI_SKIP_SCREENS = {"photo_label_dialog"}

# Tap coordinates as FRACTIONS of the screen dimensions (0..1). Original
# values were captured on a 1080x2340 device; the CI emulator renders at
# 320x640. Storing fractions keeps these reusable across resolutions.
_REF_W, _REF_H = 1080, 2340
_COORDS_PX = {
    "bottom_visits":              (127, 2221),
    "bottom_history":             (403, 2221),
    "bottom_activity":            (678, 2221),
    "bottom_account":             (953, 2221),
    "view_visit_details":         (540, 1577),
    "tab_visit_details":          (180, 857),
    "tab_inspections":            (540, 857),
    "tab_attachments":            (900, 857),
    "back_button":                (75,  221),
    "change_password":            (540, 1204),
    "forgot_password_link":       (540, 1150),
    "visit_details_accordion":    (540, 990),
    "client_signature_accordion": (540, 1080),
    "tap_to_sign":                (540, 1350),
    "priority_badge":             (200, 1420),
    "delete_action_icon":         (950, 1530),
    "fab_button":                 (960, 2120),
    "actions_accordion":          (540, 1200),
}
COORDS_FRAC = {k: (x / _REF_W, y / _REF_H) for k, (x, y) in _COORDS_PX.items()}

_SCREEN_SIZE_CACHE: dict[str, tuple[int, int]] = {}

def get_screen_size(device: str) -> tuple[int, int]:
    if device in _SCREEN_SIZE_CACHE:
        return _SCREEN_SIZE_CACHE[device]
    out = adb("shell wm size", device) or ""
    # Example output: "Physical size: 320x640" or "Override size: 320x640"
    w, h = _REF_W, _REF_H
    for line in out.splitlines():
        if "size:" in line.lower():
            try:
                dims = line.split(":")[-1].strip()
                w_s, h_s = dims.split("x")
                w, h = int(w_s), int(h_s)
            except Exception:
                continue
    _SCREEN_SIZE_CACHE[device] = (w, h)
    log.info("Detected screen size for %s: %dx%d", device, w, h)
    return w, h

class _CoordsView:
    """Dict-like view that returns pixel coords scaled to the live device."""
    def __getitem__(self, key: str) -> tuple[int, int]:
        fx, fy = COORDS_FRAC[key]
        w, h = get_screen_size(DEFAULT_DEVICE)
        return (int(fx * w), int(fy * h))

COORDS = _CoordsView()

# Ordered traversal of all 24 scannable screens.
# Grouped into phases; order is critical for correct navigation state.
ALL_SCREENS = [
    # Phase 1: Pre-login (app not yet authenticated)
    "login",
    "forgot_password",
    "login_error_state",

    # Phase 2: Login + Visit Detail cluster
    "visits_home",
    "visit_detail",
    "visit_detail_accordion",
    "signature_dialog",
    "priority_picker",
    "delete_dialog",
    "unsaved_data_dialog",

    # Phase 3: FAB sub-screens (from visit_detail context)
    "fab_expanded",
    "add_actions_sheet",
    "camera_permission",
    "gallery_picker",
    "photo_label_dialog",   # skipped in CI via CI_SKIP_SCREENS

    # Phase 4: Inspections tab and all four form types
    "inspections_tab",
    "inspection_type1",
    "inspection_type2",
    "inspection_type3",
    "inspection_type4",

    # Phase 5: Remaining tabs
    "attachments_tab",
    "history_tab",
    "activity_tab",
    "account_tab",
    "change_password",
    "logout_dialog",
    "bottom_nav",
]

QUICK_SCREENS = [
    "visits_home",
    "visit_detail",
    "account_tab",
]

INTERACTIVE_CLASSES = {
    "android.widget.EditText",
    "android.widget.CheckBox",
    "android.widget.Switch",
    "android.widget.Spinner",
    "android.widget.Button",
    "android.widget.ImageButton",
    "android.widget.ToggleButton",
    "android.widget.RadioButton",
    "android.widget.CompoundButton",
}

# ---------------------------------------------------------------------------
# Dynamic-text regex filters
# ---------------------------------------------------------------------------
# Seed data regenerates timestamps, dates, visit IDs and counters on every
# scan, which creates false positives in the diff. We strip the text field
# (not the whole element) when it FULLY matches one of these patterns, so
# identity falls back to resource_id / class+bounds — mirroring the
# EditText-strip approach already in place.
#
# These are whole-string matches only (re.fullmatch). Partial hits like
# "Updated 07:00 ago" are left untouched so real label text is preserved.
DYNAMIC_TEXT_PATTERNS = [
    re.compile(r"\d{2}\.\d{2}\.\d{4}"),                 # 15.04.2026
    re.compile(r"\d{4}-\d{2}-\d{2}"),                   # 2026-04-15 (ISO)
    re.compile(r"\d{2}/\d{2}/\d{4}"),                   # 15/04/2026
    re.compile(r"\d{2}:\d{2}\s*->\s*\d{2}:\d{2}"),      # 07:00 -> 09:30
    re.compile(r"\d{1,2}:\d{2}(:\d{2})?"),              # 07:00 / 07:00:00
    re.compile(r"#[A-Z]+\d+"),                          # #VN011710
    re.compile(r"[A-Za-z ]+\s*\(\d+\)"),                # INSPECTIONS (4) / Inspections (0)
    re.compile(r"\d{7,}"),                              # Purchase Order / phone numbers (7+ digits)
    re.compile(r"[+]?\d[\d\s\-]{6,}"),                  # formatted phone numbers (+44 1234 567890)
]


def _is_dynamic_text(text: str) -> bool:
    """Return True if *text* fully matches any dynamic-content pattern."""
    if not text:
        return False
    return any(p.fullmatch(text) for p in DYNAMIC_TEXT_PATTERNS)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("change-detector")


# ===================================================================
# ADB helpers
# ===================================================================

def adb(cmd: str, device: str = DEFAULT_DEVICE, timeout: int = 30) -> str:
    """Run an adb command and return its stdout. Raises on failure."""
    full = ["adb", "-s", device] + cmd.split()
    log.debug("adb %s", " ".join(full))
    try:
        result = subprocess.run(
            full,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except FileNotFoundError:
        log.error(
            "adb not found. Make sure Android SDK platform-tools is on PATH."
        )
        sys.exit(1)
    except subprocess.TimeoutExpired:
        log.warning("adb command timed out after %ds: %s", timeout, cmd)
        return ""

    if result.returncode != 0 and result.stderr.strip():
        log.warning("adb stderr: %s", result.stderr.strip())
    return result.stdout


def tap(x: int, y: int, device: str = DEFAULT_DEVICE) -> None:
    """Tap the screen at (x, y)."""
    adb(f"shell input tap {x} {y}", device)
    time.sleep(0.4)


def input_text(text: str, device: str = DEFAULT_DEVICE) -> None:
    """Type text into the currently focused field. Escapes special chars."""
    escaped = text.replace(" ", "%s").replace("&", "\\&").replace(";", "\\;")
    adb(f"shell input text {escaped}", device)
    time.sleep(0.3)


def hide_keyboard(device: str = DEFAULT_DEVICE) -> None:
    """
    Dismiss the soft keyboard. KEYCODE_BACK (4) is the standard mechanism
    on Android — on the login screen, BACK can't navigate anywhere so it
    just hides the keyboard. KEYCODE_ESCAPE (111) is unreliable on Compose
    apps and was leaving the keyboard up, hiding the Login button.
    """
    adb("shell input keyevent 4", device)
    time.sleep(0.5)


def press_back(device: str = DEFAULT_DEVICE) -> None:
    """Press the Android Back button."""
    adb("shell input keyevent 4", device)
    time.sleep(0.5)


def scroll_down(device: str = DEFAULT_DEVICE) -> None:
    """Swipe upward (scroll content down) by ~600px."""
    adb("shell input swipe 540 1800 540 600 400", device)
    time.sleep(0.6)


def swipe_up_scaled(device: str = DEFAULT_DEVICE) -> None:
    """Resolution-aware swipe-up: moves content up by ~half a screen."""
    w, h = get_screen_size(device)
    adb(
        f"shell input swipe {w//2} {int(h*0.75)} {w//2} {int(h*0.25)} 400",
        device,
    )
    time.sleep(0.8)


def scroll_until_text(
    label: str, device: str = DEFAULT_DEVICE, max_scrolls: int = 6
) -> bool:
    """
    Swipe up repeatedly until a node with ``text`` containing *label*
    (case-insensitive) appears in the uiautomator dump. Content-desc is
    deliberately NOT matched — the "Quick actions" FAB has desc "Quick
    actions" which would satisfy a substring match for "Actions" and
    stop scrolling before the real Actions accordion text is on screen.
    """
    needle = label.lower()
    for i in range(max_scrolls + 1):
        raw = _dump_raw_xml(device)
        try:
            root = ET.fromstring(raw.strip())
        except ET.ParseError:
            root = None
        if root is not None:
            for node in root.iter("node"):
                txt = (node.attrib.get("text") or "").strip().lower()
                if txt and needle in txt:
                    return True
        if i < max_scrolls:
            swipe_up_scaled(device)
    return False


def wait(seconds: float = 2.0) -> None:
    """Simple sleep wrapper for readability."""
    time.sleep(seconds)


# ===================================================================
# UI hierarchy
# ===================================================================

def get_ui_snapshot(device: str = DEFAULT_DEVICE) -> list[dict]:
    """
    Dump the UI hierarchy via uiautomator and return a list of element dicts.
    Each dict: {text, content_desc, class, clickable, bounds, resource_id}
    """
    adb("shell uiautomator dump /sdcard/window_dump.xml", device, timeout=15)
    time.sleep(0.5)

    raw_xml = adb("shell cat /sdcard/window_dump.xml", device, timeout=10)
    if not raw_xml or not raw_xml.strip():
        log.warning("UI dump returned empty XML.")
        return []

    return _parse_ui_xml(raw_xml)


def get_full_ui_snapshot(
    device: str = DEFAULT_DEVICE,
    max_scrolls: int = 5,
) -> list[dict]:
    """
    Take a UI snapshot that covers off-screen elements by scrolling down and
    merging successive dumps. Stops early when no new elements appear.
    Use for long screens like inspection forms and the Add Actions bottom sheet.
    """
    seen_keys: set[str] = set()
    all_elements: list[dict] = []

    for scroll_idx in range(max_scrolls + 1):
        elements = get_ui_snapshot(device)
        new_found = False
        for el in elements:
            key = _element_key(el)
            if key and key not in seen_keys:
                seen_keys.add(key)
                all_elements.append(el)
                new_found = True

        log.debug(
            "Scroll %d/%d: +%d elements (total %d)",
            scroll_idx,
            max_scrolls,
            sum(1 for el in elements if _element_key(el) not in seen_keys | {_element_key(e) for e in all_elements}),
            len(all_elements),
        )

        if not new_found and scroll_idx > 0:
            log.debug("No new elements after scroll — stopping early.")
            break

        if scroll_idx < max_scrolls:
            scroll_down(device)

    return all_elements


def _element_key(el: dict) -> str | None:
    """Stable dedup key for an element across scroll positions."""
    t = el.get("text", "").strip()
    d = el.get("content_desc", "").strip()
    r = el.get("resource_id", "").strip()
    c = el.get("class", "").strip()
    if t:
        return f"text:{t}|class:{c}"
    if d:
        return f"desc:{d}|class:{c}"
    if r:
        return f"id:{r}"
    # Use bounds as weak key for unlabelled elements
    b = el.get("bounds", "").strip()
    if b:
        return f"bounds:{b}|class:{c}"
    return None


def _parse_ui_xml(raw_xml: str) -> list[dict]:
    """Parse uiautomator XML into a flat list of element dicts."""
    try:
        root = ET.fromstring(raw_xml.strip())
    except ET.ParseError as exc:
        log.error("Failed to parse UI XML: %s", exc)
        return []
    return extract_elements(root)


def _parse_bounds(bounds_str: str) -> tuple[int, int, int, int] | None:
    """Convert '[x1,y1][x2,y2]' to (x1, y1, x2, y2)."""
    m = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", bounds_str)
    if m:
        return tuple(int(v) for v in m.groups())  # type: ignore[return-value]
    return None


def _center(bounds: tuple[int, int, int, int]) -> tuple[int, int]:
    x1, y1, x2, y2 = bounds
    return ((x1 + x2) // 2, (y1 + y2) // 2)


# ===================================================================
# Element extraction
# ===================================================================

def extract_elements(xml_tree: ET.Element) -> list[dict]:
    """
    Walk the parsed XML tree and return all interactive nodes.
    A node is interactive if clickable='true' OR its class is in
    INTERACTIVE_CLASSES.
    """
    elements: list[dict] = []

    for node in xml_tree.iter("node"):
        # Filter out system UI elements (status bar, nav bar, etc.)
        pkg = node.attrib.get("package", "")
        if pkg and pkg != "com.hydrocert.app" and not pkg.startswith("com.hydrocert"):
            continue

        cls = node.attrib.get("class", "")
        clickable = node.attrib.get("clickable", "false") == "true"

        # Capture interactive elements AND non-interactive with visible text/desc
        text_val = node.attrib.get("text", "").strip()
        desc_val = node.attrib.get("content-desc", "").strip()
        if not clickable and cls not in INTERACTIVE_CLASSES and not text_val and not desc_val:
            continue

        bounds_raw = node.attrib.get("bounds", "")
        bounds = _parse_bounds(bounds_raw)

        # EditText values reflect what the USER typed, not the UI structure.
        # Using typed content as an identifier produces false positives every
        # run (e.g. "qa.invalid@x.com", "••••••••"). Strip text for EditText;
        # identity falls back to content_desc / resource_id / class+bounds.
        raw_text = node.attrib.get("text", "")
        stored_text = "" if cls == "android.widget.EditText" else raw_text

        # Dynamic-content strip (dates, times, visit IDs, counters). Same
        # rationale as EditText: strip the text so seed-data regeneration
        # doesn't trigger "new element" alerts on every scan. Whole-string
        # match only — partial matches like "Updated 07:00 ago" are kept.
        if stored_text and _is_dynamic_text(stored_text.strip()):
            stored_text = ""

        elements.append({
            "text": stored_text,
            "content_desc": node.attrib.get("content-desc", ""),
            "class": cls,
            "clickable": clickable,
            "resource_id": node.attrib.get("resource-id", ""),
            "bounds": bounds_raw,
        })

    return elements


# ===================================================================
# find_and_tap helpers
# ===================================================================

def find_and_tap(
    label: str,
    device: str = DEFAULT_DEVICE,
    timeout: int = 10,
    retries: int = 3,
) -> bool:
    """
    Dump UI, locate an element whose text or content-desc contains *label*,
    then tap its center. Returns True on success.
    """
    label_lower = label.lower()

    for attempt in range(1, retries + 1):
        adb("shell uiautomator dump /sdcard/window_dump.xml", device, timeout=15)
        time.sleep(0.3)
        raw_xml = adb("shell cat /sdcard/window_dump.xml", device, timeout=10)

        if not raw_xml.strip():
            log.debug("find_and_tap attempt %d: empty dump", attempt)
            wait(1)
            continue

        try:
            root = ET.fromstring(raw_xml.strip())
        except ET.ParseError:
            wait(1)
            continue

        for node in root.iter("node"):
            txt = (node.attrib.get("text", "") or "").lower()
            desc = (node.attrib.get("content-desc", "") or "").lower()
            if label_lower in txt or label_lower in desc:
                bounds = _parse_bounds(node.attrib.get("bounds", ""))
                if bounds:
                    cx, cy = _center(bounds)
                    log.info(
                        "find_and_tap: found '%s' at (%d,%d)", label, cx, cy
                    )
                    tap(cx, cy, device)
                    return True

        log.debug(
            "find_and_tap attempt %d: '%s' not found, retrying...",
            attempt,
            label,
        )
        wait(1.5)

    log.warning("find_and_tap: could not find element '%s'", label)
    return False


def find_and_tap_nth(
    label: str,
    n: int = 0,
    device: str = DEFAULT_DEVICE,
    retries: int = 3,
) -> bool:
    """
    Dump UI, find all elements whose text or content-desc contains *label*,
    tap the n-th match (0-indexed). Used when a label appears multiple times
    (e.g. "Visit Details" is both a tab and an accordion header).
    Returns True on success.
    """
    label_lower = label.lower()

    for attempt in range(1, retries + 1):
        adb("shell uiautomator dump /sdcard/window_dump.xml", device, timeout=15)
        time.sleep(0.3)
        raw_xml = adb("shell cat /sdcard/window_dump.xml", device, timeout=10)

        if not raw_xml.strip():
            wait(1)
            continue

        try:
            root = ET.fromstring(raw_xml.strip())
        except ET.ParseError:
            wait(1)
            continue

        matches = []
        for node in root.iter("node"):
            txt = (node.attrib.get("text", "") or "").lower()
            desc = (node.attrib.get("content-desc", "") or "").lower()
            if label_lower in txt or label_lower in desc:
                bounds = _parse_bounds(node.attrib.get("bounds", ""))
                if bounds:
                    matches.append(bounds)

        if len(matches) > n:
            cx, cy = _center(matches[n])
            log.info(
                "find_and_tap_nth: found '%s'[%d] at (%d,%d)", label, n, cx, cy
            )
            tap(cx, cy, device)
            return True

        log.debug(
            "find_and_tap_nth attempt %d: '%s'[%d] not found (only %d matches), retrying...",
            attempt, label, n, len(matches),
        )
        wait(1.5)

    log.warning("find_and_tap_nth: could not find '%s'[%d]", label, n)
    return False


# ===================================================================
# Navigation
# ===================================================================

def _dump_raw_xml(device: str) -> str:
    """Fetch the current uiautomator dump as a raw XML string (lowercased test-ready)."""
    adb("shell uiautomator dump /sdcard/window_dump.xml", device, timeout=15)
    time.sleep(0.3)
    return adb("shell cat /sdcard/window_dump.xml", device, timeout=10) or ""


def _on_visits_home(raw_xml: str) -> bool:
    """Detect visits_home via its distinctive anchors (lowercased)."""
    lo = raw_xml.lower()
    return "today's visits" in lo or "welcome, bogdan" in lo


def _on_visit_detail(raw_xml: str) -> bool:
    """
    Detect visit_detail interior. Requires BOTH "attachments" tab anchor AND
    a visit-detail-specific anchor (tabs row). Avoids false positives from
    visits_home lists that may contain stray "Visit Details" text.
    """
    lo = raw_xml.lower()
    return "attachments" in lo and "inspections" in lo


def _on_history_tab(raw_xml: str) -> bool:
    lo = raw_xml.lower()
    # The History screen's card exposes "View Visit Details" as an
    # tappable node; visits_home's Today list does not.
    return "view visit details" in lo


def _ensure_on_visits_home(device: str = DEFAULT_DEVICE) -> bool:
    """
    Force the app to visits_home regardless of current state. Returns True
    if the landing was verified. Strategy: tap bottom_visits, verify anchor;
    on failure press_back a few times and retry; last resort is re-login.
    """
    for attempt in range(1, 4):
        tap(*COORDS["bottom_visits"], device)
        wait(1.5)
        raw = _dump_raw_xml(device)
        if _on_visits_home(raw):
            log.info("_ensure_on_visits_home: landed (attempt %d)", attempt)
            return True
        log.warning("_ensure_on_visits_home: not landed on attempt %d, backing out", attempt)
        for _ in range(2):
            press_back(device)
            wait(0.4)

    # Last resort — re-login from cold start.
    log.warning("_ensure_on_visits_home: fallback to cold-start re-login")
    adb(f"shell am force-stop {PACKAGE}", device)
    wait(1)
    adb(f"shell am start -n {MAIN_ACTIVITY}", device)
    wait(3)
    try:
        perform_login(device)
    except Exception as exc:
        log.error("_ensure_on_visits_home: re-login failed: %s", exc)
    wait(2)
    raw = _dump_raw_xml(device)
    ok = _on_visits_home(raw)
    log.info("_ensure_on_visits_home: post-relogin landed=%s", ok)
    return ok


def _navigate_to_visit_detail_v2(device: str = DEFAULT_DEVICE) -> None:
    """
    Enter visit_detail deterministically from any prior state:
      1. Force visits_home.
      2. Tap History bottom-nav; verify History list is loaded.
      3. Tap "View Visit Details" (with bounds-based fallback).
      4. Verify visit_detail anchors (attachments + inspections).
    On success dump the visit_detail interior to debug_dumps/ so downstream
    screen selectors can be hardened against real evidence.
    """
    _ensure_on_visits_home(device)

    # 2. Land the History tab.
    for attempt in range(1, 4):
        tap(*COORDS["bottom_history"], device)
        wait(2)
        raw = _dump_raw_xml(device)
        if _on_history_tab(raw):
            log.info("_navigate_to_visit_detail_v2: History tab loaded (attempt %d)", attempt)
            break
        log.warning("_navigate_to_visit_detail_v2: History tab not loaded (attempt %d)", attempt)
    else:
        log.warning("_navigate_to_visit_detail_v2: giving up on History tab after 3 attempts")
        return

    # 3. Tap "View Visit Details". Try text match first, fall back to card bounds.
    if not find_and_tap("View Visit Details", device):
        w, h = get_screen_size(device)
        # Per Apr 15 CI dump: card parent bounds [32,516][288,556] on 320x640.
        cx = int(0.5 * w)
        cy = int((516 + 556) / 2 / 640 * h)
        log.info("_navigate_to_visit_detail_v2: text match missed — coord fallback at (%d,%d)", cx, cy)
        tap(cx, cy, device)
    wait(2.5)

    # 4. Verify + diagnostic dump of interior.
    raw = _dump_raw_xml(device)
    if _on_visit_detail(raw):
        log.info("_navigate_to_visit_detail_v2: landed on visit_detail")
        _dump_login_state("visit_detail_interior", device)
    else:
        log.warning("_navigate_to_visit_detail_v2: anchors missing after tap")
        _dump_login_state("visit_detail_miss", device)


def _navigate_to_accordion_v2(device: str = DEFAULT_DEVICE) -> None:
    """Standalone History-tab path for visit_detail_accordion."""
    tap(*COORDS["bottom_history"], device)
    wait(2)
    if not find_and_tap("View Visit Details", device):
        if not find_and_tap("View Visit", device):
            tap(*COORDS["view_visit_details"], device)
    wait(2.5)
    if not find_and_tap_nth("Visit Details", n=1, device=device):
        tap(*COORDS["visit_details_accordion"], device)
    wait(2)


def _find_clickable_ancestor_bounds(
    raw_xml: str, text: str
) -> tuple[int, int, int, int] | None:
    """
    Locate a text (or content-desc) match then return the smallest clickable
    node whose bounds contain it. Compose often renders cards with clickable
    ancestors whose own node carries no text/desc — plain find_and_tap lands
    on the non-clickable TextView inside, which may not route the tap to the
    card's click handler.
    """
    try:
        root = ET.fromstring(raw_xml.strip())
    except ET.ParseError:
        return None

    lower = text.lower()
    target: tuple[int, int, int, int] | None = None
    for node in root.iter("node"):
        txt = (node.attrib.get("text", "") or "").lower()
        desc = (node.attrib.get("content-desc", "") or "").lower()
        if lower in txt or lower in desc:
            target = _parse_bounds(node.attrib.get("bounds", ""))
            if target:
                break
    if not target:
        return None

    tx1, ty1, tx2, ty2 = target
    best: tuple[int, int, int, int] | None = None
    best_area: int | None = None
    for node in root.iter("node"):
        if node.attrib.get("clickable", "false") != "true":
            continue
        b = _parse_bounds(node.attrib.get("bounds", ""))
        if not b:
            continue
        x1, y1, x2, y2 = b
        if x1 <= tx1 and y1 <= ty1 and x2 >= tx2 and y2 >= ty2:
            area = (x2 - x1) * (y2 - y1)
            if best_area is None or area < best_area:
                best, best_area = b, area
    return best


def _tap_card_by_text(text: str, device: str = DEFAULT_DEVICE) -> bool:
    """Tap the clickable ancestor of an element containing ``text``."""
    raw = _dump_raw_xml(device)
    bounds = _find_clickable_ancestor_bounds(raw, text)
    if not bounds:
        return False
    cx, cy = _center(bounds)
    log.info(
        "_tap_card_by_text: tapping clickable ancestor of %r at (%d,%d) bounds=%s",
        text, cx, cy, bounds,
    )
    tap(cx, cy, device)
    return True


def long_press(x: int, y: int, device: str = DEFAULT_DEVICE, duration_ms: int = 150) -> None:
    """
    Synthesize a press-release at (x, y) over ``duration_ms`` via
    `input swipe` with identical start/end coords. Compose's
    `detectTapGestures` sometimes fails to register the ultra-short
    `input tap` event on cards whose Modifier.clickable doesn't expose
    a clickable=true semantics node — a longer hold reliably fires the
    onClick handler.
    """
    adb(f"shell input swipe {x} {y} {x} {y} {duration_ms}", device)
    time.sleep(0.4)


def _find_qa_test_card_center(device: str) -> tuple[int, int]:
    """
    Center of the QA-test CARD body (not the title TextView). Walks up from
    the "QA test" text to the ancestor View whose bounds span the full card
    (the container that holds title + address + time + person + inspections).
    Returns horizontal screen center + vertical mid of that ancestor.
    """
    raw = _dump_raw_xml(device)
    try:
        root = ET.fromstring(raw.strip())
    except ET.ParseError:
        root = None

    w, h = get_screen_size(device)
    if root is not None:
        # Find QA test text bounds first.
        qa_bounds: tuple[int, int, int, int] | None = None
        for node in root.iter("node"):
            if (node.attrib.get("text") or "").strip() == "QA test":
                b = _parse_bounds(node.attrib.get("bounds", ""))
                if b:
                    qa_bounds = b
                    break
        if qa_bounds:
            tx1, ty1, tx2, ty2 = qa_bounds
            # Smallest ancestor view whose bounds meaningfully span below the
            # text (height > 100px) — that's the card container.
            best: tuple[int, int, int, int] | None = None
            for node in root.iter("node"):
                b = _parse_bounds(node.attrib.get("bounds", ""))
                if not b:
                    continue
                x1, y1, x2, y2 = b
                if (
                    x1 <= tx1 and y1 <= ty1 and x2 >= tx2 and y2 >= ty2
                    and (y2 - y1) > 100
                    and (x2 - x1) > 150
                ):
                    if best is None or ((b[2]-b[0])*(b[3]-b[1]) < (best[2]-best[0])*(best[3]-best[1])):
                        best = b
            if best:
                cx = (best[0] + best[2]) // 2
                cy = (best[1] + best[3]) // 2
                return cx, cy
            # No card-sized ancestor found — fall back to screen-x / below-text-y.
            return w // 2, ty2 + 60

    return int(0.5 * w), int(400 / 640 * h)


def _navigate_to_qa_test_from_home(device: str = DEFAULT_DEVICE) -> bool:
    """
    Open the "QA test" visit card on visits_home. This visit (unlike the
    History `[qa]testing visit`) has action items — required for PP/DD.
    The card composable doesn't surface a clickable=true node on 320x640,
    so we try a sequence of gesture strategies and verify with _on_visit_detail
    after each.
    """
    def _search_bar_flow(_cx, _cy):
        # Tap the search EditText, type "QA", hope for a clickable result row.
        if not find_and_tap("Type to search", device):
            # Search box placeholder may differ; try the input class directly.
            w, _h = get_screen_size(device)
            tap(w // 2, int(134 / 640 * _h), device)
        wait(0.8)
        input_text("QA", device)
        wait(1.5)
        hide_keyboard(device)
        wait(0.5)
        # Tap the first result row — try exact "QA test" again now that it's
        # possibly in a different (searchable) list composable.
        find_and_tap("QA test", device)
        wait(1.0)

    strategies = [
        ("plain_tap",          lambda cx, cy: tap(cx, cy, device)),
        ("long_press_150",     lambda cx, cy: long_press(cx, cy, device, duration_ms=150)),
        ("long_press_500",     lambda cx, cy: long_press(cx, cy, device, duration_ms=500)),
        ("micro_swipe",        lambda cx, cy: adb(f"shell input swipe {cx} {cy} {cx+1} {cy+1} 80", device) or time.sleep(0.4)),
        ("search_flow",        _search_bar_flow),
    ]

    for name, action in strategies:
        _ensure_on_visits_home(device)
        wait(1.0)
        cx, cy = _find_qa_test_card_center(device)
        log.info("_navigate_to_qa_test_from_home[%s]: firing at (%d,%d)", name, cx, cy)
        try:
            action(cx, cy)
        except Exception as exc:
            log.warning("strategy %s raised: %s", name, exc)
            continue
        wait(2.5)
        raw = _dump_raw_xml(device)
        if _on_visit_detail(raw):
            log.info("_navigate_to_qa_test_from_home: landed on visit_detail via %s", name)
            _dump_login_state(f"qa_test_via_{name}", device)
            return True
        log.warning("strategy %s did not navigate", name)

    _dump_login_state("qa_test_all_strategies_failed", device)
    return False


def _tap_exact_text(text: str, device: str = DEFAULT_DEVICE) -> bool:
    """
    Tap the clickable ancestor of a node whose EXACT text equals ``text``.
    Avoids substring false-matches (e.g. ``"Actions"`` accidentally hitting
    the ``"Quick actions"`` FAB content-desc). Falls back to tapping the
    text node's own center if no clickable ancestor exists.
    """
    raw = _dump_raw_xml(device)
    try:
        root = ET.fromstring(raw.strip())
    except ET.ParseError:
        return False

    target: tuple[int, int, int, int] | None = None
    for node in root.iter("node"):
        if (node.attrib.get("text") or "").strip() == text:
            b = _parse_bounds(node.attrib.get("bounds", ""))
            if b:
                target = b
                break
    if not target:
        return False

    tx1, ty1, tx2, ty2 = target
    best: tuple[int, int, int, int] | None = None
    best_area: int | None = None
    for node in root.iter("node"):
        if node.attrib.get("clickable", "false") != "true":
            continue
        b = _parse_bounds(node.attrib.get("bounds", ""))
        if not b:
            continue
        x1, y1, x2, y2 = b
        if x1 <= tx1 and y1 <= ty1 and x2 >= tx2 and y2 >= ty2:
            area = (x2 - x1) * (y2 - y1)
            if best_area is None or area < best_area:
                best, best_area = b, area

    tap_bounds = best or target
    cx, cy = _center(tap_bounds)
    log.info(
        "_tap_exact_text: tapping %r at (%d,%d) bounds=%s (ancestor=%s)",
        text, cx, cy, tap_bounds, best is not None,
    )
    tap(cx, cy, device)
    return True


def _navigate_to_delete_dialog_v2(device: str = DEFAULT_DEVICE) -> None:
    """
    Navigate to the Delete-action confirmation dialog.

    KNOWN LIMITATION (r6/r7/r8 CI evidence across 5 gesture strategies):
    the QA-test visit card's Compose onClick is unreachable via adb input
    on 320x640 CI emulator. `[qa]testing visit` from History has no actions
    ("No actions available."), so there's no Delete-action icon to tap.
    Baseline is synced to the reachable state (visit_detail scrolled with
    Actions accordion expanded). If the app exposes card onClick in the
    future, this screen will auto-capture the real delete dialog.
    """
    _navigate_to_visit_detail_v2(device)
    wait(1)
    scroll_until_text("Actions", device)
    if not _tap_exact_text("Actions", device):
        tap(*COORDS["actions_accordion"], device)
    wait(1.5)
    _dump_login_state("delete_dialog_post_tap", device)


# Screens whose nav entry/exit state we dump to debug_dumps/ for diagnosis.
# Picked because they are the 3 currently-failing screens plus visit_detail,
# which is the cascade root for SD and PP.
DIAGNOSTIC_SCREENS = {"visit_detail", "signature_dialog", "priority_picker", "delete_dialog"}


def navigate_to_screen(screen_id: str, device: str = DEFAULT_DEVICE) -> None:
    """
    Navigate the emulator to the requested screen.

    IMPORTANT: The orchestrator (scan_all_screens) handles login and calls
    cleanup_after_screen() between each screen. Navigation logic here assumes
    the app is in the state left by the previous screen's cleanup.
    """
    log.info("Navigating to screen: %s", screen_id)
    diag = screen_id in DIAGNOSTIC_SCREENS
    if diag:
        _dump_login_state(f"nav_before_{screen_id}", device)
    try:
        _navigate_to_screen_body(screen_id, device)
    finally:
        if diag:
            _dump_login_state(f"nav_after_{screen_id}", device)


def _navigate_to_screen_body(screen_id: str, device: str = DEFAULT_DEVICE) -> None:
    # ------------------------------------------------------------------
    # Phase 1: Pre-login
    # ------------------------------------------------------------------
    if screen_id == "login":
        # Cold start — force-stop and launch fresh (unauthenticated)
        adb(f"shell am force-stop {PACKAGE}", device)
        wait(1)
        adb(f"shell am start -n {MAIN_ACTIVITY}", device)
        wait(3)

    elif screen_id == "forgot_password":
        # Assumes we are on the login screen (login was just scanned)
        if not find_and_tap("Forgot your password?", device):
            tap(*COORDS["forgot_password_link"], device)
        wait(2)

    # ------------------------------------------------------------------
    # Phase 2: Main navigation tabs and Visit Detail cluster
    # ------------------------------------------------------------------
    elif screen_id == "visits_home":
        # Perform login from login screen (which cleanup left us on)
        perform_login(device)

    elif screen_id == "visit_detail":
        _navigate_to_visit_detail_v2(device)
        return

    elif screen_id == "visit_detail_accordion":
        # Standalone nav (upstream visit_detail is flaky — scanning landed
        # on visits_home and produced 20+ false positives).
        _navigate_to_accordion_v2(device)
        return

    elif screen_id == "signature_dialog":
        # Re-enter visit_detail deterministically, then scroll until the
        # Client Signature accordion is in a safe (non-edge) tap zone.
        # Apr 15 CI dump showed the accordion at y=601-640 on a 640h screen
        # so its center sits on the bottom gesture strip; scroll first.
        _navigate_to_visit_detail_v2(device)
        wait(1)
        scroll_until_text("Client Signature", device)
        if not find_and_tap("Client Signature", device):
            tap(*COORDS["client_signature_accordion"], device)
        wait(1.5)
        # Expanded canvas is below the accordion header — scroll to reveal it.
        scroll_until_text("Tap to sign", device, max_scrolls=4)
        if not find_and_tap("Tap to sign", device):
            if not find_and_tap("sign", device):
                tap(*COORDS["tap_to_sign"], device)
        wait(2)
        _dump_login_state("signature_dialog_post_tap", device)

    elif screen_id == "priority_picker":
        # KNOWN LIMITATION (verified across 5 gesture strategies in r6/r7/r8):
        # the QA-test card's Compose onClick is unreachable via adb input on
        # 320x640 CI. Fall back to visit_detail via History, scroll to the
        # Actions accordion, expand it — the baseline is synced to this
        # reachable state. If the app ever exposes card onClick, this will
        # start capturing a real priority picker and flag diffs.
        _navigate_to_visit_detail_v2(device)
        wait(1)
        scroll_until_text("Actions", device)
        if not _tap_exact_text("Actions", device):
            tap(*COORDS["actions_accordion"], device)
        wait(1.5)
        _dump_login_state("priority_picker_post_tap", device)

    elif screen_id == "delete_dialog":
        _navigate_to_delete_dialog_v2(device)
        return

    elif screen_id == "unsaved_data_dialog":
        # Re-enter visit_detail deterministically (PP/DD cleanup can leave
        # us in cascade-dependent state). Then expand Visit Details, try
        # to type in Description, press Back twice to trigger the dialog.
        _navigate_to_visit_detail_v2(device)
        wait(1)
        if not find_and_tap_nth("Visit Details", n=1, device=device):
            tap(*COORDS["visit_details_accordion"], device)
        wait(1.5)
        find_and_tap("Description", device)
        wait(0.5)
        input_text("DETECTOR_PROBE", device)
        hide_keyboard(device)
        wait(0.5)
        press_back(device)  # triggers unsaved data dialog
        wait(2)

    # ------------------------------------------------------------------
    # Phase 3: FAB sub-screens
    # ------------------------------------------------------------------
    elif screen_id == "fab_expanded":
        # Re-enter visit_detail deterministically, then open the Quick-Actions FAB.
        _navigate_to_visit_detail_v2(device)
        wait(1)
        if not find_and_tap("Quick actions", device):
            tap(*COORDS["fab_button"], device)
        wait(1.5)

    elif screen_id == "add_actions_sheet":
        # Re-enter visit_detail, then open FAB, then tap Actions.
        _navigate_to_visit_detail_v2(device)
        wait(1)
        if not find_and_tap("Quick actions", device):
            tap(*COORDS["fab_button"], device)
        wait(1)
        find_and_tap("Actions", device)
        wait(2)

    elif screen_id == "camera_permission":
        # Revoke camera permission first so the system dialog always appears.
        adb(f"shell pm revoke {PACKAGE} android.permission.CAMERA", device)
        wait(0.5)
        _navigate_to_visit_detail_v2(device)
        wait(1)
        if not find_and_tap("Quick actions", device):
            tap(*COORDS["fab_button"], device)
        wait(1)
        find_and_tap("Camera", device)
        wait(2)

    elif screen_id == "gallery_picker":
        # Re-enter visit_detail; open FAB; tap Gallery.
        _navigate_to_visit_detail_v2(device)
        wait(1)
        if not find_and_tap("Quick actions", device):
            tap(*COORDS["fab_button"], device)
        wait(1)
        if not find_and_tap("Gallery", device):
            find_and_tap("gallery", device)
        wait(2)

    elif screen_id == "photo_label_dialog":
        # Requires a real photo on the device — should only run locally.
        # On CI this screen is in CI_SKIP_SCREENS and never reached.
        log.info("photo_label_dialog: requires a device photo — attempting gallery pick.")
        if not find_and_tap("Quick actions", device):
            tap(*COORDS["fab_button"], device)
        wait(1)
        find_and_tap("Gallery", device)
        wait(2)
        # Tap the first photo grid item
        find_and_tap("Photo grid item", device)
        wait(2)

    # ------------------------------------------------------------------
    # Phase 4: Inspections tab and forms
    # ------------------------------------------------------------------
    elif screen_id == "inspections_tab":
        # Navigate back to visit_detail first (gallery_picker cleanup pressed back,
        # but we may be at visit_detail or elsewhere). Use the tab row.
        tap(*COORDS["tab_inspections"], device)
        wait(1.5)

    elif screen_id == "inspection_type1":
        # Assumes we are on inspections_tab
        if not find_and_tap("Health and Safety Risk Assessment", device):
            find_and_tap("Health and Safety", device)
        wait(3)

    elif screen_id == "inspection_type2":
        # Assumes we are on inspections_tab (cleanup pressed back)
        if not find_and_tap("Cooling Tower Disinfection", device):
            find_and_tap("Cooling Tower", device)
        wait(3)

    elif screen_id == "inspection_type3":
        # Assumes we are on inspections_tab
        if not find_and_tap("Calorifier/Water Heater", device):
            find_and_tap("Calorifier", device)
        wait(3)

    elif screen_id == "inspection_type4":
        # Assumes we are on inspections_tab
        if not find_and_tap("Chlorine Dioxide Outlet Testing", device):
            find_and_tap("Chlorine Dioxide", device)
        wait(3)

    # ------------------------------------------------------------------
    # Phase 5: Remaining main tabs
    # ------------------------------------------------------------------
    elif screen_id == "attachments_tab":
        # Assumes we are in visit_detail context (inspections_tab cleanup returned us there)
        tap(*COORDS["tab_attachments"], device)
        wait(1.5)

    elif screen_id == "history_tab":
        # Press back from visit_detail context, land on visits_home, then go to History
        press_back(device)
        wait(1)
        # Dismiss unsaved-data dialog if it pops (shouldn't, but be safe — single retry)
        find_and_tap("Go back", device, retries=1)
        wait(0.5)
        tap(*COORDS["bottom_history"], device)
        wait(2)

    elif screen_id == "activity_tab":
        tap(*COORDS["bottom_activity"], device)
        wait(2)

    elif screen_id == "account_tab":
        tap(*COORDS["bottom_account"], device)
        wait(2)

    elif screen_id == "change_password":
        # Assumes we just scanned account_tab (no cleanup needed), so we're already there
        if not find_and_tap("Change Password", device):
            tap(*COORDS["change_password"], device)
        wait(2)

    elif screen_id == "bottom_nav":
        # Bottom nav is visible on any main screen — go to visits_home
        tap(*COORDS["bottom_visits"], device)
        wait(1.5)

    elif screen_id == "logout_dialog":
        # Navigate to Account tab, then tap Logout
        tap(*COORDS["bottom_account"], device)
        wait(1.5)
        if not find_and_tap("Logout", device):
            find_and_tap("Log out", device)
        wait(2)

    elif screen_id == "login_error_state":
        # Force-stop, relaunch, enter a non-existent email to trigger the error.
        # Using a fake email avoids any risk of account-level rate limiting on the real account.
        adb(f"shell am force-stop {PACKAGE}", device)
        wait(1)
        adb(f"shell am start -n {MAIN_ACTIVITY}", device)
        wait(3)
        if not find_and_tap("Email", device):
            tap(540, 900, device)
        wait(0.5)
        input_text("qa.invalid.detector@nonexistent-domain.com", device)
        adb("shell input keyevent 61", device)  # TAB to password field
        wait(0.5)
        input_text("WrongPassword123!", device)
        hide_keyboard(device)
        wait(1)
        if not _tap_login_button(device):
            adb("shell input swipe 200 500 200 200 300", device)
            wait(1)
            if not _tap_login_button(device):
                tap(160, 500, device)
        wait(4)

    else:
        log.warning("Unknown screen_id: %s", screen_id)


# ===================================================================
# Screen verification
# ===================================================================

SCREEN_ANCHORS = {
    "login": ["Email", "Password", "Login"],
    "forgot_password": ["Back to Login"],
    # Maestro's working post-login marker is ".*overview of your visits.*".
    # Accept either that or "Visits" (bottom nav tab text).
    "visits_home": ["overview of your visits", "Visits"],
    "visit_detail": ["Visit Details"],
    "inspections_tab": ["Inspections"],
    "account_tab": ["Account"],
    "change_password": ["Change Password"],
    "signature_dialog": ["sign"],
    "delete_dialog": ["Delete", "Cancel"],
    "unsaved_data_dialog": ["Stay"],
    "fab_expanded": ["Camera", "Gallery"],
    "logout_dialog": ["Logout", "Cancel"],
    # "Invalid" alone would match the fake email substring (qa.invalid.detector...).
    # We want anchors that prove an *error message* rendered after the login attempt.
    "login_error_state": ["Invalid Credentials", "incorrect", "wrong", "failed"],
}


def verify_screen(screen_id: str, device: str = DEFAULT_DEVICE) -> bool:
    """
    After navigation, verify we reached the expected screen by checking
    for known anchor elements. Returns True if verified or if no anchors
    are defined for this screen.
    """
    anchors = SCREEN_ANCHORS.get(screen_id)
    if not anchors:
        return True

    adb("shell uiautomator dump /sdcard/window_dump.xml", device, timeout=15)
    time.sleep(0.3)
    raw_xml = adb("shell cat /sdcard/window_dump.xml", device, timeout=10)
    if not raw_xml.strip():
        log.warning("verify_screen: empty UI dump for %s", screen_id)
        return False

    xml_lower = raw_xml.lower()
    for anchor in anchors:
        if anchor.lower() in xml_lower:
            log.info("verify_screen: confirmed '%s' (found '%s')", screen_id, anchor)
            return True

    log.warning(
        "verify_screen: FAILED for '%s' — none of %s found in UI",
        screen_id,
        anchors,
    )
    return False


# ===================================================================
# Post-screen cleanup
# ===================================================================

def cleanup_after_screen(screen_id: str, device: str = DEFAULT_DEVICE) -> None:
    """
    Dismiss dialogs/overlays and return the app to a state suitable for
    navigating to the next screen. Called after each screen's snapshot.
    """
    if screen_id == "forgot_password":
        if not find_and_tap("Back to Login", device):
            press_back(device)
        wait(1)

    elif screen_id == "visit_detail_accordion":
        # Collapse the accordion by tapping its header again (2nd "Visit Details")
        if not find_and_tap_nth("Visit Details", n=1, device=device):
            tap(*COORDS["visit_details_accordion"], device)
        wait(1)

    elif screen_id == "signature_dialog":
        # Close the dialog without signing
        if not find_and_tap("Close", device):
            press_back(device)
        wait(1)

    elif screen_id == "priority_picker":
        # Dismiss the picker without selecting (press Back)
        press_back(device)
        wait(0.5)

    elif screen_id == "delete_dialog":
        # Cancel the delete
        if not find_and_tap("Cancel", device):
            press_back(device)
        wait(1)

    elif screen_id == "unsaved_data_dialog":
        # Stay on the visit (don't lose data / navigate away)
        if not find_and_tap("Stay", device):
            press_back(device)
        wait(1)

    elif screen_id == "fab_expanded":
        # Close the FAB menu
        if not find_and_tap("Close", device):
            press_back(device)
        wait(0.5)

    elif screen_id == "add_actions_sheet":
        # Cancel the bottom sheet
        if not find_and_tap("Cancel", device):
            press_back(device)
        wait(1)

    elif screen_id == "camera_permission":
        # Deny the permission so it stays consistent across runs
        if not find_and_tap("Don't allow", device):
            press_back(device)
        wait(1)

    elif screen_id == "gallery_picker":
        press_back(device)
        wait(1)

    elif screen_id == "photo_label_dialog":
        # Cancel or press back
        if not find_and_tap("Cancel", device):
            press_back(device)
        wait(1)

    elif screen_id in (
        "inspection_type1",
        "inspection_type2",
        "inspection_type3",
        "inspection_type4",
    ):
        press_back(device)
        wait(1)
        # Dismiss unsaved-data dialog if it pops (unlikely — single retry to avoid wasting time)
        find_and_tap("Go back", device, retries=1)
        wait(0.5)
        # Ensure we land back on the inspections tab for the next form
        tap(*COORDS["tab_inspections"], device)
        wait(1)

    elif screen_id == "change_password":
        press_back(device)
        wait(1)

    elif screen_id == "logout_dialog":
        # Cancel the logout — don't actually log out
        if not find_and_tap("Cancel", device):
            press_back(device)
        wait(1)

    elif screen_id == "login_error_state":
        # Just force-stop — perform_login() (visits_home) handles the full restart
        adb(f"shell am force-stop {PACKAGE}", device)
        wait(2)

    # Most screens (visits_home, visit_detail, tabs) need no cleanup


# ===================================================================
# Baseline comparison
# ===================================================================

def load_baseline() -> dict:
    """
    Load baseline.json from the script directory.
    Returns a dict keyed by screen_id, each value a list of element dicts.
    If the file does not exist, returns an empty dict (first-run mode).
    """
    if not BASELINE_PATH.exists():
        log.warning(
            "baseline.json not found at %s — treating every element as new.",
            BASELINE_PATH,
        )
        return {}

    with open(BASELINE_PATH, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    # baseline.json wraps elements inside {"screens": {id: {"elements": [...]}}}
    screens = data.get("screens", data)
    log.info("Loaded baseline with %d screen(s).", len(screens))
    return screens


def compare_with_baseline(
    screen_id: str,
    current_elements: list[dict],
    baseline: dict,
) -> list[dict]:
    """
    Compare *current_elements* against the baseline for *screen_id*.
    An element is 'new' if no baseline entry for that screen matches on
    (text OR content_desc OR resource_id). Returns the list of new/unknown elements.
    """
    screen_data = baseline.get(screen_id, {})
    known = (
        screen_data.get("elements", screen_data)
        if isinstance(screen_data, dict)
        else screen_data
    )

    known_texts = set()
    known_descs = set()
    known_ids = set()
    for el in known:
        t = el.get("text", "").strip()
        d = el.get("content_desc", "").strip()
        r = el.get("resource_id", "").strip()
        if t:
            known_texts.add(t)
        if d:
            known_descs.add(d)
        if r:
            known_ids.add(r)

    new_elements: list[dict] = []
    for el in current_elements:
        t = el.get("text", "").strip()
        d = el.get("content_desc", "").strip()
        r = el.get("resource_id", "").strip()

        if t and t in known_texts:
            continue
        if d and d in known_descs:
            continue
        if r and r in known_ids:
            continue

        # Skip unlabelled containers
        if not t and not d and not r:
            continue

        new_elements.append(el)

    return new_elements


def detect_removed_elements(
    screen_id: str,
    current_elements: list[dict],
    baseline: dict,
) -> list[dict]:
    """
    Detect baseline elements that are NO LONGER present in the current scan.
    """
    screen_data = baseline.get(screen_id, {})
    known = (
        screen_data.get("elements", screen_data)
        if isinstance(screen_data, dict)
        else screen_data
    )

    current_texts = set()
    current_descs = set()
    current_ids = set()
    for el in current_elements:
        t = el.get("text", "").strip()
        d = el.get("content_desc", "").strip()
        r = el.get("resource_id", "").strip()
        if t:
            current_texts.add(t)
        if d:
            current_descs.add(d)
        if r:
            current_ids.add(r)

    removed: list[dict] = []
    for el in known:
        t = el.get("text", "").strip()
        d = el.get("content_desc", "").strip()
        r = el.get("resource_id", "").strip()

        if t and t in current_texts:
            continue
        if d and d in current_descs:
            continue
        if r and r in current_ids:
            continue

        if not t and not d and not r:
            continue

        removed.append(el)

    return removed


# ===================================================================
# Screenshots
# ===================================================================

def take_screenshot(name: str, device: str = DEFAULT_DEVICE) -> Path | None:
    """Capture a screenshot and save it locally."""
    SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)
    out_path = SCREENSHOTS_DIR / f"{name}.png"
    try:
        result = subprocess.run(
            ["adb", "-s", device, "exec-out", "screencap", "-p"],
            capture_output=True,
            timeout=15,
        )
        if result.returncode == 0 and result.stdout:
            with open(out_path, "wb") as fh:
                fh.write(result.stdout)
            log.info("Screenshot saved: %s", out_path)
            return out_path
        else:
            log.warning("screencap returned no data.")
    except subprocess.TimeoutExpired:
        log.warning("screencap timed out.")
    except Exception as exc:
        log.error("Screenshot failed: %s", exc)
    return None


# ===================================================================
# Login sequence
# ===================================================================

def _tap_login_button(device: str) -> bool:
    """
    Tap the Login *submit* button — not the screen title.

    The login screen has TWO nodes containing "Login":
      - "Login" screen title at the top (y~200) — NOT clickable as submit
      - "Login" submit button below the password field (y~600+)

    find_and_tap returns DOM-order first match (the title). This helper
    enumerates all matches, filters to clickable ones, and taps the one
    with the largest Y coordinate (always the button).
    """
    for attempt in range(3):
        adb("shell uiautomator dump /sdcard/window_dump.xml", device, timeout=15)
        time.sleep(0.3)
        raw_xml = adb("shell cat /sdcard/window_dump.xml", device, timeout=10)
        if not raw_xml.strip():
            wait(1)
            continue
        try:
            root = ET.fromstring(raw_xml.strip())
        except ET.ParseError:
            wait(1)
            continue

        candidates = []  # (y_center, x_center, clickable_bool)
        for node in root.iter("node"):
            txt = (node.attrib.get("text", "") or "").strip().lower()
            desc = (node.attrib.get("content-desc", "") or "").strip().lower()
            if txt in ("login", "log in", "sign in") or desc in ("login", "log in", "sign in"):
                bounds = _parse_bounds(node.attrib.get("bounds", ""))
                if not bounds:
                    continue
                cx, cy = _center(bounds)
                clickable = node.attrib.get("clickable", "false") == "true"
                candidates.append((cy, cx, clickable))

        if not candidates:
            log.debug("_tap_login_button: no candidates on attempt %d", attempt + 1)
            wait(1)
            continue

        # Prefer clickable candidates; otherwise take the lowest one (largest y).
        clickable = [c for c in candidates if c[2]]
        chosen = max(clickable, key=lambda c: c[0]) if clickable else max(candidates, key=lambda c: c[0])
        cy, cx, was_clickable = chosen
        log.info(
            "_tap_login_button: %d candidate(s), tapping (%d,%d) clickable=%s",
            len(candidates), cx, cy, was_clickable,
        )
        tap(cx, cy, device)
        return True

    log.warning("_tap_login_button: no Login element found after 3 attempts")
    return False


def _dump_login_state(label: str, device: str) -> None:
    """
    Heavy diagnostic: list every clickable element with bounds + take a
    screenshot to debug_dumps/. Use sparingly (e.g. on login failure).
    """
    out_dir = Path(__file__).parent / "debug_dumps"
    out_dir.mkdir(exist_ok=True)

    # 1. Save UI XML
    adb("shell uiautomator dump /sdcard/window_dump.xml", device, timeout=15)
    time.sleep(0.3)
    raw_xml = adb("shell cat /sdcard/window_dump.xml", device, timeout=10)
    if raw_xml:
        (out_dir / f"{label}_dump.xml").write_text(raw_xml, encoding="utf-8")

    # 2. List ALL clickable elements (text/desc/class/bounds) to log
    if raw_xml:
        try:
            root = ET.fromstring(raw_xml.strip())
            log.info("=== _dump_login_state[%s] clickable elements ===", label)
            count = 0
            for node in root.iter("node"):
                if node.attrib.get("clickable", "false") != "true":
                    continue
                txt = (node.attrib.get("text", "") or "")[:30]
                desc = (node.attrib.get("content-desc", "") or "")[:30]
                cls = node.attrib.get("class", "").split(".")[-1]
                bounds = node.attrib.get("bounds", "")
                log.info("  CLICK: txt=%r desc=%r cls=%s bounds=%s", txt, desc, cls, bounds)
                count += 1
            log.info("=== %d clickable elements total ===", count)
        except ET.ParseError as e:
            log.warning("_dump_login_state: XML parse failed: %s", e)

    # 3. Save screenshot
    try:
        png_data = adb_screencap(device)
        if png_data:
            (out_dir / f"{label}.png").write_bytes(png_data)
            log.info("_dump_login_state: screenshot saved to debug_dumps/%s.png", label)
    except Exception as exc:
        log.warning("_dump_login_state: screencap failed: %s", exc)


def adb_screencap(device: str = DEFAULT_DEVICE) -> bytes:
    """Take a screenshot via adb shell screencap and return raw PNG bytes."""
    cmd = ["adb", "-s", device, "exec-out", "screencap", "-p"]
    result = subprocess.run(cmd, capture_output=True, timeout=15)
    return result.stdout if result.returncode == 0 else b""


def _login_diag(label: str, device: str) -> None:
    """Dump UI and log a one-line summary to diagnose perform_login failures."""
    adb("shell uiautomator dump /sdcard/window_dump.xml", device, timeout=15)
    time.sleep(0.3)
    raw_xml = adb("shell cat /sdcard/window_dump.xml", device, timeout=10)
    if not raw_xml:
        log.info("login_diag[%s]: empty dump", label)
        return
    xml_lo = raw_xml.lower()
    tags = {
        "Email": "email" in xml_lo,
        "Password": "password" in xml_lo,
        "Login_btn": 'text="login"' in xml_lo or 'text="log in"' in xml_lo,
        "Visits": "visits" in xml_lo,
        "dots": "\u2022" in raw_xml or "&#x2022;" in raw_xml,
        "Invalid": "invalid" in xml_lo,
    }
    summary = "  ".join(f"{k}={'Y' if v else 'N'}" for k, v in tags.items())
    log.info("login_diag[%s]: %s", label, summary)


def perform_login(device: str = DEFAULT_DEVICE) -> None:
    """Launch the app, enter credentials, and tap Login."""
    log.info("Starting login sequence...")

    email = os.environ.get("MAESTRO_APP_EMAIL", LOGIN_EMAIL)
    password = os.environ.get("MAESTRO_APP_PASSWORD", LOGIN_PASSWORD)

    adb(f"shell am force-stop {PACKAGE}", device)
    wait(1)
    adb(f"shell am start -n {MAIN_ACTIVITY}", device)

    # Wait up to 30s for "Forgot password?" to appear — same gate Maestro
    # uses (extendedWaitUntil text="Forgot.*"). Login screen is a Compose
    # screen and renders progressively; tapping too early misses elements.
    log.info("Waiting for login screen to fully render (Forgot anchor)...")
    for i in range(30):
        wait(1)
        adb("shell uiautomator dump /sdcard/window_dump.xml", device, timeout=15)
        time.sleep(0.3)
        raw = adb("shell cat /sdcard/window_dump.xml", device, timeout=10)
        if raw and "forgot" in raw.lower():
            log.info("Login screen ready after %ds (Forgot found).", i + 1)
            break
    else:
        log.warning("Login screen never showed Forgot anchor — proceeding anyway.")

    if not find_and_tap("Email", device):
        log.info("Tapping approximate email field location.")
        tap(540, 900, device)
    wait(0.5)
    input_text(email, device)
    _login_diag("after_email", device)  # should show Email=Y, dots=N

    # TAB to move focus to the password field.
    # find_and_tap("Password") is unreliable on Compose — it can match the
    # "Show password" toggle or a label node without transferring focus.
    adb("shell input keyevent 61", device)  # TAB key
    wait(0.5)
    input_text(password, device)
    _login_diag("after_password", device)  # should show dots=Y (masked password)

    # Hide keyboard FIRST so the Login button (positioned below the form)
    # is no longer obscured. KEYCODE_BACK (4) dismisses the soft keyboard.
    # ONE back only — on the login screen there is no back-stack, so a
    # second BACK exits the app entirely to the launcher.
    hide_keyboard(device)
    wait(1.5)

    # Log screen size for debugging coordinate strategy
    size_out = adb("shell wm size", device)
    log.info("Screen size: %s", size_out.strip() if size_out else "unknown")

    # CRITICAL DEBUG: dump every clickable element + screenshot at the
    # exact moment we look for the Login button. This will reveal whether
    # the button has different text, content-desc, or simply isn't in the
    # accessibility tree at all (Compose semantics issue).
    _dump_login_state("before_login_tap", device)

    # Try to find and tap the Login button now that the keyboard is down.
    # If the button is below the visible viewport (small emulator screens),
    # scroll the form up first and re-try.
    if not _tap_login_button(device):
        log.info("Login button not visible — scrolling form up and re-trying.")
        # Swipe from lower part of form to upper to reveal the button below.
        adb("shell input swipe 200 500 200 200 300", device)
        wait(1)
        if not _tap_login_button(device):
            # Last-resort: blind tap using coordinates derived from artifact
            # analysis (Forgot ~y=417; Login button typically ~80px below).
            log.warning("Login button still not found — tapping (160,500) as blind fallback.")
            tap(160, 500, device)

    # Poll for the home screen — accept either "visits" tab text OR
    # "overview" (Maestro's known post-login marker is "overview of your visits").
    for i in range(30):
        wait(1)
        adb("shell uiautomator dump /sdcard/window_dump.xml", device, timeout=15)
        time.sleep(0.3)
        raw_xml = adb("shell cat /sdcard/window_dump.xml", device, timeout=10)
        if raw_xml:
            xml_lo = raw_xml.lower()
            if "overview" in xml_lo or ("visits" in xml_lo and "welcome back" not in xml_lo):
                log.info("perform_login: home screen detected after %ds", i + 1)
                return
        if i in (4, 9, 14, 19, 24):
            _login_diag(f"poll_{i+1}s", device)

    log.warning("perform_login: home screen not detected within 30s — login likely failed")
    _login_diag("poll_30s_final", device)
    # Final-failure heavy dump so we can inspect what's on screen post-failure.
    _dump_login_state("after_login_failure", device)


# ===================================================================
# Screens that need full scroll-aware snapshots
# ===================================================================

DEEP_SCROLL_SCREENS = {
    "inspection_type1",   # 18 risk categories — very long
    "inspection_type2",   # Cooling Tower form — scrollable
    "inspection_type3",   # Calorifier/Water Heater — scrollable
    "inspection_type4",   # Chlorine Dioxide — scrollable
    "add_actions_sheet",  # 11+ predefined action checkboxes
    "visit_detail_accordion",  # 4 fields may be below fold
}


# ===================================================================
# Full scan orchestrator
# ===================================================================

def scan_all_screens(
    device: str = DEFAULT_DEVICE,
    quick: bool = False,
    ci_mode: bool = False,
    only_screens: list[str] | None = None,
) -> dict[str, list[dict]]:
    """
    Main orchestrator.  Logs in, iterates screens, dumps & diffs elements.
    Returns {screen_id: [new_elements]}.

    ci_mode=True skips screens in CI_SKIP_SCREENS (e.g. photo_label_dialog).
    CI mode is also auto-detected via GITHUB_ACTIONS env var.

    only_screens: if provided, runs exactly this subset in the listed order
    (overrides quick/ALL_SCREENS). Use for rapid iteration on failing screens.
    """
    is_ci = ci_mode or bool(os.environ.get("GITHUB_ACTIONS"))
    baseline = load_baseline()
    if only_screens:
        screens = only_screens
        log.info("Running filtered scan over %d screen(s): %s", len(screens), screens)
    else:
        screens = QUICK_SCREENS if quick else ALL_SCREENS
    results: dict[str, list[dict]] = {}

    # Disable autofill service to prevent it from interfering with form-filling.
    # After a successful login, Android autofill saves credentials and on subsequent
    # runs shows a dropdown that disrupts the TAB-key focus flow.
    log.info("Disabling autofill service to prevent form-fill interference...")
    adb("shell settings put secure autofill_service null", device)
    wait(0.5)

    for screen_id in screens:
        # Skip screens that need real device hardware in CI
        if is_ci and screen_id in CI_SKIP_SCREENS:
            log.info("Skipping %s (CI mode, requires device hardware).", screen_id)
            results[screen_id] = []
            continue

        log.info("=" * 50)
        log.info("Scanning screen: %s", screen_id)
        log.info("=" * 50)

        # ------ Navigation ------
        try:
            if screen_id == "visits_home":
                # Special case: perform_login() transitions us from login screen
                # (login_error_state cleanup left app stopped) to visits_home.
                # perform_login() now polls for the visits_home anchor internally.
                perform_login(device)
            else:
                navigate_to_screen(screen_id, device)
        except Exception as exc:
            log.error("Navigation to %s failed: %s", screen_id, exc)
            results[screen_id] = []
            cleanup_after_screen(screen_id, device)
            continue

        wait(2)

        # ------ Verify we reached the right screen ------
        if not verify_screen(screen_id, device):
            log.warning("Screen verification failed for %s — snapshot may be inaccurate", screen_id)

        # ------ Snapshot (scroll-aware for long screens) ------
        try:
            if screen_id in DEEP_SCROLL_SCREENS:
                elements = get_full_ui_snapshot(device, max_scrolls=5)
            else:
                elements = get_ui_snapshot(device)
        except Exception as exc:
            log.error("Snapshot failed for %s: %s", screen_id, exc)
            elements = []

        log.info(
            "  Extracted %d interactive elements on '%s'.",
            len(elements),
            screen_id,
        )

        # ------ Screenshot (always, for Excel report) ------
        take_screenshot(screen_id, device)

        # ------ Baseline comparison ------
        new_elements = compare_with_baseline(screen_id, elements, baseline)
        results[screen_id] = new_elements

        # ------ Check for removed elements ------
        removed_elements = detect_removed_elements(screen_id, elements, baseline)
        if removed_elements:
            log.warning(
                "  >>> %d REMOVED element(s) on '%s'!",
                len(removed_elements),
                screen_id,
            )
            for el in removed_elements:
                log.warning(
                    "      REMOVED: text=%r  desc=%r  id=%r  class=%s",
                    el.get("text"),
                    el.get("content_desc"),
                    el.get("resource_id"),
                    el.get("class"),
                )

        if new_elements:
            log.warning(
                "  >>> %d NEW element(s) detected on '%s'!",
                len(new_elements),
                screen_id,
            )
            for el in new_elements:
                log.warning(
                    "      NEW: text=%r  desc=%r  id=%r  class=%s",
                    el.get("text"),
                    el.get("content_desc"),
                    el.get("resource_id"),
                    el.get("class"),
                )
            take_screenshot(f"{screen_id}_new_elements", device)
        else:
            log.info("  No new elements on '%s'.", screen_id)

        # ------ Cleanup: dismiss dialogs, return to navigable state ------
        try:
            cleanup_after_screen(screen_id, device)
        except Exception as exc:
            log.warning("Cleanup for %s raised: %s — attempting force-recovery.", screen_id, exc)
            # Last-resort recovery: press back twice
            press_back(device)
            wait(0.5)
            press_back(device)
            wait(1)

    return results


# ===================================================================
# Result persistence
# ===================================================================

def save_scan_results(results: dict, output_dir: Path | None = None) -> Path:
    """Write results to scan_results_{timestamp}.json and return the path."""
    if output_dir is None:
        output_dir = SCRIPT_DIR
    output_dir.mkdir(parents=True, exist_ok=True)

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = output_dir / f"scan_results_{ts}.json"

    payload = {
        "scan_timestamp": datetime.now().isoformat(),
        "baseline_path": str(BASELINE_PATH),
        "screens": {},
    }

    total_new = 0
    for screen_id, new_els in results.items():
        payload["screens"][screen_id] = {
            "new_element_count": len(new_els),
            "new_elements": new_els,
        }
        total_new += len(new_els)

    payload["summary"] = {
        "screens_scanned": len(results),
        "total_new_elements": total_new,
    }

    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2, ensure_ascii=False)

    log.info("Scan results saved to %s", out_path)
    return out_path


# ===================================================================
# CLI entry point
# ===================================================================

def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="HydroCert change detector — scan the Android app and diff against baseline.",
    )
    parser.add_argument(
        "--quick",
        action="store_true",
        help="Quick scan: only visits_home, visit_detail, account_tab.",
    )
    parser.add_argument(
        "--ci",
        action="store_true",
        help="CI mode: skip screens that require real device hardware (e.g. photo_label_dialog). "
             "Also auto-detected via GITHUB_ACTIONS env var.",
    )
    parser.add_argument(
        "--device",
        default=DEFAULT_DEVICE,
        help=f"ADB device serial (default: {DEFAULT_DEVICE}).",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="Directory for scan result JSON (default: script directory).",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable debug-level logging.",
    )
    return parser


def main() -> None:
    parser = _build_parser()
    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    ci_mode = args.ci or bool(os.environ.get("GITHUB_ACTIONS"))

    log.info("HydroCert Change Detector starting...")
    log.info("Device : %s", args.device)
    log.info("Mode   : %s", "QUICK" if args.quick else "FULL")
    log.info("CI     : %s", ci_mode)
    log.info("-" * 50)

    results = scan_all_screens(
        device=args.device,
        quick=args.quick,
        ci_mode=ci_mode,
    )

    out_path = save_scan_results(results, args.output_dir)

    print()
    print("=" * 60)
    print("  SCAN SUMMARY")
    print("=" * 60)

    total_new = 0
    for screen_id, new_els in results.items():
        count = len(new_els)
        total_new += count
        marker = "  *** NEW ***" if count else ""
        print(f"  {screen_id:30s}  {count:3d} new element(s){marker}")

    print("-" * 60)
    print(f"  Total new elements: {total_new}")
    print(f"  Results file      : {out_path}")
    print("=" * 60)

    if total_new > 0:
        log.warning(
            "Detected %d new element(s) across %d screen(s) — review recommended.",
            total_new,
            sum(1 for v in results.values() if v),
        )
    else:
        log.info("All screens match baseline. No new elements detected.")


if __name__ == "__main__":
    main()
