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

Trigger via UI: Actions tab -> "Robot Sanity (scaffold)" -> "Run workflow".

Or via gh CLI:

```bash
gh workflow run robot-sanity.yml --ref main
gh run watch  # picks the latest run
```

First validated run: `25701295560` (2026-05-12, 12s, 3/3 PASS).

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
