# Robot Framework Scaffold — Design Spec

> Date: 2026-05-12
> Status: Approved (design only — implementation pending separate plan)
> Scope: Prepare the ground for Robot Framework in `Hydro-QA` repo. **No real tests yet.** Validate that RF installs, runs, produces output, and integrates with the existing `summary.json` reporting contract — using a dummy sanity suite.

## Goal

After this scaffold lands, the user can:

1. Trigger the **Robot Sanity** workflow manually in GitHub Actions and see it pass green in under 2 minutes.
2. Download an artifact containing `log.html` (native RF report), `output.xml`, and a `summary.json` in the existing Hydro-QA schema.
3. Run the same flow locally with a single command on Windows PowerShell.
4. Begin writing real API tests in subsequent iterations by dropping `.robot` files into `robot/suites/<name>/` and adding an entry in the bundle runner — no further infrastructure work required.

## Non-Goals (explicit)

- ❌ Write any real Hydrocert API/UI/lab test.
- ❌ Modify any existing Node script, Maestro flow, or workflow (except adding one entry to a dict in `run_regression_bundle.mjs`).
- ❌ Add the Robot sanity suite to nightly or post-deploy schedules.
- ❌ Add Teams notification, Excel reporter, or `/qa` tracker integration for Robot.
- ❌ Install `robotframework-browser` or any UI/mobile library.
- ❌ Touch `hydrocert-web`, `hydrocert-services`, Azure infra, Cloudflare, DNS, certificates, Key Vaults, Logic Apps, alerts.
- ❌ Use Hydrocert credentials. The sanity suite makes **zero** network calls.
- ❌ Write to the `/qa` tracker, GitHub Issues, Project Board, or Teams.

## Constraints

- **Read-only on hydrocert-web / hydrocert-services**: untouched. Per memory `feedback_hydroqa_constraints`.
- **Direct push to `main` on Hydro-QA**: no PR required (per repo convention), but implementation goes through writing-plans + executing-plans skills.
- **No real lab submissions**: per memory `feedback_hydrocert_lab_no_real_submissions`. Sanity suite does not even reach this concern — it makes no network calls at all.
- **Tool priority**: CLI > REST API > MCP > skills > Playwright. Robot Framework introduces a Python-CLI runner that fits at the top of this hierarchy.

## Architecture

### Folder layout (additions only — nothing existing is renamed or deleted)

```
Hydro-QA/
├── robot/                                       # NEW
│   ├── suites/
│   │   └── sanity/
│   │       └── hello.robot                      # 3 dummy tests (SAN01-SAN03)
│   ├── resources/                               # empty — placeholder for future api.resource, fixtures.resource
│   ├── lib/
│   │   └── output_xml_to_summary.py             # output.xml → summary.json converter
│   ├── runner/
│   │   └── run_robot_suite.mjs                  # Node wrapper, bundle-compatible
│   ├── requirements.txt                         # pinned: robotframework, robotframework-requests
│   └── README.md
├── docs/superpowers/specs/                      # NEW
│   └── 2026-05-12-robot-framework-scaffold-design.md   # this file
├── scripts/run_regression_bundle.mjs            # MODIFIED: 1 entry appended to SUITES dict (dormant)
└── .github/workflows/
    └── robot-sanity.yml                         # NEW, workflow_dispatch only
```

### Component responsibilities

| Component | Purpose | Inputs | Outputs |
|---|---|---|---|
| `robot/suites/sanity/hello.robot` | Prove RF engine runs | none | RF test results in `output.xml` |
| `robot/lib/output_xml_to_summary.py` | Bridge RF output to Hydro-QA reporting | `output.xml` path | `summary.json` (existing schema) |
| `robot/runner/run_robot_suite.mjs` | Make Robot suites callable from `run_regression_bundle.mjs` | env: `ROBOT_SUITE_PATH`, `ROBOT_SUITE_ID` | stdout line `SUMMARY_JSON=<path>` |
| `.github/workflows/robot-sanity.yml` | CI sanity gate (manual trigger) | none | artifact `robot-sanity-<run_id>` |
| `scripts/run_regression_bundle.mjs` (modified) | Pre-wires Robot suite integration without activating it | (no behavior change) | (no behavior change) |

## Data Flow

```
                ┌────────────────────────────────────────┐
                │  GitHub Actions: workflow_dispatch     │
                │  .github/workflows/robot-sanity.yml    │
                └────────────────┬───────────────────────┘
                                 │
            ┌────────────────────┼────────────────────┐
            ▼                                         ▼
   pip install -r                              robot --outputdir
   robot/requirements.txt                      qa-artifacts/robot/sanity
                                                   robot/suites/sanity/
                                                          │
                                                          ▼
                                       qa-artifacts/robot/sanity/
                                         ├── output.xml
                                         ├── log.html
                                         └── report.html
                                                          │
                                                          ▼
                       python robot/lib/output_xml_to_summary.py
                         --input  qa-artifacts/robot/sanity/output.xml
                         --output qa-artifacts/robot/sanity/summary.json
                                                          │
                                                          ▼
                                       qa-artifacts/robot/sanity/summary.json
                                       (existing Hydro-QA schema)
                                                          │
                                                          ▼
                                   actions/upload-artifact@v4
                                   name: robot-sanity-<run_id>
                                   retention: 14 days
```

