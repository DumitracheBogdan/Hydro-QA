# Parity Add → Verify Catalog (Bidirectional, Exhaustive)

**Date:** 2026-05-30 · **Status:** READ-ONLY analysis (no product-repo changes)
**Sources merged + deduped:** WEB addables (hydrocert-web/src), MOBILE addables (tmp-hydrocert-android), SAMPLES deep-dive, API connection-layer map, plus `docs/research/parity-coverage/{COVERAGE-MATRIX,R1..R5}.md` and `docs/PARITY-COVERAGE-LEDGER.md`.

---

## 1. Goal

For **every** data point a user can ADD or EDIT on one platform (Hydrocert web app `dev.gen-cert.com` or the Android app), this catalog establishes the bidirectional **add → verify** contract:

1. **Add/edit on platform A** (with the exact web selector and/or mobile selector).
2. **Verify it appears on platform B** — per item, with a screenshot of the named element on the other platform.
3. **Plus an API connection check** — the `SET` (POST/PATCH) endpoint and the `GET` endpoint + field to read it back, so propagation is proven at the connection layer independent of UI rendering.
4. **Samples are verified per-sample** — loop over every base sample type (enumerated at runtime from `GET /sample-types`), plus the full Normec and ALS field sets.

A *parity* datum is **shared data on a shared backend**. Pure navigation and one-platform-only controls are accounted-for here (so nothing is silently dropped) but flagged `web-only` / `mobile-only` and de-prioritized — they are functional coverage, not parity.

**Write→read field-name drift** and **side effects** (status auto-advance, submit-form forcing `completed`) are carried in the Guardrail column because they break naive verification.

### ABSOLUTE GUARDRAIL — never submit to a real lab
The **only** paths that transmit to Normec/ALS are the batch-submit calls `POST /laboratory-samples/submit-batch`, wired to the mobile **"Submit Samples"** button (`WaterSamplingScreen.kt:402`) and the **SubmitSamplesScreen "Complete"** button (`SubmitSamplesScreen.kt:221`). **NEVER press those; NEVER call submit-batch.** Per-sample "Save Sample" on the Normec/ALS form is LOCAL-ONLY (Room) and safe. Keep every sample at `collectionStatus='pending_collection'` so it is not even eligible for a batch. ALS = dry-run only; Normec = dummy creds only.

---

## 2. Master Table (deduped, grouped by entity)

Direction key: `both` = settable on both platforms; `web→mobile` / `mobile→web` = settable on one, visible/read-only on the other; `web-only` / `mobile-only` = no cross-platform parity (accounted-for).
Feasibility key: `auto-easy` / `auto-medium` / `auto-hard` (Maestro/API automatable) · `manual-only` (gesture/picker/forbidden).

### 2.1 VISIT — core (text, schedule, identity, status)

