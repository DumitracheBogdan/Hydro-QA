# Coverage Matrix — Hydrocert Parity Tests (Visits + Inspections)

> Synthesized from R1 (BE Inspection), R2 (BE Visit), R3 (Mobile Inspection), R4 (Mobile Visit), R5 (Web).  
> Generated: 2026-05-27

## Automation status (implemented 2026-05-27)
The `bidirectional-parity` suite now scores **9 checks** (was 6). Implemented:
- **2a** description (`visit.notes`) · **2b** visit actions · **2c** inspection actions (API-only, F-01 gap) · **2d** `waterSystemDescription` (web→mobile API PATCH) — web→mobile
- **3a** signature · **3b** Visit Information (Assisting 1/2/3 + Works) · **3c** Risk Assessment "- Comments" (1 field automated on CI; full 18 validated locally — see note) · **3d** visit text (waterSystemDescription/workDetails/samplingDetails) · **3e** Site Induction dropdown — mobile→web

Flows: `p01a/b/d` (web→mobile), `p02/p03/p03b/p04/p05` (mobile→web). p04 generated from `RISK_COMMENT_FIELDS_AUTOMATED` via `scripts/parity/gen-p04.mjs`. The full 18-field RA flow types + saves correctly on a local emulator but is CI-deferred (the CI emulator's smaller viewport puts the 2nd+ field's input below the fold; `tapOn below label` then misses it). See `docs/PARITY-FACTS.md` for the full check table, the 18-field diagnosis, and mobile-UI gotchas.

---

## Master Coverage Table

