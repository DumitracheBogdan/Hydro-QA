# robot/lib/output_xml_to_summary.py
"""Convert Robot Framework output.xml into Hydro-QA summary.json schema.

Schema (matches scripts/tmp-dev-infra-*.mjs output):
  {
    "totals": {"total": N, "pass": N, "fail": N, "skip": N},
    "checks": [
      {"id": "...", "area": "...", "test": "...", "status": "PASS|FAIL|SKIP",
       "details": "...", "evidence": []}
    ]
  }
"""
import argparse
import json
import xml.etree.ElementTree as ET
from pathlib import Path


def _tag_value(tags: list[str], prefix: str) -> str | None:
    for t in tags:
        if t and t.startswith(prefix):
            return t.split(":", 1)[1]
    return None


def parse(xml_path: Path) -> dict:
    root = ET.parse(xml_path).getroot()
    checks = []
    for test in root.iter("test"):
        tags = [t.text for t in test.findall("./tags/tag") if t.text]
        test_name = test.get("name") or ""
        status_el = test.find("./status")
        if status_el is None:
            continue
        status = status_el.get("status") or "UNKNOWN"

        details = ""
        if status != "PASS":
            raw = (status_el.text or "").strip()
            details = " ".join(raw.split())[:320]

        checks.append({
            "id":       _tag_value(tags, "id:") or test_name,
            "area":     _tag_value(tags, "area:") or "robot",
            "test":     test_name,
            "status":   status,
            "details":  details,
            "evidence": [],
        })

    totals = {
        "total": len(checks),
        "pass":  sum(1 for c in checks if c["status"] == "PASS"),
        "fail":  sum(1 for c in checks if c["status"] == "FAIL"),
        "skip":  sum(1 for c in checks if c["status"] == "SKIP"),
    }
    return {"totals": totals, "checks": checks}


def main() -> int:
    ap = argparse.ArgumentParser(description="Robot Framework output.xml -> Hydro-QA summary.json")
    ap.add_argument("--input", required=True, help="path to Robot output.xml")
    ap.add_argument("--output", required=True, help="path to write summary.json")
    args = ap.parse_args()

    summary = parse(Path(args.input))
    Path(args.output).write_text(json.dumps(summary, indent=2), encoding="utf-8")
    t = summary["totals"]
    print(f"WROTE {args.output}: total={t['total']} pass={t['pass']} fail={t['fail']} skip={t['skip']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