| Datum | Entity | Add/Edit on (web selector / mobile selector) | Direction | View on other (screenshot selector) | API set + GET verify | Feas. | Guardrail |
|---|---|---|---|---|---|---|---|
| Description & Reference (`waterSystemDescription`) | visit | WEB: VisitDetails > Visit Details accordion > 1st textarea, blur-save / MOB: Summary > "Visit Details" ExpandableCard > "Enter description & reference...", then Save | both | WEB textarea label "Description & Reference" / MOB Visit Details card field | PATCH `/visits/{id}` `{waterSystemDescription}` → GET `/visits/{id}.waterSystemDescription` | auto-easy | Web saves on blur only. **WORKFLOW_TRIGGER**: change auto-advances `visitStatus` from not-started unless `visitStatus` explicitly sent. Mobile expand card first; persist on visit-level Save. |
| Work Details (`workDetails`) | visit | WEB: Visit Details accordion > 2nd textarea, blur / MOB: same ExpandableCard > "Enter work details..." > Save | both | WEB label "Work Details" / MOB Visit Details card | PATCH `/visits/{id}` `{workDetails}` → GET `.workDetails` | auto-easy | Blur-save; workflow-trigger field. |
| Water Sampling Details (`samplingDetails`) | visit | WEB: Visit Details accordion > 3rd textarea, blur / MOB: same card > "Enter water sampling details..." > Save | both | WEB label "Water Sampling Details" / MOB card | PATCH `/visits/{id}` `{samplingDetails}` → GET `.samplingDetails` | auto-easy | Blur-save; workflow-trigger field. |
| Description / Notes (`notes`) | visit | WEB: EditVisitPage > Description pencil > EditNotesModal (required textarea) > Save / MOB: read-only Description card (no mobile edit path) | web→mobile | MOB read-only "Description" card bound to `taskDetails.notes` | PATCH `/visits/{id}` `{notes}` → GET `.notes` | auto-medium | **DISTINCT from `waterSystemDescription`.** Required field (cannot save empty). Modal-based on web. Mobile read-only. |
| Job title (`title`) | visit | WEB: EditVisitPage > "Change Main Details" > Job Title FormInput (sent with engineerIds+bookingPersonId) / MOB: create-only, read-only header after | web→mobile | MOB visit header/list title text | PATCH `/visits/{id}` `{title}` → GET `.title` | auto-medium | All three (title+engineers+bookingPerson) required in one PATCH. |
| Engineers (`engineerIds`) | visit | WEB: EditMainDetailsModal multi-select "Engineer"; also AppointmentDetailsPopup inline MultiSelect (fires on click-outside) / MOB: read-only assigned-engineer chips | web→mobile | MOB engineer avatars/chips on visit | PATCH `/visits/{id}` `{engineerIds:[uuid]}` → GET `.engineers`/`.engineerIds` | auto-medium | Options filtered `isEngineer=true`; order preserved (first=primary). Popup variant saves on click-outside. |
| Booking person (`bookingPersonId`) | visit | WEB: EditMainDetailsModal single-select "Booking Person" / MOB: none | web-only | n/a (no mobile UI) | PATCH `/visits/{id}` `{bookingPersonId}` → GET `.bookingPersonId` | auto-medium | Options filtered `isBookingPerson=true`. No mobile parity — verify web/API only. |
| Date / from / to / originalDate / isFixed / points | visit | WEB: EditDateAndTimeModal (date picker + From/To time selects, Fixed switch; points disabled/auto) / MOB: none (read-only schedule) | web→mobile | MOB visit date/time display | PATCH `/visits/{id}` `{from,to,originalDate,isFixed}` → GET `.from,.to,.originalDate,.isFixed,.points` | auto-hard | To > From validated. `points` derived BE-side. **Use a TODAY-dated visit** or mobile search misses it. Timezone formatting fragile — assert date portion. |
| Site reassignment (`siteId`) | visit | WEB: AppointmentDetailsPopup > Customer site typeahead (>=2 chars, 500ms debounce) > select / MOB: read-only site name | web→mobile | MOB site/customer name on visit | lookup GET `/sites/filtered?siteName=`; PATCH `/visits/{id}` `{siteId}` → GET `.siteId` | auto-hard | Typeahead then click result; changes booking-info/address shown. Real test site. |
| Booking status (`status`: scheduled\|pending\|confirmed\|cancelled) | visit | WEB: AppointmentDetailsPopup status Select; also EditVisitPage StatusSelector / MOB: no direct setter (auto-managed) | web→mobile | MOB status badge on visit card | PATCH `/visits/{id}` `{status}` → GET `.status` | auto-easy | Only the 4 booking values. **Do NOT confuse with `visitStatus` execution states.** |
| Workflow/execution status (`visitStatus`: not-started\|started\|completed\|missed\|aborted) | visit | WEB: read-only VisitStatusPill + list filter (no setter) / MOB: "Aborted visit" toggle sets `aborted`; auto-advances on workflow text fields | both | WEB VisitStatusPill / MOB status badge + Aborted toggle | mobile sets via PATCH `/visits/{id}` `{visitStatus}` → GET `.visitStatus` | auto-easy | `aborted` toggle force-opens AddActionsBottomSheet (handle it). **State-changing — run LAST.** `status` (4-enum) ≠ `visitStatus` (5 workflow). Other web values are mobile-set only. |
| Client signature name (`signatureName`) | visit | WEB: read-only label (no input) / MOB: Summary > "Client Signature" card > "Client name" field > Save | mobile→web | WEB read-only signature-name label (VisitDetailsPanel) | PATCH `/visits/{id}` `{signatureName}` → GET `.signatureName` | auto-easy | Web display-only. Persist on visit-level Save. |
| Client signature image (`signature`, base64 PNG) | visit | WEB: read-only `<img>` (no capture) / MOB: SignatureDialog DrawingCanvas freehand > Submit | mobile→web | WEB read-only base64 `<img>` (VisitDetailsPanel:263-286) | PATCH `/visits/{id}` `{signature}` → GET `.signature` | manual-only | Freehand not Maestro-reproducible → pre-populate via API PATCH, assert web renders. Clear+Submit empty = nulls it. |
| Report Sent toggle (`wasServiceReportSent`) | visit | WEB: VisitDetails header Switch "Report Sent" / MOB: none | web-only | n/a | PATCH `/visits/{id}` `{wasServiceReportSent:bool}` → GET `.wasServiceReportSent` | auto-easy | Optimistic toggle, reverts on error. No mobile parity. |
| Create whole visit (+ nested inspections/products/samples/notes) | visit | WEB: `/visits/new` AddNewAppointment (title, engineers, bookingPerson, date/time, status, site typeahead, nested inspections) / MOB: none (create is web/API only) | web→mobile | MOB visit appears in list/calendar | POST `/visits` `{title,engineerIds,bookingPersonId,siteId,from,to,originalDate,status,inspections:[...]}` → GET `/visits/{id}` | auto-hard | Largest create surface. Nested inspections use `samples` (not laboratorySamples), products `price:0`. **`itemDetail` collected in form but DROPPED from payload.** TODAY date. |
| Delete visit | visit | WEB: AppointmentDetailsPopup > Trash2 > ConfirmationModal / MOB: none | web-only | MOB visit removed from list/calendar | DELETE `/visits/{id}` → GET `/visits/{id}` not-found | auto-medium | **DESTRUCTIVE** + confirm. Test visits only. |
| Download service report / lab certificate | visit | WEB: VisitDetails "Download Report"; LabResults "Certificate" dropdown / MOB: n/a | web-only | n/a (export only) | GET `/service-reports/download?visitId`; GET `/lab-results/certifications/{normec\|als}/download` | auto-easy | **Read-only export — zero data change, zero parity value.** Documented for completeness; not a check. |

### 2.2 ACTIONS (visit-level + inspection-level)

