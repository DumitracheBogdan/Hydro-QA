# Parity Expansion — Overnight Progress Tracker (2026-05-30)

**GOAL (autonomous, until done):** implement every AUTOMATABLE check from `docs/PARITY-ADD-VERIFY-CATALOG.md` (35 new), each = add on a platform + photo on both UIs + API connection verify, CI-validated + autohealed, promoted to gate when green. P4-manual stays documented. Don't break the green suite.

**Pattern per check (mirror 2g/2h):** setup-data (buildExpected + PATCH/add in create+reuse paths) → verify-data (checkX comparator + EXPECTED_IDS + KNOWN_FLAKY-until-green + wire main) → tests (TDD) → webapp-shots ({id}-web-verify.png) → mobile flow pXX + orchestrator Phase wiring → gen-report FLOW map + build_parity_evidence_excel CHECK_TO_FLOW + EVIDENCE_MAP → CI → promote (remove from KNOWN_FLAKY) on green.

**CI:** `gh workflow run bidirectional-parity.yml -R DumitracheBogdan/Hydro-QA`; gate keys on summary.gateFailed; new checks KNOWN_FLAKY first. Creds: tq@hydrocert.com / TechQuarter2025! (API+web), parity GH secrets. Web base var HYDROCERT_DEV_WEB_BASE. Sample inspection for probes: 2b442e37-11e7-490c-a7d6-32e1b44e5a92.

## Done (gated unless noted)
- Suite = **11 checks**: 2a,2b,2c(API),2d,2g,2h(samples 16/16),3a,3b,3c,3d,3e. Dual-UI (web+mobile photos) + rich report.html + run-summary list + download buttons.

