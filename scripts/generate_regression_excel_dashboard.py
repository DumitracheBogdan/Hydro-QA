from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
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

DEFAULT_ROOT = Path(r'c:\work\QA TRacker')
DEFAULT_COMBINED_JSON = DEFAULT_ROOT / 'qa-artifacts' / 'infra-regression' / 'tmp-combined-184-doublecheck.json'
DEFAULT_OUTPUT = DEFAULT_ROOT / 'qa-artifacts' / 'infra-regression' / 'Hydrocert_DEV_Regression_Dashboard_2026-03-06.xlsx'


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Generate Hydrocert regression Excel dashboard.')
    parser.add_argument('--combined-json', default=str(DEFAULT_COMBINED_JSON))
    parser.add_argument('--output', default=str(DEFAULT_OUTPUT))
    parser.add_argument('--title', default='Hydrocert DEV Regression Dashboard')
    parser.add_argument('--subtitle', default='Generated from combined regression summary')
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


def style_table_header_row(ws, row_idx, fill='navy'):
    for cell in ws[row_idx]:
        style_header(cell, fill=fill)


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


def load_summary(path: Path) -> dict:
    return json.loads(path.read_text(encoding='utf-8'))


def unique_preserve_order(values):
    seen = set()
    result = []
    for value in values:
        if not value or value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def extract_paths(*texts):
    import re

    matches = []
    pattern = re.compile(r'(/[a-zA-Z0-9][a-zA-Z0-9\-._~/%?=&:]*)(?=\s|$|,|\)|\|)')
    for text in texts:
        if not text:
            continue
        matches.extend(match.group(1) for match in pattern.finditer(str(text)))
    return unique_preserve_order(matches)


def endpoint_hint(check: dict) -> str:
    text = ' '.join([
        str(check.get('suite', '')),
        str(check.get('area', '')),
        str(check.get('test', '')),
        str(check.get('details', '')),
    ]).lower()
    paths = extract_paths(check.get('test', ''), check.get('details', ''))
    if paths:
        return ', '.join(paths[:3])

    hints = [
        ('/api and /api-json', ['swagger', 'openapi', 'docs']),
        ('/auth/register', ['self-registration', 'register']),
        ('/auth/login', ['login']),
        ('/users/profile/me', ['profile']),
        ('/users', ['users endpoint']),
        ('/customers/filtered?page=1&limit=20', ['customers filtered', 'customers page', 'customer']),
        ('/customers', ['create customer', 'delete customer']),
        ('/visits/calendar-filter', ['calendar filter', 'visits filter', 'own visits', 'visit']),
        ('/users/absences', ['absences']),
        ('/activity-logs', ['activity logs']),
        ('/products', ['products']),
        ('/sample-types', ['sample types']),
        ('/labs', ['labs']),
        ('/job-types', ['job types']),
        ('/skills', ['skills']),
        ('/sites', ['sites']),
        ('/contracts', ['contracts']),
        ('/health', ['health']),
        ('/dashboard', ['dashboard']),
        ('/planner', ['planner']),
        ('/visits-list', ['visits list']),
        ('/visits/addnewvisit', ['add new visit']),
        ('/visits', ['visits']),
        ('/settings', ['settings']),
        ('/team-management', ['team management']),
        ('/schedule', ['schedule']),
        ('/', ['web root', 'root']),
    ]
    for endpoint, keywords in hints:
        if any(keyword in text for keyword in keywords):
            return endpoint
    return ''


