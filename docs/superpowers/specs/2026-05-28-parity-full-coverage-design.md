# Parity Suite — Full-Coverage Extension + Review (Design Spec)

**Date:** 2026-05-28
**Repo:** DumitracheBogdan/Hydro-QA (push direct to `main`, no PR, no Claude attribution)
**Builds on:** `docs/bidirectional-parity-design.md`, `docs/PARITY-FACTS.md`, `docs/research/parity-coverage/COVERAGE-MATRIX.md`
**Environment:** dev only (`dev.gen-cert.com` / `api.dev.gen-cert.com`)
**Status:** Design (approved decisions below; pending implementation plan)

---

## 1. Goal

Take the existing bidirectional web↔mobile parity suite from **9 checks** to **honest 100% coverage** of the parity-relevant surface, and **review** the existing suite for correctness/robustness before expanding.

"100%" is defined against the *parity datum* — every field/value that exists on both platforms and can be created on one and read on the other. It is **not** every button/navigation element (those are functional coverage, handled by `post-deploy-regression.yml` / `webapp-ui-detector.yml`). The authoritative scope list is `COVERAGE-MATRIX.md`.

**Honest-100% contract:** every datum in the matrix is *accounted for* — either **automated** (a scored check) or **documented as a tracked manual check with rationale**. Nothing is silently dropped.

## 2. Approved decisions (2026-05-28)

