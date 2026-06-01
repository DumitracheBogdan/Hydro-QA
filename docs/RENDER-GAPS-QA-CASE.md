# RENDER-GAPS — consolidated ready-to-file QA case (mobile inspection screen)

The bidirectional parity triage surfaced a cluster of findings about web/API data **not rendering on the mobile inspection screen**. This document consolidates the **GENUINE-BUG** findings into a single tracker-fileable QA case (one ticket, one section per field), and separately documents the **BY-DESIGN** findings that are *not* bugs (so they are not filed by mistake).

> Note: the genuine-bug section below describes **product** bugs in the mobile app (`hydrocert-android`), surfaced by the QA parity work. Filing it is outward-facing — your call on timing. To file: paste the QA-CASE block to `/qa-case`, or run the skill with it.

Companion to `docs/F-01-qa-case-ready.md` (F-01, inspection-level **actions** no-show). F-01 (finding 2c) is re-stated here as Bug A so this is the single "inspection screen render gaps" ticket; if F-01 is already filed, file only Bug B and cross-reference.

---

# QA-CASE (file as ONE tracker item)

**Title:** Mobile inspection screen render gaps — inspection-level actions and asset itemLocation not shown (web/API shows them)

**Location:** Mobile app — Inspection screen (`TankInspectionScreen`). Dev (`dev.gen-cert.com` / Android debug build). Two cards on this screen: the **Actions** card (`TankInspectionScreen.kt:727-758`) and the **Location** card (`TankInspectionScreen.kt:509-514`).

**Description:** Two distinct asset/inspection fields that are stored server-side and shown on the **web** Inspection Details are not reliably visible on the **mobile** inspection screen. Both are parity gaps the suite cannot assert on-device today (no on-device assertion exists for either). They share one screen and one theme — "web/API data not rendered on the mobile inspection screen" — so they are filed together. Sub-bugs:

- **Bug A (finding 2c / F-01):** Inspection-level **actions** are not confirmed to render on mobile, while the sibling **visit-level** actions card does render (and is verified on-device). The mobile render+parse path now exists, but the data it depends on is delivered only via the aggregate sync endpoint, whose payload population is unverified; the historical empirical result was a no-show, and no on-device re-test exists.
- **Bug B (finding 4d):** The inspection asset's **itemLocation** ("Asset Location" on web) is silently **hidden on mobile whenever itemDetail is set**, because both fields are collapsed into one shared `LocationCard` with itemDetail taking priority. In the normal real-world case (asset has both a detail and a location), the populated location is never shown to the on-site inspector.

---

## Bug A — Inspection-level actions are not confirmed to render on the mobile inspection screen (visit-level actions do) — finding 2c / F-01

**Confidence:** medium · **Classification:** GENUINE-BUG

**Description:** Actions attached to an *inspection* (created via the web ActionsPanel on the Inspection Details tab, via `POST /inspections/{id}/actions`, or via `PATCH /inspections/{id}` with an `actions` array) are stored server-side and render on the **web** Inspection Details → Actions tab (which reads `inspectionDetails.actions` from `GET /inspections/{id}`, fed at `JobRecordTabs.tsx:85` into `ActionsPanel`; there is no separate `GET /actions?inspectionId=` call).

The mobile app now contains a complete client-side path to render them:
- **Render:** the inspection Actions card `ExpandableCard` (`TankInspectionScreen.kt:727-758`) renders an `ActionCard` per action via `ActionsWidget(initialActions = convertTankActionsToActions(...), previewOnly = true)` (lines 750-756; per-row card at `ActionsWidget.kt:99-118`) when `tankInspection.actions` is non-empty. Empty-state branch (header only, no rows) is `TankInspectionScreen.kt:732-748`.
- **Parse:** `TankInspectionUseCase.kt:86` `actions = parseTankActionsFromInspectionActions(inspection.inspectionActions)`; parser at `:290-312` returns `emptyList()` when the JSON column is null/empty (`:291`).
- **Persist:** `DetailedVisitMapper.kt:141` `inspectionActions = serializeInspectionActions(inspection.inspectionActions)`; inspections mapped at `:48, 123-152`.
- **DTO:** `VisitResponseSchema.kt:88` `@Json(name = "actions") val inspectionActions: List<InspectionActionSchema>?` on `InspectionSchema`.