| Data point | Settable on WEB (API/UI)? | Settable on MOBILE? | Visible on WEB? | Visible on MOBILE? | Parity direction(s) | Automation | How to verify |
|---|---|---|---|---|---|---|---|
| **VISIT — core** | | | | | | | |
| `visit.title` | Yes — Add/Edit main details | No (create only via web/API) | Yes | Yes (read-only header) | web→mobile | easy | PATCH visit; GET visit on web + read title on mobile summary card |
| `visit.status` (scheduled/confirmed/cancelled/pending) | Yes — StatusSelector inline on Edit page | No direct UI; auto-managed | Yes | Yes (badge) | web→mobile | easy | PATCH `status`; check badge on mobile visit card |
| `visit.visitStatus` (not-started/started/completed/missed/aborted) | Yes — Edit page PATCH | Yes — "Aborted visit" toggle sets `aborted`; auto-advances on workflow fields | Yes | Yes | both | easy | Set via API; check mobile badge; set aborted toggle on mobile; check web |
| `visit.from` (start time) | Yes — Add/Edit date & time | No | Yes | Yes (display) | web→mobile | easy | PATCH visit; check mobile task card time display |
| `visit.to` (end time) | Yes — Add/Edit date & time | No | Yes | Yes (display) | web→mobile | easy | PATCH visit; check mobile task card time display |
| `visit.isFixed` | Yes — Fixed Visit toggle | No | Yes | No | web→mobile | easy | PATCH; check web display (mobile does not show this flag) |
| `visit.notes` (description) | Yes — Edit Notes modal | No | Yes | Yes (read-only Description card) | web→mobile | easy | PATCH `notes`; verify read-only description card on mobile |
| `visit.waterSystemDescription` | Yes — Visit Details inline textarea (onBlur) | Yes — "Description & Reference" multi-line field | Yes | Yes | both | easy | Set on mobile Save; read on web textarea; set on web; read on mobile field |
| `visit.workDetails` | Yes — Visit Details inline textarea (onBlur) | Yes — "Work Details" multi-line field | Yes | Yes | both | easy | Set on mobile Save; read on web textarea; set on web; read on mobile field |
| `visit.samplingDetails` | Yes — Visit Details inline textarea (onBlur) | Yes — "Water Sampling Details" multi-line field | Yes | Yes | both | easy | Set on mobile Save; read on web textarea; set on web; read on mobile field |
| `visit.signature` (base64 PNG) | No — display only | Yes — drawing canvas in SignatureDialog | Yes (read-only image) | Yes | mobile→web | hard (draw) | Pre-populate via API PATCH; verify web renders image; Maestro: tap Submit on blank canvas to test clear path |
| `visit.signatureName` | No — display only on web | Yes — "Client name" text field | Yes (read-only) | Yes | mobile→web | easy | Type on mobile Save; verify web shows label |
| `visit.engineerIds` | Yes — Engineers multi-select | No | Yes | Yes (read-only engineer list) | web→mobile | easy | PATCH; check mobile engineer chip |
| `visit.bookingPersonId` | Yes — Booking Person select | No | Yes | No | web only | easy | PATCH; check web only |
| `visit.isException` | Yes — API/Add New Visit | No | Yes | No | web only | medium | PATCH via API; check web |
| `visit.originalDate` | Yes — Edit date & time | No | Yes | No | web only | medium | PATCH via API; check web |
| `visit.isContract` | No — ServiceTracker import only | No | Yes (read-only) | No | none | manual | Not settable via REST; skip in automation |
| `visit.wasServiceReportSent` | Yes — API (PATCH) | No | Yes (indicator) | No | web only | medium | PATCH; check web indicator |
| **VISIT — site / booking info** | | | | | | | |
| `site.accessInfo` (Booking Info) | Yes — Booking Info modal (PATCH /sites/{id}) | Yes — "Edit" link in Booking Info card → AccessInfoDialog | Yes | Yes | both | medium | Set on mobile (open Edit dialog, type, Save); verify web modal shows value; set on web; verify mobile card |
| **VISIT — actions** | | | | | | | |
| `visit.actions[].name` (predefined/custom) | Yes — Add Action modal (template + custom textarea) | Yes — AddActionsBottomSheet predefined checklist + custom text | Yes | Yes | both | medium | Add action on mobile; check web Actions panel; add on web; check mobile Actions card |
| `visit.actions[].priority` | Yes — Add Action modal / ActionsPanel inline select | Yes — priority dropdown per action in bottom sheet | Yes | Yes | both | medium | Set on mobile; check web; set on web; check mobile |
| `visit.actions[].status` | Yes — ActionsPanel inline select (New/Follow Up/Completed/Cancelled) | No mobile status field found | Yes | No | web only | medium | PATCH via API; verify web only |
| **VISIT — attachments** | | | | | | | |
| Visit file upload (binary) | Yes — AttachmentsPanel file input (image/*) | Yes — camera or gallery picker | Yes | Yes | both | hard (camera/gallery) | Upload via web API multipart; verify in web Attachments panel and mobile Attachments tab |
| Visit file label | Yes — API PATCH /visits-file/:fileId | Yes — PhotoLabelDialog (free text + 13-option predefined dropdown) | Yes | Yes | both | medium | Set label on mobile; verify web attachment label; set on web API; verify mobile |
| Visit file sortOrder | Yes — API bulk-sort-order | Yes — drag reorder | Yes | Yes | both | hard (drag) | API only for automation; skip UI drag |
| **INSPECTION — core** | | | | | | | |
| `inspection.notes` | Yes — Edit Notes modal (inspection context) | Yes — "Notes" Edit link → NotesEditDialog | Yes | Yes | both | medium | Set on mobile (click Edit, type, Save); verify web Edit Notes modal; set via web; verify mobile Notes card |
| `inspection.inspectionStatus` (`missed`) | Yes — API PATCH `inspectionStatus: "missed"` | Yes — "Unable to Inspect" toggle (sets `MISSED`) | Yes (tag `missed_inspection`) | Yes | both | easy | Toggle on mobile; check web tag; PATCH via API; check mobile toggle state |
| `inspection.itemReference` (Asset Reference) | Yes — Add/Edit inspection form | Yes — display only (LocationCard, not editable on mobile) | Yes | Yes (read-only) | web→mobile | easy | Set on web; verify mobile LocationCard shows value |
| `inspection.itemLocation` (Asset Location) | Yes — Add/Edit inspection form | Yes — display only (LocationCard, not editable on mobile) | Yes | Yes (read-only) | web→mobile | easy | Set on web; verify mobile LocationCard shows value |
| `inspection.itemDetail` | Yes — API only | No | Yes | Yes (read-only LocationCard) | web→mobile | medium | PATCH via API; check mobile LocationCard |
| **INSPECTION — dynamic form fields** | | | | | | | |
| Form field value — TEXT_SINGLE_LINE | Yes — DetailsPanel inline text (only if value already exists and no fieldOptions) | Yes — OutlinedTextField single-line | Yes | Yes | both | easy | Set on mobile; GET /inspections/{id} and verify value; set via submit-form API; check mobile shows value |
| Form field value — TEXT_MULTI_LINE | Yes — DetailsPanel inline textarea (same condition as above) | Yes — OutlinedTextField multi-line (maxLines=4) | Yes | Yes | both | easy | Same as above |
| Form field value — NUMBER | Yes — DetailsPanel (same condition) | Yes — numeric keyboard field | Yes | Yes | both | easy | Same as above |
| Form field value — TOGGLE/Switch | No — web does not render boolean fields editably (they either lack value or have fieldOptions) | Yes — Switch composable | No (read-only or blank on web) | Yes | mobile→web | easy | Set toggle on mobile Save; GET /inspections/{id} confirm bool value; confirm web shows value (even if not re-editable) |
| Form field value — DROPDOWN single-select | No — web renders as disabled/read-only (`isEditableStringField` false when fieldOptions present) | Yes — ExposedDropdownMenuBox | Yes (read-only) | Yes | mobile→web | medium | Select on mobile; GET /inspections/{id} confirm value; verify web shows value read-only |
| Form field value — DROPDOWN multi-select (`isMultiSelect=true`) | No — same web constraint | Yes — multi-select dropdown with checkboxes; delimiter `|#|` | Yes (read-only) | Yes | mobile→web | hard | Manual: select multiple on mobile; verify GET response array; web shows read-only |
| Form field value — DATE/DATETIME | No | Yes — DateTimeTextField → DateTimePickerDialog | Yes (read-only) | Yes | mobile→web | hard | Manual: set date on mobile; verify GET /inspections/{id}; web shows read-only |
| Form field isNotApplicable flag | Yes — API only (submit-form `isNotApplicable: true`) | Yes — N/A checkbox card (`showNotApplicable=true` fields) | Yes | Yes | both | easy | Tap N/A on mobile; GET confirm `.isNotApplicable=true`; PATCH via API; check mobile N/A state |
| **INSPECTION — actions** | | | | | | | |
| `inspection.actions[].name` | Yes — Add Action modal (inspection context) | Yes — FAB → actions icon → AddActionsBottomSheet | Yes | **NOT rendered on mobile inspection screen** (known gap — R3 §2E, R5 finding) | web→mobile gap | medium | Set on web; GET /inspections/{id}; actions NOT displayed on mobile TankInspectionScreen |
| `inspection.actions[].priority` | Yes — ActionsPanel inline select | Yes — priority dropdown per action in bottom sheet (mobile CAN add them, just not visible after) | Yes | gap (same as above) | web→mobile gap | medium | Same gap as above |
| **INSPECTION — laboratory samples** | | | | | | | |
| `laboratorySample.sampleTypeId` (add sample) | Yes — Edit Water Samples modal (multi-select) | Yes — SelectWaterSamplesBottomSheet (search + checkboxes) | Yes | Yes | both | medium | Add sample on mobile; verify GET inspection shows laboratorySamples; add on web; check mobile Water Sampling section |
| Normec sample — description | No — Normec form is mobile-only | Yes — "Description" required free-text | No | Yes | mobile→web | easy | Set on mobile Save Sample; GET /laboratory-samples/{id}; verify sampleName/testSuite stored |
| Normec sample — asset | No | Yes — "Asset" text field | No | Yes | mobile→web | easy | Same; verify `.asset` |
| Normec sample — temperature | No | Yes — numeric field | No | Yes | mobile→web | easy | Same; verify `.temperature` |
| Normec sample — matrix / matrixSupertype | No | Yes — "Matrix Option" dropdown | No | Yes | mobile→web | medium | Same; verify `.matrix` / `.matrixSupertype` (note: absent from embedded inspection GET — use GET /laboratory-samples/{id}) |
| Normec sample — suite code | No | Yes — "Suite Code" dropdown (30+ options) | No | Yes | mobile→web | medium | Same; verify `.testSuite` |
| Normec sample — date & time | No | Yes — date-time picker | No | Yes | mobile→web | hard | Manual |
| Normec sample — barcode | No | Yes — free-text + scan | No | Yes | mobile→web | medium (type only) | Type barcode on mobile; verify `.sampleIdentifier` |
| Normec sample — additionalTests | No | Yes — "Additional Tests" free-text multi-line | No | Yes | mobile→web | easy | Same; verify `.additionalTests` |
| ALS sample — laboratoryCode | No | Yes — "Laboratory Code" dropdown (2 options) | No | Yes | mobile→web | medium | Set on mobile; GET ALS batch / inspection; verify stored |
| ALS sample — samplingPoint (free text) | No | Yes — "Sampling Point" free-text | No | Yes | mobile→web | easy | Same |
| ALS sample — temperature | No | Yes — numeric | No | Yes | mobile→web | easy | Same |
| ALS sample — sampleType | No | Yes — dropdown (4 options) | No | Yes | mobile→web | medium | Same |
| ALS sample — samplePoint | No | Yes — dropdown (21 options) | No | Yes | mobile→web | medium | Same |
| ALS sample — date & time | No | Yes — date-time picker | No | Yes | mobile→web | hard | Manual |
| `laboratorySample.collectionStatus` | Yes — API (PATCH /laboratory-samples/{id}) | Yes — collect flow (Submit Samples screen) | Yes | Yes | both | medium | Trigger mobile Submit Samples; GET inspection confirm `collectionStatus=collected` |
| **INSPECTION — attachments** | | | | | | | |
| Inspection file upload (binary) | Yes — AttachmentsPanel file input (web) | Yes — camera or gallery picker (FAB on TankInspectionScreen) | Yes | Yes | both | hard (camera/gallery) | Upload via web API; verify GET /inspections-file/{id}; verify mobile Attachments section |
| Inspection file label | Yes — API PATCH /inspections-file/:fileId | Yes — PhotoLabelDialog (free text + 13-option predefined dropdown) | Yes | Yes | both | medium | Set label on mobile; verify web shows label; set via API; verify mobile |
| Inspection file sortOrder | Yes — API bulk-sort-order | Yes — drag reorder in ReorderablePhotosSection | Yes | Yes | both | hard (drag) | API only for automation |
| **INSPECTION — products** | | | | | | | |
| `inspectionProducts[].productId` | Yes — Edit Products modal | No mobile UI for products found (products inherited from job at creation) | Yes | No | web only | medium | PATCH via web/API; verify GET /inspections/{id} |
| `inspectionProducts[].quantity` | Yes — Edit Products modal | No | Yes | No | web only | medium | Same |
| **VISIT INFORMATION block (p03)** | | | | | | | |
| Site Induction dropdown (inspection form field) | No — web read-only (has fieldOptions) | Yes — DROPDOWN single-select | Yes (read-only) | Yes | mobile→web | medium | Select on mobile Save; GET /inspections/{id}; verify web shows value read-only |
| **RISK ASSESSMENT — Comments text fields (p04)** | | | | | | | |
| Risk Assessment field "- Comments" (TEXT_MULTI_LINE, ×18 fields) | Yes — DetailsPanel inline textarea (if value exists, no fieldOptions) | Yes — OutlinedTextField multi-line | Yes | Yes | both | easy | Set on mobile; GET /inspections/{id} confirm value; verify web textarea shows it |
| Risk Assessment field — dropdown (×36 dropdown fields) | No — web read-only | Yes — ExposedDropdownMenuBox | Yes (read-only) | Yes | mobile→web | hard | Deferred — see Manual-only section |

---

## 1. In Scope for Automation

Fields suitable for Maestro (mobile) + API/UI (web) automated parity flows, grouped by flow.

### p01a — Inspection description (notes)
- `inspection.notes` — free-text multi-line (NotesEditDialog on mobile; EditNotesForm on web)

### p01b — Visit actions
- `visit.actions[].name` — predefined selection from template list, plus custom text entry
- `visit.actions[].priority` — LOW / MEDIUM / HIGH / NOT_SET dropdown per action

### p02 — Signature (client name only; draw is deferred)
- `visit.signatureName` — "Client name" single-line text field on mobile; displayed read-only on web

### p03 — Visit Information (4 text fields + 1 dropdown)
- `visit.waterSystemDescription` — "Description & Reference" multi-line (mobile + web, both directions)
- `visit.workDetails` — "Work Details" multi-line (mobile + web, both directions)
- `visit.samplingDetails` — "Water Sampling Details" multi-line (mobile + web, both directions)
- `site.accessInfo` — "Booking Info" multi-line (mobile AccessInfoDialog; web Booking Info modal)
- Site Induction form field — DROPDOWN single-select on mobile; verify read-only on web (mobile→web)

### p04 — Risk Assessment comments (18 "- Comments" text fields)
All 18 `- Comments` multi-line text fields within the Risk Assessment inspection form section. Each is a `TEXT_MULTI_LINE` field, settable on mobile (easy) and readable/editable on web (when value exists and no fieldOptions). Full list of exact field labels must be fetched from `GET /form-fields?jobTypeId=658f27c1-9306-42a2-81a6-ad249d7eaef3` at runtime — labels are 100% backend-driven.

### p05 — Visit-detail text (3 web→mobile fields)
Already covered under p03 above. The three fields `waterSystemDescription`, `workDetails`, `samplingDetails` are the canonical p05 targets:
- Set on web (VisitDetailsPanel inline textarea, onBlur save)
- Verify on mobile (expand "Visit Details" ExpandableCard; read fields)

### Additional web→mobile (easy/medium)
- `inspection.inspectionStatus = missed` — "Unable to Inspect" toggle (easy toggle, both directions)
- `visit.visitStatus = aborted` — "Aborted visit" toggle (easy toggle, both directions)
- `inspection.itemReference` — set on web Add/Edit inspection; verify mobile LocationCard (web→mobile, easy)
- `inspection.itemLocation` — same (web→mobile, easy)
- Form field `isNotApplicable` flag — N/A checkbox on mobile; verify via API (easy, both)
- `inspection.notes` — easy, both directions (already listed in p01a)
- `laboratorySample` add (sampleTypeId) — medium, both directions
- `visit.actions[].status` — web-only inline select (New/Follow Up/Completed/Cancelled); verify via GET (web only, medium)

---

## 2. Manual-Only / Deferred

| Item | Reason |
|---|---|
| `visit.signature` (drawing canvas) | Maestro cannot simulate freehand draw reliably; workaround = pre-populate via API PATCH and verify web display |
| Camera photo capture | Requires real device camera + OS permission grant; outside Maestro's reliable scope |
| Gallery photo picker | System photo picker UI is fragile under Maestro; not stable across Android versions |
| Date / DateTime pickers (Normec, ALS, dynamic form fields) | Material3 DatePicker + TimePicker two-step dialog; Maestro has no stable hook into calendar UI |
| Multi-select dropdowns (`isMultiSelect=true`) | Custom `|#|` delimiter + checkbox state inside dropdown; multi-tap sequencing is brittle and selector-dependent |
| Swipe-delete sample | Swipe gesture on `SwipeableSampleItem`; unreliable in Maestro |
| Drag photo reorder | Drag-and-drop gesture (`ReorderablePhotosSection`); use API bulk-sort-order endpoint instead |
| Risk Assessment — 36 dropdown fields (non-Comments) | Single-select `ExposedDropdownMenuBox`, web read-only; 36 fields × medium difficulty = deferred for scope; cover Comments text fields first |
| `visit.isContract` | Set only by ServiceTracker import; not settable via REST API; skip entirely |
| `visit.samples` in UpdateVisitDto | Dead field — extracted but never processed in service; no backend effect |

---

## 3. Known Findings

### F-01 — Inspection actions do not render on mobile
`inspection.actions[]` can be set on both web (Add Action modal, inspection context) and via the mobile AddActionsBottomSheet (FAB on TankInspectionScreen). However, inspection-level actions added on mobile are **not rendered** in any visible list on TankInspectionScreen after saving — there is no actions display card on the inspection screen (only on the visit-level summary tab). Actions ARE stored server-side (confirmed via `GET /inspections/{id}` → `.actions[]`) and ARE visible on web (ActionsPanel on Inspection Details tab), but the mobile UI has no display path for them. This is a confirmed parity gap: mobile→web direction only.

### F-02 — Web inspection form fields are narrow-editable (read-only for dropdowns + blank fields)
The web `isEditableStringField` predicate (DetailsPanel.tsx:36-42) permits editing an inspection form field only when (a) the value is a non-empty string AND (b) `fieldOptions` is empty. This means:
- All dropdown-type fields (`fieldOptions.length > 0`) are read-only on web regardless of whether they have a value.
- Any field with no pre-existing value is read-only on web (blank fields must be set first on mobile).
- The parity flow for these fields is strictly mobile→web: set on mobile, verify read-only display on web.

### F-03 — `signature` and `signatureName` are web read-only
`VisitDetailsPanel.tsx:39-46, 263-286` renders `signature` as a base64 `<img>` and `signatureName` as a label — there is no `<input>` or mutation on web for either field. Both must be written from mobile. Any parity test asserting signature state must set values via mobile (or direct API PATCH) and verify the static display on web.

### F-04 — `matrix`/`matrixSupertype`/`additionalTests`/`temperature`/`engineerId` absent from embedded inspection GET
These Normec sample fields are stored in the DB and settable via `POST/PATCH /laboratory-samples`, but are **not included** in `LaboratorySampleDto` and therefore do not appear in the embedded `.laboratorySamples[]` array returned by `GET /inspections/{id}`. Verification for these fields must call `GET /laboratory-samples/{id}` directly.
