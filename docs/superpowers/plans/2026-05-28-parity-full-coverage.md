# Parity Full-Coverage — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-05-28-parity-full-coverage-design.md`
**Review:** `docs/PARITY-REVIEW.md` (19 findings)
**Repo:** `C:\Users\Coca-Cola\tmp-hydroqa\Hydro-QA` (DumitracheBogdan/Hydro-QA, push direct to main, no PR, no Claude attribution)
**Discipline:** TDD at the comparator layer (`node --test scripts/parity/`); local emulator (API 35) before CI; the split done-bar from the spec.

---

## Wave 0 — Fix wave (gates expansion)

Fixes the fail-open cluster + cheap robustness items. All in the QA repo. TDD: write/extend the failing test, then fix.

### 0.1 — Scoring integrity (`scripts/parity/verify-data.mjs`) [H1, H3, M6, M8, M10, L1, L6]
- [ ] Extract a pure `buildSummary(ctx, apiChecks, mobileChecksOrNull)` that: pins `EXPECTED_IDS` (the 9 current ids); pushes a synthetic `FAIL` for any expected id missing from the assembled set; treats `mobileChecksOrNull === null` (file absent/corrupt) as a synthetic `FAIL` (`{id:'mobile-results', status:'FAIL'}`); computes total/passed/failed.
- [ ] `checkFields`/`checkVisitText`: empty expected object ⇒ `FAIL` (`keys.length>0 && every`); keep `undefined`→FAIL semantics (don't conflate missing with `""` when `want` is non-empty — guard for future empty `want`).
- [ ] `main()`: read mobile-results as `null` on catch (not `[]`); call `buildSummary`; `if (summary.failed > 0) process.exit(1)` after writing `summary.json`.
- [ ] Tests: `buildSummary` with (a) null mobile ⇒ FAIL present; (b) a missing expected id ⇒ synthetic FAIL; (c) failed>0 path; empty-expected ⇒ FAIL.

### 0.2 — Comparator: priority (`verify-data.mjs`) [M1]
- [ ] `checkInspectionActions` (and visit-actions if scored via API): match on `name` AND `priority`. Test: priority mismatch ⇒ FAIL.

### 0.3 — CI gate step (`.github/workflows/bidirectional-parity.yml`) [H2, M7, L2]
- [ ] Add a gate step **after** the emulator step, **no `continue-on-error`**: fail if `summary.json` absent, or `s.failed>0`, or `s.total < EXPECTED_API` (the deterministic floor). Keep the emulator step `continue-on-error: true` so artifacts/report still upload; the gate is what turns the job red.
- [ ] Split the done-bar in the gate: deterministic API checks must be green; Maestro-UI checks reported but (per spec) judged best-of-3 — encode as a separate non-gating summary line + a `PARITY_STRICT` toggle (default: gate API-only).
- [ ] Remove dead `HYDROCERT_WEB_BASE` env (or comment as reserved).

### 0.4 — Setup hardening (`scripts/parity/setup-data.mjs`) [M2, M3]
- [ ] Drop `|| list[0]`; bind only on exact title/ref match, else throw (both `findVisitByTitle` and the VISIT_REF reuse path).
- [ ] Reuse path: derive `runId` from `visit.title` (`replace(/^PARITY-/,'')`) before `buildExpected`, and export it so the orchestrator passes the derived RUN_ID to the flows.

### 0.5 — Flow robustness [M5, L3]
- [ ] `p03_mobile2web_visit_info.yaml`: `eraseText` before each `inputText` (Assisting 1/2/3 + Works).
- [ ] `p02_mobile2web_signature.yaml`: anchor `^Submit$`; add post-Submit assertion that "Tap to sign" is replaced by a preview.

### 0.6 — Phase-2 exit-code wiring (`scripts/run-parity-test.sh`) [M4, L4]
- [ ] Capture each Phase-2 flow exit code; write them into `parity-mobile-results.json` as flow-status entries; `verify-data` ANDs the p03b flow status into 3e (the fixed-value check), and surfaces any Phase-2 crash as a check FAIL.

### 0.7 — Test coverage [M8, M9]
- [ ] New `scripts/parity/gen-p04.test.mjs`: render the p04 flow, assert emitted `inputText` value + count + labels equal `RISK_COMMENT_FIELDS_AUTOMATED` / `buildExpected('X').riskAssessment`.

### 0.8 — Metric honesty [L5]
- [ ] Report 2c as a labeled known-gap smoke check; in `gen-report.mjs` separate the "parity pass-count" from the 2c known-gap row (don't let it inflate the headline). Note F-01 inline.

**Wave 0 gate:** `node --test scripts/parity/` all green; one CI run where an injected FAIL turns the job RED, and a clean run is GREEN with `total === EXPECTED`.

---

## Waves A–F — Expansion (API-verified-first → Maestro-UI-last)

Each new check = setup datum (`buildExpected`) + flow/API action + verify fn + report row + comparator test. Reconcile every new check to a `COVERAGE-MATRIX.md` row.

### Wave A — Web→mobile reads (API-seed → assert on mobile) — deterministic
- [ ] A1 `visit.title` → mobile header
- [ ] A2 `visit.status` badge → mobile visit card
- [ ] A3 `visit.from`/`to` → mobile time display
- [ ] A4 `visit.engineerIds` → mobile engineer chip
- [ ] A5 `inspection.itemReference`/`itemLocation`/`itemDetail` → mobile LocationCard
- [ ] A6 `visit.workDetails`/`samplingDetails` web→mobile (reverse of 3d)

### Wave B — Mobile→web toggles & fields (Maestro set → API read)
- [ ] B1 `inspection.inspectionStatus = missed` (Unable to Inspect toggle)
- [ ] B2 `visit.visitStatus = aborted` (Aborted visit toggle)
- [ ] B3 `inspection.notes` (NotesEditDialog)
- [ ] B4 `site.accessInfo` Booking Info (AccessInfoDialog) — both directions
- [ ] B5 mobile add-action (visit-level name+priority, AddActionsBottomSheet)
- [ ] B6 form-field `isNotApplicable` (N/A checkbox)

### Wave C — Generic form-field-type parity (representatives)
- [ ] C1 NUMBER field · [ ] C2 TOGGLE/Switch field (text/dropdown already covered)

### Wave D — Lab samples (GUARDRAILED — no Submit-to-Normec/ALS)
- [ ] D1 add `laboratorySample` (sampleTypeId) + read back via `GET /laboratory-samples/{id}`
- [ ] D2 Normec/ALS text fields (description, asset, temperature, barcode, additionalTests, samplingPoint)
- [ ] D3 dropdowns/date pickers attempted per Decision 1; document residue
- [ ] **HARD EXCLUSION:** never trigger Submit Samples / `collectionStatus=collected`

### Wave E — Attachments (API-side parity)
- [ ] E1 upload file via API → assert mobile Attachments section
- [ ] E2 set label on mobile → read on web; camera/gallery/drag attempted, residue documented

### Wave F — 18-field Risk Assessment on CI (bounded spike)
- [ ] F1 widen `RISK_COMMENT_FIELDS_AUTOMATED`; scroll each field to the NEXT label as anchor; timebox — else keep documented gap.

### Hard items attempted (Decision 1)
- [ ] Freehand signature draw (Maestro strokes; fallback API PATCH + display assert)
- [ ] Date/DateTime pickers · multi-select dropdowns · 36 RA dropdown subset — attempt, document residue as manual-tracked.

---

## Closeout
- [ ] `COVERAGE-MATRIX.md`: add an **Automation status** column; reconcile — every row has a status, every scored check maps to a row (the "100% accounted-for" proof).
- [ ] `gen-report.mjs`: group by direction; flag known-flaky / manual-tracked rows.
- [ ] Surface F-01 as a ready-to-fire `/qa-case` (don't auto-file).
- [ ] 3 CI runs for the split done-bar; update `PARITY-FACTS.md` + Obsidian + memory.
