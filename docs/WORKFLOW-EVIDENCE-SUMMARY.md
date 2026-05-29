# Hydro-QA Workflow Evidence - Summary

**2026-05-28.** Evidence that each CI *test* workflow actually works, gathered by 8 parallel agents that read each workflow + its scripts, pulled CI history, downloaded artifacts, and **visually judged every sampled screenshot** (rendered each + verified it shows the correct screen). Full workbook with embedded screenshots: `QA - Tracker Photo-video/Hydro-QA-Workflow-Evidence-2026-05-28.xlsx`. Regenerate: re-run the gather workflow + `python scripts/build_evidence_excel.py <out.json> <xlsx>`.

## Headline
**1/8 test workflows PROVEN; 7 WEAK.** Screenshots validated: **23/24 show the correct screen.**

Only `bidirectional-parity` (just hardened) is Proven - real fail-closed assertions + 23/24 valid screenshots. The other 7 mostly **run green without truly asserting** (the fail-open / regression-bundle-exits-0 pattern) or produce evidence that isn't validated. Actionable takeaway: the suite *executes* broadly but only one workflow *proves* it caught a regression.

## Per-workflow verdicts

| Workflow | Verdict | Assertions | Screenshots (valid/total) | Key gap |
|---|---|---|---|---|
| `bidirectional-parity.yml` | **Proven** | strong | 7/7 | Fail-closed path never observed firing in CI: 'goes red on regression' is proven by construction (unit tests exercising  |
| `nightly-regression.yml` | **Weak** | weak | 6/6 | JOB-LEVEL FAIL-OPEN: no step consumes steps.bundle.outputs.failed_tests to fail the job; suites exit 0 on logical FAIL a |
| `post-deploy-regression.yml` | **Weak** | weak | n/a (report) | FAIL-OPEN: add a gate — either process.exit(1) when totals.fail>0 in run_regression_bundle.mjs (after artifact write), o |
| `post-deploy-regression-mobile.yml` | **Weak** | weak | 5/6 | Fail-open: continue-on-error:true (workflow:41) + 'set +e' in run-mobile-v2-test.sh make the job green even with 10/38 f |
| `mobile-ui-detector.yml` | **Weak** | weak | n/a (report) | Cannot validate ANY screenshot/Excel evidence — all artifacts expired (14-day retention; newest run 2026-04-23, 35+ days |
| `webapp-ui-detector.yml` | **Weak** | weak | 5/5 | Fail-open: a stable UI regression (missing/renamed button, removed page, text change) is recorded in diff.json but the j |
| `robot-sanity.yml` | **Weak** | strong | n/a (report) | Artifacts EXPIRED (expired:true, retention 14d, run 17d old) - log.html/report.html/output.xml/summary.json could not be |
| `snyk-hydrocert.yml` | **Weak** | weak | n/a (report) | No gating: continue-on-error on test/code/monitor means severity_threshold never fails the job — findings are advisory o |

## Notable findings (out-of-the-box)

- **Screenshot validation caught a flawed assertion** in `post-deploy-regression-mobile.yml`: `27_inspection_start-after.png` - FAIL flow — a real 'Cooling Tower Cleaning form' inspection rendered fine (Pre/Inspection/Post accordions, Actions, Attachments), but flow expected '(Visit Information|Save)' which this form type doesn't show; assertion fired against a valid-but-different screen (test expectation, not app, is wrong).
- **7/8 workflows have weak/absent assertions** - they can report green while a regression slips through (same class of bug just fixed in parity). Recommend applying the parity fail-closed pattern (dedicated gate step + exit-on-fail + pinned expected-checks) to the regression suites.

## Non-test automation (classified, not evidence-graded)

- `claude-populator.yml` - DATA-PATCHING automation, NOT a QA test. Lives in the Hydro-QA test repo but is production data-population, not a test suite. Patches the la
- `claude-populator-v2.yml` - DATA-PATCHING automation, NOT a QA test. Production data-population housed in the test repo. Patches the laboratorySamples field on Hydrocer
- `claude-populator-v2-prod.yml` - DATA-PATCHING automation, NOT a QA test. Patches the laboratorySamples field on Hydrocert PRODUCTION inspections via PATCH /inspections (+ D
- `claude-populator-v2-prod-james-watch.yml` - DATA-PATCHING automation, NOT a QA test. Patches the laboratorySamples field on Hydrocert PRODUCTION inspections via PATCH /inspections (+ D
- `claude-populator-watchdog.yml` - NOT a data-patching workflow and NOT a QA test. It is monitoring/observability over the patchers. Prompt explicitly states 'NEVER PATCH Hydr
- `claude-populator-rollback.yml` - Data-MUTATING automation, NOT a QA test. It is the inverse of the patchers: it un-patches / removes laboratorySamples that a prior dev popul
