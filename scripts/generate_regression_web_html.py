"""
Generate a self-contained HTML report for the web post-deploy / full regression
bundle produced by scripts/run_regression_bundle.mjs.

Consumes combined-summary.json:
  {
    "generatedAt": "...", "environment": "dev", "mode": "standard",
    "totals": { "total", "pass", "fail", "skip" },
    "suiteRuns": [ { "suite", "label", "tests", "totals": {pass,fail,skip} } ],
    "checks":    [ { "suite", "id", "area", "status", "test", "details",
                     "evidence": [ "<path or basename>" ] } ]
  }

Produces one self-contained .html file (evidence screenshots inlined as base64,
no external assets) with:
  - a header + 4 metric cards (Total / Passed / Failed / Skipped),
  - a per-suite overview strip,
  - one collapsible <details> card per check, grouped by suite, showing the
    check id, name, area, status and the result detail; failed checks open by
    default and embed any failure screenshot.

Matches the mobile regression HTML report (generate_mobile_regression_html.py)
style. Renders in the viewer's light or dark theme and never crashes on a
missing screenshot or summary.
"""
from __future__ import annotations

import argparse
import base64
import html
import json
import sys
from pathlib import Path

_PILL = {"PASS": ("pass", "Passed"), "FAIL": ("fail", "Failed"),
         "SKIP": ("skip", "Skipped")}
_CARD_CLASS = {"PASS": "pass", "FAIL": "failed", "SKIP": "skip"}
_IMG_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
_MIME = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
         ".webp": "image/webp", ".gif": "image/gif"}


def logo_data_uri() -> str:
    """The TechQuarter logo as a base64 data URI, or '' if the asset is gone."""
    path = Path(__file__).resolve().parent / "assets" / "tq-logo.txt"
    try:
        return path.read_text(encoding="utf-8").strip()
    except Exception:
        return ""


