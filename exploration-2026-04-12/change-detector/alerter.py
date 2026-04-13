"""
HydroCert UI Change Detector - Alert System
Sends notifications through multiple channels when UI changes are detected.
"""

import json
import os
import subprocess
import sys
from datetime import datetime


# ANSI colour codes (work in Windows Terminal / modern consoles)
_RESET = "\033[0m"
_BOLD = "\033[1m"
_RED = "\033[91m"
_GREEN = "\033[92m"
_YELLOW = "\033[93m"
_CYAN = "\033[96m"
_DIM = "\033[2m"

# Base directory: same folder as this script
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))


# ---------------------------------------------------------------------------
# 1. Windows Toast Notification
# ---------------------------------------------------------------------------
def send_toast(title, message):
    """
    Show a native Windows 10/11 toast notification via PowerShell.
    Fails silently if PowerShell or the toast API is unavailable.
    """
    # Escape single quotes for PowerShell string embedding
    safe_title = str(title).replace("'", "''").replace('"', '`"')
    safe_message = str(message).replace("'", "''").replace('"', '`"')

    ps_script = f'''
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$template = @"
<toast>
    <visual>
        <binding template="ToastGeneric">
            <text>{safe_title}</text>
            <text>{safe_message}</text>
        </binding>
    </visual>
</toast>
"@
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml($template)
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("HydroCert Change Detector").Show($toast)
'''
    try:
        result = subprocess.run(
            ["powershell", "-Command", ps_script],
            capture_output=True,
            timeout=15,
        )
        if result.returncode == 0:
            print(f"{_GREEN}[alerter]{_RESET} Toast notification sent.")
        else:
            stderr = result.stderr.decode(errors="replace").strip()
            print(f"{_YELLOW}[alerter]{_RESET} Toast notification failed: {stderr[:200]}")
    except FileNotFoundError:
        print(f"{_YELLOW}[alerter]{_RESET} PowerShell not found -- toast skipped.")
    except subprocess.TimeoutExpired:
        print(f"{_YELLOW}[alerter]{_RESET} Toast notification timed out.")
    except Exception as e:
        print(f"{_YELLOW}[alerter]{_RESET} Toast notification error: {e}")


# ---------------------------------------------------------------------------
# 2. Log file
# ---------------------------------------------------------------------------
def append_to_log(message, log_path=None):
    """Append a timestamped entry to the alerts log file."""
    if log_path is None:
        log_path = os.path.join(_BASE_DIR, "alerts.log")
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    entry = f"[{now}] {message}\n"
    try:
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(entry)
        print(f"{_GREEN}[alerter]{_RESET} Logged to {log_path}")
    except Exception as e:
        print(f"{_RED}[alerter]{_RESET} Failed to write log: {e}")


# ---------------------------------------------------------------------------
# 3. Console output
# ---------------------------------------------------------------------------
def print_console_alert(summary_text, report_path=None):
    """Print a coloured alert to the terminal."""
    border = "=" * 60
    print()
    print(f"{_CYAN}{_BOLD}{border}{_RESET}")
    print(f"{_CYAN}{_BOLD}  HYDROCERT CHANGE DETECTOR - ALERT{_RESET}")
    print(f"{_CYAN}{_BOLD}{border}{_RESET}")
    print()
    for line in summary_text.splitlines():
        if line.startswith("  -"):
            print(f"  {_YELLOW}{line.strip()}{_RESET}")
        else:
            print(f"  {_RED}{_BOLD}{line}{_RESET}")
    print()
    if report_path:
        print(f"  {_DIM}Full report: {report_path}{_RESET}")
    print()
    print(f"{_CYAN}{_BOLD}{border}{_RESET}")
    print()


def print_console_all_clear():
    """Print a reassuring green message when no changes are found."""
    border = "-" * 60
    print()
    print(f"{_GREEN}{border}{_RESET}")
    print(f"{_GREEN}  HYDROCERT CHANGE DETECTOR - ALL CLEAR{_RESET}")
    print(f"{_GREEN}  No new UI elements detected. Baseline matches.{_RESET}")
    print(f"{_GREEN}{border}{_RESET}")
    print()


# ---------------------------------------------------------------------------
# 4. Summary file
# ---------------------------------------------------------------------------
def write_summary_file(summary_text, report_path=None, output_path=None):
    """Write a human-readable latest_changes.txt file."""
    if output_path is None:
        output_path = os.path.join(_BASE_DIR, "latest_changes.txt")
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    lines = [
        "HydroCert Change Detector - Latest Changes",
        f"Generated: {now}",
        "",
        summary_text,
        "",
    ]
    if report_path:
        lines.append(f"Full HTML report: {report_path}")
        lines.append("")
    try:
        with open(output_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))
        print(f"{_GREEN}[alerter]{_RESET} Summary written to {output_path}")
    except Exception as e:
        print(f"{_RED}[alerter]{_RESET} Failed to write summary file: {e}")


# ---------------------------------------------------------------------------
# Main dispatch
# ---------------------------------------------------------------------------
def send_alerts(scan_results, report_path=None):
    """
    Inspect scan_results for new elements and fire all alert channels.

    Args:
        scan_results: Dict with structure:
            {
                "scan_timestamp": "...",
                "screens": {
                    "screen_name": {"new_elements": [...]},
                    ...
                }
            }
        report_path: Optional path to the generated HTML report.

    Returns:
        True if alerts were sent (changes detected), False otherwise.
    """
    # Import here to avoid circular import at module level
    from reporter import generate_diff_summary

    screens = scan_results.get("screens", {})
    total_new = sum(len(info.get("new_elements", [])) for info in screens.values())

    summary = generate_diff_summary(scan_results)

    if total_new == 0:
        # No changes -- just show console all-clear and log it
        print_console_all_clear()
        append_to_log("Scan complete. No new elements detected.")
        write_summary_file(summary, report_path)
        return False

    # --- Changes detected: fire all channels ---

    # 3. Console (first, so the user sees it immediately)
    print_console_alert(summary, report_path)

    # 1. Windows toast
    toast_title = "HydroCert Change Detector"
    toast_msg = f"{total_new} new UI element{'s' if total_new != 1 else ''} detected! Check the report."
    send_toast(toast_title, toast_msg)

    # 2. Log file
    log_line = summary.replace("\n", " | ")
    append_to_log(log_line)

    # 4. Summary file
    write_summary_file(summary, report_path)

    return True


# ---------------------------------------------------------------------------
# CLI usage: python alerter.py <scan_results.json> [report_path]
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python alerter.py <scan_results.json> [report_path]")
        sys.exit(1)

    results_path = sys.argv[1]
    rpt = sys.argv[2] if len(sys.argv) > 2 else None

    with open(results_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    send_alerts(data, rpt)
