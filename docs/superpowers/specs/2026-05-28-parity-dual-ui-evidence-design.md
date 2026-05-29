# Parity Dual-UI Evidence — Design + Plan

**Date:** 2026-05-28 · **Repo:** DumitracheBogdan/Hydro-QA · **Status:** Approved (decisions below), executing
**Builds on:** `docs/PARITY-FACTS.md`, `docs/PARITY-COVERAGE-LEDGER.md`, investigation `wf_8e4fd6df-ca7`

## Goal
Make the bidirectional-parity test prove propagation with **visual evidence on BOTH UIs** (webapp + mobile) per check, backed by a **connection-level (no-UI) check first**, and report it in an **Excel that matches the existing Hydro-QA generators** (Summary + per-check Description + real Steps-to-reproduce + Expected/Actual + embedded pass/fail screenshots). Today the webapp side is API-only (zero webapp screenshots) — that is the gap this closes.

## Three-layer evidence model (per check)
1. **Connection (no UI) — API GET** read-back (`verify-data.mjs`), the most robust parity verify (both clients read the same REST contract). Labeled explicitly. Optional `GET /activity-logs` breadcrumb. (DB Postgres / Azure App Insights = documented manual escalation only — stale creds + per-IP firewall, not in CI.)
2. **Webapp UI** screenshot — proves the value was set on / renders on the webapp.
3. **Mobile UI** screenshot — proves the value was set on / renders on mobile (exists today).

## Direction model
- **web→mobile** (2a notes, 2b visit-actions, 2d visit-text, 2g itemDetail): SET on the web side → screenshot web (set-side) → verify renders on mobile (screenshot).
- **mobile→web** (3a signature, 3b visit-info, 3c risk, 3d visit-text, 3e site-induction): SET on mobile (screenshot) → verify renders on the webapp UI (screenshot, verify-side).
- **2c** inspection-actions: API↔API only (F-01, mobile doesn't render) — label as such, not visual cross-platform parity.

## Approved decisions (2026-05-28)
1. **Hybrid web SET:** for datums the webapp CAN edit (notes, description, visit-text, actions), perform a REAL webapp-UI set (type+Save) + screenshot. For web-read-only datums (dropdowns, signature, toggles, blank fields — F-02/F-03), keep set on mobile/API and screenshot the webapp DISPLAYING the value. PARITY-CONTRACT records which mode per datum.
2. **API GET = the connection layer** (explicit in report) + optional `GET /activity-logs` breadcrumb. DB/Azure = documented escalation, not wired into CI.
3. **Staged, all 10 checks:** order by reliability — (a) webapp read-only render screenshots, (b) mobile→web verify-side shots, (c) real webapp-UI sets — incremental, each validated on CI.

## Reusable infra (from investigation — do NOT rebuild)
- **Webapp login/launch:** `scripts/lib/webapp-login.mjs` `launchAuthed({webBase,email,password,viewport})` → authed headless chromium on dev.gen-cert.com. ⚠ It freezes the clock to 2026-04-16 — for a live parity run pass an UN-frozen/run-dated clock or the TODAY-dated visit won't be found.
- **Web screenshot/annotate:** `scripts/qa-maestro-web-smoke.mjs` `shot()/settled()`, `scripts/qa-resume-extra-addvisit.mjs` `mark()/clearMarks()/shot()`, `scripts/webapp-ui-detector/{crawler,annotate}.mjs`.
- **REST client:** `scripts/parity/api.mjs` `makeClient(base)` — resolve visit UUID from `visitRef` via `GET /visits/filter?visitReference=`.
- **State:** `parity-context.json` (visitId, inspectionId, visitRef, expected map).
- **Screenshot dir/naming:** `run-parity-test.sh:61/69` `$SHOTS` = `qa-artifacts/parity/screenshots`, `{name}-before.png`/`-after.png`.
- **Excel format to copy:** `scripts/generate_mobile_regression_excel.py` (Summary cards + table w/ cross-sheet hyperlinks; Details w/ embedded screenshot via `add_image_scaled`) + `scripts/generate_regression_excel_dashboard.py` (Description / Issue Summary / Reproduction Steps / Path / Evidence columns; PALETTE + status fills; steps GENERATED via `build_steps`/`build_issue_summary` maps). Shared PALETTE (navy 0F172A, pass 0F766E/CCFBF1, fail B91C1C/FEE2E2, skip 92400E/FEF3C7), `card()`, `add_image_scaled()`.

## Phased plan
- **F1 — `docs/PARITY-CONTRACT.md`** (foundation): one row per datum = {datum | direction | web SET field/selector + editable-on-web? | web READ (API + UI selector) | mobile SET/READ selector + widget strategy | BE field}. Built by reading source (read-only): mobile `DynamicFormField`/`TaskDetailsSummaryTab.kt`/`LocationCard*.kt`/`SignatureDialog`; web inspection-form + VisitDetailsPanel. Field LABELS come from PARITY-FACTS (backend-config, already exact) — do not re-extract.
- **F2 — `scripts/parity/webapp-shots.mjs`** (Playwright): args `(phase=set|verify, checkId)`; reads parity-context; resolves UUID; navigates; per the contract either SET+Save (editable) or just screenshot (read-only); saves `{check}-web-{set|verify}.png` to `$SHOTS`. Wire orchestrator: Phase 0.5 (web set-side: 2a/2b/2d/2g where editable) + Phase 3.5 (web verify-side: 3a/3b/3c/3d/3e). Workflow yml: install chromium (`npx playwright install --with-deps chromium`) + add `HYDROCERT_DEV_WEB_BASE` + `HYDROCERT_QA_EMAIL`/`_PASSWORD` to the emulator step env. Un-freeze the login clock.
- **F3 — connection layer explicit:** verify-data labels the API-GET result as the connection check per datum; optional activity-logs breadcrumb.
- **F4 — `scripts/build_parity_evidence_excel.py`:** Summary (cards + per-check table) + Details per check: Description, real Steps-to-reproduce (hand-authored per check id), Expected, Actual, connection result, **embedded webapp screenshot + mobile screenshot**, PASS/FAIL fills. Replaces the generic evidence Excel for parity. (Reuse the new `build_evidence_excel.py` patterns + the mobile-regression generator's embedding.)
- **F5 — CI validate + autoheal (3× green incl. new web steps); regenerate Excel + summary; update PARITY-FACTS/ledger/Obsidian/memory.**

## Constraints
QA repo only (read FE/mobile SOURCE for selectors, never modify); dev only; no real Normec/ALS; no Claude attribution; CI-validated; don't disrupt the live trading fleet.
