"""
HydroCert UI Change Detector - Report Generator
Generates self-contained HTML reports from scan results JSON.
"""

import json
import base64
import os
from datetime import datetime
from pathlib import Path


def _encode_screenshot(screenshot_path):
    """Read a screenshot file and return its base64-encoded data URI."""
    if not os.path.isfile(screenshot_path):
        return None
    try:
        with open(screenshot_path, "rb") as f:
            data = f.read()
        ext = Path(screenshot_path).suffix.lower()
        mime = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".webp": "image/webp",
        }.get(ext, "image/png")
        return f"data:{mime};base64,{base64.b64encode(data).decode('ascii')}"
    except Exception:
        return None


def _build_html(scan_results, screenshots_dir):
    """Build the full self-contained HTML string for the report."""

    timestamp = scan_results.get("scan_timestamp", "unknown")
    screens = scan_results.get("screens", {})
    total_screens = len(screens)
    total_new = sum(len(info.get("new_elements", [])) for info in screens.values())

    # --- Per-screen card HTML ---
    cards_html = ""
    for screen_name, info in screens.items():
        new_elements = info.get("new_elements", [])
        count = len(new_elements)
        border_color = "#e74c3c" if count > 0 else "#2ecc71"
        badge_bg = "#e74c3c" if count > 0 else "#2ecc71"
        badge_label = f"{count} new" if count > 0 else "no changes"

        # Screenshot
        screenshot_html = ""
        if screenshots_dir:
            for ext in (".png", ".jpg", ".jpeg", ".webp"):
                candidate = os.path.join(screenshots_dir, f"{screen_name}{ext}")
                data_uri = _encode_screenshot(candidate)
                if data_uri:
                    screenshot_html = (
                        f'<div class="screenshot">'
                        f'<img src="{data_uri}" alt="{screen_name} screenshot" />'
                        f'</div>'
                    )
                    break

        # Elements table
        table_html = ""
        if count > 0:
            rows = ""
            for el in new_elements:
                text = _esc(el.get("text", ""))
                cls = _esc(el.get("class", ""))
                etype = _esc(el.get("type", ""))
                clickable = el.get("clickable", False)
                click_badge = (
                    '<span class="click-yes">yes</span>'
                    if clickable
                    else '<span class="click-no">no</span>'
                )
                rows += (
                    f"<tr>"
                    f"<td>{text}</td>"
                    f"<td><code>{cls}</code></td>"
                    f"<td>{etype}</td>"
                    f"<td>{click_badge}</td>"
                    f"</tr>\n"
                )
            table_html = f"""
            <table>
                <thead>
                    <tr>
                        <th>Text</th>
                        <th>Class</th>
                        <th>Type</th>
                        <th>Clickable</th>
                    </tr>
                </thead>
                <tbody>
                    {rows}
                </tbody>
            </table>"""
        else:
            table_html = '<p class="all-clear">All elements match baseline. No changes detected.</p>'

        cards_html += f"""
        <div class="card" style="border-left: 4px solid {border_color};">
            <div class="card-header">
                <h2>{_esc(screen_name)}</h2>
                <span class="badge" style="background:{badge_bg};">{badge_label}</span>
            </div>
            {screenshot_html}
            {table_html}
        </div>
        """

    # --- Full HTML document ---
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>HydroCert Change Detector Report - {_esc(timestamp)}</title>
<style>
    *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        background: #f0f2f5;
        color: #333;
        line-height: 1.5;
    }}
    header {{
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
        color: #fff;
        padding: 28px 40px;
    }}
    header h1 {{
        font-size: 1.6em;
        font-weight: 600;
        margin-bottom: 4px;
    }}
    header .subtitle {{
        font-size: 0.9em;
        opacity: 0.8;
    }}
    .summary {{
        display: flex;
        gap: 20px;
        padding: 20px 40px;
        background: #fff;
        border-bottom: 1px solid #e0e0e0;
        flex-wrap: wrap;
    }}
    .summary-item {{
        flex: 1;
        min-width: 160px;
        padding: 16px 20px;
        border-radius: 8px;
        background: #f8f9fa;
        text-align: center;
    }}
    .summary-item .num {{
        font-size: 2em;
        font-weight: 700;
        display: block;
    }}
    .summary-item .label {{
        font-size: 0.85em;
        color: #666;
    }}
    .num-green {{ color: #2ecc71; }}
    .num-red {{ color: #e74c3c; }}
    .num-blue {{ color: #3498db; }}
    .container {{
        max-width: 1100px;
        margin: 24px auto;
        padding: 0 20px;
    }}
    .card {{
        background: #fff;
        border-radius: 8px;
        margin-bottom: 20px;
        padding: 20px 24px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }}
    .card-header {{
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 14px;
    }}
    .card-header h2 {{
        font-size: 1.15em;
        font-weight: 600;
    }}
    .badge {{
        display: inline-block;
        padding: 3px 12px;
        border-radius: 12px;
        color: #fff;
        font-size: 0.8em;
        font-weight: 600;
    }}
    .screenshot {{
        margin-bottom: 14px;
        text-align: center;
    }}
    .screenshot img {{
        max-width: 100%;
        max-height: 280px;
        border-radius: 6px;
        border: 1px solid #e0e0e0;
    }}
    table {{
        width: 100%;
        border-collapse: collapse;
        font-size: 0.9em;
    }}
    thead th {{
        text-align: left;
        padding: 8px 10px;
        background: #f8f9fa;
        border-bottom: 2px solid #e0e0e0;
        font-weight: 600;
        color: #555;
    }}
    tbody td {{
        padding: 8px 10px;
        border-bottom: 1px solid #f0f0f0;
    }}
    tbody tr:hover {{
        background: #fafbfc;
    }}
    code {{
        background: #eef;
        padding: 1px 5px;
        border-radius: 3px;
        font-size: 0.92em;
    }}
    .click-yes {{
        background: #d4edda;
        color: #155724;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 0.85em;
        font-weight: 600;
    }}
    .click-no {{
        background: #f0f0f0;
        color: #888;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 0.85em;
    }}
    .all-clear {{
        color: #2ecc71;
        font-weight: 500;
        padding: 8px 0;
    }}
    footer {{
        text-align: center;
        padding: 20px;
        color: #999;
        font-size: 0.8em;
    }}
</style>
</head>
<body>
<header>
    <h1>HydroCert UI Change Detector</h1>
    <div class="subtitle">Scan Report &mdash; {_esc(timestamp)}</div>
</header>

<div class="summary">
    <div class="summary-item">
        <span class="num num-blue">{total_screens}</span>
        <span class="label">Screens Scanned</span>
    </div>
    <div class="summary-item">
        <span class="num {"num-red" if total_new > 0 else "num-green"}">{total_new}</span>
        <span class="label">New Elements Found</span>
    </div>
    <div class="summary-item">
        <span class="num" style="font-size:1em;color:#555;">{_esc(timestamp)}</span>
        <span class="label">Scan Timestamp</span>
    </div>
</div>

<div class="container">
    {cards_html}
</div>

<footer>
    Generated by HydroCert Change Detector &bull; {_esc(timestamp)}
</footer>
</body>
</html>"""
    return html


def _esc(text):
    """Escape HTML special characters."""
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#x27;")
    )


def generate_report(scan_results_path, screenshots_dir=None, output_dir=None):
    """
    Generate an HTML report from a scan results JSON file.

    Args:
        scan_results_path: Path to the scan results JSON file.
        screenshots_dir:   Path to the directory containing screenshot images.
        output_dir:        Directory where the HTML report will be saved.
                           Defaults to a 'reports' subfolder next to this script.

    Returns:
        The path to the generated HTML report file.
    """
    with open(scan_results_path, "r", encoding="utf-8") as f:
        scan_results = json.load(f)

    if output_dir is None:
        output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "reports")
    os.makedirs(output_dir, exist_ok=True)

    timestamp_slug = (
        scan_results
        .get("scan_timestamp", datetime.now().strftime("%Y-%m-%d_%H-%M-%S"))
        .replace(":", "-")
        .replace(" ", "_")
    )
    filename = f"scan_report_{timestamp_slug}.html"
    output_path = os.path.join(output_dir, filename)

    html = _build_html(scan_results, screenshots_dir)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"[reporter] HTML report saved to: {output_path}")
    return output_path


def generate_diff_summary(scan_results):
    """
    Return a short text summary of detected changes.

    Args:
        scan_results: A dict (already loaded) with the scan results structure:
            {
                "scan_timestamp": "...",
                "screens": {
                    "screen_name": {
                        "new_elements": [
                            {"text": "...", "class": "...", "type": "...", "clickable": bool},
                            ...
                        ]
                    },
                    ...
                }
            }

    Returns:
        A human-readable string summarising the changes.
    """
    screens = scan_results.get("screens", {})
    total_new = sum(len(info.get("new_elements", [])) for info in screens.values())

    if total_new == 0:
        return "\u2705 HydroCert Change Detector - No new elements found. All clear!"

    lines = [f"\U0001f514 HydroCert Change Detector - {total_new} new element{'s' if total_new != 1 else ''} found!"]

    for screen_name, info in screens.items():
        new_elements = info.get("new_elements", [])
        if not new_elements:
            continue

        count = len(new_elements)
        # Determine dominant type for the label
        types = set(el.get("type", "element") for el in new_elements)
        type_label = "element" if len(types) > 1 else types.pop()
        if count > 1:
            type_label = type_label if type_label.endswith("s") else type_label + "s"
            # List up to 3 element texts
            names = [f'"{el.get("text", "?")}"' for el in new_elements[:3]]
            if count > 3:
                names.append(f"... +{count - 3} more")
            names_str = ", ".join(names)
            lines.append(f"  - {screen_name}: {count} new {type_label} {names_str}")
        else:
            el = new_elements[0]
            etype = el.get("type", "element")
            etext = el.get("text", "?")
            lines.append(f'  - {screen_name}: 1 new {etype} "{etext}"')

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI usage: python reporter.py <scan_results.json> [screenshots_dir] [output_dir]
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python reporter.py <scan_results.json> [screenshots_dir] [output_dir]")
        sys.exit(1)

    results_path = sys.argv[1]
    ss_dir = sys.argv[2] if len(sys.argv) > 2 else None
    out_dir = sys.argv[3] if len(sys.argv) > 3 else None

    report_path = generate_report(results_path, ss_dir, out_dir)

    with open(results_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    print(generate_diff_summary(data))
