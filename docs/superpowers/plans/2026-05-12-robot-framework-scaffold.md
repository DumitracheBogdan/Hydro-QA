# Robot Framework Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Robot Framework scaffold to the `Hydro-QA` repo so RF installs, runs, produces a green sanity report, and is pre-wired for the existing `summary.json` bundle contract — with zero real tests and zero impact on existing Node/Maestro suites.

**Architecture:** New top-level `robot/` directory with a 3-test sanity suite, a Python converter that maps Robot's `output.xml` to the existing Hydro-QA `summary.json` schema, a Node wrapper that makes Robot suites callable from `scripts/run_regression_bundle.mjs`, and a manual-only GitHub Actions workflow. Bundle runner gets a single dormant entry appended to its `SUITES` dict; `selectedSuiteKeys()` is **not** modified, so nightly/post-deploy are unaffected.

**Tech Stack:** Robot Framework 7.1.1 (Python 3.12), `robotframework-requests` 0.9.7 (installed but unused in sanity), Python `xml.etree.ElementTree` for the converter, Node 22 wrapper, GitHub Actions.

**Spec:** [`docs/superpowers/specs/2026-05-12-robot-framework-scaffold-design.md`](../specs/2026-05-12-robot-framework-scaffold-design.md)

---

## File Plan

| Path | Action | Responsibility |
|---|---|---|
| `robot/requirements.txt` | Create | Pin RF + RequestsLibrary versions |
| `robot/suites/sanity/hello.robot` | Create | 3 dummy tests (SAN01-SAN03), no network |
| `robot/lib/output_xml_to_summary.py` | Create | Convert RF `output.xml` → Hydro-QA `summary.json` |
| `robot/lib/test_output_xml_to_summary.py` | Create | Unit tests for converter |
| `robot/runner/run_robot_suite.mjs` | Create | Node wrapper, emits `SUMMARY_JSON=` for bundle compat |
| `robot/README.md` | Create | Local + CI run instructions |
| `.github/workflows/robot-sanity.yml` | Create | Manual-only CI sanity gate |
| `scripts/run_regression_bundle.mjs` | Modify | Append one dormant entry to `SUITES` dict |

---

## Task 1: Pin dependencies

**Files:**
- Create: `robot/requirements.txt`

- [ ] **Step 1: Create `robot/requirements.txt`**

```
robotframework==7.1.1
robotframework-requests==0.9.7
```

- [ ] **Step 2: Verify install works locally**

Run (PowerShell):
```powershell
python -m pip install -r robot/requirements.txt
robot --version
```
Expected: `Robot Framework 7.1.1 (Python 3.x on win32)` or similar — non-zero exit means we abort and report.

- [ ] **Step 3: Commit**

```bash
git add robot/requirements.txt
git commit -m "chore(robot): pin robotframework 7.1.1 + requests 0.9.7"
```

---

## Task 2: Sanity suite (TDD: write the suite, run it, see green)

**Files:**
- Create: `robot/suites/sanity/hello.robot`

- [ ] **Step 1: Create `robot/suites/sanity/hello.robot`**

```robot
*** Settings ***
Documentation    Sanity suite - verifies Robot Framework runs.
...              Makes ZERO network calls. Reads no Hydrocert credentials.

*** Test Cases ***
SAN01 Robot Framework Runs
    [Documentation]    Engine sanity: arithmetic + Log keyword.
    [Tags]    id:SAN01    area:sanity    safeOnProd
    Log    Robot Framework is alive
    Should Be Equal As Integers    ${1 + 1}    2

SAN02 Variables Resolve
    [Documentation]    Variable substitution + string assertion.
    [Tags]    id:SAN02    area:sanity    safeOnProd
    ${msg}=    Set Variable    hydrocert-robot-scaffold
    Should Contain    ${msg}    robot

SAN03 Environment Var Readable
    [Documentation]    Confirms CI env vars reach Robot (read-only - no fetch).
    [Tags]    id:SAN03    area:sanity    safeOnProd
    ${base}=    Get Environment Variable    HYDROCERT_API_BASE    default=${EMPTY}
    Log    HYDROCERT_API_BASE resolved to: ${base}
    Should Not Be Empty    ${base}
```

