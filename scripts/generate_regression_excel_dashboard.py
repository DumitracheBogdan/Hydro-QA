from __future__ import annotations

import json
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import Table, TableStyleInfo


ROOT = Path(r"c:\work\QA TRacker")
REPORT_JSON = ROOT / "qa-artifacts" / "infra-regression" / "tmp-combined-184-doublecheck.json"
RETEST_JSON = ROOT / "qa-artifacts" / "infra-regression" / "dev-infra-fail-retest2-2026-03-06T12-43-30-626Z" / "summary.json"
OUTPUT_XLSX = ROOT / "qa-artifacts" / "infra-regression" / "Hydrocert_DEV_Regression_Dashboard_2026-03-06.xlsx"

FINAL_OVERRIDES = {
    ("UI22", "U16"): "PASS",
    ("NEW60", "R36"): "PASS",
    ("NEW60", "R37"): "PASS",
    ("NEW60", "R38"): "PASS",
    ("NEW60", "R39"): "PASS",
    ("NEW60", "R51"): "PASS",
    ("NEW60", "R52"): "PASS",
    ("ESS25", "E25"): "PASS",
}

FAIL_EXPLANATIONS = {
    "L08": {
        "tested": "80 mixed concurrent API calls on /health, /users/profile/me, /customers/filtered and /visits/calendar-filter.",
        "problem": "Average response time stayed above the target under mixed load.",
    },
    "R07": {
        "tested": "Web root response headers on GET /.",
        "problem": "Strict-Transport-Security header is missing.",
    },
    "R08": {
        "tested": "Web root response headers on GET /.",
        "problem": "X-Content-Type-Options nosniff header is missing.",
    },
    "R09": {
        "tested": "Web root response headers on GET /.",
        "problem": "No anti-frame protection was returned (X-Frame-Options or CSP frame-ancestors).",
    },
    "R10": {
        "tested": "TRACE / on web and TRACE /health on API.",
        "problem": "Web still answers TRACE with HTTP 200, so TRACE is not fully blocked.",
    },
    "R43": {
        "tested": "80 mixed concurrent API calls with a looser average threshold.",
        "problem": "Average response time still stayed above the allowed threshold under burst load.",
    },
    "E04": {
        "tested": "Main JavaScript bundle requested from the web root HTML.",
        "problem": "Main bundle response does not expose Cache-Control header.",
    },
    "E05": {
        "tested": "API health endpoint content type on GET /health.",
        "problem": "Health endpoint returned HTML content type instead of JSON.",
    },
    "E06": {
        "tested": "API health payload structure on GET /health.",
        "problem": "Health response did not return a clear JSON payload with expected health fields.",
    },
    "E15": {
        "tested": "Sample rows from /visits/calendar-filter looking for parseable date fields.",
        "problem": "Test looked for visitDate/date/startDate/fromDate and found none; API sample uses from/to instead.",
    },
}

PALETTE = {
    "navy": "0F172A",
    "slate": "334155",
    "muted": "64748B",
    "border": "CBD5E1",
    "sheet": "F8FAFC",
    "pass": "0F766E",
    "pass_bg": "CCFBF1",
    "fail": "B91C1C",
    "fail_bg": "FEE2E2",
    "skip": "92400E",
    "skip_bg": "FEF3C7",
    "card": "E2E8F0",
    "accent": "2563EB",
    "accent_bg": "DBEAFE",
    "purple": "7C3AED",
    "purple_bg": "EDE9FE",
}


def load_checks() -> list[dict]:
    data = json.loads(REPORT_JSON.read_text(encoding="utf-8"))
    checks = data["checks"]
    for check in checks:
        override = FINAL_OVERRIDES.get((check["suite"], check["id"]))
        if override:
            check["status"] = override
    return checks


def load_retest_fail_details() -> dict[str, str]:
    data = json.loads(RETEST_JSON.read_text(encoding="utf-8"))
    return {check["id"]: check.get("details", "") for check in data["checks"]}


def autosize(ws, min_width=12, max_width=58):
    for col_cells in ws.columns:
        col_letter = get_column_letter(col_cells[0].column)
        max_len = 0
        for cell in col_cells:
            value = "" if cell.value is None else str(cell.value)
            if "\n" in value:
                value = max(value.splitlines(), key=len)
            max_len = max(max_len, len(value))
        ws.column_dimensions[col_letter].width = max(min_width, min(max_width, max_len + 2))


def style_header(cell, fill="navy", size=11, color="FFFFFF"):
    cell.fill = PatternFill("solid", fgColor=PALETTE[fill])
    cell.font = Font(name="Aptos", bold=True, size=size, color=color)
    cell.alignment = Alignment(horizontal="center", vertical="center")


def style_table_header_row(ws, row_idx, fill="navy"):
    for cell in ws[row_idx]:
        style_header(cell, fill=fill)