| Datum | Entity | Add/Edit on (web selector / mobile selector) | Direction | View on other (screenshot selector) | API set + GET verify | Feas. | Guardrail |
|---|---|---|---|---|---|---|---|
| Action add — visit-level (template + custom + priority) | action | WEB: VisitDetails > Actions accordion > "New Action" > AddActionModal (11 templates/custom, priority per item) / MOB: Summary > QuickActionsFab '+' > "Actions" sub-FAB > AddActionsBottomSheet | both | WEB ActionsPanel rows / MOB visit Actions card | PATCH `/visits/{id}` `{actions:[{id?,name,priority}]}` → GET `.actions[]` (or GET `/actions?visitId=`) | auto-medium | **REPLACE semantics** on the visit-level subset: send all existing + new (omitting an id deletes it). Priority required before Save. Layered FAB (expand '+' then sub-FAB after animation). |
| Action add — inspection-level (flat list) | action | WEB: InspectionDetails > Actions tab > "New Action" > same modal / MOB: TankInspectionScreen QuickActionsFab > "Actions" sub-FAB | mobile→web (+ web→both) | WEB ActionsPanel on Inspection Details tab. **F-01: mobile-added inspection actions DO NOT render on TankInspectionScreen** (stored server-side, shown on web) | PATCH `/inspections/{id}` `{actions:[{id?,actionTypeId?,name,priority,status?}]}` → GET `.actions[]` (or GET `/actions?inspectionId=`) | auto-medium | **F-01 render gap → verify via API only (this is the current 2c check, labelled `(API)`).** REPLACE semantics. DRIFT: write `actionTypeId` → read `.actionType` object; name derived from type. |
| Action edit priority (high/medium/low/unset) | action | WEB: Action card Priority Select / MOB: ActionCard priority chip dropdown (LOW/MED/HIGH/NOT_SET) inside AddActionsBottomSheet | both | WEB priority chip / MOB action priority | PATCH `/visits/{id}` or `/inspections/{id}` `{actions:[...]}` → GET `.actions[].priority` | auto-medium | Rebuilds+re-sends whole subset. `unset`→null; mobile `not_set`→`'low'` on save. |
| Action edit status (New/Follow Up/Completed/Cancelled) | action | WEB: Action card Status Select / MOB: **no status setter on mobile** | web→mobile | MOB action status display | PATCH `/visits/{id}` or `/inspections/{id}` `{actions:[...]}` → GET `.actions[].status` | auto-medium | status id 1=New,2=Follow Up,3=Completed,4=Cancelled. Web-only setter. |
| Action custom text | action | WEB: AddActionModal "Type custom action here..." / MOB: "Add Custom Action" > NewActionWidget "Enter action..." | both | WEB action name row / MOB action name | PATCH `/visits/{id}` `{actions:[...new name]}` → GET `.actions[].name` | auto-medium | Blank custom names filtered out on save. Mobile widget visible only after "Add Custom Action". |
| Action delete | action | WEB: Action card Trash2 > ConfirmationModal / MOB: (delete via omitting id in PATCH; in-list) | both | other-platform actions list (absent) | PATCH `/visits/{id}` or `/inspections/{id}` `{actions:[remaining]}` → GET `.actions[]` absent | auto-medium | **DESTRUCTIVE** (web confirm). Delete = PATCH with filtered array, not a DELETE endpoint. |

### 2.3 INSPECTION — lifecycle + asset fields + notes

| Datum | Entity | Add/Edit on (web selector / mobile selector) | Direction | View on other (screenshot selector) | API set + GET verify | Feas. | Guardrail |
|---|---|---|---|---|---|---|---|
| Add inspection to visit | inspection | WEB: EditVisitPage > Inspections > "+ Inspection" > AddInspectionModal (multi-select Job Type + qty) / MOB: none (created via web/job) | web→mobile | MOB inspection appears in visit's inspection list | POST `/inspections` `{jobTypeId,visitId}` (one per qty) → GET `/visits/{id}.inspections[]` | auto-medium | One POST per quantity unit. `jobTypeId` triggers auto-creation of InspectionForms + sets `requiresWaterSample`. |
| Delete inspection | inspection | WEB: EditVisitPage > accordion > Trash2 > ConfirmationModal / MOB: none | web-only | MOB inspection disappears from visit | DELETE `/inspections/{id}` → GET `/visits/{id}.inspections[]` absent | auto-medium | **DESTRUCTIVE** + confirm; removes child products/samples/actions. Disposable visit only. |
| Asset Reference (`itemReference`) | inspection | WEB: EditVisitPage > inspection header inline Input "Asset Reference", blur (read-only on VisitDetails/InspectionDetails) / MOB: read-only LocationCard | web→mobile | MOB LocationCard asset reference | PATCH `/inspections/{id}` `{itemReference,itemLocation}` → GET `.itemReference` | auto-easy | Both sent together each blur. 🟡 mobile-render of itemReference distinctly unverified — fold into 2g once confirmed. |
| Asset Location (`itemLocation`) | inspection | WEB: same header inline Input "Asset Location", blur / MOB: read-only LocationCard | web→mobile | MOB LocationCard asset location | PATCH `/inspections/{id}` `{itemReference,itemLocation}` → GET `.itemLocation` | auto-easy | Paired with itemReference. |
| Asset Detail (`itemDetail`) | inspection | WEB: PATCH `/inspections` `{itemDetail}` (no working create-form write path — dropped from create payload) / MOB: read-only LocationCard | web→mobile | MOB LocationCard renders `itemDetail ?? location` | PATCH `/inspections/{id}` `{itemDetail}` → GET `.itemDetail` | auto-easy | **This is the current 2g check** (CI-confirmed renders on mobile LocationCard). itemDetail is API-only on web (dropped from createVisit payload). |
| Inspection notes (`notes`) | inspection | WEB: inspection accordion > Notes pencil > EditNotesModal (required) / MOB: TankInspectionScreen > Notes card > "Edit" > NotesEditDialog > Save | both | WEB inspection Notes (read-only on InspectionDetails) / MOB Notes card | PATCH `/inspections/{id}` `{notes}` → GET `.notes` | auto-medium | DISTINCT from `visit.notes` (same field name, different endpoint). PATCH `/inspections` is additive/merge. |
| Unable-to-Inspect / Missing (`inspectionStatus='missed'`) | inspection | WEB: read-only `missed_inspection` tag / MOB: TankInspectionScreen > AlertStatusToggleCard "Missing inspection" Switch | mobile→web | WEB computed `missed_inspection` tag/badge | PATCH `/inspections/{id}` `{inspectionStatus:'missed'}` → GET `.inspectionStatus`/`.tags[]` | auto-easy | Toggle ON force-opens AddActionsBottomSheet. **submit-form would override status to 'completed'** — run this before/separate from form-field flows. State-changing — run LAST. |

