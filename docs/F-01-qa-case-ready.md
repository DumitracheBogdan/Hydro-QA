# F-01 — ready-to-file QA bug (the parity suite surfaced it)

The bidirectional parity suite confirmed a real web↔mobile gap. Per your decision, it is **documented + ready to file**, not auto-filed. To file: paste the block below to `/qa-case`, or run the skill with it.

> Note: this is a **product** bug in the mobile app (`hydrocert-android`), surfaced by the QA suite. Filing it is outward-facing — your call on timing.

---

**Title:** Inspection-level actions do not render on the mobile inspection screen

**Location:** Mobile app — Inspection screen (TankInspectionScreen) → "Actions" card. Dev (`dev.gen-cert.com` / Android debug build).

**Description:** Actions attached to an *inspection* (created via the web ActionsPanel on the Inspection Details tab, or via `POST /actions` with `inspectionId`, or added on mobile via the inspection FAB → AddActionsBottomSheet) are persisted server-side and are visible on the **web** Inspection Details tab, but they are **not rendered anywhere on the mobile inspection screen**. Visit-level actions (same mechanism with `visitId`) DO render correctly on the mobile visit-detail Actions card — so the gap is specific to the inspection context.

**Expected:** Inspection-level actions appear in an Actions list on the mobile inspection screen, matching what the web shows and what `GET /actions?inspectionId={id}` returns.

**Actual:** The mobile inspection "Actions" card (TankInspectionScreen.kt:727) shows only its header when expanded — no action rows — even though `GET /actions?inspectionId={id}` returns all of them and the web displays them.

**Steps to reproduce:**
1. On a dev visit, open an inspection.
2. Create 3 inspection-level actions (web Add Action modal in inspection context, or `POST /actions {inspectionId, name, priority}`).
3. Confirm via `GET /actions?inspectionId={id}` that all 3 are stored; confirm they show on the web Inspection Details tab.
4. Open the same inspection on the mobile app → expand the Actions card.
5. Observe: no action rows render (header only).

**Severity:** Medium (data is not lost — stored + visible on web — but the mobile inspector cannot see inspection actions, a functional/parity gap).

**Evidence:** Confirmed empirically by the `bidirectional-parity` workflow (check 2c is therefore API-verified, not mobile-asserted). See `docs/PARITY-FACTS.md` F-01 and `docs/research/parity-coverage/COVERAGE-MATRIX.md` row "INSPECTION — actions".

**assign to:** (your choice — mobile team)

---

Once the mobile app renders inspection actions, re-add the mobile assertion: create `mobile-flows-parity/p01c_web2mobile_inspection_actions.yaml`; the orchestrator already auto-detects it and scores 2c on-device instead of via API.
