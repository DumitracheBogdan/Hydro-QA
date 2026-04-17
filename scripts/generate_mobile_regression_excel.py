"""
Generate an Excel report for the mobile Maestro post-deploy regression workflow.

Consumes:
  - summary.json produced by scripts/run-mobile-v2-test.sh
  - Per-flow after.png screenshots under <artifacts>/test/screenshots/
  - Per-flow uiautomator XML dumps under <artifacts>/test/ui-dumps/
  - Per-flow maestro logs under <artifacts>/logs/ (or test/logs/)

Produces a workbook with a single sheet:
  Flow | Status | Error | Print-screen (annotated)

For failed flows, attempts to parse the selector text out of the Maestro error
line, find a matching node in the uiautomator dump, and draw a red circle +
numbered label on the after screenshot (reusing the pattern from
generate_detector_excel.py). If nothing matches, the raw after.png is embedded
instead — the script never crashes on missing pieces.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

from openpyxl import Workbook
from openpyxl.drawing.image import Image as XLImage
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

try:
    from PIL import Image as PILImage, ImageDraw, ImageFont
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

# Reuse the annotate helpers from the sibling detector script if importable.
sys.path.insert(0, str(Path(__file__).resolve().parent))
try:
    from generate_detector_excel import (  # type: ignore
        PALETTE,
        parse_bounds,
        crop_and_annotate,
        add_image_scaled,
    )
except Exception:
    # Fallback: copy minimal pieces so we don't hard-depend on the sibling.
    PALETTE = {
        'navy': '0F172A',
        'slate': '334155',
        'border': 'CBD5E1',
        'pass': '0F766E',
        'pass_bg': 'CCFBF1',
        'fail': 'B91C1C',
        'fail_bg': 'FEE2E2',
    }
    _BOUNDS_RE = re.compile(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]')

    def parse_bounds(s):  # type: ignore[override]
        m = _BOUNDS_RE.match(s or '')
        if not m:
            return None
        return int(m.group(1)), int(m.group(2)), int(m.group(3)), int(m.group(4))

    def crop_and_annotate(*args, **kwargs):  # type: ignore[override]
        return None

    def add_image_scaled(ws, path_str, anchor_cell, max_w=360, max_h=520):  # type: ignore[override]
        p = Path(path_str)
        if not p.exists():
            return
        try:
            img = XLImage(str(p))
        except Exception:
            return
        w, h = img.width, img.height
        ratio = min(max_w / max(w, 1), max_h / max(h, 1), 1)
        img.width = int(w * ratio)
        img.height = int(h * ratio)
        img.anchor = anchor_cell
        ws.add_image(img)


# Quoted-selector regex: e.g.  Element "Save" not found, or 'Save'
QUOTED_RE = re.compile(r'["\u201C\u201D\u2018\u2019\'`]([^"\u201C\u201D\u2018\u2019\'`]{1,120})["\u201C\u201D\u2018\u2019\'`]')


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description='Generate mobile regression Excel report.')
    p.add_argument('--summary-json', required=True, help='Path to summary.json from run-mobile-v2-test.sh')
    p.add_argument('--artifacts-dir', required=True, help='Path to qa-artifacts/mobile-v2')
    p.add_argument('--output', required=True, help='Output .xlsx path')
    p.add_argument('--title', default='Mobile Regression Report')
    return p.parse_args()


def load_summary(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception as exc:
        print(f'WARNING: failed to load summary {path}: {exc}', file=sys.stderr)
        return {'checks': [], 'totals': {}}


def find_log_line(log_path: Path) -> str:
    """Return the first line matching FAILED|Error|Assertion is false, or ''."""
    if not log_path.is_file():
        return ''
    try:
        text = log_path.read_text(encoding='utf-8', errors='replace')
    except Exception:
        return ''
    for line in text.splitlines():
        if re.search(r'FAILED|Assertion is false|Error', line, re.IGNORECASE):
            return line.strip()[:400]
    return ''


def extract_selector(error_line: str) -> str | None:
    """Best-effort: pull a quoted selector string out of the error line."""
    if not error_line:
        return None
    # Try all quoted substrings; prefer the longest plausible one.
    candidates = [c for c in QUOTED_RE.findall(error_line) if c.strip()]
    if not candidates:
        return None
    candidates.sort(key=len, reverse=True)
    return candidates[0].strip()


def find_node_bounds(xml_path: Path, selector: str) -> tuple[int, int, int, int] | None:
    """Search a uiautomator XML dump for a node whose text / content-desc matches."""
    if not xml_path.is_file() or not selector:
        return None
    try:
        tree = ET.parse(str(xml_path))
    except Exception as exc:
        print(f'WARNING: failed to parse {xml_path}: {exc}', file=sys.stderr)
        return None

    root = tree.getroot()
    needle = selector.lower()

    exact_attrs = ('text', 'content-desc', 'resource-id')
    # First pass: exact match
    for node in root.iter('node'):
        for attr in exact_attrs:
            v = node.attrib.get(attr, '')
            if v and v.lower() == needle:
                b = parse_bounds(node.attrib.get('bounds', ''))
                if b:
                    return b
    # Second pass: substring match
    for node in root.iter('node'):
        for attr in exact_attrs:
            v = node.attrib.get(attr, '')
            if v and needle in v.lower():
                b = parse_bounds(node.attrib.get('bounds', ''))
                if b:
                    return b
    return None


def resolve_log_path(artifacts_dir: Path, flow_name: str) -> Path:
    """Logs may be in artifacts/logs/ or artifacts/test/logs/ — try both."""
    candidates = [
        artifacts_dir / 'test' / 'logs' / f'{flow_name}.log',
        artifacts_dir / 'logs' / f'{flow_name}.log',
    ]
    for c in candidates:
        if c.is_file():
            return c
    return candidates[0]


def style_header_cell(cell):
    cell.fill = PatternFill('solid', fgColor=PALETTE['navy'])
    cell.font = Font(name='Aptos', bold=True, size=11, color='FFFFFF')
    cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)


def set_col_widths(ws, widths):
    for idx, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(idx)].width = w


def build_report(
    summary: dict,
    artifacts_dir: Path,
    output: Path,
    title: str,
) -> None:
    wb = Workbook()
    ws = wb.active
    ws.title = 'Mobile Regression'
    ws.sheet_view.showGridLines = False

    totals = summary.get('totals') or {}
    generated = summary.get('generatedAt', '')

    # Title bar
    ws.merge_cells('A1:D1')
    ws['A1'].value = title
    ws['A1'].fill = PatternFill('solid', fgColor=PALETTE['navy'])
    ws['A1'].font = Font(name='Aptos Display', bold=True, size=20, color='FFFFFF')
    ws['A1'].alignment = Alignment(horizontal='center', vertical='center')
    ws.row_dimensions[1].height = 36

    ws.merge_cells('A2:D2')
    sub = (
        f"Generated: {generated}  |  "
        f"Total: {totals.get('total', 0)}  |  "
        f"Pass: {totals.get('pass', 0)}  |  "
        f"Fail: {totals.get('fail', 0)}"
    )
    ws['A2'].value = sub
    ws['A2'].fill = PatternFill('solid', fgColor=PALETTE['slate'])
    ws['A2'].font = Font(name='Aptos', size=11, color='FFFFFF')
    ws['A2'].alignment = Alignment(horizontal='center', vertical='center')
    ws.row_dimensions[2].height = 22

    ws.row_dimensions[3].height = 6

    # Headers
    headers = ['Flow', 'Status', 'Error', 'Print-screen (annotated)']
    for i, h in enumerate(headers, start=1):
        style_header_cell(ws.cell(row=4, column=i, value=h))
    ws.row_dimensions[4].height = 24

    screenshots_dir = artifacts_dir / 'test' / 'screenshots'
    ui_dumps_dir = artifacts_dir / 'test' / 'ui-dumps'

    checks = summary.get('checks') or []

    with tempfile.TemporaryDirectory(prefix='mobile_excel_') as tmp_dir_str:
        tmp_dir = Path(tmp_dir_str)

        row = 5
        for check in checks:
            flow_name = check.get('id') or ''
            status_raw = (check.get('status') or '').upper()
            details = check.get('details') or ''

            ws.cell(row=row, column=1, value=flow_name)

            status_cell = ws.cell(row=row, column=2, value=status_raw)
            if status_raw == 'PASS':
                status_cell.fill = PatternFill('solid', fgColor=PALETTE['pass_bg'])
                status_cell.font = Font(name='Aptos', bold=True, color=PALETTE['pass'])
            else:
                status_cell.fill = PatternFill('solid', fgColor=PALETTE['fail_bg'])
                status_cell.font = Font(name='Aptos', bold=True, color=PALETTE['fail'])
            status_cell.alignment = Alignment(horizontal='center', vertical='center')

            # For failures, enrich error with the log line.
            error_text = details
            if status_raw != 'PASS':
                log_line = find_log_line(resolve_log_path(artifacts_dir, flow_name))
                if log_line and log_line not in error_text:
                    error_text = (error_text + '  |  ' + log_line).strip(' |')

            err_cell = ws.cell(row=row, column=3, value=error_text[:800])
            err_cell.alignment = Alignment(wrap_text=True, vertical='top')

            screenshot_path = screenshots_dir / f'{flow_name}-after.png'
            ws.row_dimensions[row].height = 320

            embed_path: Path | None = None

            if status_raw != 'PASS' and HAS_PIL and screenshot_path.is_file():
                try:
                    img = PILImage.open(screenshot_path)
                except Exception as exc:
                    print(f'WARNING: cannot open screenshot {screenshot_path}: {exc}', file=sys.stderr)
                    img = None

                bounds = None
                if img is not None:
                    selector = extract_selector(error_text)
                    if selector:
                        bounds = find_node_bounds(ui_dumps_dir / f'{flow_name}.xml', selector)

                if img is not None and bounds is not None:
                    x1, y1, x2, y2 = bounds
                    try:
                        annotated = crop_and_annotate(
                            img, x1, y1, x2, y2,
                            label=1,
                            tmp_dir=tmp_dir,
                            tag=f'{flow_name}_fail',
                        )
                        if annotated:
                            embed_path = annotated
                    except Exception as exc:
                        print(f'WARNING: annotate failed for {flow_name}: {exc}', file=sys.stderr)

                if embed_path is None:
                    # No matching node (or PIL disabled / annotate failed) — embed raw after.png
                    embed_path = screenshot_path
            elif status_raw == 'PASS' and screenshot_path.is_file():
                # Passing flow: embed the after.png as-is, no annotation needed.
                embed_path = screenshot_path

            if embed_path is not None:
                try:
                    add_image_scaled(ws, str(embed_path), f'D{row}', max_w=360, max_h=520)
                except Exception as exc:
                    print(f'WARNING: embed image failed for {flow_name}: {exc}', file=sys.stderr)

            row += 1

        set_col_widths(ws, [32, 12, 60, 50])

        output.parent.mkdir(parents=True, exist_ok=True)
        wb.save(str(output))


def main() -> int:
    args = parse_args()
    summary_path = Path(args.summary_json)
    artifacts_dir = Path(args.artifacts_dir)
    output = Path(args.output)

    if not HAS_PIL:
        print('WARNING: Pillow not installed — screenshots will be embedded unannotated', file=sys.stderr)

    if not summary_path.is_file():
        print(f'WARNING: summary JSON not found at {summary_path} — writing empty report', file=sys.stderr)
        summary = {'checks': [], 'totals': {}}
    else:
        summary = load_summary(summary_path)

    build_report(summary, artifacts_dir, output, args.title)
    print(f'EXCEL_PATH={output}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