### 2.4 INSPECTION FORM-FIELDS (backend-driven dynamic fields)

> Labels are 100% runtime DB-driven — fetch `GET /form-fields?jobTypeId=658f27c1-9306-42a2-81a6-ad249d7eaef3` at runtime. The task-named "Assisting 1/2/3", "Works", Risk-Assessment "- Comments" (×18), and "Site Induction" are these dynamic fields, NOT hardcoded widgets. Verify field id used in submit-form payload = the **InspectionFormField UUID** from `GET .inspectionForms[].formFields[].id` (NOT the FormField config id).

| Datum | Entity | Add/Edit on (web selector / mobile selector) | Direction | View on other (screenshot selector) | API set + GET verify | Feas. | Guardrail |
|---|---|---|---|---|---|---|---|
| Single-line text field | form-field | WEB: InspectionDetails > DetailsPanel inline `<input>`, blur (editable ONLY if value already non-empty AND no fieldOptions) / MOB: DynamicTextField TEXT_SINGLE_LINE | both (pre-filled) / mobile→web (blank) | WEB dynamic field by fieldName | PATCH `/inspections/{id}/submit-form` `{formFields:[{id,value}]}` → GET `.inspectionForms[].formFields[].value` | auto-easy | **submit-form SIDE EFFECT: force-sets `inspectionStatus='completed'`** + re-syncs visit status. Web blank/dropdown fields read-only (F-02). |
| Multi-line text (incl. "Assisting 1/2/3", "Works", RA "- Comments") | form-field | WEB: DetailsPanel textarea (same isEditableStringField gate) / MOB: DynamicTextField TEXT_MULTI_LINE (maxLines=4) | mobile→web | WEB textarea by fieldName (e.g. "...- Comments") | PATCH `/inspections/{id}/submit-form` `{formFields:[{id,value}]}` → GET `.inspectionForms[].formFields[].value` | auto-easy | **These are the current 3b (Visit Info), 3c (RA Comments) checks.** CI viewport gotcha: 2nd+ field input below the fold → full 18-field RA flow CI-deferred (1 automated on CI, 18 local). submit-form forces completed. |
| Number field | form-field | WEB: DetailsPanel (isEditableStringField gate) / MOB: DynamicTextField NUMBER (decimal) | mobile→web | WEB numeric field by fieldName | PATCH `/inspections/{id}/submit-form` → GET `.inspectionForms[].formFields[].value` | auto-easy | submit-form forces completed. Input numeric-only client-side. |
| Toggle / switch (boolean) | form-field | WEB: not rendered editably (read-only/blank) / MOB: DynamicTextField TOGGLE SwitchField | mobile→web | WEB read-only field state | PATCH `/inspections/{id}/submit-form` `{formFields:[{id,value:'true'\|'false'}]}` → GET `.value` | auto-easy | Boolean stored as string. May auto-generate Actions. Web read-only. |
| Single-select dropdown (incl. "Site Induction") | form-field | WEB: DetailsPanel DISABLED/read-only when fieldOptions present (F-02) / MOB: DynamicTextField DROPDOWN ExposedDropdownMenuBox | mobile→web | WEB read-only field showing selected value | PATCH `/inspections/{id}/submit-form` `{formFields:[{id,value}]}` → GET `.value` | auto-medium | **This is the current 3e (Site Induction) check.** Two taps (open + option). May auto-generate Actions/Comments. submit-form forces completed. |
| N/A flag (`isNotApplicable`) | form-field | WEB: DetailsPanel N/A state (settable via API) / MOB: NotApplicableButton "N/A" checkbox | both | WEB N/A indicator on field | PATCH `/inspections/{id}/submit-form` `{formFields:[{id,isNotApplicable:true,value:null}]}` → GET `.isNotApplicable` | auto-easy | Checking N/A forces value=null (BE enforces). submit-form forces completed. |
| Multi-select dropdown (`isMultiSelect`) | form-field | WEB: read-only (fieldOptions present) / MOB: DynamicTextField checkbox dropdown, joined `\|#\|` | mobile→web | WEB read-only bulleted list | PATCH `/inspections/{id}/submit-form` `{formFields:[{id,value:[...]}]}` → GET `.value` (array) | manual-only | BE rejects non-array with 400. `\|#\|` delimiter + multi-tap brittle. API read-back confirms array. |
| Date / datetime picker | form-field | WEB: read-only / MOB: DynamicTextField DATE/DATETIME > Material3 dialog | mobile→web | WEB read-only date field | PATCH `/inspections/{id}/submit-form` → GET `.value` (ISO) | manual-only | Material3 two-step picker has no stable Maestro hook. |
| Barcode (type/scan) | form-field | WEB: editable text if value+no options, else read-only / MOB: DynamicTextField BARCODE typeable + scan icon (camera) | mobile→web / both | WEB field by fieldName | PATCH `/inspections/{id}/submit-form` → GET `.value` | auto-medium (type) / manual (scan) | Type path medium; scan icon (camera) manual. |

### 2.5 SAMPLES (Laboratory / Water Sampling) — exhaustive, per-sample

> **Base add parity is WEB→MOBILE only.** Web add sends `{sampleTypeId,quantity}` via PATCH `/inspections` and reaches the BE. **Mobile add (SelectWaterSamplesBottomSheet) writes LOCAL Room only** (`AddLocalInspectionWaterSamplesUseCase`); `UpdateInspectionRequest.samples` is a DEAD field never populated by any caller — so a mobile-added sample never reaches BE except via the FORBIDDEN submit-batch. **Mobile→web sample-add is a documented GAP, not a check.**
>
> **No per-sample photo exists** — `WaterSampleEntity` has zero image columns; photos are inspection-level only (`/inspections-file`). The "with a photo each" requirement does not match the model.
>
> **F-04 drift:** `matrix`, `matrixSupertype`, `additionalTests`, `temperature`, `engineerId` are settable but ABSENT from the embedded `GET /inspections/{id}.laboratorySamples` DTO — verify those via `GET /laboratory-samples/{id}` directly. Normec/ALS rich field values live in device Room until batch submit → **field-set verification is MOBILE-SCREENSHOT ONLY**, not API, not cross-platform.

