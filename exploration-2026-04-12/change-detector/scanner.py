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

# Approximate tap coordinates gathered from QA sessions
# Physical resolution on the CI emulator is ~1080x2340
COORDS = {
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
    # New fallback coords for expanded screens
    "forgot_password_link":       (540, 1150),
    "visit_details_accordion":    (540, 990),
    "client_signature_accordion": (540, 1080),
    "tap_to_sign":                (540, 1350),
    "priority_badge":             (200, 1420),
    "delete_action_icon":         (950, 1530),
    "fab_button":                 (960, 2120),
    "actions_accordion":          (540, 1200),
}

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
    """Press Back to dismiss the soft keyboard."""
    adb("shell input keyevent 111", device)
    time.sleep(0.3)


def press_back(device: str = DEFAULT_DEVICE) -> None:
    """Press the Android Back button."""
    adb("shell input keyevent 4", device)
    time.sleep(0.5)


def scroll_down(device: str = DEFAULT_DEVICE) -> None:
    """Swipe upward (scroll content down) by ~600px."""
    adb("shell input swipe 540 1800 540 600 400", device)
    time.sleep(0.6)


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

        elements.append({
            "text": node.attrib.get("text", ""),
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

def navigate_to_screen(screen_id: str, device: str = DEFAULT_DEVICE) -> None:
    """
    Navigate the emulator to the requested screen.

    IMPORTANT: The orchestrator (scan_all_screens) handles login and calls
    cleanup_after_screen() between each screen. Navigation logic here assumes
    the app is in the state left by the previous screen's cleanup.
    """
    log.info("Navigating to screen: %s", screen_id)

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
        # Assumes we are on visits_home
        tap(*COORDS["bottom_visits"], device)
        wait(2)
        if not find_and_tap("View Visit Details", device):
            tap(*COORDS["view_visit_details"], device)
        wait(2)

    elif screen_id == "visit_detail_accordion":
        # Assumes we are on visit_detail.
        # "Visit Details" appears as both a tab (index 0) and an accordion (index 1).
        # Tap the second occurrence to expand the accordion.
        if not find_and_tap_nth("Visit Details", n=1, device=device):
            tap(*COORDS["visit_details_accordion"], device)
        wait(2)

    elif screen_id == "signature_dialog":
        # Assumes visit_detail_accordion cleanup collapsed it, we are on visit_detail.
        # Expand the Client Signature accordion, then tap the signature canvas.
        if not find_and_tap("Client Signature", device):
            tap(*COORDS["client_signature_accordion"], device)
        wait(1.5)
        if not find_and_tap("Tap to sign", device):
            if not find_and_tap("sign", device):
                tap(*COORDS["tap_to_sign"], device)
        wait(2)

    elif screen_id == "priority_picker":
        # Assumes we are on visit_detail.
        # Tap a priority badge — "Low" is the default for the seeded action item.
        if not find_and_tap("Low", device):
            tap(*COORDS["priority_badge"], device)
        wait(1.5)

    elif screen_id == "delete_dialog":
        # Assumes we are on visit_detail.
        # Expand the Actions accordion, then tap the Delete action icon.
        if not find_and_tap("Actions", device):
            tap(*COORDS["actions_accordion"], device)
        wait(1.5)
        if not find_and_tap("Delete action", device):
            tap(*COORDS["delete_action_icon"], device)
        wait(1.5)

    elif screen_id == "unsaved_data_dialog":
        # Assumes we are on visit_detail (after delete_dialog cleanup / Cancel).
        # Expand Visit Details accordion, type in the Description field, press Back.
        if not find_and_tap_nth("Visit Details", n=1, device=device):
            tap(*COORDS["visit_details_accordion"], device)
        wait(1.5)
        # Tap below the label to focus the EditText (API 30 Compose quirk)
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
        # Assumes we are on visit_detail (unsaved_data_dialog cleanup tapped "Stay").
        if not find_and_tap("Quick actions", device):
            tap(*COORDS["fab_button"], device)
        wait(1.5)

    elif screen_id == "add_actions_sheet":
        # Assumes FAB is closed (cleanup_after_screen closed it).
        # Open FAB then tap Actions.
        if not find_and_tap("Quick actions", device):
            tap(*COORDS["fab_button"], device)
        wait(1)
        find_and_tap("Actions", device)
        wait(2)

    elif screen_id == "camera_permission":
        # Revoke camera permission first so the system dialog always appears.
        adb(f"shell pm revoke {PACKAGE} android.permission.CAMERA", device)
        wait(0.5)
        if not find_and_tap("Quick actions", device):
            tap(*COORDS["fab_button"], device)
        wait(1)
        find_and_tap("Camera", device)
        wait(2)

    elif screen_id == "gallery_picker":
        # Assumes we are on visit_detail (camera_permission cleanup dismissed dialog).
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
        # Force-stop, relaunch, enter wrong credentials
        adb(f"shell am force-stop {PACKAGE}", device)
        wait(1)
        adb(f"shell am start -n {MAIN_ACTIVITY}", device)
        wait(3)
        if not find_and_tap("Email", device):
            tap(540, 900, device)
        wait(0.5)
        input_text(os.environ.get("MAESTRO_APP_EMAIL", LOGIN_EMAIL), device)
        if not find_and_tap("Password", device):
            tap(540, 1050, device)
        wait(0.5)
        input_text("WrongPassword123!", device)
        hide_keyboard(device)
        wait(0.5)
        if not find_and_tap("Login", device):
            if not find_and_tap("LOG IN", device):
                tap(540, 1300, device)
        wait(3)

    else:
        log.warning("Unknown screen_id: %s", screen_id)


# ===================================================================
# Screen verification
# ===================================================================

SCREEN_ANCHORS = {
    "login": ["Email", "Password", "Login"],
    "forgot_password": ["Back to Login"],
    "visits_home": ["Visits"],
    "visit_detail": ["Visit Details"],
    "inspections_tab": ["Inspections"],
    "account_tab": ["Account"],
    "change_password": ["Change Password"],
    "signature_dialog": ["sign"],
    "delete_dialog": ["Delete", "Cancel"],
    "unsaved_data_dialog": ["Stay"],
    "fab_expanded": ["Camera", "Gallery"],
    "logout_dialog": ["Logout", "Cancel"],
    "login_error_state": ["Invalid", "Login"],
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
        # Clear the error state — force-stop and relaunch for clean login
        adb(f"shell am force-stop {PACKAGE}", device)
        wait(1)
        adb(f"shell am start -n {MAIN_ACTIVITY}", device)
        wait(3)

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

def perform_login(device: str = DEFAULT_DEVICE) -> None:
    """Launch the app, enter credentials, and tap Login."""
    log.info("Starting login sequence...")

    email = os.environ.get("MAESTRO_APP_EMAIL", LOGIN_EMAIL)
    password = os.environ.get("MAESTRO_APP_PASSWORD", LOGIN_PASSWORD)

    adb(f"shell am force-stop {PACKAGE}", device)
    wait(1)
    adb(f"shell am start -n {MAIN_ACTIVITY}", device)
    wait(4)

    if not find_and_tap("Email", device):
        log.info("Tapping approximate email field location.")
        tap(540, 900, device)
    wait(0.5)
    input_text(email, device)

    if not find_and_tap("Password", device):
        log.info("Tapping approximate password field location.")
        tap(540, 1050, device)
    wait(0.5)
    input_text(password, device)

    hide_keyboard(device)
    wait(0.5)

    if not find_and_tap("Login", device):
        if not find_and_tap("LOG IN", device):
            if not find_and_tap("Sign in", device):
                log.warning("Could not find login button — tapping fallback.")
                tap(540, 1300, device)
    wait(5)

    log.info("Login sequence complete — waiting for home screen.")


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
) -> dict[str, list[dict]]:
    """
    Main orchestrator.  Logs in, iterates screens, dumps & diffs elements.
    Returns {screen_id: [new_elements]}.

    ci_mode=True skips screens in CI_SKIP_SCREENS (e.g. photo_label_dialog).
    CI mode is also auto-detected via GITHUB_ACTIONS env var.
    """
    is_ci = ci_mode or bool(os.environ.get("GITHUB_ACTIONS"))
    baseline = load_baseline()
    screens = QUICK_SCREENS if quick else ALL_SCREENS
    results: dict[str, list[dict]] = {}

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
                # (forgot_password cleanup left us on login) to visits_home.
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