1. **Scope ceiling = attempt everything, including hard items.** Drive date pickers, multi-select dropdowns, and freehand signature draw via Maestro where possible; fall back to an API-side workaround (pre-populate/read-back via REST) where Maestro genuinely cannot drive the widget; document only the empirically-proven-impossible residue as manual. The matrix's "Manual-Only" set is a *starting hypothesis to challenge*, not an exemption.
2. **Done-bar = split + realistic.** Deterministic **API-parity** checks must pass **3 consecutive green CI runs**. **Maestro-UI** checks are judged **best-of-3** with any residual flake explicitly documented (check id + cause). Every check keeps its own `continue-on-error` isolation so one flaky tap cannot blind the rest.
3. **F-01** (inspection actions created via API/web don't render on mobile) — keep documented; produce a ready-to-fire `/qa-case`; user decides when to file. Do not auto-file.

## 3. Deliverable 1 — Review pass (gates the expansion)

Runs **before** any expansion. A comparator/setup bug in the existing scripts would propagate into every new check stacked on top. Parallel read-only agents audit:

- **R-scripts:** `scripts/parity/{api,setup-data,verify-data,gen-p04,gen-report}.mjs` + their `*.test.mjs` — comparator correctness (`extractFormValue`, `checkFields`, `checkVisitText`, signature/actions logic), `??`-vs-`||` nullish traps, write→read field-name drift, payload-builder edge cases, test adequacy.
- **R-orchestrator:** `scripts/run-parity-test.sh` + `.github/workflows/bidirectional-parity.yml` — phase sequencing, per-phase `continue-on-error`, mobile-result file merge, scoring math, secret/var wiring, APK download, ANR handling, the Phase 1.5 `waterSystemDescription` clear.
- **R-flows:** the 8 `mobile-flows-parity/*.yaml` + `_shared/*` — selector fragility vs `BUTTON-MAP-MOBILE.md`, ambiguous-label traps ("Visit Details" tab vs card), async-save pattern, `name:` `<`/`>` Windows crash, idempotency for the run_flow retry-once.
- **R-coverage:** end-to-end wiring — does each of the 9 advertised checks actually flow setup→flow→verify→score→report? Any check that can pass vacuously (e.g. asserting `"" === ""`)?

**Adversarial verification:** each finding is independently re-checked by a second agent against the cited `file:line` before it enters `docs/PARITY-REVIEW.md`. Severity-classified (Blocker / High / Medium / Low). **Blockers and Highs are fixed before Phase 1**; Medium/Low are folded into the relevant expansion wave or logged.

## 4. Deliverable 2 — Expansion waves (API-verified-first → Maestro-UI-last)

Existing 9 checks are preserved. New checks ordered so deterministic ones land first and fragile UI ones are isolated at the end. Each new check = (optional setup datum) + (flow or API action) + (verify fn) + (report row), TDD'd at the comparator layer like the existing ones.

### Wave A — Web→mobile reads (API-seed in Phase 0 → assert on mobile in Phase 1). Deterministic setup.
- `visit.title` → mobile header
- `visit.status` badge (scheduled/confirmed/…) → mobile visit card
- `visit.from`/`to` → mobile time display
- `visit.engineerIds` → mobile engineer chip
- `inspection.itemReference` / `itemLocation` / `itemDetail` → mobile LocationCard (read-only)
- `visit.workDetails` / `samplingDetails` **web→mobile** direction (3d covers mobile→web only)

### Wave B — Mobile→web toggles & fields (Maestro set → API read).
- `inspection.inspectionStatus = missed` — "Unable to Inspect" toggle
- `visit.visitStatus = aborted` — "Aborted visit" toggle
- `inspection.notes` — NotesEditDialog
- `site.accessInfo` — Booking Info (AccessInfoDialog) — both directions
- mobile **add-action** (visit-level: name + priority via AddActionsBottomSheet) — the mobile→web action path (inspection-level is the F-01 gap)
- form-field `isNotApplicable` flag — N/A checkbox → `GET` confirms `.isNotApplicable=true`

### Wave C — Generic dynamic-form-field-type parity (one representative per type).
Text single/multi + dropdown already covered (Visit Info / Site Induction / RA comments). Add: **NUMBER** field, **TOGGLE/Switch** field. Verify via `GET /inspections/{id}` formFields.

### Wave D — Lab samples — **GUARDRAILED** (mobile→web).
- Add `laboratorySample` (sampleTypeId) + Normec/ALS text fields (description, asset, temperature, barcode, additionalTests, samplingPoint) → read back via `GET /laboratory-samples/{id}` (F-04: some fields absent from embedded inspection GET).
- Attempt the dropdowns (matrix/suite/laboratoryCode/sampleType) and date pickers per Decision 1.
- **HARD EXCLUSION:** never trigger "Submit Samples" / `collectionStatus=collected`. That path can transmit to Normec/ALS. ALS=dry-run, Normec=dummy only. No test sends real lab data. (Memory: `feedback_hydrocert_lab_no_real_submissions`.)

### Wave E — Attachments (API-side parity).
- Upload file via web API multipart → assert mobile Attachments section shows it.
- Set file label on mobile (PhotoLabelDialog) → read on web via API.
- Camera capture / gallery picker / drag-reorder: attempt per Decision 1; expect to document as manual (OS-permission + gesture limits) with API bulk-sort-order as the reorder workaround.

### Wave F — 18-field Risk Assessment on CI (**bounded spike**).
- Re-attempt full 18 on the CI emulator (API 30) using the scroll-each-field-to-**next**-label anchor so the current field's input stays on-screen. Widen `RISK_COMMENT_FIELDS_AUTOMATED`.
- **Timebox.** If it doesn't land quickly, keep the documented 1-on-CI / 18-validated-locally gap. 100% is NOT gated on this single item.

### Hard items attempted (Decision 1), with expected fallbacks:
- **Freehand signature draw** — Maestro swipe strokes; fallback = API PATCH pre-populate + verify web display (current 3a already does name; add image presence).
- **Date/DateTime pickers** — Maestro Material3 dialog taps; fallback = documented-manual.
- **Multi-select dropdowns** (`isMultiSelect`, `|#|` delimiter) — Maestro multi-tap; fallback = documented-manual.
- **36 RA dropdown fields** — sample a representative subset; full set documented.

## 5. Verification model

- **Comparator/unit:** `node --test scripts/parity/` green after every script change (TDD, like the existing 20 tests).
- **Local emulator (API 35):** author/validate each new Maestro flow before CI.
- **CI (`bidirectional-parity.yml`, API 30):** the integration test. Apply the split done-bar (Decision 2).
- **Report:** `gen-report.mjs` extended to group checks by direction and flag known-flaky / manual-tracked rows so the HTML report shows the honest-100% accounting.

## 6. Coverage ledger

`COVERAGE-MATRIX.md` gains an **Automation status** column per datum: `automated` / `automated (API workaround)` / `manual-tracked (reason)`. A final reconciliation asserts every matrix row has a status and every scored check maps to a matrix row — that reconciliation IS the "100% accounted-for" proof.

## 7. Constraints (unchanged)

- Product repos (`hydrocert-web` FE, `hydrocert-services` BE, `tmp-hydrocert-android` mobile) are **read-only** — source analysis only, never modified.
- All work in `Hydro-QA` only. Dev only. Push direct to `main`, no PR. No Claude attribution in commits.
- No test transmits real data to Normec/ALS (Wave D hard exclusion).

## 8. Risks

1. **CI flakiness scales with check count** (9→~30 against a cold emulator). Mitigated by API-first ordering, per-check isolation, and the split done-bar.
2. **Hard items may not be Maestro-drivable** — Decision 1 means *attempt*, with API workaround + honest documentation as the floor, not silent omission.
3. **Dev-data accumulation** — each run leaves a `PARITY-*` visit. Consider a best-effort cleanup step (delete the run's visit at the end) — to be decided in the plan.
4. **Wave F rabbit hole** — explicitly timeboxed.
