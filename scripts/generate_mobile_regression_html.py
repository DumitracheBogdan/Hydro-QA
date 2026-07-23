"""
Generate a self-contained HTML report for the mobile Maestro post-deploy
regression workflow.

Consumes the same inputs as generate_mobile_regression_excel.py:
  - summary.json produced by scripts/run-mobile-v2-test.sh
  - Per-flow after.png screenshots under <artifacts>/test/screenshots/
  - Per-flow uiautomator XML dumps under <artifacts>/test/ui-dumps/
  - Per-flow Maestro YAML files under --flows-dir (default: mobile-flows-v2) for
    the "What it checks" description, the reproduction steps, and the element(s)
    circled on each screenshot.

Produces one self-contained .html file (every image inlined as base64, no
external assets) with:
  - a header + 4 metric cards (Total / Passed / Failed / Skipped),
  - a short legend explaining the per-test type tags,
  - one collapsible <details> card per flow, grouped by area, each showing what
    the test checks, the steps to reproduce, its status, and the annotated
    (circled) end screenshot.

The page renders in the viewer's light or dark theme and never crashes on a
missing screenshot, dump, or Pillow.
"""
from __future__ import annotations

import argparse
import base64
import html
import io
import json
import sys
import tempfile
from pathlib import Path

from generate_mobile_regression_excel import (
    derive_circle_targets,
    extract_flow_description,
    find_node_bounds,
    flow_to_steps,
    load_summary,
)

try:
    from PIL import Image

    from generate_mobile_regression_excel import annotate_full

    HAS_PIL = True
except Exception:  # pragma: no cover - degraded but functional
    HAS_PIL = False


# Flows grouped by area, in report order. Any flow present in the run but not
# listed here falls into a trailing "Other" group so nothing is silently
# dropped.
CATEGORIES: list[tuple[str, list[str]]] = [
    ("Authentication & session", [
        "01_login_screen", "02_login_success", "03_forgot_password",
        "12_change_password", "13_logout_cancel", "14_logout_confirm",
        "24_login_negative", "36_change_password_validation",
        "43_login_uppercase_email"]),
    ("Navigation & shell", [
        "04_visits_home_elements", "05_filter_chips", "06_search_box",
        "07_bottom_nav", "08_history_tab", "09_activity_tab", "10_account_tab",
        "11_my_signature_toggle", "20_bd_avatar_account", "44_date_range_filter"]),
    ("Visit detail", [
        "15_visit_detail_tabs", "16_visit_detail_signature", "17_fab_quick_actions",
        "18_inspections_tab", "19_attachments_tab", "21_priority_picker",
        "22_delete_action_dialog", "23_visit_detail_location",
        "25_aborted_visit_toggle", "26_unsaved_data_dialog",
        "37_history_visit_detail", "41_site_access_persists",
        "42_sticky_bottom_bars"]),
    ("Inspections & forms", [
        "27_inspection_start", "28_inspection_visit_info",
        "29_inspection_risk_assessment", "30_inspection_missing_toggle",
        "31_inspection_type2", "32_inspection_type3", "33_inspection_type4",
        "38_e2e_save_flow", "39_submit_toast", "40_submit_inactive_after_submit",
        "45_risk_assessment_fill", "46_cooling_tower_fill_submit",
        "47_calorifier_temps_fill", "48_chlorine_dioxide_fill_submit",
        "49_form_service_report", "50_form_closed_system",
        "51_form_cooling_tower_cleaning", "52_form_outlet_temperature",
        "53_form_softener_servicing"]),
    ("Media", ["34_camera_permission", "35_gallery_picker"]),
    ("Resilience & edge cases", [
        "56_signature_e2e", "60_back_during_load", "61_double_tap_submit",
        "62a_process_death_draft", "62b_process_death_restore",
        "63_offline_note_edit", "64_keyboard_covering_fields",
        "65_huge_inspection_list"]),
]