- [ ] **Step 2: Run locally with env var set (should pass)**

Run (PowerShell):
```powershell
$env:HYDROCERT_API_BASE = "https://example.local"
robot --outputdir qa-artifacts/robot/sanity robot/suites/sanity/
```
Expected: exit code 0, console shows `3 tests, 3 passed, 0 failed`. Files created: `qa-artifacts/robot/sanity/output.xml`, `log.html`, `report.html`.

- [ ] **Step 3: Run locally WITHOUT env var (SAN03 should fail)**

Run (PowerShell):
```powershell
Remove-Item Env:\HYDROCERT_API_BASE -ErrorAction SilentlyContinue
robot --outputdir qa-artifacts/robot/sanity-neg robot/suites/sanity/
```
Expected: exit code 1, console shows `3 tests, 2 passed, 1 failed`. This is the **intended** behavior — confirms SAN03 actually checks the var. Restore env var before continuing: `$env:HYDROCERT_API_BASE = "https://example.local"`.

- [ ] **Step 4: Commit**

```bash
git add robot/suites/sanity/hello.robot
git commit -m "test(robot): add sanity suite SAN01-SAN03 (no network, no creds)"
```

---

## Task 3: Converter — failing unit test first (TDD)

**Files:**
- Create: `robot/lib/test_output_xml_to_summary.py`

- [ ] **Step 1: Create the test file with a fixture string and one assertion**

```python
# robot/lib/test_output_xml_to_summary.py
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
CONVERTER = HERE / "output_xml_to_summary.py"

SAMPLE_XML = """<?xml version="1.0" encoding="UTF-8"?>
<robot generator="Robot 7.1.1">
  <suite id="s1" name="Sanity">
    <test id="s1-t1" name="SAN01 Robot Framework Runs">
      <tags>
        <tag>id:SAN01</tag>
        <tag>area:sanity</tag>
        <tag>safeOnProd</tag>
      </tags>
      <status status="PASS" starttime="20260512 10:00:00.000" endtime="20260512 10:00:00.100"/>
    </test>
    <test id="s1-t2" name="SAN02 Variables Resolve">
      <tags>
        <tag>id:SAN02</tag>
        <tag>area:sanity</tag>
      </tags>
      <status status="FAIL" starttime="20260512 10:00:00.100" endtime="20260512 10:00:00.200">Boom: x != y</status>
    </test>
    <test id="s1-t3" name="SAN03 No Tags">
      <status status="SKIP" starttime="20260512 10:00:00.200" endtime="20260512 10:00:00.300"/>
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
```

- [ ] **Step 2: Install pytest (one-time)**

Run:
```powershell
python -m pip install pytest==8.3.3
```