For the bundle-compatibility path (`run_robot_suite.mjs`), the flow is the same except a Node wrapper invokes `robot` + the converter and emits `SUMMARY_JSON=<path>` on stdout, matching the contract at `scripts/run_regression_bundle.mjs:211`.

## Sanity Suite Detail

**File:** `robot/suites/sanity/hello.robot`

3 tests, all **`safeOnProd`**, **zero network**, **zero credentials**:

| Tag id | Purpose | Why it matters |
|---|---|---|
| `SAN01` | `Should Be Equal As Integers ${1 + 1} 2` + `Log` | Confirms Robot engine itself runs |
| `SAN02` | Variable substitution + `Should Contain` | Confirms RF variable resolution works |
| `SAN03` | `Get Environment Variable HYDROCERT_API_BASE` + `Should Not Be Empty` | Confirms CI env vars reach Robot (read-only string check — no fetch) |

**Tag convention adopted for all future suites:**
- `id:XXX` — maps to `id` field in `summary.json` (mandatory)
- `area:xxx` — maps to `area` field (mandatory)
- `safeOnProd` / `devOnly` / `load` — optional filters for `robot --include` / `--exclude`

This convention enables the existing **Test Suite Arrangement Audit** Variant A pattern (safeOnProd tagging) for the Robot stack without retrofitting later.

## Reporting Bridge

### Input: Robot Framework `output.xml`

Standard RF output. Per-test structure includes `<tags>` and `<status status="PASS|FAIL|SKIP"/>`.

### Output: Hydro-QA `summary.json` schema

Matches the schema produced by all existing Node suites (`scripts/tmp-dev-infra-*.mjs`):

```json
{
  "totals": { "total": N, "pass": N, "fail": N, "skip": N },
  "checks": [
    {
      "id":      "SAN01",
      "area":    "sanity",
      "test":    "SAN01 Robot Framework Runs",
      "status":  "PASS",
      "details": "",
      "evidence": []
    }
  ]
}
```

### Mapping rules

- `id` ← first tag matching `id:*` (split on first `:`). Falls back to test name if missing.
- `area` ← first tag matching `area:*`. Falls back to `"robot"`.
- `test` ← Robot test name (full, including ID prefix per convention).
- `status` ← `<status status="...">` attribute, verbatim.
- `details` ← `<status>` text (failure message), trimmed/truncated to 320 chars; empty string for `PASS`.
- `evidence` ← always empty for sanity (no screenshots). Future suites can extend the converter to attach paths.

## Bundle Runner Pre-Wiring

**Single modification** in existing code: append to the `SUITES` dict in `scripts/run_regression_bundle.mjs`:

```js
robotsanity: {
  key: 'robotsanity',
  id: 'ROBOTSAN03',
  label: 'Robot Sanity (scaffold)',
  script: path.join('robot', 'runner', 'run_robot_suite.mjs'),
  tests: 3,
},
```

**`selectedSuiteKeys()` is NOT modified.** Therefore:
- Nightly runs: do not invoke Robot.
- Post-deploy runs: do not invoke Robot.
- `npm run regression:bundle`: does not invoke Robot.

The entry exists so that a future PR can flip the switch by adding `'robotsanity'` (or a real suite key) to one or more of the arrays in `selectedSuiteKeys()`.

## CI Workflow

**File:** `.github/workflows/robot-sanity.yml`

- Trigger: `workflow_dispatch` **only**.
- Runner: `ubuntu-latest`.
- Timeout: 10 minutes.
- Permissions: `contents: read`.
- Concurrency group: `robot-sanity` (no cancel-in-progress).
- Steps:
  1. `actions/checkout@v4`
  2. `actions/setup-python@v5` with `python-version: '3.12'`, pip cache keyed on `robot/requirements.txt`
  3. `pip install -r robot/requirements.txt`
  4. Log `robot --version` and `python --version` for debugging
  5. Run `robot --outputdir qa-artifacts/robot/sanity ... robot/suites/sanity/`
  6. Run converter to produce `summary.json`
  7. `actions/upload-artifact@v4` with `name: robot-sanity-<run_id>`, retention 14 days, `if: always()`
  8. Publish workflow summary with totals (read from `summary.json`)
- Env:
  - `HYDROCERT_API_BASE: ${{ vars.HYDROCERT_DEV_API_BASE }}` — only for SAN03 to read the string (no fetch).
- Secrets used: **none**. `HYDROCERT_QA_EMAIL` / `HYDROCERT_QA_PASSWORD` are intentionally NOT wired in.
- Teams notification: **not added**.

## Local Run (Windows PowerShell)

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