This mirrors the sibling **visit-level** actions card (`TaskDetailsSummaryTab.kt:380-408`: same `ExpandableCard`, same empty-state, same `ActionsWidget(... previewOnly = true)`), which is fed end-to-end (`TaskEntity.visitActionsJson` via `DetailedVisitMapper.kt:109 serializeVisitActions`) and **verified on-device** by `mobile-flows-parity/p01b_web2mobile_visit_actions.yaml`.

**Why the gap is not refuted (despite the render path existing):** Mobile has **no** `GET /inspections/{id}` endpoint (`MainApi.kt` exposes only file GETs `/inspections-file/...`). It loads inspection data **exclusively** from the aggregate sync `GET /visits/filter-detailed` (`MainApi.kt:48-60`, returning `VisitListResponseSchema{ items: List<VisitResponseSchema> }`) into the local DB; `getTankInspection` reads only `inspectionDao.getInspectionById` (`InspectionDao.kt:16`). The web's proof that "web shows actions" comes from the single-inspection `GET /inspections/{id}` (`appointmentsService.ts:156`), which proves the backend **stores** actions and embeds them in that single-inspection response — it does **not** prove the `/visits/filter-detailed` aggregate serializer embeds `inspections[].actions`, which is the only payload mobile consumes. That is a backend-serializer question, and backend source / a captured aggregate fixture is out of scope (the repo's `app/src/test` + `androidTest` contain only stub `ExampleUnitTest`/`ExampleInstrumentedTest`). The dual columns `InspectionEntity.inspectionActions` + deprecated `actions = null // Deprecated, use inspectionActions` (`InspectionEntity.kt:37,39`; `DetailedVisitMapper.kt:143`) indicate recent in-progress remediation, consistent with F-01 having been real and being fixed. The F-01 symptom (Actions card header, no rows) was empirically confirmed by the parity suite and has **not** been re-tested: there is a sibling on-device `p01b` (visit actions) and a `p12_mobile2web_add_action.yaml`, but **no** `p01c_web2mobile_inspection_actions.yaml`. Render-capability does not override a confirmed empirical no-show.

**Expected:** After creating inspection-level actions on web/API and syncing on mobile, opening the same inspection and expanding the mobile Actions card shows one row per action (name + priority), matching the web Inspection Details Actions tab and matching how mobile already renders visit-level actions.

**Actual:** Unverified on current builds and not refutable from source. The mobile render+parse path exists, but the data it depends on (`inspections[].actions` inside the `/visits/filter-detailed` aggregate payload) is not provably populated from source, and the historical empirical result was a no-show (Actions card header only, no rows). No on-device parity assertion (`p01c`) exists to confirm rows now appear; check 2c is still scored via API only.

**Steps to reproduce:**
1. On a dev visit, open an inspection.
2. Create 3 inspection-level actions (web Add Action modal in the inspection context, or `POST /inspections/{id}/actions {name, priority}`, or `PATCH /inspections/{id}` with an `actions` array).
3. Confirm they are stored and shown on the web Inspection Details → Actions tab (`GET /inspections/{id}` → `actions[]`).
4. Open the same inspection on the mobile app → expand the **Actions** card.
5. Observe whether action rows render. (Historically: header only, no rows.)
6. Also inspect the device's local sync payload `GET /visits/filter-detailed` → `items[].inspections[].actions` to confirm whether the aggregate endpoint actually delivers the nested actions.

**Severity:** Medium — data is not lost (stored and visible on web), but the on-site mobile inspector may not see inspection actions; functional/parity gap.

