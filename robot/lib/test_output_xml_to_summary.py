# robot/lib/test_output_xml_to_summary.py
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
CONVERTER = HERE / "output_xml_to_summary.py"

SAMPLE_XML = """<?xml version="1.0" encoding="UTF-8"?>
<robot generator="Robot 7.1.1" schemaversion="5">
  <suite id="s1" name="Sanity">
    <test id="s1-t1" name="SAN01 Robot Framework Runs">
      <tag>id:SAN01</tag>
      <tag>area:sanity</tag>
      <tag>safeOnProd</tag>
      <status status="PASS" start="2026-05-12T10:00:00.000" elapsed="0.001"/>
    </test>
    <test id="s1-t2" name="SAN02 Variables Resolve">
      <tag>id:SAN02</tag>
      <tag>area:sanity</tag>
      <status status="FAIL" start="2026-05-12T10:00:00.100" elapsed="0.001">Boom: x != y</status>
    </test>
    <test id="s1-t3" name="SAN03 No Tags">
      <status status="SKIP" start="2026-05-12T10:00:00.200" elapsed="0.001"/>
    </test>
  </suite>
</robot>
"""

def run_converter(tmp_path: Path) -> dict:
    xml_path = tmp_path / "output.xml"
    out_path = tmp_path / "summary.json"
    xml_path.write_text(SAMPLE_XML, encoding="utf-8")
    result = subprocess.run(
        [sys.executable, str(CONVERTER), "--input", str(xml_path), "--output", str(out_path)],
        capture_output=True, text=True,
    )
    assert result.returncode == 0, f"Converter failed: {result.stderr}"
    return json.loads(out_path.read_text(encoding="utf-8"))

def test_totals(tmp_path):
    summary = run_converter(tmp_path)
    assert summary["totals"] == {"total": 3, "pass": 1, "fail": 1, "skip": 1}

def test_pass_check_shape(tmp_path):
    summary = run_converter(tmp_path)
    pass_check = next(c for c in summary["checks"] if c["status"] == "PASS")
    assert pass_check["id"] == "SAN01"
    assert pass_check["area"] == "sanity"
    assert pass_check["test"] == "SAN01 Robot Framework Runs"
    assert pass_check["details"] == ""
    assert pass_check["evidence"] == []

def test_fail_includes_message(tmp_path):
    summary = run_converter(tmp_path)
    fail_check = next(c for c in summary["checks"] if c["status"] == "FAIL")
    assert fail_check["id"] == "SAN02"
    assert "Boom" in fail_check["details"]

def test_missing_tags_fall_back(tmp_path):
    summary = run_converter(tmp_path)
    skip_check = next(c for c in summary["checks"] if c["status"] == "SKIP")
    assert skip_check["id"] == "SAN03 No Tags"  # falls back to test name
    assert skip_check["area"] == "robot"        # falls back to "robot"