# One- or two-word test type, keyed by the numeric flow prefix. Anything not
# listed here is treated as "functional".
_KIND = {
    "smoke": "01 04 07 08 09 10 15 18 19 42".split(),
    "negative": "24 36".split(),
    "end-to-end": "38 46 48 56".split(),
    "permission": "34 35".split(),
    "edge case": "26 60 61 62a 62b 63 64 65".split(),
}
_KIND_BY_NUM = {num: kind for kind, nums in _KIND.items() for num in nums}

TYPE_LEGEND = [
    ("Smoke", "screen loads, key elements present"),
    ("Functional", "a feature behaves correctly"),
    ("Negative", "invalid input is rejected"),
    ("End-to-end", "full flow through submit"),
    ("Permission", "system dialog (camera / photos)"),
    ("Edge case", "interruptions & recovery"),
]

_PILL = {"PASS": ("pass", "Passed"), "FAIL": ("fail", "Failed"),
         "SKIP": ("skip", "Skipped")}
_CARD_CLASS = {"PASS": "pass", "FAIL": "failed", "SKIP": "skip"}


def logo_data_uri() -> str:
    """The TechQuarter logo as a base64 data URI, or '' if the asset is gone."""
    path = Path(__file__).resolve().parent / "assets" / "tq-logo.txt"
    try:
        return path.read_text(encoding="utf-8").strip()
    except Exception:
        return ""


def test_kind(flow_id: str) -> str:
    return _KIND_BY_NUM.get(flow_id.split("_", 1)[0], "functional")


def flow_number(flow_id: str) -> str:
    return flow_id.split("_", 1)[0]


def flow_title(flows_dir: Path, flow_id: str) -> str:
    """The human `name:` from the flow YAML, minus the `V2 - ` prefix."""
    path = flows_dir / f"{flow_id}.yaml"
    try:
        for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
            if line.startswith("name:"):
                raw = line.split("name:", 1)[1].strip().strip('"')
                return raw.replace("V2 - ", "").split(" - ", 1)[-1]
    except Exception:
        pass
    return flow_id


def screenshot_data_uri(flows_dir: Path, screenshots_dir: Path, dumps_dir: Path,
                        flow_id: str, width: int = 360) -> str | None:
    """Return the end screenshot as a base64 data URI, circling the tested
    element(s) when Pillow and a matching dump node are available."""
    shot = screenshots_dir / f"{flow_id}-after.png"
    if not shot.is_file():
        return None
    if HAS_PIL:
        try:
            src = shot
            dump = dumps_dir / f"{flow_id}.xml"
            bounds = []
            for target in derive_circle_targets(flows_dir, flow_id):
                box = find_node_bounds(dump, target)
                if box and box not in bounds:
                    bounds.append(box)
            if bounds:
                annotated = annotate_full(
                    shot, bounds, Path(tempfile.gettempdir()), tag=f"rep_{flow_id}")
                if annotated:
                    src = annotated
            im = Image.open(src).convert("RGB")
            if im.width > width:
                im = im.resize((width, int(im.height * width / im.width)),
                               Image.LANCZOS)
            buf = io.BytesIO()
            im.save(buf, "JPEG", quality=80)
            return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
        except Exception:
            pass
    # No Pillow, or annotation failed — embed the raw PNG untouched.
    return "data:image/png;base64," + base64.b64encode(shot.read_bytes()).decode()


def _grouped_flows(status: dict[str, str]) -> list[tuple[str, list[str]]]:
    """CATEGORIES filtered to flows that actually ran, plus an 'Other' group
    for any run flow that isn't categorised."""
    groups: list[tuple[str, list[str]]] = []
    seen: set[str] = set()
    for name, ids in CATEGORIES:
        present = [fid for fid in ids if fid in status]
        if present:
            groups.append((name, present))
            seen.update(present)
    extra = [fid for fid in status if fid not in seen]
    if extra:
        groups.append(("Other", extra))
    return groups