- [ ] **Step 3: Run the tests — they MUST fail (converter doesn't exist yet)**

Run:
```powershell
python -m pytest robot/lib/test_output_xml_to_summary.py -v
```
Expected: 4 errors/failures, all with "Converter failed" or "FileNotFoundError" mentioning `output_xml_to_summary.py`.

- [ ] **Step 4: Commit failing tests**

```bash
git add robot/lib/test_output_xml_to_summary.py
git commit -m "test(robot): add failing tests for output.xml->summary.json converter"
```

---

## Task 4: Converter — minimal implementation to make tests pass

**Files:**
- Create: `robot/lib/output_xml_to_summary.py`

- [ ] **Step 1: Create the converter**

```python
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
```

- [ ] **Step 2: Run unit tests — they MUST all pass**

Run:
```powershell
python -m pytest robot/lib/test_output_xml_to_summary.py -v
```
Expected: 4 passed in <1s.

- [ ] **Step 3: Run converter against real sanity output (sanity check)**

Run (PowerShell, with the run dir from Task 2 Step 2 still present):
```powershell
python robot/lib/output_xml_to_summary.py `
  --input qa-artifacts/robot/sanity/output.xml `
  --output qa-artifacts/robot/sanity/summary.json
Get-Content qa-artifacts/robot/sanity/summary.json
```
Expected: stdout shows `WROTE ... total=3 pass=3 fail=0 skip=0`; JSON shows 3 checks with `id` SAN01/SAN02/SAN03, area `sanity`, status `PASS`.

- [ ] **Step 4: Commit**

```bash
git add robot/lib/output_xml_to_summary.py
git commit -m "feat(robot): converter output.xml -> Hydro-QA summary.json"
```

---

## Task 5: Node wrapper for bundle compatibility

**Files:**
- Create: `robot/runner/run_robot_suite.mjs`

- [ ] **Step 1: Create the wrapper**

```js
// robot/runner/run_robot_suite.mjs
// Spawns Robot, then the converter, then prints SUMMARY_JSON=<path> on stdout.
// Contract consumed by scripts/run_regression_bundle.mjs (matches /^SUMMARY_JSON=(.+)$/m).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SUITE_PATH = process.env.ROBOT_SUITE_PATH || 'robot/suites/sanity';
const SUITE_ID   = process.env.ROBOT_SUITE_ID   || 'ROBOTSAN03';

const stamp  = new Date().toISOString().replace(/[.:]/g, '-');
const runDir = path.join(process.cwd(), 'qa-artifacts', 'infra-regression', `robot-${SUITE_ID}-${stamp}`);
fs.mkdirSync(runDir, { recursive: true });

const robot = spawnSync('robot',
  ['--outputdir', runDir, '--output', 'output.xml', '--log', 'log.html', '--report', 'report.html', SUITE_PATH],
  { stdio: 'inherit' }
);
// Robot exit codes: 0 = all pass; 1..250 = N failed; >250 = engine error.
if (robot.status === null || robot.status > 250) {
  console.error(`Robot failed to execute (exit=${robot.status})`);
  process.exit(2);
}

const xmlPath     = path.join(runDir, 'output.xml');
const summaryPath = path.join(runDir, 'summary.json');

const python = process.platform === 'win32' ? 'python' : 'python3';
const conv = spawnSync(python,
  ['robot/lib/output_xml_to_summary.py', '--input', xmlPath, '--output', summaryPath],
  { stdio: 'inherit' }
);
if (conv.status !== 0) {
  console.error(`Converter failed (exit=${conv.status})`);
  process.exit(3);
}

// Bundle contract: emit these two lines on stdout.
console.log(`SUMMARY_JSON=${summaryPath}`);
console.log(`REPORT_MD=${path.join(runDir, 'report.html')}`);
```

- [ ] **Step 2: Run wrapper locally**

Run (PowerShell):
```powershell
$env:ROBOT_SUITE_PATH = "robot/suites/sanity"
$env:ROBOT_SUITE_ID   = "ROBOTSAN03"
$env:HYDROCERT_API_BASE = "https://example.local"
node robot/runner/run_robot_suite.mjs
```
Expected: Robot output prints 3/3 pass, then `WROTE ... total=3 ...`, then final two lines:
```
SUMMARY_JSON=<absolute-path>\summary.json
REPORT_MD=<absolute-path>\report.html
```

- [ ] **Step 3: Verify bundle contract regex would match**

Run (PowerShell):
```powershell
node robot/runner/run_robot_suite.mjs 2>&1 | Select-String "^SUMMARY_JSON="
```
Expected: One line matched (this is the same regex `run_regression_bundle.mjs:211` uses).

- [ ] **Step 4: Commit**

```bash
git add robot/runner/run_robot_suite.mjs
git commit -m "feat(robot): Node wrapper - bundle-compatible SUMMARY_JSON emitter"
```

---

## Task 6: Pre-wire bundle runner (dormant entry)

**Files:**
- Modify: `scripts/run_regression_bundle.mjs` (single addition inside the `SUITES` object)

- [ ] **Step 1: Read current SUITES object to confirm anchor**

Run:
```powershell
Select-String -Path scripts/run_regression_bundle.mjs -Pattern "maestro:" -Context 0,6
```
Expected: shows the `maestro:` entry block ending with `tests: 10,` then `},`.

- [ ] **Step 2: Append the dormant entry immediately after the `maestro` entry**

Open `scripts/run_regression_bundle.mjs`. Find the `maestro:` block (around line 80-86). Append, on the line immediately after its closing `},`:

```js
  // NOTE: dormant - not present in selectedSuiteKeys(). Activated manually when
  // a real Robot suite is ready. See docs/superpowers/specs/2026-05-12-robot-framework-scaffold-design.md
  robotsanity: {
    key: 'robotsanity',
    id: 'ROBOTSAN03',
    label: 'Robot Sanity (scaffold)',
    script: path.join('robot', 'runner', 'run_robot_suite.mjs'),
    tests: 3,
  },
```

- [ ] **Step 3: Verify dormancy — dry-run must NOT list ROBOTSAN03**

Run (PowerShell):
```powershell
node scripts/run_regression_bundle.mjs --dry-run
```
Expected: JSON output. The `suites` array must NOT contain any entry with `id: "ROBOTSAN03"`. (It only lists entries selected by `selectedSuiteKeys('dev','standard')`.)

Also try with `HYDROCERT_REGRESSION_MODE=full`:
```powershell
$env:HYDROCERT_REGRESSION_MODE = "full"
node scripts/run_regression_bundle.mjs --dry-run
Remove-Item Env:\HYDROCERT_REGRESSION_MODE
```
Expected: Still no `ROBOTSAN03`. Confirms the entry is truly dormant.

- [ ] **Step 4: Commit**

```bash
git add scripts/run_regression_bundle.mjs
git commit -m "feat(robot): pre-wire bundle SUITES entry (dormant)"
```

---

## Task 7: CI workflow (manual-only)

**Files:**
- Create: `.github/workflows/robot-sanity.yml`

- [ ] **Step 1: Create the workflow**

```yaml
# .github/workflows/robot-sanity.yml
name: Robot Sanity (scaffold)
run-name: "Robot Sanity - ${{ github.event_name }}"

on:
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: robot-sanity
  cancel-in-progress: false

jobs:
  sanity:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    env:
      # SAN03 reads this as a string only. No fetch is performed.
      HYDROCERT_API_BASE: ${{ vars.HYDROCERT_DEV_API_BASE }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'
          cache: pip
          cache-dependency-path: robot/requirements.txt

      - name: Install Robot Framework
        run: pip install -r robot/requirements.txt

      - name: Versions (debug)
        run: |
          robot --version || true
          python --version

      - name: Run sanity suite
        run: |
          mkdir -p qa-artifacts/robot/sanity
          robot --outputdir qa-artifacts/robot/sanity \
                --output output.xml --log log.html --report report.html \
                robot/suites/sanity/

      - name: Convert output.xml -> summary.json
        run: |
          python robot/lib/output_xml_to_summary.py \
            --input  qa-artifacts/robot/sanity/output.xml \
            --output qa-artifacts/robot/sanity/summary.json
          cat qa-artifacts/robot/sanity/summary.json

      - name: Upload Robot artifacts
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: robot-sanity-${{ github.run_id }}
          path: qa-artifacts/robot/sanity/
          if-no-files-found: error
          retention-days: 14

      - name: Publish summary
        if: always()
        run: |
          {
            echo "# Robot Sanity"
            echo ""
            echo "- Suite: robot/suites/sanity/"
            if [[ -f qa-artifacts/robot/sanity/summary.json ]]; then
              TOTAL=$(jq -r '.totals.total' qa-artifacts/robot/sanity/summary.json)
              PASS=$(jq  -r '.totals.pass'  qa-artifacts/robot/sanity/summary.json)
              FAIL=$(jq  -r '.totals.fail'  qa-artifacts/robot/sanity/summary.json)
              echo "- Total: $TOTAL | Pass: $PASS | Fail: $FAIL"
            fi
          } >> "$GITHUB_STEP_SUMMARY"
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/robot-sanity.yml
git commit -m "ci(robot): add manual-only sanity workflow"
```

- [ ] **Step 3: Push branch + trigger workflow manually**

Per repo convention (memory `feedback_hydroqa_constraints`: direct push to main, no PR). After all commits land:
```bash
git push origin main
```
Then in GitHub UI: Actions → "Robot Sanity (scaffold)" → "Run workflow" → branch `main` → Run.

- [ ] **Step 4: Verify run is green**

Open the run. Expected:
- Status: green, <2 min elapsed
- Step "Run sanity suite" exit code 0, console shows `3 tests, 3 passed`
- Step "Convert output.xml -> summary.json" prints `WROTE ... total=3 pass=3 fail=0 skip=0`
- Step "Publish summary" appends a section to the run summary with `Total: 3 | Pass: 3 | Fail: 0`
- Artifact `robot-sanity-<run_id>` is downloadable and contains `output.xml`, `log.html`, `report.html`, `summary.json`

If `HYDROCERT_DEV_API_BASE` is not set as a repo variable, SAN03 will fail with `Should Not Be Empty`. Fix: in repo Settings → Secrets and variables → Actions → Variables → set `HYDROCERT_DEV_API_BASE` to any URL string. Re-run.

---

## Task 8: README

**Files:**
- Create: `robot/README.md`

- [ ] **Step 1: Create the README**

````markdown
# Robot Framework Scaffold

Sanity scaffold for Robot Framework in the Hydro-QA repo.
**No real Hydrocert tests live here yet.** This directory exists to prove the
toolchain runs in CI and is pre-wired for the existing `summary.json` bundle
contract.

## What's here

- `suites/sanity/hello.robot` - 3 dummy tests (SAN01-SAN03). No network, no creds.
- `lib/output_xml_to_summary.py` - converts Robot `output.xml` to Hydro-QA `summary.json`.
- `lib/test_output_xml_to_summary.py` - pytest unit tests for the converter.
- `runner/run_robot_suite.mjs` - Node wrapper that emits `SUMMARY_JSON=<path>`
  on stdout, compatible with `scripts/run_regression_bundle.mjs`.
- `requirements.txt` - pinned dependencies.

## CI

Workflow: `.github/workflows/robot-sanity.yml` (manual-only, `workflow_dispatch`).
Not attached to nightly or post-deploy.

## Run locally (Windows PowerShell)

```powershell
# Once per machine
python -m pip install -r robot/requirements.txt

# Each run
$env:HYDROCERT_API_BASE = "https://example.local"
robot --outputdir qa-artifacts/robot/sanity robot/suites/sanity/
python robot/lib/output_xml_to_summary.py `
  --input qa-artifacts/robot/sanity/output.xml `
  --output qa-artifacts/robot/sanity/summary.json
```

## Validate bundle compatibility (without touching nightly)

```powershell
$env:ROBOT_SUITE_PATH = "robot/suites/sanity"
$env:ROBOT_SUITE_ID   = "ROBOTSAN03"
node robot/runner/run_robot_suite.mjs
# Last two stdout lines:
#   SUMMARY_JSON=<absolute-path>\summary.json
#   REPORT_MD=<absolute-path>\report.html
```

## Run converter unit tests

```powershell
python -m pip install pytest==8.3.3
python -m pytest robot/lib/test_output_xml_to_summary.py -v
```

## Tag convention (for future real suites)

- `id:XXX` - maps to `id` field in summary.json (mandatory)
- `area:xxx` - maps to `area` field (mandatory)
- `safeOnProd` / `devOnly` / `load` - optional filters for
  `robot --include safeOnProd` / `--exclude load`

## Adding the first real suite

1. Drop `.robot` files into `robot/suites/<name>/`.
2. If shared helpers needed, write `robot/resources/*.resource` and import them.
3. Add a new entry in `SUITES` dict in `scripts/run_regression_bundle.mjs`
   (or rename `robotsanity` -> point at the new path via `ROBOT_SUITE_PATH` env).
4. Add the key to one or more arrays in `selectedSuiteKeys()` to activate it
   for nightly / post-deploy.
5. For UI tests, install `robotframework-browser` and add it to
   `requirements.txt`.

## What this scaffold does NOT do

- Does NOT call any Hydrocert API.
- Does NOT modify `hydrocert-web` or `hydrocert-services`.
- Does NOT send Teams notifications.
- Does NOT generate Excel reports for Robot runs.
- Does NOT run in nightly or post-deploy.

See `docs/superpowers/specs/2026-05-12-robot-framework-scaffold-design.md`
for the full design rationale.
````

- [ ] **Step 2: Commit**

```bash
git add robot/README.md
git commit -m "docs(robot): scaffold README + tag convention"
```

---

## Task 9: Final verification

- [ ] **Step 1: Confirm no Hydrocert infra was touched**

Run:
```powershell
git log --oneline -10
git diff main~9 main --stat
```
Expected: all modified/created paths are under `robot/`, `.github/workflows/robot-sanity.yml`, `scripts/run_regression_bundle.mjs`, or `docs/superpowers/`. **NO** changes outside these.

- [ ] **Step 2: Confirm bundle dry-run still excludes Robot**

Run:
```powershell
node scripts/run_regression_bundle.mjs --dry-run
```
Expected: `suites` array does not contain `ROBOTSAN03` for `dev`+`standard`.

```powershell
$env:HYDROCERT_REGRESSION_MODE = "full"
node scripts/run_regression_bundle.mjs --dry-run
Remove-Item Env:\HYDROCERT_REGRESSION_MODE
```
Expected: Still no `ROBOTSAN03`.

- [ ] **Step 3: Confirm CI workflow ran green at least once**

Open GitHub Actions → "Robot Sanity (scaffold)" → most recent run.
Expected: green checkmark, artifact downloadable, summary shows `Total: 3 | Pass: 3 | Fail: 0`.

- [ ] **Step 4: Confirm no outgoing requests to Hydrocert domains**

Open the most recent run's `output.xml` artifact in a text editor.
Search for `hydrocert.com`, `gen-cert.com`, `azurewebsites.net`.
Expected: **zero matches**. Confirms SAN03 only read the env var; no fetch happened.

- [ ] **Step 5: No commit needed for this task — verification only.**

---

## Self-Review Notes

**Spec coverage check:**
- Goal (sanity runs green in CI <2 min) → Task 7
- Artifact contains output.xml/log.html/report.html/summary.json → Task 7 Step 4 verification
- Local PowerShell flow → README in Task 8 + verified in Tasks 2/4/5
- Real tests next iteration → out of scope, listed in spec "Out-of-Scope Future Work"
- Non-goals (Teams, Excel, nightly attachment, hydrocert-web/services edits) → enforced by Task 6 (dormant entry) + Task 7 (workflow_dispatch only, no Teams step) + Task 9 verification
- Tag convention `id:` / `area:` / `safeOnProd` → Task 2 (suite) + Task 4 (converter mapping) + Task 8 (README)
- Schema mapping → Task 3 (failing tests pin schema) + Task 4 (impl)
- Bundle contract (`SUMMARY_JSON=<path>` regex match) → Task 5 Step 3
- Dormancy proven by dry-run → Task 6 Step 3 + Task 9 Step 2
- No-network proof → Task 9 Step 4

**Placeholder scan:** none — all code blocks are complete, every command has expected output.

**Type/name consistency:**
- `ROBOTSAN03` as suite ID: consistent across Task 5 default env, Task 6 dict entry, Task 9 dry-run check.
- `summary.json` schema (`totals.{total,pass,fail,skip}` + `checks[].{id,area,test,status,details,evidence}`): consistent between Task 3 test assertions, Task 4 implementation, and Task 8 README.
- `SUMMARY_JSON=`/`REPORT_MD=` stdout markers: consistent between Task 5 wrapper output and existing `run_regression_bundle.mjs:211,216` regex.
- File paths: all absolute repo-relative (`robot/...`, `scripts/...`, `.github/workflows/...`), no shifting.

No issues found.
