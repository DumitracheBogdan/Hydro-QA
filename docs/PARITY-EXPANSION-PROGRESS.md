# Parity Expansion — Overnight Progress Tracker (2026-05-30)

**GOAL (autonomous, until done):** implement every AUTOMATABLE check from `docs/PARITY-ADD-VERIFY-CATALOG.md` (35 new), each = add on a platform + photo on both UIs + API connection verify, CI-validated + autohealed, promoted to gate when green. P4-manual stays documented. Don't break the green suite.

**Pattern per check (mirror 2g/2h):** setup-data (buildExpected + PATCH/add in create+reuse paths) → verify-data (checkX comparator + EXPECTED_IDS + KNOWN_FLAKY-until-green + wire main) → tests (TDD) → webapp-shots ({id}-web-verify.png) → mobile flow pXX + orchestrator Phase wiring → gen-report FLOW map + build_parity_evidence_excel CHECK_TO_FLOW + EVIDENCE_MAP → CI → promote (remove from KNOWN_FLAKY) on green.

**CI:** `gh workflow run bidirectional-parity.yml -R DumitracheBogdan/Hydro-QA`; gate keys on summary.gateFailed; new checks KNOWN_FLAKY first. Creds: tq@hydrocert.com / TechQuarter2025! (API+web), parity GH secrets. Web base var HYDROCERT_DEV_WEB_BASE. Sample inspection for probes: 2b442e37-11e7-490c-a7d6-32e1b44e5a92.

## Done (gated unless noted)
- Suite = **11 checks**: 2a,2b,2c(API),2d,2g,2h(samples 16/16),3a,3b,3c,3d,3e. Dual-UI (web+mobile photos) + rich report.html + run-summary list + download buttons.

## Waves (from catalog, by priority)
- [~] **Wave 1 (P1 safe, web->mobile API-set):** 4a-inspection-notes, 4b-booking-info(site.accessInfo), 4c-item-reference, 4d-item-location. (agent in flight)
- [ ] **Wave 2 (P1 form-fields, mobile->web):** form-field NUMBER, TOGGLE/switch, N/A flag (isNotApplicable). Needs Maestro flows.
- [ ] **Wave 3 (P2 web->mobile API-set):** visit.status badge, visit.engineers chip, visit.from/to (CAUTION: don't break today-dating/mobile search), add/delete inspection.
- [ ] **Wave 4 (P2 mobile->web state):** inspection missed (Unable to Inspect), visit aborted, mobile add-action (name+priority). STATE-CHANGERS → run LAST in Phase 2, after form reads, or they hide fields.
- [ ] **Wave 5 (P2 samples+actions+attach):** sample note, sample delete, sample lab-assign, action delete, attachment label, attachment delete.
- [ ] **Wave 6 (P3 hard, attempt+KNOWN_FLAKY/doc):** attachment upload (API multipart), attachment reorder (bulk-sort-order), RA-18-on-CI (scroll-anchor), RA-36-dropdowns.
- [ ] **P4 manual (document only — already in catalog):** signature freehand, camera/gallery, date pickers, multiselect dropdown, swipe/drag gestures, mobile->web sample-add gap, Normec/ALS field-set, submit-batch GUARDRAIL.

## Guardrails
QA repo only; product repos read-only; dev only; **NEVER** Submit-to-Normec/ALS (POST /laboratory-samples/submit-batch); no Claude attribution; don't change visit title/ref/dates in a way that breaks mobile search; promote a check only after a green CI run with it.
