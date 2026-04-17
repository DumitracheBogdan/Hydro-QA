from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import Table, TableStyleInfo

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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description='Generate UI Change Detector Mobile Excel report from scan results.',
    )
    parser.add_argument('--scan-json', required=True, help='Path to scan_results JSON file')
    parser.add_argument('--output', required=True, help='Path for the output .xlsx file')
    parser.add_argument('--title', default='UI Change Detector Mobile')
    parser.add_argument('--subtitle', default='')
    return parser.parse_args()


def autosize(ws, min_width=12, max_width=58):
    for col_cells in ws.columns:
        col_letter = get_column_letter(col_cells[0].column)
        max_len = 0
        for cell in col_cells:
            value = '' if cell.value is None else str(cell.value)
            if '\n' in value:
                value = max(value.splitlines(), key=len)
            max_len = max(max_len, len(value))
        ws.column_dimensions[col_letter].width = max(min_width, min(max_width, max_len + 2))


def style_header(cell, fill='navy', size=11, color='FFFFFF'):
    cell.fill = PatternFill('solid', fgColor=PALETTE[fill])
    cell.font = Font(name='Aptos', bold=True, size=size, color=color)
    cell.alignment = Alignment(horizontal='center', vertical='center')


def card(ws, cell_range, title, value, fill_color, value_color='FFFFFF'):
    ws.merge_cells(cell_range)
    cell = ws[cell_range.split(':')[0]]
    cell.value = f'{title}\n{value}'
    cell.fill = PatternFill('solid', fgColor=fill_color)
    cell.font = Font(name='Aptos', bold=True, size=17, color=value_color)
    cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
    thin = Side(style='thin', color=PALETTE['border'])
    for row in ws[cell_range]:
        for item in row:
            item.border = Border(left=thin, right=thin, top=thin, bottom=thin)


def add_table(ws, start_row, end_row, end_col, table_name):
    ref = f'A{start_row}:{get_column_letter(end_col)}{end_row}'
    table = Table(displayName=table_name, ref=ref)
    table.tableStyleInfo = TableStyleInfo(
        name='TableStyleMedium2',
        showFirstColumn=False,
        showLastColumn=False,
        showRowStripes=True,
        showColumnStripes=False,
    )
    ws.add_table(table)


def load_scan(path: Path) -> dict:
    return json.loads(path.read_text(encoding='utf-8'))


def status_fill(status: str):
    if status == 'PASS':
        return PatternFill('solid', fgColor=PALETTE['pass_bg'])
    return PatternFill('solid', fgColor=PALETTE['fail_bg'])


def status_font(status: str):
    color = PALETTE['pass'] if status == 'PASS' else PALETTE['fail']
    return Font(name='Aptos', bold=True, size=11, color=color)


def apply_status_style(cell, status: str):
    cell.fill = status_fill(status)
    cell.font = status_font(status)
    cell.alignment = Alignment(horizontal='center', vertical='center')


def build_summary_sheet(ws, data: dict, title: str, subtitle: str):
    screens = data.get('screens', {})
    summary = data.get('summary', {})
    scan_ts = data.get('scan_timestamp', '')

    screens_scanned = summary.get('screens_scanned', len(screens))
    total_new = summary.get('total_new_elements', 0)

    passed = sum(1 for s in screens.values() if s.get('new_element_count', 0) == 0)
    failed = screens_scanned - passed

    # Title row
    ws.merge_cells('A1:H1')
    title_cell = ws['A1']
    title_cell.value = title
    title_cell.fill = PatternFill('solid', fgColor=PALETTE['navy'])
    title_cell.font = Font(name='Aptos Display', bold=True, size=22, color='FFFFFF')
    title_cell.alignment = Alignment(horizontal='center', vertical='center')
    ws.row_dimensions[1].height = 42

    # Subtitle row
    sub_text = subtitle if subtitle else f'Scan: {scan_ts}'
    ws.merge_cells('A2:H2')
    sub_cell = ws['A2']
    sub_cell.value = sub_text
    sub_cell.fill = PatternFill('solid', fgColor=PALETTE['slate'])
    sub_cell.font = Font(name='Aptos', size=12, color='FFFFFF')
    sub_cell.alignment = Alignment(horizontal='center', vertical='center')
    ws.row_dimensions[2].height = 28

    # Row 3 spacer
    ws.row_dimensions[3].height = 8

    # Metric cards in row 4-5
    ws.row_dimensions[4].height = 52
    ws.row_dimensions[5].height = 52

    card(ws, 'A4:B5', 'Screens Scanned', screens_scanned, PALETTE['slate'])
    card(ws, 'C4:D5', 'Passed Screens', passed, PALETTE['pass'])
    card(ws, 'E4:F5', 'Failed Screens', failed, PALETTE['fail'])
    card(ws, 'G4:H5', 'New Elements', total_new, PALETTE['skip'], value_color='000000')

    # Row 6-7 spacer
    ws.row_dimensions[6].height = 8
    ws.row_dimensions[7].height = 8

    # Label row
    ws['A8'].value = 'Screen Summary'
    ws['A8'].font = Font(name='Aptos', bold=True, size=13, color=PALETTE['navy'])
    ws.row_dimensions[8].height = 24

    # Table header at row 9
    headers = ['Screen ID', 'Status', 'Baseline Elements', 'New Elements', 'New Element Details']
    for col_idx, header in enumerate(headers, start=1):
        cell = ws.cell(row=9, column=col_idx, value=header)
        style_header(cell)
    ws.row_dimensions[9].height = 24

    # Table data starting row 10
    row = 10
    for screen_id in sorted(screens.keys()):
        screen = screens[screen_id]
        new_count = screen.get('new_element_count', 0)
        status = 'PASS' if new_count == 0 else 'FAIL'
        baseline_count = screen.get('baseline_element_count', '')

        # Build detail summary
        details = ''
        if new_count > 0:
            parts = []
            for elem in screen.get('new_elements', []):
                text = elem.get('text', '')
                desc = elem.get('content_desc', '')
                rid = elem.get('resource_id', '')
                label = text or desc or rid or elem.get('class', '')
                parts.append(label)
            details = '; '.join(parts) if parts else f'{new_count} new element(s)'

        ws.cell(row=row, column=1, value=screen_id)
        status_cell = ws.cell(row=row, column=2, value=status)
        apply_status_style(status_cell, status)
        ws.cell(row=row, column=3, value=baseline_count)
        ws.cell(row=row, column=4, value=new_count)
        ws.cell(row=row, column=5, value=details)

        row += 1

    # Add table if we have data
    if row > 10:
        add_table(ws, 9, row - 1, len(headers), 'ScreenSummary')

    # Sheet settings
    ws.sheet_properties.tabColor = '3B82F6'
    ws.sheet_view.showGridLines = False
    ws.sheet_view.zoomScale = 90

    autosize(ws)