def card(ws, cell_range, title, value, fill_color, value_color="FFFFFF"):
    ws.merge_cells(cell_range)
    cell = ws[cell_range.split(":")[0]]
    cell.value = f"{title}\n{value}"
    cell.fill = PatternFill("solid", fgColor=fill_color)
    cell.font = Font(name="Aptos", bold=True, size=17, color=value_color)
    cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    thin = Side(style="thin", color=PALETTE["border"])
    for row in ws[cell_range]:
        for item in row:
            item.border = Border(left=thin, right=thin, top=thin, bottom=thin)


def add_table(ws, start_row, end_row, end_col, table_name):
    ref = f"A{start_row}:{get_column_letter(end_col)}{end_row}"
    tab = Table(displayName=table_name, ref=ref)
    tab.tableStyleInfo = TableStyleInfo(
        name="TableStyleMedium2",
        showFirstColumn=False,
        showLastColumn=False,
        showRowStripes=True,
        showColumnStripes=False,
    )
    ws.add_table(tab)


def build_workbook():
    checks = load_checks()
    fail_details_map = load_retest_fail_details()

    totals = Counter(check["status"] for check in checks)
    suite_stats: dict[str, Counter] = defaultdict(Counter)
    area_fail_stats: Counter = Counter()

    for check in checks:
        suite_stats[check["suite"]][check["status"]] += 1
        suite_stats[check["suite"]]["TOTAL"] += 1
        if check["status"] == "FAIL":
            area_fail_stats[check["area"]] += 1

    failed_rows = [check for check in checks if check["status"] == "FAIL"]

    wb = Workbook()
    wb.properties.creator = "Codex"
    wb.properties.title = "Hydrocert DEV Regression Dashboard"
    wb.properties.subject = "DEV Regression Report"
    wb.properties.description = "Final 184-test DEV regression workbook with dashboard and fail details."

    dashboard = wb.active
    dashboard.title = "Dashboard"
    dashboard.sheet_view.showGridLines = False
    dashboard.freeze_panes = "A1"
    dashboard.sheet_properties.tabColor = PALETTE["accent"]
    dashboard["A1"] = "Hydrocert DEV Regression Dashboard"
    dashboard["A2"] = f"Final run set with targeted fail retests | Generated {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    dashboard["A1"].font = Font(name="Aptos Display", bold=True, size=22, color="FFFFFF")
    dashboard["A2"].font = Font(name="Aptos", italic=True, size=10, color="E2E8F0")
    dashboard["A1"].alignment = Alignment(horizontal="left", vertical="center")
    dashboard["A2"].alignment = Alignment(horizontal="left", vertical="center")
    dashboard.merge_cells("A1:H1")
    dashboard.merge_cells("A2:H2")
    for row in ("A1:H1", "A2:H2"):
        for cells in dashboard[row]:
            for cell in cells:
                cell.fill = PatternFill("solid", fgColor=PALETTE["navy"])

    card(dashboard, "A4:B6", "Total Tests", len(checks), PALETTE["slate"])
    card(dashboard, "C4:D6", "Passed", totals["PASS"], PALETTE["pass"])
    card(dashboard, "E4:F6", "Failed", totals["FAIL"], PALETTE["fail"])
    card(dashboard, "G4:H6", "Skipped", totals["SKIP"], PALETTE["skip"])

    dashboard["A8"] = "Suite Summary"
    dashboard["A8"].font = Font(name="Aptos", bold=True, size=14, color=PALETTE["navy"])
    dashboard["A9"] = "Suite"
    dashboard["B9"] = "Total"
    dashboard["C9"] = "Passed"
    dashboard["D9"] = "Failed"
    dashboard["E9"] = "Skipped"
    style_table_header_row(dashboard, 9)

    suite_order = ["DEEP32", "API34", "UI22", "SOAK11", "NEW60", "ESS25"]
    row = 10
    for suite in suite_order:
        stats = suite_stats[suite]
        dashboard.cell(row, 1, suite)
        dashboard.cell(row, 2, stats["TOTAL"])
        dashboard.cell(row, 3, stats["PASS"])
        dashboard.cell(row, 4, stats["FAIL"])
        dashboard.cell(row, 5, stats["SKIP"])
        row += 1

    dashboard["G8"] = "Open Failures"
    dashboard["G8"].font = Font(name="Aptos", bold=True, size=14, color=PALETTE["navy"])
    dashboard["G9"] = "Area"
    dashboard["H9"] = "Count"
    style_table_header_row(dashboard, 9)
    row = 10
    for area, count in sorted(area_fail_stats.items(), key=lambda item: (-item[1], item[0])):
        dashboard.cell(row, 7, area)
        dashboard.cell(row, 8, count)
        row += 1

    dashboard["A18"] = "Current Failed Items"
    dashboard["A18"].font = Font(name="Aptos", bold=True, size=14, color=PALETTE["navy"])
    headers = ["Suite", "ID", "Area", "Test"]
    for idx, header in enumerate(headers, start=1):
        dashboard.cell(19, idx, header)
    style_table_header_row(dashboard, 19, fill="slate")
    row = 20
    for check in failed_rows:
        dashboard.cell(row, 1, check["suite"])
        dashboard.cell(row, 2, check["id"])
        dashboard.cell(row, 3, check["area"])
        dashboard.cell(row, 4, check["test"])
        row += 1

    for row_cells in dashboard.iter_rows():
        for cell in row_cells:
            if cell.row >= 9 and cell.column <= 8:
                cell.border = Border(
                    left=Side(style="thin", color=PALETTE["border"]),
                    right=Side(style="thin", color=PALETTE["border"]),
                    top=Side(style="thin", color=PALETTE["border"]),
                    bottom=Side(style="thin", color=PALETTE["border"]),
                )
                if cell.row not in (9, 19):
                    cell.alignment = Alignment(vertical="center", horizontal="left", wrap_text=True)

    dashboard.column_dimensions["A"].width = 18
    dashboard.column_dimensions["B"].width = 12
    dashboard.column_dimensions["C"].width = 12
    dashboard.column_dimensions["D"].width = 12
    dashboard.column_dimensions["E"].width = 12
    dashboard.column_dimensions["F"].width = 12
    dashboard.column_dimensions["G"].width = 20
    dashboard.column_dimensions["H"].width = 12
    dashboard.column_dimensions["I"].width = 3
    dashboard.column_dimensions["J"].width = 12
    dashboard.column_dimensions["K"].width = 12
    dashboard.column_dimensions["L"].width = 12
    dashboard.column_dimensions["M"].width = 12
    dashboard.row_dimensions[1].height = 28
    dashboard.row_dimensions[2].height = 20

    all_tests = wb.create_sheet("All Tests")
    all_tests.freeze_panes = "A2"
    all_tests.sheet_properties.tabColor = PALETTE["pass"]
    all_headers = ["#", "Suite", "ID", "Area", "Status", "Test"]
    all_tests.append(all_headers)
    style_table_header_row(all_tests, 1)
    for idx, check in enumerate(checks, start=1):
        all_tests.append([idx, check["suite"], check["id"], check["area"], check["status"], check["test"]])
    add_table(all_tests, 1, len(checks) + 1, len(all_headers), "AllTestsTable")
    autosize(all_tests)

    for row_idx in range(2, len(checks) + 2):
        status_cell = all_tests.cell(row_idx, 5)
        fill = PALETTE["pass_bg"]
        font_color = PALETTE["pass"]
        if status_cell.value == "FAIL":
            fill = PALETTE["fail_bg"]
            font_color = PALETTE["fail"]
        elif status_cell.value == "SKIP":
            fill = PALETTE["skip_bg"]
            font_color = PALETTE["skip"]
        status_cell.fill = PatternFill("solid", fgColor=fill)
        status_cell.font = Font(name="Aptos", bold=True, color=font_color)
        status_cell.alignment = Alignment(horizontal="center")
        all_tests.cell(row_idx, 6).alignment = Alignment(wrap_text=True, vertical="top")

    failed_sheet = wb.create_sheet("Failed Details")
    failed_sheet.freeze_panes = "A2"
    failed_sheet.sheet_properties.tabColor = PALETTE["fail"]
    fail_headers = ["Suite", "ID", "Area", "Status", "Test", "Retest Details", "What Was Tested", "Observed Problem"]
    failed_sheet.append(fail_headers)
    style_table_header_row(failed_sheet, 1)

    for check in failed_rows:
        explanation = FAIL_EXPLANATIONS.get(check["id"], {})
        failed_sheet.append(
            [
                check["suite"],
                check["id"],
                check["area"],
                check["status"],
                check["test"],
                fail_details_map.get(check["id"], ""),
                explanation.get("tested", ""),
                explanation.get("problem", ""),
            ]
        )

    add_table(failed_sheet, 1, len(failed_rows) + 1, len(fail_headers), "FailedTestsTable")
    autosize(failed_sheet, max_width=72)
    for row in failed_sheet.iter_rows(min_row=2):
        row[3].fill = PatternFill("solid", fgColor=PALETTE["fail_bg"])
        row[3].font = Font(name="Aptos", bold=True, color=PALETTE["fail"])
        for cell in row:
            cell.alignment = Alignment(vertical="top", wrap_text=True)

    for ws in (dashboard, all_tests, failed_sheet):
        ws.sheet_view.zoomScale = 90

    OUTPUT_XLSX.parent.mkdir(parents=True, exist_ok=True)
    wb.save(OUTPUT_XLSX)


if __name__ == "__main__":
    build_workbook()
