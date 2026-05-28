# QUEUED NEXT TASK (user, 2026-05-28) — Evidence Excel for all Hydro-QA workflows

**Start only AFTER the bidirectional-parity task is fully wrapped.** Set a `/goal` for this when starting.

## Ask
Survey **all the other workflows** in `DumitracheBogdan/Hydro-QA` and produce an **Excel that shows evidence/proof that each test actually works** — not just "it ran", but real proof it tests what it claims. **Think out of the box.** Crucially: **verify each screenshot is actually correct** (right screen, not blank/ANR/stale/error-dialog) — a screenshot is only evidence if it shows the real expected state.

## Workflows in scope (`.github/workflows/`)
`bidirectional-parity.yml` (just hardened), `nightly-regression.yml`, `post-deploy-regression.yml`, `post-deploy-regression-mobile.yml`, `mobile-ui-detector.yml`, `webapp-ui-detector.yml`, `robot-sanity.yml`, `snyk-hydrocert.yml`, `claude-populator*.yml` (5). (Populator = data-patching automation, not a test — classify separately.)

## Likely approach (refine when starting)
- Per workflow: what it tests, last N CI runs (`gh run list`), pass/fail, artifacts produced, and the **actual evidence** (assertions made, screenshots/reports). Pull artifacts, OPEN screenshots, and validate each shows the correct screen (out-of-the-box: OCR/visual check that the SS isn't blank/ANR/login-error; cross-check against the step it claims to prove).
- Out-of-the-box evidence ideas: assertion counts, screenshot-content validation (not just existence), report parsing, run-history stability, coverage mapping (what each suite actually exercises), flaky-detection.
- Build the Excel (python `openpyxl` available) — one sheet/section per workflow + a summary dashboard. Save to the QA screenshot/report folder per `feedback_qa_screenshot_folder` or as requested.
- Use Workflow tool (multi-agent) per the user's "workflow" keyword + ultracode.

## Constraints (carry over)
QA repo only; product repos read-only; no real Normec/ALS; dev only; no Claude attribution; don't disrupt the live trading fleet (no heavy local emulator unless cleared).