**Evidence:** Mobile render path `TankInspectionScreen.kt:727-758` + `ActionsWidget.kt:99-118`; parse `TankInspectionUseCase.kt:86,290-312`; persist `DetailedVisitMapper.kt:48,123-152,141,143`; DTO `VisitResponseSchema.kt:88`; mobile endpoints `MainApi.kt:48-60` (no `GET /inspections/{id}`); DAO `InspectionDao.kt:16`; entity `InspectionEntity.kt:37,39`. Web proof from a different endpoint: `appointmentsService.ts:156`, `JobRecordTabs.tsx:85`. Sibling that renders + passes on-device: `TaskDetailsSummaryTab.kt:380-408`, `DetailedVisitMapper.kt:109`, `mobile-flows-parity/p01b_web2mobile_visit_actions.yaml`. Missing assertion: no `mobile-flows-parity/p01c_web2mobile_inspection_actions.yaml`. See `docs/F-01-qa-case-ready.md`, `docs/PARITY-FACTS.md` F-01, `docs/research/parity-coverage/COVERAGE-MATRIX.md` row "INSPECTION — actions".

**Fix / next step:** Add the on-device re-test `mobile-flows-parity/p01c_web2mobile_inspection_actions.yaml` (the orchestrator already auto-detects it and would score 2c on-device instead of via API). If rows still do not appear after sync, fix the backend to embed `inspections[].actions` in the `/visits/filter-detailed` response.

---

## Bug B — Inspection itemLocation is hidden on mobile whenever itemDetail is set (shared LocationCard shadowing) — finding 4d

**Confidence:** medium · **Classification:** GENUINE-BUG

**Description:** On the mobile inspection screen, the asset's **Location** (`itemLocation`) and the asset's **Detail** (`itemDetail`) are collapsed into a single `LocationCard` that displays only one value, with `itemDetail` taking priority:

```
LocationCard(location = tankInspection.itemDetail?.takeIf { it.isNotBlank() }
                        ?: tankInspection.location?.takeIf { it.isNotBlank() })   // TankInspectionScreen.kt:509-511
```

`tankInspection.location` is the DB `InspectionEntity.itemLocation` (mapped `itemLocation -> location` at `TankInspectionUseCase.kt:66,79`; the domain model `TankInspection` has only a `location` field, no `itemLocation` — `TankInspection.kt:6,8,9`). `LocationCard` shows exactly one string (`LocationCard.kt:36-40`). The only other touch of `location` on the screen is a `Spacer`, not a value render (`TankInspectionScreen.kt:607-609`).

As a result, when an inspection has **both** an `itemDetail` and an `itemLocation` — the normal case for a real asset — the mobile app renders `itemDetail` and **silently hides** `itemLocation`; there is no other place on the inspection screen that surfaces `itemLocation`. `itemLocation` appears on mobile only in the narrow case where `itemDetail` is blank.

On the **web** the two are independent, always-present fields: the Inspection Details header renders a dedicated `DetailsCard type="itemLocation"` (`InspectionDetailsHeader.tsx:85`), and the visit Inspections panel renders an "Asset Location" card `{inspection.itemLocation || '-'}` (`InspectionsPanel.tsx:96-98`) — both separate from Asset Reference and **independent of** `itemDetail` (the web read views do not render `itemDetail` at all).

The gap is specific to `itemLocation`: the sibling **itemReference** (finding 4c) keeps its own independent mobile slot — the screen title `"$jobTypeName ($itemReference)"` (`TankInspectionUseCase.kt:70-71`) — and is never shadowed. So among the asset-field trio, two fields get independent mobile slots (itemReference = title, itemDetail = LocationCard primary) while itemLocation has no slot of its own and loses the shared LocationCard to itemDetail. The parity suite cannot assert 4d on-device because the only asserted state (check 2g) populates `itemDetail`, which suppresses `itemLocation` — this is exactly why `itemLocation`'s distinct mobile render is a deferred/unverified catalog item (`PARITY-ADD-VERIFY-CATALOG.md` #21).

**Expected:** Mobile inspection screen shows the asset's Location (`itemLocation`) whenever it is populated, matching the web "Asset Location" card — independently of whether `itemDetail` is also set. `itemLocation` should not be suppressed by the presence of `itemDetail`.