| Datum | Entity | Add/Edit on (web selector / mobile selector) | Direction | View on other (screenshot selector) | API set + GET verify | Feas. | Guardrail |
|---|---|---|---|---|---|---|---|
| Enumerate base sample TYPES (`sampleTypeId` options) | sample | WEB: Add Water Sample MultiSelect options / MOB: SelectWaterSamplesBottomSheet checkbox rows | both (read-only catalog) | MOB bottom-sheet checkbox list (title "Select water samples") | GET `/sample-types` (verify list; NO set) | auto-easy | **The loop source — fetch first to get the N types.** Web MultiSelect keys by NAME (collision risk on dup names); mobile keys by id. Names are runtime DB data — not in source, not enumerable here. |
| ADD a water sample (base `sampleTypeId`) — WEB | sample | WEB: EditVisitPage > Water Samples > "Add Water Sample" > EditWaterSamplesModal (Sample Type MultiSelect + qty) > Add / MOB: re-pull shows it | web→mobile | MOB WaterSamplingScreen sample rows + "Total" StatCard increments | PATCH `/inspections/{id}` `{samples:[{sampleTypeId,quantity}]}` → GET `/inspections/{id}.laboratorySamples[]` | auto-easy | **WRITE field `samples` → READ field `laboratorySamples`** (drift). PATCH additive/merge; `samples:[]` is a silent no-op (delete via DELETE `/laboratory-samples/{id}`). `collectionStatus='pending_collection'` — never advances toward submission. Section only if `requiresWaterSample`. |
| ADD a water sample (base) — MOBILE | sample | MOB: TankInspection > Water Sampling > "Add new samples" > SelectWaterSamplesBottomSheet > tick > "Add samples" / WEB: n/a | mobile→web **(GAP)** | n/a — does NOT reach BE / web | SET: none (local Room insert). VERIFY: re-open WaterSamplingScreen (mobile-only); no server GET returns it | manual-only | **CONFIRMED PARITY GAP — document, do NOT "fix" by submitting.** Mobile add is local-only; only mobile→BE path is the forbidden submit-batch. Treat as mobile-screenshot-only. |
| Assign laboratory to sample (`labId`) | sample | WEB: shows assigned lab read-only / MOB: WaterSamplingScreen per-sample bottom sheet > tap NORMEC/ALS card | mobile→web | WEB lab field on sample (`.lab`); MOB lab-pick bottom sheet | PATCH `/inspections/{id}` `{samples[].labId}` (local then sync) → GET `.laboratorySamples[].labId`/`.lab` | auto-easy | Local-only + safe; does NOT submit. Do not proceed to "Submit Samples". ALS lab ids: dev `e34c9055-...`, prod `f02450ad-...`. |
| Per-sample NOTE (`sampleNote.noteText`) | sample | WEB: InspectionDetails > Lab Results > sample card > "Add/Edit notes" > AddNotesModal (Tiptap rich text) / MOB: not exposed on add/collect flow | web→mobile (web-set; embedded read-back) | WEB sample accordion "Notes" block (LabResultsPanel) | POST `/laboratory-samples/{sampleId}/notes` `{noteText(HTML)}` → GET `/laboratory-samples/{sampleId}/notes.noteText` (also embedded `.laboratorySamples[].sampleNote`) | auto-medium | `sampleId` must be the lab-sample UUID (a BE sample, i.e. web-created), not a mobile-local one. Stored as HTML. Does NOT submit to lab. |
| DELETE a water sample | sample | WEB: EditVisitPage per-sample delete > DELETE / MOB: swipe-left > ConfirmationDialog (local-only) | web→mobile (web removes BE row) | WEB Water Samples list (absent); MOB swipe-delete is local-only | DELETE `/laboratory-samples/{id}` → GET `/inspections/{id}.laboratorySamples` absent | auto-easy (web) / manual (mobile swipe) | **DESTRUCTIVE** — only delete test-created samples. Mobile swipe gesture brittle. |
| Open Normec/ALS collect form | sample | MOB-only: tick sample checkbox > lab bottom sheet > tap row > WaterSamplingFormScreen (Normec or ALS via factory) / WEB: n/a | mobile-only | MOB lab-pick sheet + form header (no web UI) | none (lab assignment writes Room only) | auto-medium | Local-only + safe. **Do NOT proceed to Submit Samples afterward.** |
| **Normec sample — Date & Time** (`sampledatetime`) | sample | MOB-only: WaterSamplingFormNormecScreen DATE_TIME picker / WEB: n/a | mobile-only | MOB Normec form screenshot | (submit-only) POST `/laboratory-samples/submit-batch` … sample.sampledatetime; GET `/laboratory-samples/{id}.collectedAt` | manual-only | **NEVER real submission (Normec dummy creds).** "Save Sample" is local Room (safe). Material3 picker has no Maestro hook. |
| **Normec sample — Barcode / sampleId** (`sampleIdentifier`) | sample | MOB-only: DetailsCard "Barcode" (type or scan) / WEB: not a form; readable via API | mobile→web | n/a form (verify via GET `/laboratory-samples`) | (submit-only) … sample.sampleid; GET `.sampleIdentifier` | auto-medium (type) | No real submission. Required. Scan icon = manual. |
| **Normec sample — Description** (`sampleName`) | sample | MOB-only: DetailsCard "Description" (multi-line, required) / WEB: n/a | mobile→web | MOB Normec form | (submit-only) … sample.sampledescription; GET `.sampleName` | auto-easy | No real submission. Required. |
| **Normec sample — Asset** (`asset`) | sample | MOB-only: DetailsCard "Asset" (required if requireAssetAndTemperature) / WEB: n/a | mobile→web | MOB Normec form | (submit-only) … sample.asset; GET `.asset` | auto-easy | No real submission. |
| **Normec sample — Temperature** (`temperature`) | sample | MOB-only: DetailsCard "Temperature" (number) / WEB: n/a | mobile-only | MOB Normec form | (submit-only) … sample.temperature; GET `/laboratory-samples/{id}.temperature` | auto-easy | **F-04: absent from embedded inspection GET** — must GET `/laboratory-samples/{id}`. No real submission. |
| **Normec sample — Matrix Option** (`matrix`,`matrixSupertype`) | sample | MOB-only: DetailsCard "Matrix Option" DROPDOWN (matrixChoices API) / WEB: n/a | mobile-only | MOB Normec form | (submit-only) … sample.matrix + matrixsupertype; GET `.matrix`/`.matrixSupertype` | auto-medium | **F-04: absent from embedded inspection GET.** No real submission. |
| **Normec sample — Suite Code** (`testSuite`) | sample | MOB-only: DetailsCard "Suite Code" DROPDOWN (30+ options) / WEB: n/a | mobile→web | MOB Normec form | (submit-only) … sample.suite; GET `.testSuite` | auto-medium | No real submission. Many options — exact label selector. |
| **Normec sample — Additional Tests** (`additionalTests`) | sample | MOB-only: DetailsCard "Additional Tests" (multi-line, optional) / WEB: n/a | mobile-only | MOB Normec form | (submit-only) … sample.notes; GET `.additionalTests` | auto-easy | **F-04: absent from embedded inspection GET.** No real submission. |
| **Normec sample — Save Sample** | sample | MOB-only: SubmitButton "Save Sample" | mobile-only | MOB Normec form (saved state) | LOCAL Room only (submitForm → saveWaterSampleForm → Room; no MainApi) | manual-only | SAFE (local). **Do NOT press screen-level "Submit Samples" after.** Enabled only when isFormValid. |
| **ALS sample — dynamic schema** (labCode, samplingPoint Text02, temperature Text04, date Date04, sampleType SampleTypeId, samplePoint SamplePointId) | sample | MOB-only: WaterSamplingFormAlsScreen fields from AlsStaticFormSchema / WEB: n/a | mobile-only | MOB ALS form screenshot | (submit-only) POST `/laboratory-samples/submit-batch` AlsSubmitBatchRequest order.* ; GET `/laboratory-samples/{id}` | manual-only | **ALS = DRY-RUN only — never real submission.** "Save Sample" = saveAlsDraft → Room (safe). Sample Point auto-fills Test Item. Date picker hard; dropdowns medium; barcode (WtSampleNo)+testItem hidden. |
| Select sample checkbox (batch assign) | sample | MOB-only: WaterSamplingScreen checkbox per SwipeableSampleItem / WEB: n/a | mobile-only | n/a | in-memory only (for batch lab-assign), not persisted alone | auto-easy | Selection not persisted by itself. |
| Submit Samples (drop-off + Complete) | sample | MOB-only: SubmitSamplesScreen drop-off card + "Complete" | mobile→web | **DO NOT USE TO VERIFY** | POST `/laboratory-samples/submit-batch` (collection flow) | manual-only | **GUARDRAIL — NEVER TRIGGER (see §3).** This transmits to the lab. |
| **GUARDRAIL — Normec submit-batch** | sample | MOB: "Submit Samples" (WaterSamplingScreen:402) / "Complete" (SubmitSamplesScreen:221) | — | **NEVER use to verify** | POST `/laboratory-samples/submit-batch` (Normec) — **DO NOT CALL** | manual-only | **ABSOLUTE: never press / never call.** Sends real data to Normec. Keep samples `pending_collection` so they're ineligible. |
| **GUARDRAIL — ALS submit-batch** | sample | MOB: same buttons (ALS lab path) | — | **NEVER use to verify** | POST `/laboratory-samples/submit-batch` (ALS) — **DO NOT CALL** | manual-only | **ABSOLUTE: never trigger.** EXTRA RISK: offline submit enqueues a WorkManager sync that fires later. Don't even initiate while offline. |