To validate bundle compatibility locally without nightly side-effects:

```powershell
$env:ROBOT_SUITE_PATH = "robot/suites/sanity"
$env:ROBOT_SUITE_ID   = "ROBOTSAN03"
node robot/runner/run_robot_suite.mjs
# Expect: stdout ends with SUMMARY_JSON=<absolute-path>
```

## Dependencies

`robot/requirements.txt` (pinned):

```
robotframework==7.1.1
robotframework-requests==0.9.7
```

Rationale: `robotframework-requests` is included to validate the future API path is unblocked, even though sanity does not use it. Pinning to known-stable versions avoids surprise breakage in CI.

`robotframework-browser` is intentionally excluded — it pulls in Node + Playwright again, duplicating an existing CI cost. Add when first UI test is written.

## Error Handling

| Failure mode | Detection | Outcome |
|---|---|---|
| `pip install` fails | `setup-python` step exit code | Job fails before Robot runs; artifact step skipped |
| Robot syntax error in `hello.robot` | Robot exit code > 250 | `run_robot_suite.mjs` exits 2; CI step fails; `if: always()` still uploads any partial artifacts |
| Robot test failure (e.g., SAN03 env var not set) | Robot exit code 1..250 | `run_robot_suite.mjs` proceeds to conversion; `summary.json` records FAIL; CI step succeeds (failures are visible in artifact, matching the existing `regression_bundle exits 0 on logical FAILs` pattern of the repo) |
| Converter crashes | Python exit code != 0 | Wrapper exits 3; CI step fails; `output.xml` still uploaded by `if: always()` |
| `HYDROCERT_API_BASE` repo variable not set | SAN03 fails with `Should Not Be Empty` | Visible FAIL in `summary.json`; signals CI vars need configuration |

## Verification Checklist (post-implementation, before declaring done)

- [ ] `Robot Sanity (scaffold)` workflow appears in the Actions tab.
- [ ] Manual dispatch produces a green run in <2 minutes.
- [ ] Artifact `robot-sanity-<run_id>` contains `output.xml`, `log.html`, `report.html`, `summary.json`.
- [ ] `summary.json` has `totals.total = 3`, `totals.pass = 3`, `totals.fail = 0`.
- [ ] `log.html` opens in a browser and shows the 3 test cases with tags.
- [ ] Local run on Windows PowerShell produces identical `summary.json`.
- [ ] `node robot/runner/run_robot_suite.mjs` prints `SUMMARY_JSON=<path>` as last line.
- [ ] `node scripts/run_regression_bundle.mjs --dry-run` does **NOT** list `ROBOTSAN03` (proves dormancy).
- [ ] No file under `hydrocert-web`, `hydrocert-services`, or any Azure resource changed.
- [ ] No outgoing network requests to `*.hydrocert.com`, `*.gen-cert.com`, `*.azurewebsites.net` from sanity suite (verifiable via `output.xml` — RequestsLibrary not imported in `hello.robot`).

## Out-of-Scope Future Work (next iterations)

These are tracked here for visibility, not for this scaffold:

1. **First real Robot suite** — likely `LABCON15` from `[[Lab API QA Automation]]` plan (already designed in Obsidian). Will require `api.resource`, `fixtures.resource`, `lab_helpers.resource`.
2. **`robotframework-browser`** — add when first UI suite is written.
3. **Bundle activation** — add `'robotXxx'` to one or more arrays in `selectedSuiteKeys()` when a real suite is ready for nightly.
4. **Teams reporting for Robot** — extend the existing nightly Teams card to include Robot suites once they run alongside Node suites in the bundle.
5. **Excel reporting for Robot** — `generate_regression_excel_dashboard.py` already consumes `combined-summary.json`. Once Robot suites enter the bundle, they appear in Excel automatically (no Excel script change required).

## References

- `[[QA Automation Overview]]` — Hydro-QA repos, suites, constraints
- `[[Test Suite Arrangement Audit]]` — Variant A `safeOnProd` tagging proposal (Robot tag convention here is its native implementation)
- `[[Lab API QA Automation]]` — first candidate suite for real Robot tests
- Memory: `feedback_hydroqa_constraints`, `feedback_regression_bundle_exits_0`, `feedback_hydrocert_lab_no_real_submissions`, `feedback_hydrocert_tool_priority`
- Code refs: `scripts/run_regression_bundle.mjs:16-90` (SUITES dict), `:92-98` (`selectedSuiteKeys`), `:204-235` (suite spawn + `SUMMARY_JSON` contract), `:237-242` (totals aggregation)
- Tracker: `https://dev.gen-cert.com/qa` (untouched by this scaffold)

## Approval Trail

- 2026-05-12: Folder structure — approved
- 2026-05-12: Dependencies + sanity suite — approved (with explicit confirmation: no Hydrocert infra touched)
- 2026-05-12: Converter + wrapper — approved
- 2026-05-12: CI workflow + local run + non-goals — approved