def load_summary(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def evidence_data_uri(ev: str, output_dir: Path) -> str | None:
    """Resolve an evidence entry to a base64 image data URI, or None.

    The path in the JSON may be absolute (from the suite run) or a basename;
    suite artifacts are copied under <output_dir>/suites/. Try the literal path
    first, then a recursive basename match under the output dir."""
    try:
        p = Path(ev)
        if p.suffix.lower() not in _IMG_EXT:
            return None
        target = None
        if p.is_absolute() and p.is_file():
            target = p
        else:
            for found in output_dir.rglob(p.name):
                if found.is_file():
                    target = found
                    break
        if not target:
            return None
        mime = _MIME.get(target.suffix.lower(), "image/png")
        data = base64.b64encode(target.read_bytes()).decode()
        return f"data:{mime};base64,{data}"
    except Exception:
        return None


def _suites_in_order(summary: dict) -> list[dict]:
    """suiteRuns as given; if absent, synthesise from the checks."""
    runs = summary.get("suiteRuns") or []
    if runs:
        return runs
    seen: dict[str, dict] = {}
    for c in summary.get("checks") or []:
        sid = c.get("suite") or "suite"
        seen.setdefault(sid, {"suite": sid, "label": sid, "tests": 0,
                              "totals": {}})
    return list(seen.values())


def build_html(summary: dict, output_dir: Path, title: str, subtitle: str) -> str:
    checks = summary.get("checks") or []
    totals = summary.get("totals") or {}
    total = int(totals.get("total", len(checks)) or 0)
    passed = int(totals.get("pass", 0) or 0)
    failed = int(totals.get("fail", 0) or 0)
    skipped = int(totals.get("skip", 0) or 0)

    by_suite: dict[str, list[dict]] = {}
    for c in checks:
        by_suite.setdefault(c.get("suite") or "suite", []).append(c)

    suite_runs = _suites_in_order(summary)

    # Overview strip: one chip per suite with its pass/total count.
    strip = []
    for run in suite_runs:
        st = run.get("totals") or {}
        s_pass = int(st.get("pass", 0) or 0)
        s_fail = int(st.get("fail", 0) or 0)
        s_total = int(run.get("tests", 0) or (s_pass + s_fail + int(st.get("skip", 0) or 0)))
        cls = "bad" if s_fail else "good"
        strip.append(
            f'<span class="chip {cls}"><span class="ct">{html.escape(str(run.get("label") or run.get("suite")))}</span>'
            f'<span class="cn">{s_pass}/{s_total}</span></span>')
    strip_html = f'<div class="strip">{"".join(strip)}</div>' if strip else ""

    sections = []
    for run in suite_runs:
        sid = run.get("suite")
        rows = by_suite.get(sid, [])
        if not rows:
            continue
        cards = []
        for c in rows:
            st = (c.get("status") or "").upper()
            pill_cls, pill_txt = _PILL.get(st, ("skip", st or "Skipped"))
            card_cls = _CARD_CLASS.get(st, "skip")
            open_attr = " open" if st == "FAIL" else ""
            cid = html.escape(str(c.get("id") or "-"))
            area = html.escape(str(c.get("area") or ""))
            test = html.escape(str(c.get("test") or c.get("id") or ""))
            detail = html.escape(str(c.get("details") or "").strip())
            imgs = []
            for ev in (c.get("evidence") or []):
                uri = evidence_data_uri(str(ev), output_dir)
                if uri:
                    imgs.append(
                        f'<figure class="shot"><img loading="lazy" src="{uri}" '
                        f'alt="{cid} evidence"></figure>')
            shots = f'<div class="shots">{"".join(imgs)}</div>' if imgs else ""
            detail_html = (f'<div class="detail">{detail}</div>' if detail
                           else '<div class="detail muted">no detail reported</div>')
            area_tag = f'<span class="type">{area}</span>' if area else ""
            cards.append(f"""
        <details class="card {card_cls}"{open_attr}>
          <summary>
            <span class="fid">{cid}</span>
            <span class="ctitle">{test}</span>
            {area_tag}
            <span class="pill {pill_cls}">{html.escape(pill_txt)}</span>
          </summary>
          <div class="card-body">
            {detail_html}
            {shots}
          </div>
        </details>""")
        st = run.get("totals") or {}
        counts = (f'{int(st.get("pass", 0) or 0)} passed'
                  + (f' · {int(st.get("fail", 0) or 0)} failed' if int(st.get("fail", 0) or 0) else "")
                  + (f' · {int(st.get("skip", 0) or 0)} skipped' if int(st.get("skip", 0) or 0) else ""))
        sections.append(f"""
      <section class="cat">
        <div class="cat-head"><h2>{html.escape(str(run.get("label") or sid))}</h2>
          <span class="cat-count">{counts}</span></div>
        {''.join(cards)}
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
    {strip_html}
    {''.join(sections)}
  </main>
</div>
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
.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:26px 0 26px}
.m{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:22px 24px}
.m b{display:block;font-size:42px;font-weight:700;letter-spacing:-.02em;line-height:1;color:var(--ink)}
.m span{display:block;margin-top:9px;font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.07em}
.m.pass b{color:var(--ok)} .m.fail b{color:var(--fail)} .m.skip b{color:var(--warn)}
@media(max-width:600px){.metrics{grid-template-columns:repeat(2,1fr)}}
.strip{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:26px}
.chip{display:inline-flex;align-items:center;gap:8px;background:var(--surface);border:1px solid var(--line);
  border-radius:100px;padding:6px 6px 6px 13px;font-size:12.5px;color:var(--muted)}
.chip .ct{font-weight:600;color:var(--ink)}
.chip .cn{font-size:11px;font-weight:700;padding:2px 9px;border-radius:100px}
.chip.good .cn{color:var(--ok);background:var(--ok-bg)}
.chip.bad .cn{color:var(--fail);background:var(--fail-bg)}
.cat{margin-top:34px}
.cat-head{display:flex;align-items:baseline;gap:12px;padding-bottom:10px;margin-bottom:14px;border-bottom:2px solid var(--line)}
.cat-head h2{font-size:18px;font-weight:670;letter-spacing:-.01em;margin:0}
.cat-count{font-size:12px;color:var(--muted);font-weight:600}
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
.fid{font-family:"Cascadia Code","Consolas",ui-monospace,monospace;font-size:12px;font-weight:600;
  color:var(--accent);background:var(--accent-soft);padding:2px 8px;border-radius:6px;flex:none}
.pill{font-size:11px;font-weight:700;padding:3px 11px;border-radius:100px;letter-spacing:.02em;white-space:nowrap;flex:none}
.pill.fail{color:var(--fail);background:var(--fail-bg)}
.pill.skip{color:var(--warn);background:var(--warn-bg)}
.pill.pass{color:var(--ok);background:var(--ok-bg)}
.card-body{padding:14px 18px 18px;border-top:1px solid var(--line)}
.detail{font-family:"Cascadia Code","Consolas",ui-monospace,monospace;font-size:12.5px;line-height:1.7;
  color:var(--ink);white-space:pre-wrap;word-break:break-word;overflow-x:auto}
.detail.muted{color:var(--muted)}
.shots{display:flex;flex-wrap:wrap;gap:12px;margin-top:14px}
.shot{margin:0}
.shot img{max-width:280px;width:100%;border-radius:10px;border:1px solid var(--line)}
</style>
"""


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Generate web regression HTML report.")
    p.add_argument("--combined-json", required=True,
                   help="Path to combined-summary.json from run_regression_bundle.mjs")
    p.add_argument("--output", required=True, help="Output .html path")
    p.add_argument("--title", default="Web Regression Report")
    p.add_argument("--subtitle", default="Hydrocert web · regression report")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    summary_path = Path(args.combined_json)
    output = Path(args.output)

    if summary_path.is_file():
        summary = load_summary(summary_path)
    else:
        print(f"WARNING: combined JSON not found at {summary_path} - empty report",
              file=sys.stderr)
        summary = {"checks": [], "totals": {}, "suiteRuns": []}

    output_dir = summary_path.resolve().parent
    doc = build_html(summary, output_dir, args.title, args.subtitle)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(doc, encoding="utf-8")
    print(f"HTML_PATH={output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