## Waves (from catalog, by priority)
- [x] **Wave 1 (P1 safe, web->mobile API-set):** 4a-inspection-notes, 4b-booking-info, 4c-item-reference, 4d-item-location — DONE, CI-VERIFIED PASS (run 26668604041, 17/17). Photos correct (2i shot shows item-ref/loc on web). **PROMOTE: remove from KNOWN_FLAKY on next verify-data edit (after Wave 4 agent, to avoid file conflict).**
- [x] **Wave 2:** 2i-add-inspection (2 inspections shown on web), 2j-visit-status(confirmed) — DONE, CI-VERIFIED PASS. PROMOTE with Wave 1.
- [~] **Wave 3:** 4e-mobile-action (mobile->web) — committed, KNOWN_FLAKY; Wave 3 CI (26669275076) pending (p12 mobile flow is the flaky part).
- [~] **Wave 4:** 2k-sample-note, 2l-engineers (web->mobile) — agent in flight.
- NEXT verify-data edit must: remove from KNOWN_FLAKY -> {4a,4b,4c,4d,2i,2j} (CI-verified PASS); keep {4e,2k,2l} until their CI green.
- [ ] **Wave 2 (P1 form-fields, mobile->web):** form-field NUMBER, TOGGLE/switch, N/A flag (isNotApplicable). Needs Maestro flows.
- [ ] **Wave 3 (P2 web->mobile API-set):** visit.status badge, visit.engineers chip, visit.from/to (CAUTION: don't break today-dating/mobile search), add/delete inspection.
- [ ] **Wave 4 (P2 mobile->web state):** inspection missed (Unable to Inspect), visit aborted, mobile add-action (name+priority). STATE-CHANGERS → run LAST in Phase 2, after form reads, or they hide fields.
- [ ] **Wave 5 (P2 samples+actions+attach):** sample note, sample delete, sample lab-assign, action delete, attachment label, attachment delete.
- [ ] **Wave 6 (P3 hard, attempt+KNOWN_FLAKY/doc):** attachment upload (API multipart), attachment reorder (bulk-sort-order), RA-18-on-CI (scroll-anchor), RA-36-dropdowns.
- [ ] **P4 manual (document only — already in catalog):** signature freehand, camera/gallery, date pickers, multiselect dropdown, swipe/drag gestures, mobile->web sample-add gap, Normec/ALS field-set, submit-batch GUARDRAIL.

## Guardrails
QA repo only; product repos read-only; dev only; **NEVER** Submit-to-Normec/ALS (POST /laboratory-samples/submit-batch); no Claude attribution; don't change visit title/ref/dates in a way that breaks mobile search; promote a check only after a green CI run with it.


---

## FINAL OVERNIGHT STATUS (2026-05-30)
**Suite: 20 checks, 19 HARD-GATED, 1 KNOWN_FLAKY (4e).** Final confirming CI: run 26670639867.

**Built + PROMOTED to gate (8 new, CI-verified PASS run 26669758113, 19/20):**
- 4a inspection-notes, 4b booking-info (site.accessInfo), 4c item-reference, 4d item-location (web->mobile API-set)
- 2i add-inspection (2nd jobType; web shows 2 inspections), 2j visit-status=confirmed (web->mobile)
- 2k sample-note (per-sample note), 2l engineers (2nd engineer, parity.bot preserved)
Each: setup add (API) + web photo (webapp-shots) + mobile photo (pXX) + API verify + report/Excel.

**KNOWN_FLAKY (built, reports, non-gating):**
- 4e mobile-action (mobile->web add-action) — API comparator sound; the p12 Maestro AddActionsBottomSheet flow FAILS on the CI emulator (selectors). Needs mobile-flow selector iteration to set the action on-device, then promote. The mobile->write Maestro flows are the flaky frontier (same class as the 18-field RA).

## Remaining backlog (NOT auto'd overnight — rationale per item)
Deliberately not implemented to protect the green gate / because not safely automatable in CI:
- **State-changers (mobile->web): inspection missed (Unable to Inspect), visit aborted.** Marking missed/aborted changes inspection/visit STATE and can HIDE the form fields that 3b/3c/3e read -> would break hard-gated checks. Must run isolated/last with care; deferred. (mobile->web direction already covered by 3a-3e.)
- **Form-field types (number/toggle/N-A) mobile->web:** the parity jobType 658f27c1 (Visit Information + Risk Assessment) may not expose NUMBER/TOGGLE/showNotApplicable fields -> need a jobType that has them (like samples needing requiresWaterSample). Conditional.
- **sample-delete / action-delete (destructive):** deleting a sample changes laboratorySamples count -> breaks 2h (16/16); deleting an action breaks 2b. Only safe on test-only items with care.
- **P3 hard:** attachment upload (multipart) + reorder (drag/bulk-sort), RA-18-on-CI (scroll geometry), RA-36 dropdowns. Attempt with KNOWN_FLAKY; Maestro-hostile.
- **P4 manual (documented in catalog):** signature freehand draw, camera/gallery, date/datetime pickers, multi-select dropdowns, swipe/drag gestures, mobile->web sample-add (Room-only, no endpoint, syncs only on forbidden Submit), Normec/ALS field-set, submit-batch GUARDRAIL (NEVER).

**To promote 4e:** fix p12 selectors (mobile FAB -> Actions -> AddActionsBottomSheet -> Add Custom Action -> name + priority + Save) on the CI emulator; once CI shows 4e PASS, remove from KNOWN_FLAKY.

---

## DROPDOWN WAVE (2026-05-30) — 4f: 36 Risk Assessment Yes/No dropdowns

**Why:** dropdown parity coverage was **1/75** surfaces (only 3e Site Induction). Discovery sweep
`docs/PARITY-DROPDOWNS-CATALOG.md` (4-agent workflow) mapped EVERY dropdown on both apps; 53 addable
new checks, the bulk being the **36 Risk Assessment Yes/No dropdowns** of the parity jobType (P1, easiest,
identical to the proven 3e pattern).

**Built (4f-ra-dropdowns):** ONE check, 36 datums (mirrors 2h = 16 samples).
- `RA_DROPDOWN_FIELDS` (36 exact fieldNames, GENERATED from the live dev dump, asserted length===36).
- `buildExpected.raDropdowns` = {fieldName: alternating Yes/No}.
- `addRaDropdowns(c, inspectionId, expected)` — GET inspection, resolve each dropdown's InspectionFormField
  id by fieldName, `PATCH /inspections/{id}/submit-form {formFields:[{id,value}]}`. Called in create + reuse.
- verify: reuses `checkFields("4f-ra-dropdowns", "Web->Mobile (API)", inspection, "Risk Assessment", raDropdowns)`
  — all 36 must match (fail-closed). EXPECTED_IDS += 4f, KNOWN_FLAKY += 4f (until CI confirms render).
- Evidence: p15 mobile flow (RA form photo) + web shot + gen-report FLOW + Excel CHECK_TO_FLOW/EVIDENCE_MAP.

**Probe-verified live before building (advisor caught these):**
1. `submit-form` is **MERGE** not replace — setting the 36 dropdowns does NOT null the 18 free-text
   "- Comments" that 3c reads. So 4f is safe at any phase; cannot red 3c's green gate.
2. 36 fieldNames generated from the dump (not retyped) — incl. anomalies "Releasing Aerosols - Risks
   Managed?" (plural) + "Assesing Chemical Dosing Equipment" (backend typo).
3. **End-to-end live PASS:** buildExpected -> addRaDropdowns -> submit-form -> GET -> checkFields = 36/36, restored.

**+7 unit tests (97 total green).** Committed ab86e3d. CI validation: run **26683132921** (in flight).

**Promote-vs-relabel decision (the render discriminator):** web UI is read-only on these (F-02), so
"Web->Mobile" is API-set -> the **mobile RA photo (p15-after.png) is the real-vs-tautology discriminator**.
After CI: if the mobile RA form shows the Yes/No values -> promote 4f to the gate (remove from KNOWN_FLAKY).
If blank -> keep flaky, relabel "API-only", file an F-01-style render-gap finding (precedent: 2c).

**Remaining dropdown backlog (from the catalog, deferred):** P2b entity Selects (product, action-status —
visit-status=2j & engineers=2l already cover those datums), P2 mobile-set (photo label, predefined action,
flaky like 4e), P3 multi-select (needs isMultiSelect toggle / different jobType), P4 Normec/ALS sample
dropdowns (GUARDRAIL — mobile-only, manual, NEVER submit-batch).