def build_html(summary: dict, artifacts_dir: Path, flows_dir: Path,
               title: str, subtitle: str) -> str:
    checks = summary.get("checks") or []
    status = {c.get("id"): (c.get("status") or "").upper() for c in checks if c.get("id")}
    totals = summary.get("totals") or {}
    total = int(totals.get("total", len(status)) or 0)
    passed = int(totals.get("pass", 0) or 0)
    failed = int(totals.get("fail", 0) or 0)
    skipped = int(totals.get("skip", 0) or 0)

    screenshots_dir = artifacts_dir / "test" / "screenshots"
    dumps_dir = artifacts_dir / "test" / "ui-dumps"

    legend = '<div class="legend2">' + "".join(
        f'<span class="li"><span class="lt">{html.escape(n)}</span>'
        f'{html.escape(d)}</span>' for n, d in TYPE_LEGEND) + "</div>"

    sections = []
    for cat, ids in _grouped_flows(status):
        rows = []
        for fid in ids:
            st = status.get(fid, "SKIP")
            pill_cls, pill_txt = _PILL.get(st, ("skip", st or "Skipped"))
            card_cls = _CARD_CLASS.get(st, "skip")
            steps = "".join(f"<li>{html.escape(s)}</li>"
                            for s in flow_to_steps(flows_dir, fid))
            uri = screenshot_data_uri(flows_dir, screenshots_dir, dumps_dir, fid)
            img = (f'<img loading="lazy" src="{uri}" alt="{html.escape(fid)} screenshot">'
                   if uri else '<div class="noshot">no screenshot</div>')
            num = flow_number(fid)
            rows.append(f"""
        <details id="flow-{html.escape(num)}" class="card {card_cls}">
          <summary>
            <span class="fid">{html.escape(num)}</span>
            <span class="ctitle">{html.escape(flow_title(flows_dir, fid))}</span>
            <span class="type">{html.escape(test_kind(fid))}</span>
            <span class="pill {pill_cls}">{html.escape(pill_txt)}</span>
          </summary>
          <div class="card-body">
            <div class="card-main">
              <p class="what">{html.escape(extract_flow_description(flows_dir, fid) or "")}</p>
              <div class="repro">
                <span class="lbl">Steps to reproduce</span>
                <ol>{steps}</ol>
              </div>
            </div>
            <figure class="shot">{img}<figcaption>circled = what this test verifies</figcaption></figure>
          </div>
        </details>""")
        sections.append(f"""
      <section class="cat">
        <div class="cat-head"><h2>{html.escape(cat)}</h2></div>
        {''.join(rows)}
      </section>""")

    logo = logo_data_uri()
    logo_html = (f'<span class="logo-badge"><img src="{logo}" alt="TechQuarter"></span>'
                 if logo else "")
    eyebrow = html.escape(subtitle or title)

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
{STYLE}
</head>
<body>
<div class="wrap">
  <main class="main">
    <header>{logo_html}
      <span class="eyebrow" style="margin:0">{eyebrow}</span></header>
    <div class="metrics">
      <div class="m"><b>{total}</b><span>Total</span></div>
      <div class="m pass"><b>{passed}</b><span>Passed</span></div>
      <div class="m fail"><b>{failed}</b><span>Failed</span></div>
      <div class="m skip"><b>{skipped}</b><span>Skipped</span></div>
    </div>
    {legend}
    {''.join(sections)}
  </main>