**Actual:** Mobile renders a single `LocationCard = itemDetail ?: itemLocation` (`TankInspectionScreen.kt:509-511`). When `itemDetail` is non-blank, only `itemDetail` is shown and the populated `itemLocation` is hidden entirely. `itemLocation` appears on mobile only when `itemDetail` is blank. Web always shows `itemLocation` in its own card.

**Steps to reproduce:**
1. On a dev inspection, ensure the asset has **both** an `itemDetail` and an `itemLocation` (e.g., `PATCH /inspections/{id}` setting `itemDetail` — as check 2g does — while `itemLocation` is also populated).
2. Confirm on web: Inspection Details header / visit Inspections panel shows the "Asset Location" card with the `itemLocation` value.
3. Open the same inspection on mobile → look at the Location card.
4. Observe: mobile shows `itemDetail`; the populated `itemLocation` is not displayed anywhere on the screen.
5. (Contrast) Clear `itemDetail` → mobile now shows `itemLocation` in the same card, proving it is shadowed, not unmapped.

**Severity:** Low — value is stored and visible on web (no data loss), but the on-site inspector cannot see a populated `itemLocation` whenever `itemDetail` is also set.

**Evidence:** Mobile mapping `TankInspectionUseCase.kt:66,79`; shadowing render `TankInspectionScreen.kt:509-511`; single-display card `LocationCard.kt:36-40`; spacer-only second reference `TankInspectionScreen.kt:607-609`; domain model has only `location` `TankInspection.kt:6,8,9`; independent sibling slot `TankInspectionUseCase.kt:70-71`. Web independent always-present cards: `InspectionDetailsHeader.tsx:85,86`, `InspectionsPanel.tsx:96-98`. Test context: `mobile-flows-parity/p01e_web2mobile_item_detail.yaml` (asserts itemDetail on LocationCard); `docs/PARITY-ADD-VERIFY-CATALOG.md:71-72,215` (#21 deferred distinct-render item).

**Fix / next step:** Give `itemLocation` its own read-only row/card on the mobile inspection screen (or stop overloading `LocationCard` with `itemDetail`) so a populated `itemLocation` is visible even when `itemDetail` is also set, matching web. Then the parity suite can assert 4d distinctly (fold into 2g per catalog #21).

**assign to:** (your choice — mobile team)

---

# Not bugs (documented — do NOT file)

These two findings from the same triage are **BY-DESIGN** and are recorded here so they are not filed as tracker items. They are categorical "whole web surface has no mobile counterpart" gaps, not empty slots in an existing mobile surface (which is what makes Bugs A and B genuine).

## Finding 2l — 2nd engineer (visit.visitEngineers) does not render as a roster on mobile — BY-DESIGN

**Confidence:** high. The mobile app is **single-engineer-centric**: every engineer authenticates and sees only their **own** visits — all reads filter on `assignedEngineerId = the logged-in user's id` (`TasksRepository.kt:152,167,199`; `HomeRepository.kt:61,92,124,149`; `TaskListItemDao.kt:16,22,25,28` all `WHERE assignedEngineerId = :engineerId`; entity has a single `assignedEngineerId`, no list — `TaskListItemEntity.kt:33`). `visit.visitEngineers` is parsed at the DTO layer (`VisitResponseSchema.kt:19`, `VisitEngineerSchema` `:39-45`; `DetailedVisitResponseSchema.kt:21`) but is then **dropped** on both write paths (`TasksRepository.convertVisitToTaskListItem` `:320-364` sets `assignedEngineerId = current user` `:356` and never reads `visitEngineers`; `DetailedVisitMapper.mapToTaskEntity` `:71-113` never references it), is **absent** from the domain model (`TaskDetails.kt:19-50`), and is rendered by **no** visit-detail composable (`TaskDetailsHeader.kt:45-171` shows title/address/status/date/time only; grep for engineer/firstName/lastName/assignee/crew/team across the tabs composables and `VisitDetailsCard.kt` returns nothing). The mobile visit-detail screen shows **no engineer at all** — not even the logged-in one — so there is no engineers-list UI that could be "broken."

**Why not a bug / why not the same as Bug A:** There is no roster concept on mobile to begin with; the omission is intentional and matches the per-engineer task-list architecture. The nearest same-*shape* field, `visit.bookingPerson` (also a person attached to the visit), **does** render on mobile (`VisitDetailsCard.kt:131-179`), but it is **not the same kind**: bookingPerson is a single distinguished contact role (scalar — who to contact for access), whereas `visitEngineers` is a list of work-assignees (a crew/roster). A single-contact field rendering does not establish a roster-rendering inconsistency. Web is the roster-aware surface (`appointmentsUtils.tsx:772-791` builds `engineers[]`/`engineerNames[]` joined with ", ") and correctly shows all engineers. **Recommendation:** treat the `visitEngineers` parity check as not-applicable on mobile (web-only field) rather than a mobile assertion. No QA case.

## Finding 2k — per-sample note (laboratory-sample sampleNote / noteText) does not render on mobile — BY-DESIGN

**Confidence:** high. On **web**, the per-sample note is a **separate sub-resource**, not a core sample field — saved via `POST /laboratory-samples/{sampleId}/notes` returning `noteText` (`LabResultsPanel.tsx:553-554`; request type `SaveLaboratorySampleNotesRequest{sampleId,noteText}` at `interfaces.ts:1048-1051`), fetched lazily (`useLazyGetLaboratorySampleNotesQuery`, `LabResultsPanel.tsx:54`) into `sampleNotesMap` (`:928`) and rendered **only** in the Lab Results **review** panel as a synthetic "Sample Notes" `LabTest` row inside each `SampleItem` (`:516-518,565-567,900-906`), authored via an `AddNotesModal` (`:89-130`). It is a reviewer annotation surfaced next to lab certificates.

On **mobile** the concept is absent at **every** layer: a repo-wide grep for `sampleNote|noteText` returns **zero** files; the DTO `LaboratorySampleSchema` (`VisitResponseSchema.kt:142-171`) has **no** `sampleNote` field (its `notes` field at `:162` maps to Normec `additionalTests`, a different concept — `WaterSampleRepository.kt:267`, `DetailedVisitMapper.kt:306`); the Room entity `WaterSampleEntity` (`WaterSampleEntity.kt:37-69`) has no column for it; the mobile water-sampling row `SampleItem` (`SampleItem.kt:162-201`) shows only title / "Lab: <name>" / collection status; and mobile has **no** lab-results / certificate-review surface at all (the only "lab results" reference is the status string `R.string.job_completed_waiting_for_lab_results` at `VisitDetailsCard.kt:201`). The mobile `water_sampling` feature is a **collection** flow (collect → assign lab → save to local Room → submit batch).

**Why not a bug / kills the TEST-LIMITATION hypothesis:** Because the note renders **nowhere** on mobile (no DTO field, no Room column, no render path), running the parity check under a `requiresWaterSample` jobType would still **not** surface it — wrong-jobType is not the cause; the whole surface is absent. This is **unlike** F-01 / Bug A, where an identical Actions widget renders in one context (visit) but not its sibling context (inspection) — an empty slot in a surface that exists. Here the entire web surface (Lab Results review panel + the notes sub-resource) has no mobile counterpart — a categorical surface gap, analogous to mobile never showing an engineer roster (2l). **Recommendation:** document `sampleNote`/`noteText` as a web-only field in the parity catalog. No QA case.

---

## Summary

| Finding | Field | Verdict | File? |
|---|---|---|---|
| 2c / F-01 | inspection-level **actions** render on mobile | GENUINE-BUG (medium) | **Yes — Bug A** |
| 4d | inspection **itemLocation** hidden when itemDetail set | GENUINE-BUG (low) | **Yes — Bug B** |
| 2l | 2nd engineer roster (`visitEngineers`) on mobile | BY-DESIGN | No — web-only field |
| 2k | per-sample note (`sampleNote`/`noteText`) on mobile | BY-DESIGN | No — web-only surface |

File **Bug A + Bug B as one tracker item** ("Mobile inspection screen render gaps"). If F-01 (Bug A) is already filed via `docs/F-01-qa-case-ready.md`, file Bug B and cross-reference. Do **not** file 2l or 2k.
