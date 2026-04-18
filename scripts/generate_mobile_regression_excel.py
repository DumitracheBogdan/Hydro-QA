"""
Generate an Excel report for the mobile Maestro post-deploy regression workflow.

Consumes:
  - summary.json produced by scripts/run-mobile-v2-test.sh
  - Per-flow after.png screenshots under <artifacts>/test/screenshots/
  - Per-flow uiautomator XML dumps under <artifacts>/test/ui-dumps/
  - Per-flow maestro logs under <artifacts>/logs/ (or test/logs/)

Produces a workbook with TWO sheets modeled on generate_detector_excel.py:

  Sheet 1 "Summary" — title banner, subtitle, 4 metric cards (Total / Passed /
  Failed / Skipped), and a per-flow table (Flow | Status | Duration | Error |
  Detail). The Detail column is a cross-sheet hyperlink to the matching row on
  the Details sheet.

  Sheet 2 "Details" — per-flow rich view with the current annotated-screenshot
  layout (Flow | Status | Error | Print-screen (annotated)).

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
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

try:
    from PIL import Image as PILImage, ImageDraw, ImageFont
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

# Reuse the annotate + styling helpers from the sibling detector script if importable.
sys.path.insert(0, str(Path(__file__).resolve().parent))
try:
    from generate_detector_excel import (  # type: ignore
        PALETTE,
        parse_bounds,
        crop_and_annotate,
        add_image_scaled,
        card as _detector_card,
        style_header as _detector_style_header,
    )
    _HAS_DETECTOR_HELPERS = True
except Exception:
    _HAS_DETECTOR_HELPERS = False
    # Fallback: copy minimal pieces so we don't hard-depend on the sibling.
    PALETTE = {
        'navy': '0F172A',
        'slate': '334155',
        'muted': '64748B',
        'border': 'CBD5E1',
        'pass': '0F766E',
        'pass_bg': 'CCFBF1',
        'fail': 'B91C1C',
        'fail_bg': 'FEE2E2',
        'skip': '92400E',
        'skip_bg': 'FEF3C7',
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


# ---------------------------------------------------------------------------
# Local styling helpers (fallback if the detector helpers weren't importable)
# ---------------------------------------------------------------------------

def style_header(cell, fill='navy'):
    """Navy header style — delegates to the detector helper when available."""
    if _HAS_DETECTOR_HELPERS:
        return _detector_style_header(cell, fill=fill)
    cell.fill = PatternFill('solid', fgColor=PALETTE[fill])
    cell.font = Font(name='Aptos', bold=True, size=11, color='FFFFFF')
    cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)


def card(ws, cell_range, title, value, fill_color, value_color='FFFFFF'):
    """Metric card — delegates to the detector helper when available."""
    if _HAS_DETECTOR_HELPERS:
        return _detector_card(ws, cell_range, title, value, fill_color, value_color=value_color)
    ws.merge_cells(cell_range)
    cell = ws[cell_range.split(':')[0]]
    cell.value = f'{title}\n{value}'
    cell.fill = PatternFill('solid', fgColor=fill_color)
    cell.font = Font(name='Aptos', bold=True, size=17, color=value_color)
    cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
    thin = Side(style='thin', color=PALETTE.get('border', 'CBD5E1'))
    for row in ws[cell_range]:
        for item in row:
            item.border = Border(left=thin, right=thin, top=thin, bottom=thin)


def set_col_widths(ws, widths):
    for idx, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(idx)].width = w


# Quoted-selector regex: e.g.  Element "Save" not found, or 'Save'
QUOTED_RE = re.compile(r'["\u201C\u201D\u2018\u2019\'`]([^"\u201C\u201D\u2018\u2019\'`]{1,120})["\u201C\u201D\u2018\u2019\'`]')


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description='Generate mobile regression Excel report.')
    p.add_argument('--summary-json', required=True, help='Path to summary.json from run-mobile-v2-test.sh')
    p.add_argument('--artifacts-dir', required=True, help='Path to qa-artifacts/mobile-v2')
    p.add_argument('--output', required=True, help='Output .xlsx path')
    p.add_argument('--title', default='Mobile Regression Report')
    p.add_argument('--subtitle', default='')
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


def _status_colors(status_raw: str) -> tuple[str, str]:
    """Return (bg_fill, font_color) for a status cell."""
    if status_raw == 'PASS':
        return PALETTE['pass_bg'], PALETTE['pass']
    if status_raw == 'SKIP':
        return PALETTE.get('skip_bg', 'FEF3C7'), PALETTE.get('skip', '92400E')
    return PALETTE['fail_bg'], PALETTE['fail']


# ===================================================================
# Sheet 1: Summary
# ===================================================================

def build_summary_sheet(ws, summary: dict, title: str, subtitle: str) -> None:
    """Title banner + 4 metric cards + per-flow table with cross-sheet links."""
    ws.sheet_view.showGridLines = False
    ws.sheet_view.zoomScale = 90

    totals = summary.get('totals') or {}
    generated = summary.get('generatedAt', '')
    total = int(totals.get('total', 0) or 0)
    passed = int(totals.get('pass', 0) or 0)
    failed = int(totals.get('fail', 0) or 0)
    skipped = int(totals.get('skip', 0) or 0)

    # Row 1: Title banner
    ws.merge_cells('A1:H1')
    ws['A1'].value = title
    ws['A1'].fill = PatternFill('solid', fgColor=PALETTE['navy'])
    ws['A1'].font = Font(name='Aptos Display', bold=True, size=22, color='FFFFFF')
    ws['A1'].alignment = Alignment(horizontal='center', vertical='center')
    ws.row_dimensions[1].height = 42

    # Row 2: Subtitle
    sub_text = subtitle if subtitle else f'Generated: {generated}'
    ws.merge_cells('A2:H2')
    ws['A2'].value = sub_text
    ws['A2'].fill = PatternFill('solid', fgColor=PALETTE['slate'])
    ws['A2'].font = Font(name='Aptos', size=12, color='FFFFFF')
    ws['A2'].alignment = Alignment(horizontal='center', vertical='center')
    ws.row_dimensions[2].height = 28

    # Row 3: spacer
    ws.row_dimensions[3].height = 8

    # Rows 4-5: Metric cards
    ws.row_dimensions[4].height = 52
    ws.row_dimensions[5].height = 52
    card(ws, 'A4:B5', 'Total',   total,   PALETTE['slate'])
    card(ws, 'C4:D5', 'Passed',  passed,  PALETTE['pass'])
    card(ws, 'E4:F5', 'Failed',  failed,  PALETTE['fail'])
    card(ws, 'G4:H5', 'Skipped', skipped, PALETTE.get('skip', '92400E'), value_color='000000')

    # Rows 6-7: spacers
    ws.row_dimensions[6].height = 8
    ws.row_dimensions[7].height = 8

    # Row 8: table headers
    headers = ['Flow', 'Status', 'Duration', 'Error', 'Detail']
    for i, h in enumerate(headers, start=1):
        style_header(ws.cell(row=8, column=i, value=h))
    ws.row_dimensions[8].height = 24

    # Row 9+: one row per check. Details sheet will have the same order
    # starting at row 2 (row 1 = headers), so details_row = 2 + index.
    checks = summary.get('checks') or []
    row = 9
    for idx, check in enumerate(checks):
        flow_name = check.get('id') or ''
        status_raw = (check.get('status') or '').upper()
        duration = check.get('duration', '') or check.get('durationMs', '') or ''
        details = check.get('details') or ''

        ws.cell(row=row, column=1, value=flow_name)

        sc = ws.cell(row=row, column=2, value=status_raw)
        bg, fg = _status_colors(status_raw)
        sc.fill = PatternFill('solid', fgColor=bg)
        sc.font = Font(name='Aptos', bold=True, color=fg)
        sc.alignment = Alignment(horizontal='center', vertical='center')

        ws.cell(row=row, column=3, value=duration if duration != '' else None)

        err_cell = ws.cell(row=row, column=4, value=details[:80])
        err_cell.alignment = Alignment(wrap_text=True, vertical='top')

        link_cell = ws.cell(row=row, column=5, value='See Details')
        details_target_row = 2 + idx  # headers on row 1
        link_cell.hyperlink = f"#'Details'!A{details_target_row}"
        link_cell.font = Font(name='Aptos', color='1D4ED8', underline='single')
        link_cell.alignment = Alignment(horizontal='center', vertical='center')

        row += 1

    set_col_widths(ws, [28, 10, 12, 55, 15])

    # Freeze header + left column
    ws.freeze_panes = 'B9'


# ===================================================================
# Sheet 2: Details
# ===================================================================

def build_details_sheet(
    ws,
    summary: dict,
    artifacts_dir: Path,
    tmp_dir: Path,
) -> None:
    """Per-flow rich view: Flow | Status | Error | Print-screen (annotated)."""
    ws.sheet_view.showGridLines = False

    # Row 1: headers (no title banner, Summary sheet already has it)
    headers = ['Flow', 'Status', 'Error', 'Print-screen (annotated)']
    for i, h in enumerate(headers, start=1):
        style_header(ws.cell(row=1, column=i, value=h))
    ws.row_dimensions[1].height = 24

    screenshots_dir = artifacts_dir / 'test' / 'screenshots'
    ui_dumps_dir = artifacts_dir / 'test' / 'ui-dumps'

    checks = summary.get('checks') or []

    row = 2
    for check in checks:
        flow_name = check.get('id') or ''
        status_raw = (check.get('status') or '').upper()
        details = check.get('details') or ''

        ws.cell(row=row, column=1, value=flow_name)

        status_cell = ws.cell(row=row, column=2, value=status_raw)
        bg, fg = _status_colors(status_raw)
        status_cell.fill = PatternFill('solid', fgColor=bg)
        status_cell.font = Font(name='Aptos', bold=True, color=fg)
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
    ws.freeze_panes = 'A2'


# ===================================================================
# Build + entrypoint
# ===================================================================

def build_report(
    summary: dict,
    artifacts_dir: Path,
    output: Path,
    title: str,
    subtitle: str,
) -> None:
    wb = Workbook()

    with tempfile.TemporaryDirectory(prefix='mobile_excel_') as tmp_dir_str:
        tmp_dir = Path(tmp_dir_str)

        # Sheet 1: Summary
        ws_summary = wb.active
        ws_summary.title = 'Summary'
        build_summary_sheet(ws_summary, summary, title, subtitle)

        # Sheet 2: Details
        ws_details = wb.create_sheet(title='Details')
        build_details_sheet(ws_details, summary, artifacts_dir, tmp_dir)

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

    build_report(summary, artifacts_dir, output, args.title, args.subtitle)
    print(f'EXCEL_PATH={output}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
