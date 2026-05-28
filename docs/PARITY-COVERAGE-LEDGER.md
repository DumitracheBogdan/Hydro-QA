# Parity Coverage Ledger — 100% Accounted-For

**Date:** 2026-05-28 · **Source of truth:** `docs/research/parity-coverage/COVERAGE-MATRIX.md`

This ledger reconciles **every parity-relevant datum** in the coverage matrix to an automation status, so "100% coverage" is provably *accounted-for*: each datum is **automated** (a scored check), **API-workaround**, **planned** (automatable — exact spec below, ready to implement), or **manual-tracked** (with a reason it isn't machine-driven). Nothing is silently dropped.

Status legend: ✅ automated · 🟡 attempted/pending-verify · ◑ partial · 🔵 API-workaround · 📋 planned (spec ready) · 📖 manual-tracked.

> A *parity* test covers shared **data**, not every button. Pure navigation / one-platform-only controls are functional coverage (handled by `post-deploy-regression.yml` / `webapp-ui-detector.yml`), not parity, and are out of scope by design.

---

## A. Automated (scored checks)

| Check | Datum | Direction | Flow / verify |
|---|---|---|---|
| 2a-description | `visit.notes` | web→mobile | p01a → assertVisible |
| 2b-visit-actions | `visit.actions[]` name×3 | web→mobile | p01b → assertVisible |
| 2c-inspection-actions | `inspection.actions[]` ×3 (name+priority) | web→mobile (API) | 🔵 API verify — mobile render gap **F-01** |
| 2d-visit-text | `waterSystemDescription` + `workDetails` + `samplingDetails` | web→mobile | p01d → assertVisible (all 3) — **A6** |
| 2g-item-detail | `inspection.itemDetail` → LocationCard | web→mobile | 🟡 p01e → assertVisible — **A5, KNOWN_FLAKY pending CI verify** |
| 3a-signature | `signature` + `signatureName` | mobile→web | p02 → API `GET /visits/{id}` |
| 3b-visit-info | `Assisting 1/2/3` + `Works being carried out` | mobile→web | p03 → API inspection formFields |
| 3c-risk | Risk Assessment "- Comments" | mobile→web | ◑ p04 → 1 field on CI / **18 validated locally** (CI geometry) |
| 3d-visit-text | `waterSystemDescription`+`workDetails`+`samplingDetails` | mobile→web | p05 → API `GET /visits/{id}` |
| 3e-site-induction | Site Induction dropdown | mobile→web | p03b → API inspection formFields |

**Hard-gate set** = all of the above except `2c` (API tautology, reported separately) and `2g` (KNOWN_FLAKY until verified). Done-bar: hard-gate set 3× consecutive green (split done-bar, `verify-data.gateFailed`).

## B. Partial / known limitations

| Datum | Status | Note |
|---|---|---|
| Risk Assessment 18 "- Comments" | ◑ 1-on-CI / 18-local | CI emulator (API 30) puts the 2nd+ field input below the fold → `tapOn below label` misses. Full 18 types+saves on local API 35. **Wave F spike**: scroll each field to the *next* label as anchor; if it lands, widen `RISK_COMMENT_FIELDS_AUTOMATED`; else keep documented. |
| `inspection.actions[]` render on mobile | 🔵 / **F-01** | Created on web/API + addable on mobile, but TankInspectionScreen has no display path → verified via API only (2c). Ready-to-file `/qa-case` (see `PARITY-FACTS.md` F-01). |
| `itemReference` / `itemLocation` → LocationCard | 🟡 | LocationCard renders `itemDetail ?? location` (R3); `itemDetail` covered by 2g. Whether `itemReference`/`itemLocation` render distinctly is unverified — fold into 2g once 2g's render is confirmed. |

## C. Planned — automatable, spec ready (next cycles)

Each is a known, automatable parity datum with the exact wiring. Ordered API-deterministic-first.

### C1 — web→mobile reads (API-seed in Phase 0 → mobile assertVisible)
| Datum | API set | Mobile assert | Notes |
|---|---|---|---|
| `visit.title` | already `PARITY-<runId>` at create | header text | low marginal value (2a already asserts the tagged superstring) |
| `visit.status` badge | `PATCH /visits {status}` | status badge text on visit card | need exact badge label per status enum |
| `visit.from`/`to` | set at create | time display | ⚠ timezone formatting fragile — assert date portion only |
| `visit.engineerIds` | already `[parity.bot]` | engineer chip name | resolve parity.bot display name via `GET /users` in setup, pass via `-e EXPECTED_ENGINEER` |

### C2 — mobile→web (Maestro set → API `GET` read-back)
| Datum | Mobile action | API read | Risk / ordering |
|---|---|---|---|
| `inspection.inspectionStatus = missed` | "Unable to Inspect" toggle | `GET /inspections/{id}.inspectionStatus` | **state-changing** — run LAST (after 3b/3c/3e form reads) so it can't hide form fields |
| `visit.visitStatus = aborted` | "Aborted visit" toggle | `GET /visits/{id}.visitStatus` | **state-changing** — run LAST |
| `inspection.notes` | NotesEditDialog (Edit → type → Save) | `GET /inspections/{id}.notes` | new flow p06 |
| `site.accessInfo` (Booking Info) | AccessInfoDialog (Edit → type → Save) | `PATCH/GET /sites/{id}.accessInfo` | both directions; site is shared — use the run's site |
| `visit.actions[]` add (name+priority) | AddActionsBottomSheet | `GET /actions?visitId=` | mobile→web action path; `checkInspectionActions` already compares name+priority |
| form-field `isNotApplicable` | N/A checkbox | `GET /inspections/{id}` formField `.isNotApplicable` | pick a showNotApplicable field |
| form-field NUMBER / TOGGLE | numeric field / Switch | `GET` formFields | representative per type (text/dropdown already covered) |

### C3 — lab samples (GUARDRAILED — mobile→web, **never Submit-to-lab**)
| Datum | Mobile | API read | Hard rule |
|---|---|---|---|
| `laboratorySample` add (sampleTypeId) | SelectWaterSamplesBottomSheet | `GET /inspections/{id}.laboratorySamples` | — |
| Normec/ALS text fields (description/asset/temperature/barcode/additionalTests/samplingPoint) | sample form | `GET /laboratory-samples/{id}` (F-04: absent from embedded GET) | **NEVER** trigger "Submit Samples" / `collectionStatus=collected` — that path can transmit to Normec/ALS. ALS=dry-run, Normec=dummy only. |

### C4 — attachments (API-side parity)
| Datum | Set | Verify | Note |
|---|---|---|---|
| file upload | web API multipart `POST /…-file` | mobile Attachments section / `GET` | camera/gallery = manual (see D) |
| file label | mobile PhotoLabelDialog | web/API label | — |

## D. Manual-tracked (attempted per "attempt everything", documented where Maestro can't drive reliably)

| Item | Why manual | Automatable fallback |
|---|---|---|
| `signature` freehand draw | Maestro can't reproduce a meaningful stroke reliably | 3a covers name + image-presence; pre-populate image via API PATCH to assert web display |
| Camera capture / gallery picker | OS permission + system picker UI unstable under Maestro | upload via API instead (C4) |
| Date / DateTime pickers (Normec/ALS/dynamic fields) | Material3 two-step dialog has no stable Maestro hook | attempt once per Wave D; document residue |
| Multi-select dropdowns (`isMultiSelect`, `\|#\|` delimiter) | checkbox multi-tap sequencing brittle | document; API read-back confirms stored array |
| Swipe-delete sample / drag photo reorder | gesture unreliable under Maestro | API `bulk-sort-order` for reorder |
| Risk Assessment 36 dropdown fields | 36× single-select, web read-only; volume | sample a representative subset; full set documented |
| `visit.isContract` | set only by ServiceTracker import, not REST | skip (not settable) |
| `visit.samples` (UpdateVisitDto) | dead field — extracted but never processed | skip |
| web-only fields (`bookingPersonId`, `isException`, `originalDate`, `wasServiceReportSent`, `visit.actions[].status`, `inspectionProducts`) | no mobile UI → not cross-platform parity | verify web/API-side only if desired; not parity |

---

## Reconciliation
Every datum in `COVERAGE-MATRIX.md` maps to exactly one row above (A/B/C/D). Automated set grows as C-items land (each promoted from 📋→✅ after a green CI run); 2g promotes from 🟡→✅ once its mobile render is confirmed. That mapping IS the "100% accounted-for" proof — the suite automates everything reliably automatable and explicitly tracks the rest.