### 2.6 ATTACHMENTS (files / photos)

| Datum | Entity | Add/Edit on (web selector / mobile selector) | Direction | View on other (screenshot selector) | API set + GET verify | Feas. | Guardrail |
|---|---|---|---|---|---|---|---|
| Upload visit attachment (image) | attachment | WEB: VisitDetails > Attachments > Visit "Upload" file input (image/*) / MOB: QuickActionsFab camera/gallery sub-FAB > PhotoLabelDialog | both | WEB AttachmentsPanel grid / MOB visit gallery | POST `/visits-file/{visitId}?label=` (multipart) → GET `/visits-file/{visitId}` (NOT embedded in GET /visits) | auto-hard (web API) / manual (mobile camera) | IMAGES ONLY. Files not embedded in visit GET — separate GET. Base path `/visits-file` (hyphen). Camera/gallery = manual (use API multipart). |
| Upload inspection attachment (image) | attachment | WEB: VisitDetails Attachments per-inspection "Upload" + InspectionDetails Attachments "Upload" / MOB: TankInspectionScreen FAB camera/gallery | both | WEB InspectionDetails Attachments grid / MOB inspection gallery | POST `/inspections-file/{inspectionId}?label=` (multipart) → GET `/inspections-file/{inspectionId}` (or `/by-visit/{visitId}`) | auto-hard / manual | Base path `/inspections-file` (hyphen), NOT under /inspections. Not embedded in inspection GET. |
| Upload document (Attachments tab) | attachment | WEB: Upload control / MOB: visit Attachments tab > AttachmentOptionsBottomSheet > "Upload document" (system file picker) | both | WEB document file rows / MOB attachments | POST `/visits-file/{visitId}` (multipart) → GET `/visits-file/{visitId}.mimeType` | manual-only (mobile) | System file picker OS-level (fragile under Maestro). |
| Edit attachment label / rename | attachment | WEB: AttachmentGallery hover > Pencil > EditNameForm / MOB: PhotoLabelDialog (free text or 13-option dropdown) | both | other-platform label caption under thumbnail | PATCH `/visits-file/{fileId}` or `/inspections-file/{fileId}` `{label}` → GET `.label` | auto-medium | fileSource (visit vs inspection) picks endpoint. Label also settable at upload via `?label=`. |
| Reorder attachments (sortOrder) | attachment | WEB: AttachmentGallery drag-and-drop / MOB: ReorderablePhotosSection drag | both | other-platform thumbnail order | PATCH `/visits-file/bulk-sort-order` or `/inspections-file/bulk-sort-order` `{files:[{id,sortOrder}]}` → GET `.sortOrder` | auto-hard (API) / manual (drag) | HTML5/Compose drag unreliable → PATCH bulk-sort array directly. Optimistic revert on error. |
| Delete attachment | attachment | WEB: AttachmentGallery hover > Trash2 > ConfirmationModal / MOB: attachment row delete > ConfirmationDialog | both | other-platform gallery (absent) | DELETE `/visits-file/{fileId}` or `/inspections-file/{fileId}` → GET `?includeDeleted=false` absent | auto-medium | **DESTRUCTIVE** + confirm. Soft-delete (`deletedAt`; restorable via `.../restore`). |

### 2.7 PRODUCTS

| Datum | Entity | Add/Edit on (web selector / mobile selector) | Direction | View on other (screenshot selector) | API set + GET verify | Feas. | Guardrail |
|---|---|---|---|---|---|---|---|
| Inspection products needed (add/edit qty/delete) | product | WEB: EditVisitPage > inspection > Products Needed > "+ Product"/pencil > EditProductsModal (Product select + Quantity) + Trash2 / MOB: read-only display only (no add UI) | web→mobile | MOB read-only products list (SamplesProductsModal/ProductsModal) | PATCH `/inspections/{id}` `{products:[{productId,quantity,price}]}` → GET `.inspectionProducts[]` | auto-medium | **REPLACE semantics** — send full remaining list; `products:[]` deletes all. **DRIFT: write `products` → read `.inspectionProducts`** (each row has `.product`). Options filtered isActive; qty>0. No mobile add — web-only parity direction. |
| Visit-level products (DEAD CODE) | product | WEB: EditProductsModal gated by `isChangeProductsModalOpen` whose setter is never called → unreachable / MOB: n/a | web-only | n/a | no reachable web path | manual-only | Dead/unreachable UI. Product edits are inspection-scoped only. |

---

## 3. Lab-submission guardrails (NEVER TRIGGER)

These are the ONLY paths that send data to a real lab. They are listed here as a single prominent callout in addition to the §2.5 rows:

- **Mobile "Submit Samples"** — `WaterSamplingScreen.kt:402` → `submitBatchSync()` → POST `/laboratory-samples/submit-batch`. **NEVER press.**
- **Mobile SubmitSamplesScreen "Complete"** — `SubmitSamplesScreen.kt:221` → `submitBatch()`. **NEVER press.**
- **Any direct `POST /laboratory-samples/submit-batch`** (Normec or ALS payload). **NEVER call.**
- Offline submit enqueues a WorkManager sync that fires later — **do not even initiate while offline.**
- Mitigation by construction: keep every test sample at `collectionStatus='pending_collection'` so it is not eligible for a batch (`runSubmitBatchesForAllLaboratories` returns false → no-op).
- ALS = dry-run only. Normec = dummy creds only. Per-sample "Save Sample" is LOCAL Room and safe.

---

## 4. Currently automated (10 checks) vs NEW to add

### 4.1 Currently automated — the hard-gate set (10 checks)
Source: `docs/PARITY-COVERAGE-LEDGER.md` §A. Done-bar = all 10 green 3× consecutively.

| Check | Datum | Direction | Flow / verify |
|---|---|---|---|
| 2a-description | `visit.notes` | web→mobile | p01a → assertVisible |
| 2b-visit-actions | `visit.actions[]` name×3 | web→mobile | p01b → assertVisible |
| 2c-inspection-actions | `inspection.actions[]` ×3 (name+priority) | web→mobile **(API only — F-01)** | API verify (mobile render gap) |
| 2d-visit-text | `waterSystemDescription`+`workDetails`+`samplingDetails` | web→mobile | p01d → assertVisible (all 3) |
| 2g-item-detail | `inspection.itemDetail` → LocationCard | web→mobile | p01e → assertVisible |
| 3a-signature | `signature` + `signatureName` | mobile→web | p02 → GET `/visits/{id}` |
| 3b-visit-info | `Assisting 1/2/3` + `Works being carried out` | mobile→web | p03 → API inspection formFields |
| 3c-risk | Risk Assessment "- Comments" | mobile→web | ◑ p04 → 1 field on CI / 18 local |
| 3d-visit-text | `waterSystemDescription`+`workDetails`+`samplingDetails` | mobile→web | p05 → GET `/visits/{id}` |
| 3e-site-induction | Site Induction dropdown | mobile→web | p03b → API inspection formFields |

### 4.2 NEW to add — delta (everything in §2 not already one of the 10)
Grouped by entity; full prioritized list with ids in §5. Highlights of what is NOT yet covered:
- **Visit core:** status badge, from/to schedule, engineerIds chip, title (web→mobile reads).
- **Status (state-changing):** `visitStatus=aborted` (mobile toggle), `inspectionStatus=missed` (mobile toggle) — run LAST.
- **Notes:** `inspection.notes` (both), `site.accessInfo` Booking Info (both).
- **Form-fields:** number, toggle, N/A flag (mobile→web); multi-select/date pickers (manual).
- **Actions:** mobile→web visit action add path (name+priority); action delete.
- **Samples:** base sample-add web→mobile per-type loop; per-sample note; sample delete; lab assignment; Normec/ALS field sets (mobile-screenshot only); **mobile→web add GAP (not a check)**.
- **Attachments:** file upload (API multipart), label edit, reorder (bulk-sort API), delete.
- **Products:** web→mobile read-only display verify (one-platform).

---

## 5. Prioritized NEW-CHECK list

P1 = easy + high-value + cross-platform-verifiable · P2 = medium · P3 = hard (multipart/drag/volume) · P4 = manual/forbidden/one-platform-only. Each cross-references the ledger's planned (C) / manual (D) wiring.

### P1 — easy, high value (do first)
1. `inspection.notes` (both) — mobile NotesEditDialog → GET `.notes` (new flow p06). [C2]
2. `site.accessInfo` Booking Info (both) — mobile AccessInfoDialog → PATCH/GET `/sites/{id}.accessInfo`. Site-shared: use the run's site. [C2]
3. form-field NUMBER (mobile→web) — representative numeric field → GET formFields. [C2]
4. form-field TOGGLE (mobile→web) — Switch → GET formFields. [C2]
5. form-field `isNotApplicable` (mobile→web) — N/A checkbox on a showNotApplicable field → GET `.isNotApplicable`. [C2]
6. `visit.status` badge (web→mobile) — PATCH status → mobile badge text (need exact label per enum). [C1]
7. sample base add per-type (web→mobile) — PATCH `/inspections {samples:[{sampleTypeId,qty}]}` → GET `.laboratorySamples`, loop over `GET /sample-types`. [C3]

### P2 — medium
8. `inspection.inspectionStatus=missed` (mobile→web) — "Unable to Inspect" toggle → GET `.inspectionStatus`. **State-changing — run LAST.** [C2]
9. `visit.visitStatus=aborted` (mobile→web) — "Aborted visit" toggle → GET `.visitStatus`. **State-changing — run LAST.** [C2]
10. `visit.actions[]` add mobile→web (name+priority) — AddActionsBottomSheet → GET `/actions?visitId=`. [C2]
11. action delete (both) — PATCH filtered array → GET `.actions[]` absent.
12. per-sample note (web→mobile) — POST `/laboratory-samples/{id}/notes` → GET `.sampleNote.noteText`.
13. sample delete (web) — DELETE `/laboratory-samples/{id}` → GET absent.
14. sample lab assignment (mobile→web) — tap NORMEC/ALS card → GET `.laboratorySamples[].lab`.
15. attachment label edit (both) — PhotoLabelDialog / EditNameForm → GET `.label`. [C4]
16. attachment delete (both) — DELETE file → GET `?includeDeleted=false` absent.
17. `visit.engineerIds` chip (web→mobile) — resolve display name via GET `/users`, assert mobile chip. [C1]
18. `visit.title` (web→mobile) — header text (low marginal: 2a already asserts tagged superstring). [C1]
19. `visit.from`/`to` (web→mobile) — assert date portion on mobile (timezone fragile). [C1]
20. add/delete inspection (web→mobile) — POST/DELETE `/inspections` → GET `/visits/{id}.inspections[]`.
21. `inspection.itemReference`/`itemLocation` distinct mobile render (web→mobile) — fold into 2g once render confirmed.

### P3 — hard (multipart / drag / volume)
22. attachment file upload (web API multipart) → mobile Attachments section / GET file list. [C4]
23. attachment reorder (PATCH bulk-sort-order) → GET `.sortOrder` (skip UI drag). [C4/D]
24. Risk Assessment full 18 "- Comments" on CI — scroll-each-field-to-next-label spike (currently 1-on-CI/18-local). [B/Wave F]
25. Risk Assessment 36 single-select dropdown fields (mobile→web) — representative subset; full set documented. [D]

### P4 — manual / forbidden / one-platform-only (documented, not auto-gated)
26. `signature` freehand draw — pre-populate via API PATCH; 3a covers name+image-presence. [D]
27. Camera capture / gallery picker — OS picker unstable; upload via API instead. [D]
28. Date/DateTime pickers (form-fields, Normec/ALS) — Material3 no Maestro hook. [D]
29. Multi-select dropdown (`isMultiSelect`, `|#|`) — multi-tap brittle; API read-back confirms array. [D]
30. Swipe-delete sample / drag photo reorder — gesture unreliable; use API. [D]
31. **Mobile→web sample-add GAP** — local Room only; only mobile→BE path is forbidden submit-batch → NOT automatable as parity; document as gap. [SAMPLES]
32. Normec field set (date/barcode/description/asset/temperature/matrix/suite/additionalTests) — mobile-screenshot only (F-04 + local-only); "Save Sample" safe, never Submit. [C3]
33. ALS dynamic schema field set — mobile-screenshot only; dry-run only, never Submit. [C3]
34. **Normec submit-batch / ALS submit-batch — NEVER TRIGGER** (guardrail, not a check). [§3]
35. web-only / mobile-only non-parity fields (`bookingPersonId`, `wasServiceReportSent`, `visit.actions[].status`, `originalDate`, inspection products [web add], visit-level products dead-code, download report) — verify web/API-side only if desired; not parity. [D]

---

## 6. Reconciliation note
Every datum across the four input blobs maps to exactly one row in §2 (merged across web/mobile/API/samples angles) or is an explicit one-platform / gap / guardrail row. The 10 automated checks (§4.1) plus the 35 prioritized NEW items (§5) cover the planned (C1–C4) and manual-tracked (D) sections of `PARITY-COVERAGE-LEDGER.md`. `totalDatums` returned = the §2 master-table row count.