</div>
{LIGHTBOX}
</body>
</html>
"""


STYLE = """
<style>
:root{
  --bg:#f6f7f9; --surface:#ffffff; --surface2:#fbfcfd; --ink:#111621; --muted:#5b6472;
  --line:#e4e7ec; --accent:#1f57c3; --accent-soft:#eaf0fb;
  --ok:#0f7a4d; --ok-bg:#e7f4ee; --warn:#8a6400; --warn-bg:#fbf1d8;
  --fail:#c8322a; --fail-bg:#fbe9e7;
}
@media (prefers-color-scheme:dark){:root{
  --bg:#0d1014; --surface:#161b22; --surface2:#12161c; --ink:#e8eaed; --muted:#98a2b1;
  --line:#242c37; --accent:#6fa0f0; --accent-soft:#16233b;
  --ok:#4ade80; --ok-bg:#0f2a1c; --warn:#f0b429; --warn-bg:#2a2110;
  --fail:#f0736a; --fail-bg:#2c1512;
}}
:root[data-theme="light"]{
  --bg:#f6f7f9; --surface:#ffffff; --surface2:#fbfcfd; --ink:#111621; --muted:#5b6472;
  --line:#e4e7ec; --accent:#1f57c3; --accent-soft:#eaf0fb;
  --ok:#0f7a4d; --ok-bg:#e7f4ee; --warn:#8a6400; --warn-bg:#fbf1d8;
  --fail:#c8322a; --fail-bg:#fbe9e7;
}
:root[data-theme="dark"]{
  --bg:#0d1014; --surface:#161b22; --surface2:#12161c; --ink:#e8eaed; --muted:#98a2b1;
  --line:#242c37; --accent:#6fa0f0; --accent-soft:#16233b;
  --ok:#4ade80; --ok-bg:#0f2a1c; --warn:#f0b429; --warn-bg:#2a2110;
  --fail:#f0736a; --fail-bg:#2c1512;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
  font-family:"Segoe UI",system-ui,-apple-system,Roboto,Helvetica,Arial,sans-serif;
  line-height:1.5;-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.wrap{max-width:1080px;margin:0 auto;padding:30px 22px 90px}
header{display:flex;align-items:center;gap:15px;padding-bottom:24px;border-bottom:1px solid var(--line)}
.logo-badge{display:inline-flex;align-items:center;background:#ffffff;border:1px solid #e7ebf0;
  border-radius:13px;padding:10px 15px;box-shadow:0 1px 3px rgba(16,22,40,.09)}
.logo-badge img{height:48px;width:auto;display:block}
.eyebrow{text-transform:uppercase;letter-spacing:.15em;font-size:11px;font-weight:700;color:var(--accent)}
.sub{color:var(--muted);font-size:14px;margin-top:12px;max-width:70ch}
.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:26px 0 32px}
.m{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:22px 24px}
.m b{display:block;font-size:42px;font-weight:700;letter-spacing:-.02em;line-height:1;color:var(--ink)}
.m span{display:block;margin-top:9px;font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.07em}
.m.pass b{color:var(--ok)} .m.fail b{color:var(--fail)} .m.skip b{color:var(--warn)}
@media(max-width:600px){.metrics{grid-template-columns:repeat(2,1fr)}}
.legend2{background:var(--surface);border:1px solid var(--line);border-radius:13px;
  padding:14px 16px;margin-bottom:26px;display:flex;flex-wrap:wrap;gap:9px 20px}
.legend2 .li{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--muted)}
.legend2 .lt{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;
  padding:2px 9px;border-radius:6px;background:var(--accent-soft);color:var(--accent);white-space:nowrap;flex:none}
.cat{margin-top:38px}
.cat-head{padding-bottom:10px;margin-bottom:14px;border-bottom:2px solid var(--line)}
.cat-head h2{font-size:18px;font-weight:670;letter-spacing:-.01em;margin:0}
.card{background:var(--surface);border:1px solid var(--line);border-radius:13px;
  margin-bottom:9px;scroll-margin-top:20px;overflow:hidden}