def build_steps(check: dict) -> str:
    existing = check.get('steps')
    if isinstance(existing, list) and existing:
        return '\n'.join(f'{idx}. {step}' for idx, step in enumerate(existing, start=1))
    if isinstance(existing, str) and existing.strip():
        return existing.strip()

    suite = str(check.get('suite', '')).lower()
    area = str(check.get('area', '')).lower()
    test = str(check.get('test', ''))
    test_lc = test.lower()
    endpoint = endpoint_hint(check)

    def lines(*items):
        return '\n'.join(f'{idx}. {item}' for idx, item in enumerate(items, start=1))

    if 'swagger docs and anonymous self-registration' in test_lc:
        return lines(
            'Open the API documentation endpoints without authentication.',
            'Open `/api` and `/api-json`, then call `POST /auth/register` without prior login.',
            'Check whether docs or self-registration are still accessible to anonymous users.',
        )

    if 'create or delete customers' in test_lc:
        return lines(
            'Log in with a `user` role account and keep the bearer token.',
            'Call `POST /customers` with a unique test name, then call `DELETE /customers/{id}` if creation succeeds.',
            'Verify that both actions are blocked for the `user` role.',
        )

    if 'only sees own visits' in test_lc:
        return lines(
            'Log in with a `user` role account and keep the bearer token.',
            'Call `GET /visits/calendar-filter` for a date range that returns data.',
            'Verify that the response contains only visits assigned to the logged-in user.',
        )

    if 'team absences' in test_lc:
        return lines(
            'Log in with a `user` role account and keep the bearer token.',
            'Call `GET /users/absences` for a date range with known absence records.',
            'Verify that the response does not expose absence data for other employees.',
        )

    if 'activity logs' in test_lc:
        return lines(
            'Log in with a `user` role account and keep the bearer token.',
            'Call `GET /activity-logs`.',
            'Verify that access is denied or limited according to the expected role permissions.',
        )

    if 'global reference data' in test_lc:
        return lines(
            'Log in with a `user` role account and keep the bearer token.',
            'Call the shared reference endpoints such as `/sites`, `/products`, `/job-types`, `/skills`, and `/contracts`.',
            'Verify that the `user` role cannot read global reference data unless explicitly allowed.',
        )

    if any(keyword in test_lc for keyword in ['without token', 'anonymous']):
        return lines(
            f'Call `{endpoint or "the target endpoint"}` without an `Authorization` header.',
            'Observe the response status and payload.',
            f'Verify that the result matches the expectation: {test}.',
        )

    if any(keyword in test_lc for keyword in ['invalid token', 'tampered token']):
        return lines(
            'Authenticate first and capture a valid bearer token.',
            f'Call `{endpoint or "the target endpoint"}` with an invalid or modified token.',
            f'Verify that the result matches the expectation: {test}.',
        )

    if 'valid login' in test_lc or ('login' in test_lc and 'invalid' not in test_lc):
        return lines(
            'Open the API client used for regression.',
            'Call `POST /auth/login` with the QA credentials used by the pipeline.',
            f'Verify that the result matches the expectation: {test}.',
        )

    if 'invalid login' in test_lc:
        return lines(
            'Open the API client used for regression.',
            'Call `POST /auth/login` with the QA email and an invalid password.',
            f'Verify that the result matches the expectation: {test}.',
        )

    if 'burst' in test_lc or 'p95' in test_lc or 'avg <=' in test_lc or 'avg <' in test_lc or 'load' in area or 'perf' in area:
        return lines(
            f'Authenticate if required, then target `{endpoint or "the endpoint under test"}`.',
            'Repeat the request with the sequence or concurrency described in the test name.',
            'Measure latency or failures and compare the result with the threshold in the test.',
        )

    if any(keyword in suite for keyword in ['api', 'roleaccess']) or any(keyword in area for keyword in ['api', 'auth', 'access control', 'security']):
        auth_step = 'Authenticate with the QA account if the endpoint requires a bearer token.'
        if 'public' in test_lc or 'http' in test_lc or 'tls' in test_lc or 'dns' in test_lc:
            auth_step = 'No login is required unless the endpoint is protected.'
        return lines(
            auth_step,
            f'Call `{endpoint or "the endpoint used by the check"}` with the same query or payload used by automation.',
            f'Compare the response to the expected result from the test: {test}.',
        )

    if 'ui' in suite or 'web' in area:
        route = endpoint or 'the target page'
        return lines(
            'Open the web app with the same environment used in the regression run.',
            f'Log in if needed, then navigate to `{route}`.',
            f'Perform the action described in the test and compare the actual result with: {test}.',
        )

    return lines(
        'Open the same environment that was used by the regression run.',
        'Repeat the action described in the test name using the same page or endpoint as the automation.',
        f'Compare the actual result with the expected behavior from the test: {test}.',
    )


