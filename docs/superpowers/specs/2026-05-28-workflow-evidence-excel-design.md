# Workflow Evidence Excel — Design Spec

**Date:** 2026-05-28 · **Repo:** DumitracheBogdan/Hydro-QA · **Queued by:** user (asleep, autonomy granted)
**Builds on:** `docs/NEXT-TASK-evidence-excel.md`
**Status:** Design (proceeding autonomously — user pre-authorized; gray-area decisions made below)

## Goal
Produce an **Excel workbook proving each Hydro-QA *test* workflow actually works** — real evidence, not "it ran green". The signature requirement: **every sampled screenshot is visually validated** (an agent renders it and judges whether it shows the correct expected screen, not blank / ANR / login-error / stale / wrong-screen). A screenshot is only evidence if it shows the real expected state.

## Scope
**Test workflows (8) — full evidence treatment:**
`bidirectional-parity.yml`, `nightly-regression.yml`, `post-deploy-regression.yml`, `post-deploy-regression-mobile.yml`, `mobile-ui-detector.yml`, `webapp-ui-detector.yml`, `robot-sanity.yml`, `snyk-hydrocert.yml`.

**Non-test automation (5) — classified, not evidence-graded:** `claude-populator*.yml` (data-patching). One summary row each in a separate section.

## Evidence model (per test workflow) — out of the box
1. **Purpose / what it tests** — from the `.yml` + invoked scripts.
2. **CI stability** — `gh run list --workflow=X --limit ~10`: pass/fail/cancelled, dates, flake rate.
3. **Artifacts** — what it produces (reports, screenshots, Excel, logs); retention.
4. **Assertion strength** — does it actually *assert* (fail on regression) or just execute? Parse the suite/report for real checks. (This is where the parity suite's old fail-open hid — apply that lens to all.)
5. **Screenshot validation (CORE)** — download the latest run's artifacts; an agent *renders* each sampled screenshot (Read tool) and returns a per-screenshot verdict: `correct` / `blank` / `ANR-dialog` / `login-error` / `stale-wrong-run` / `wrong-screen`, with a one-line reason. Sample intelligently (key before/after + a representative spread, ~5–10 per workflow), not all.
6. **Coverage** — what the suite actually exercises vs claims.
7. **Verdict** — `Proven` (real assertions + valid evidence + stable) / `Weak` (runs but thin/unvalidated evidence) / `Broken/Stale`, with rationale + gaps.

## Excel structure (`openpyxl`)
- **Sheet "Summary"** — dashboard: one row per workflow → verdict, last-run result, flake rate, # screenshots validated, # valid vs problematic, headline evidence. Conditional-format the verdict.
- **Sheet "Screenshots"** — one row per sampled screenshot: workflow, run id, filename, verdict, reason, + **embedded thumbnail** (visual proof in-sheet).
- **Per-workflow sheets** — detailed evidence (purpose, CI history table, assertions, coverage, gaps).
- **Sheet "Automation (non-test)"** — the 5 populator workflows classified.

## Engine
Workflow tool (user said "workflow"; ultracode). One agent per test workflow: reads the `.yml` + scripts, pulls CI history, downloads latest artifacts, **renders + judges screenshots**, returns structured evidence (schema-validated). A barrier collects all, then I assemble the Excel locally with `openpyxl` (embedding the validated screenshots).

## Decisions (gray areas, user asleep)
- Save the `.xlsx` to `C:\Users\Coca-Cola\OneDrive - TechQuarter\Documents\QA - Tracker Photo-video\` (private QA folder, per `feedback_qa_screenshot_folder`) — NOT the public repo. A short markdown summary may go in the repo.
- Screenshot sampling: representative (~5–10/workflow), prioritizing before/after + assertion-moment shots; note total vs sampled.
- If a workflow has no screenshot artifacts (e.g. snyk, robot-sanity), evidence = its report/log output instead; mark "no screenshots (N/A)".

## Constraints (carry over)
QA repo read context only (don't modify product repos); dev only; no real Normec/ALS; no Claude attribution; don't disrupt the live trading fleet (no heavy local emulator). Read-only survey — this task produces an Excel + summary, it does not change the workflows.