.card.failed{border-left:4px solid var(--fail)}
.card.skip{border-left:4px solid var(--warn)}
.card.pass{border-left:4px solid var(--ok)}
.card>summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:11px;padding:14px 18px}
.card>summary::-webkit-details-marker{display:none}
.card>summary::after{content:"\\25B8";margin-left:2px;color:var(--muted);font-size:13px;transition:transform .15s;flex:none}
.card[open]>summary::after{transform:rotate(90deg)}
.card>summary:hover{background:var(--surface2)}
.ctitle{font-size:15px;font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.type{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding:2px 9px;
  border-radius:6px;background:var(--accent-soft);color:var(--accent);white-space:nowrap;flex:none}
.card-body{display:grid;grid-template-columns:1fr 232px;gap:20px;padding:14px 18px 18px;border-top:1px solid var(--line)}
.fid{font-family:"Cascadia Code","Consolas",ui-monospace,monospace;font-size:12px;font-weight:600;
  color:var(--accent);background:var(--accent-soft);padding:2px 8px;border-radius:6px;flex:none}
.pill{font-size:11px;font-weight:700;padding:3px 11px;border-radius:100px;letter-spacing:.02em;white-space:nowrap;flex:none}
.pill.fail{color:var(--fail);background:var(--fail-bg)}
.pill.skip{color:var(--warn);background:var(--warn-bg)}
.pill.pass{color:var(--ok);background:var(--ok-bg)}
.what{color:var(--muted);font-size:13.5px;margin:0 0 12px}
.repro{background:var(--surface2);border:1px solid var(--line);border-radius:10px;padding:11px 14px;margin-bottom:11px}
.repro .lbl{display:block;text-transform:uppercase;letter-spacing:.08em;font-size:10px;font-weight:700;color:var(--muted);margin-bottom:6px}
.repro ol{margin:0;padding-left:20px;font-family:"Cascadia Code","Consolas",ui-monospace,monospace;font-size:12px;line-height:1.75}
.shot{margin:0;text-align:center}
.shot img{width:100%;max-width:200px;border-radius:10px;border:1px solid var(--line)}
.shot figcaption{font-size:10.5px;color:var(--muted);margin-top:6px}
.noshot{color:var(--muted);font-size:12px;padding:40px 0}
@media (max-width:720px){.card-body{grid-template-columns:1fr}.shot img{max-width:260px}}
.shot img{cursor:zoom-in;transition:filter .12s}
.shot img:hover{filter:brightness(1.04)}
#lightbox{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;
  background:rgba(8,10,14,.93);padding:26px;cursor:zoom-out}
#lightbox.open{display:flex}
#lightbox img{max-width:96vw;max-height:96vh;width:auto;border-radius:10px;box-shadow:0 10px 50px rgba(0,0,0,.55)}
#lightbox .hint{position:fixed;top:16px;right:20px;color:#c8ced8;font-size:12px;letter-spacing:.03em}
</style>
"""

LIGHTBOX = """
<div id="lightbox"><span class="hint">click / Esc to close</span><img alt="full screen"></div>
<script>
(function(){
  var lb=document.getElementById('lightbox'); if(!lb) return;
  var big=lb.querySelector('img');
  document.addEventListener('click',function(e){
    var t=e.target;
    if(t.tagName==='IMG'&&t.closest('.shot')){big.src=t.currentSrc||t.src;lb.classList.add('open');}
    else if(lb.classList.contains('open')){lb.classList.remove('open');big.removeAttribute('src');}
  });
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'&&lb.classList.contains('open')){lb.classList.remove('open');big.removeAttribute('src');}
  });
})();
</script>
"""


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Generate mobile regression HTML report.")
    p.add_argument("--summary-json", required=True,
                   help="Path to summary.json from run-mobile-v2-test.sh")
    p.add_argument("--artifacts-dir", required=True,
                   help="Path to qa-artifacts/mobile-v2")
    p.add_argument("--output", required=True, help="Output .html path")
    p.add_argument("--title", default="Mobile Regression Report")
    p.add_argument("--subtitle", default="Hydrocert mobile · regression report")
    p.add_argument("--flows-dir", default="mobile-flows-v2",
                   help="Directory containing the Maestro YAML flows")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    summary_path = Path(args.summary_json)
    artifacts_dir = Path(args.artifacts_dir)
    output = Path(args.output)
    flows_dir = Path(args.flows_dir)

    if not HAS_PIL:
        print("WARNING: Pillow not installed - screenshots embedded unannotated",
              file=sys.stderr)

    if summary_path.is_file():
        summary = load_summary(summary_path)
    else:
        print(f"WARNING: summary JSON not found at {summary_path} - empty report",
              file=sys.stderr)
        summary = {"checks": [], "totals": {}}

    doc = build_html(summary, artifacts_dir, flows_dir, args.title, args.subtitle)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(doc, encoding="utf-8")
    print(f"HTML_PATH={output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
