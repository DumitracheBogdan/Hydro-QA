# RESUME — Parity Dual-UI Evidence (F2–F5)

**Paste this into a fresh session to continue.** Foundation (F1) is done + committed.

## Paste-ready resume prompt
> Continue the Hydrocert parity **dual-UI evidence** work in `C:\Users\Coca-Cola\tmp-hydroqa\Hydro-QA` (DumitracheBogdan/Hydro-QA, push to main, no PR, no Claude attribution, dev only, product repos read-only). Design+plan: `docs/superpowers/specs/2026-05-28-parity-dual-ui-evidence-design.md`. Per-datum contract (selectors + evidence mode): `docs/PARITY-CONTRACT.md`. F1 done. Do F2→F5 on etape, CI-validated, autoheal, use superpowers + agents. Goal: parity proves each datum with BOTH webapp + mobile screenshots + the API-GET connection check, reported in an Excel matching the existing generators (Description + real Steps + Expected/Actual + embedded pass/fail screenshots web+mobile).

## State (2026-05-28 / 29)
- ✅ **Parity hardened** (fail-closed gate verified; 10 checks; 3× green) — `PARITY-REVIEW.md`, `SECURITY.md` (⚠ ROTATE the 2 exposed creds), `PARITY-COVERAGE-LEDGER.md`.
- ✅ **Evidence Excel v1** (8 workflows, 24 validated screenshots) — in QA folder; builder `scripts/build_evidence_excel.py`; `docs/WORKFLOW-EVIDENCE-SUMMARY.md`.
- ✅ **F1**: `docs/PARITY-CONTRACT.md` — per-datum web/mobile selectors + evidence mode.

## Evidence mode per check (from F1)
- `2a` notes, `2b` actions → **real-web-set+mobile-verify** (webapp editable: Edit Notes / New Action modal).
- `2d`, `2g` → **api-set+web-screenshot+mobile-verify** (assumed web display-only — flip to real-web-set if the inspection/visit edit form exposes inputs; verify at runtime).
- `3a,3b,3c,3d,3e` → **mobile-set+web-render-verify** (mobile sets; screenshot webapp rendering it).
- `2c` → **api-api-only** (F-01, mobile render gap — never visual cross-platform).

## F2 — `scripts/parity/webapp-shots.mjs` (the big one)
Reuse (do NOT rebuild): `scripts/lib/webapp-login.mjs launchAuthed()` (⚠ **un-freeze its 2026-04-16 clock** for a TODAY-dated visit), `scripts/qa-maestro-web-smoke.mjs shot()/settled()`, `scripts/qa-resume-extra-addvisit.mjs mark()/shot()`, `scripts/parity/api.mjs makeClient()` (resolve visit UUID from `visitRef`), `parity-context.json`. Save to `$SHOTS`=`qa-artifacts/parity/screenshots` as `{check}-web-{set|verify}.png`.
- args `(set|verify)`; per the contract, set-phase does 2a/2b real web set; verify-phase screenshots 2d/2g (web display) + 3a–3e (web render).
- **Provisional selectors** (2g/3b/3c/3e web read — inspection-expanded DOM not in baseline; radix IDs like `#radix-_r_6_` are dynamic/unstable): use **text/role Playwright locators** + **runtime discovery** (best-effort locate + screenshot + log the surrounding DOM so the next run refines). Continue-on-error per check; never hard-crash a phase.
- **VALIDATE LOCALLY FIRST** against dev.gen-cert.com (Playwright is installed locally) before CI — discover the real selectors fast, no 30-min cycle. Needs `HYDROCERT_QA_EMAIL`/`_PASSWORD` (check Obsidian `credentials.md`).

## F2 wiring
- `run-parity-test.sh`: add Phase 0.5 (web set-side 2a/2b after API setup) + Phase 3.5 (web verify-side 2d/2g/3a–3e after mobile). Guard with `command -v`.
- `.github/workflows/bidirectional-parity.yml`: **CHECK FIRST** whether `HYDROCERT_QA_EMAIL`/`_PASSWORD` secrets exist (webapp-ui-detector uses them — `gh secret list`). Add chromium install (`npx playwright install --with-deps chromium`) + web env to the emulator step. ⚠ Verify chromium runs inside the `reactivecircus/android-emulator-runner` step context; if not, a separate job sharing `parity-context.json` via artifact may be needed.

## F3 — connection layer explicit
`verify-data.mjs`: label each API-GET result as the connection check; optional `GET /activity-logs?entityType=&entityId=` breadcrumb. DB/Azure = documented escalation only (stale creds + firewall).

## F4 — `scripts/build_parity_evidence_excel.py`
Model on `scripts/generate_mobile_regression_excel.py` (Summary cards + table w/ cross-sheet hyperlinks; Details w/ `add_image_scaled`) + `generate_regression_excel_dashboard.py` (Description / Issue Summary / Reproduction Steps columns; PALETTE + status fills; steps GENERATED via per-check maps). Per check: Description, real Steps-to-reproduce (hand-authored per check id), Expected, Actual, connection result, **embedded webapp + mobile screenshots** (before/after pairs already exist per flow). Save to QA folder.

## F5
CI validate (3× green incl. new web steps) + autoheal; regenerate Excel; update PARITY-FACTS / ledger / Obsidian / memory.