def build_workbook(summary: dict, output_path: Path, title: str, subtitle: str):
    checks = [{**check, 'steps_to_reproduce': build_steps(check)} for check in summary['checks']]
    totals = Counter(check['status'] for check in checks)
    suite_stats: dict[str, Counter] = defaultdict(Counter)

    for check in checks:
        suite_stats[check['suite']][check['status']] += 1
        suite_stats[check['suite']]['TOTAL'] += 1

    failed_rows = [check for check in checks if check['status'] == 'FAIL']
    suite_order = [suite['suite'] for suite in summary.get('suiteRuns', [])] or sorted(suite_stats.keys())

    wb = Workbook()
    wb.properties.creator = 'Codex'
    wb.properties.title = title
    wb.properties.subject = 'Hydrocert regression report'
    wb.properties.description = subtitle

    dashboard = wb.active
    dashboard.title = 'Dashboard'
    dashboard.sheet_view.showGridLines = False
    dashboard.sheet_properties.tabColor = '2563EB'

    dashboard['A1'] = title
    dashboard['A2'] = f"{subtitle} | Generated {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    dashboard['A1'].font = Font(name='Aptos Display', bold=True, size=22, color='FFFFFF')
    dashboard['A2'].font = Font(name='Aptos', italic=True, size=10, color='E2E8F0')
    dashboard.merge_cells('A1:H1')
    dashboard.merge_cells('A2:H2')
    for row in ('A1:H1', 'A2:H2'):
        for cells in dashboard[row]:
            for cell in cells:
                cell.fill = PatternFill('solid', fgColor=PALETTE['navy'])

    card(dashboard, 'A4:B6', 'Total Tests', len(checks), PALETTE['slate'])
    card(dashboard, 'C4:D6', 'Passed', totals['PASS'], PALETTE['pass'])
    card(dashboard, 'E4:F6', 'Failed', totals['FAIL'], PALETTE['fail'])
    card(dashboard, 'G4:H6', 'Skipped', totals['SKIP'], PALETTE['skip'])

    dashboard['A8'] = 'Suite Summary'
    dashboard['A8'].font = Font(name='Aptos', bold=True, size=14, color=PALETTE['navy'])
    headers = ['Suite', 'Total', 'Passed', 'Failed', 'Skipped']
    for idx, header in enumerate(headers, start=1):
        dashboard.cell(9, idx, header)
    style_table_header_row(dashboard, 9)

    row = 10
    for suite in suite_order:
        stats = suite_stats[suite]
        dashboard.cell(row, 1, suite)
        dashboard.cell(row, 2, stats['TOTAL'])
        dashboard.cell(row, 3, stats['PASS'])
        dashboard.cell(row, 4, stats['FAIL'])
        dashboard.cell(row, 5, stats['SKIP'])
        row += 1

    dashboard['G8'] = 'Current Failed Items'
    dashboard['G8'].font = Font(name='Aptos', bold=True, size=14, color=PALETTE['navy'])
    failed_headers = ['Suite', 'ID', 'Area', 'Test']
    for idx, header in enumerate(failed_headers, start=7):
        dashboard.cell(9, idx, header)
    style_table_header_row(dashboard, 9)

    row = 10
    for check in failed_rows:
        dashboard.cell(row, 7, check['suite'])
        dashboard.cell(row, 8, check['id'])
        dashboard.cell(row, 9, check['area'])
        dashboard.cell(row, 10, check['test'])
        row += 1

    thin = Side(style='thin', color=PALETTE['border'])
    for row_cells in dashboard.iter_rows():
        for cell in row_cells:
            if cell.row >= 9:
                cell.border = Border(left=thin, right=thin, top=thin, bottom=thin)
                if cell.row != 9:
                    cell.alignment = Alignment(vertical='center', horizontal='left', wrap_text=True)

    dashboard.column_dimensions['A'].width = 18
    dashboard.column_dimensions['B'].width = 12
    dashboard.column_dimensions['C'].width = 12
    dashboard.column_dimensions['D'].width = 12
    dashboard.column_dimensions['E'].width = 12
    dashboard.column_dimensions['F'].width = 12
    dashboard.column_dimensions['G'].width = 18
    dashboard.column_dimensions['H'].width = 12
    dashboard.column_dimensions['I'].width = 16
    dashboard.column_dimensions['J'].width = 44

    all_tests = wb.create_sheet('All Tests')
    all_tests.freeze_panes = 'A2'
    all_tests.sheet_properties.tabColor = PALETTE['pass']
    all_headers = ['#', 'Suite', 'ID', 'Area', 'Status', 'Test', 'Details', 'Steps to Reproduce']
    all_tests.append(all_headers)
    style_table_header_row(all_tests, 1)
    for idx, check in enumerate(checks, start=1):
        all_tests.append([
            idx,
            check['suite'],
            check['id'],
            check['area'],
            check['status'],
            check['test'],
            check.get('details', ''),
            check.get('steps_to_reproduce', ''),
        ])
    add_table(all_tests, 1, len(checks) + 1, len(all_headers), 'AllTestsTable')
    autosize(all_tests, max_width=72)

    for row_idx in range(2, len(checks) + 2):
        status_cell = all_tests.cell(row_idx, 5)
        fill = PALETTE['pass_bg']
        font_color = PALETTE['pass']
        if status_cell.value == 'FAIL':
            fill = PALETTE['fail_bg']
            font_color = PALETTE['fail']
        elif status_cell.value == 'SKIP':
            fill = PALETTE['skip_bg']
            font_color = PALETTE['skip']
        status_cell.fill = PatternFill('solid', fgColor=fill)
        status_cell.font = Font(name='Aptos', bold=True, color=font_color)
        status_cell.alignment = Alignment(horizontal='center')
        all_tests.cell(row_idx, 6).alignment = Alignment(wrap_text=True, vertical='top')
        all_tests.cell(row_idx, 7).alignment = Alignment(wrap_text=True, vertical='top')
        all_tests.cell(row_idx, 8).alignment = Alignment(wrap_text=True, vertical='top')

    failed_sheet = wb.create_sheet('Failed Details')
    failed_sheet.freeze_panes = 'A2'
    failed_sheet.sheet_properties.tabColor = PALETTE['fail']
    failed_detail_headers = ['Suite', 'ID', 'Area', 'Status', 'Test', 'Details', 'Steps to Reproduce']
    failed_sheet.append(failed_detail_headers)
    style_table_header_row(failed_sheet, 1)
    for check in failed_rows:
        failed_sheet.append([
            check['suite'],
            check['id'],
            check['area'],
            check['status'],
            check['test'],
            check.get('details', ''),
            check.get('steps_to_reproduce', ''),
        ])
    add_table(failed_sheet, 1, max(2, len(failed_rows) + 1), len(failed_detail_headers), 'FailedTestsTable')
    autosize(failed_sheet, max_width=72)
    for row in failed_sheet.iter_rows(min_row=2):
        if row[3].value == 'FAIL':
            row[3].fill = PatternFill('solid', fgColor=PALETTE['fail_bg'])
            row[3].font = Font(name='Aptos', bold=True, color=PALETTE['fail'])
        for cell in row:
            cell.alignment = Alignment(vertical='top', wrap_text=True)

    for ws in (dashboard, all_tests, failed_sheet):
        ws.sheet_view.zoomScale = 90

    output_path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(output_path)


def main():
    args = parse_args()
    summary = load_summary(Path(args.combined_json))
    build_workbook(summary, Path(args.output), args.title, args.subtitle)
    print(f'OUTPUT_XLSX={args.output}')


if __name__ == '__main__':
    main()