def build_all_screens_sheet(ws, data: dict):
    screens = data.get('screens', {})

    headers = ['#', 'Screen ID', 'Status', 'New Count', 'Element Text',
               'Content Desc', 'Resource ID', 'Class', 'Bounds']

    for col_idx, header in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        style_header(cell)

    row = 2
    seq = 0
    for screen_id in sorted(screens.keys()):
        screen = screens[screen_id]
        new_count = screen.get('new_element_count', 0)
        status = 'PASS' if new_count == 0 else 'FAIL'
        new_elements = screen.get('new_elements', [])

        if new_count == 0 or not new_elements:
            seq += 1
            ws.cell(row=row, column=1, value=seq)
            ws.cell(row=row, column=2, value=screen_id)
            sc = ws.cell(row=row, column=3, value=status)
            apply_status_style(sc, status)
            ws.cell(row=row, column=4, value=new_count)
            for c in range(5, 10):
                ws.cell(row=row, column=c, value='')
            row += 1
        else:
            for elem in new_elements:
                seq += 1
                ws.cell(row=row, column=1, value=seq)
                ws.cell(row=row, column=2, value=screen_id)
                sc = ws.cell(row=row, column=3, value=status)
                apply_status_style(sc, status)
                ws.cell(row=row, column=4, value=new_count)
                ws.cell(row=row, column=5, value=elem.get('text', ''))
                ws.cell(row=row, column=6, value=elem.get('content_desc', ''))
                ws.cell(row=row, column=7, value=elem.get('resource_id', ''))
                ws.cell(row=row, column=8, value=elem.get('class', ''))
                ws.cell(row=row, column=9, value=elem.get('bounds', ''))
                row += 1

    if row > 2:
        add_table(ws, 1, row - 1, len(headers), 'AllScreens')

    ws.freeze_panes = 'A2'
    ws.sheet_properties.tabColor = '14B8A6'

    autosize(ws)


def build_new_elements_sheet(ws, data: dict):
    screens = data.get('screens', {})

    headers = ['Screen ID', 'Element Text', 'Content Desc', 'Resource ID', 'Class', 'Bounds']

    for col_idx, header in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        style_header(cell)

    row = 2
    has_new = False
    for screen_id in sorted(screens.keys()):
        screen = screens[screen_id]
        new_elements = screen.get('new_elements', [])
        if not new_elements:
            continue
        has_new = True
        for elem in new_elements:
            ws.cell(row=row, column=1, value=screen_id)
            ws.cell(row=row, column=2, value=elem.get('text', ''))
            ws.cell(row=row, column=3, value=elem.get('content_desc', ''))
            ws.cell(row=row, column=4, value=elem.get('resource_id', ''))
            ws.cell(row=row, column=5, value=elem.get('class', ''))
            ws.cell(row=row, column=6, value=elem.get('bounds', ''))
            row += 1

    if not has_new:
        ws.cell(row=2, column=1, value='No new elements detected - all screens match baseline')
        ws.merge_cells(f'A2:{get_column_letter(len(headers))}2')
        ws['A2'].font = Font(name='Aptos', size=12, color=PALETTE['pass'])
        ws['A2'].alignment = Alignment(horizontal='center', vertical='center')

    if row > 2:
        add_table(ws, 1, row - 1, len(headers), 'NewElements')

    ws.sheet_properties.tabColor = 'EF4444'

    autosize(ws)


def main():
    args = parse_args()
    scan_path = Path(args.scan_json)
    output_path = Path(args.output)

    data = load_scan(scan_path)

    wb = Workbook()

    # Sheet 1: Summary
    ws_summary = wb.active
    ws_summary.title = 'Summary'
    build_summary_sheet(ws_summary, data, args.title, args.subtitle)

    # Sheet 2: All Screens
    ws_all = wb.create_sheet('All Screens')
    build_all_screens_sheet(ws_all, data)

    # Sheet 3: New Elements
    ws_new = wb.create_sheet('New Elements')
    build_new_elements_sheet(ws_new, data)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(str(output_path))

    print(f'EXCEL_PATH={output_path}')
    sys.exit(0)


if __name__ == '__main__':
    main()
