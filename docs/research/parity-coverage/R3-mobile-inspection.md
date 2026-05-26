# R3 — Mobile Inspection Input Inventory
**Purpose**: QA parity test reference — every settable input on the mobile INSPECTION screen and its sub-screens, with Maestro fill strategy.  
**Source repo**: `C:\Users\Coca-Cola\tmp-hydrocert-android`  
**Generated**: 2026-05-27

---

## Scope mapping

| Screen | Entry point | Key file |
|--------|------------|---------|
| Task Details (visit-level) | Home → visit card | `TaskDetailsScreen.kt` |
| Tank Inspection | "Start Inspection" or "View Inspection" button | `TankInspectionScreen.kt` |
| Water Sampling list | WaterSamplingCard → "Start Sampling" | `WaterSamplingScreen.kt` |
| Normec sample form | sample row tap (non-ALS lab) | `WaterSamplingFormNormecScreen.kt` |
| ALS sample form | sample row tap (ALS lab) | `WaterSamplingFormAlsScreen.kt` |
| Submit Samples (drop-off) | "Submit Samples" button | `SubmitSamplesScreen.kt` |

---

## Screen 1 — Task Details (Visit-level) — Summary Tab

| # | Input | UI label | Type | Save path | Maps to backend field | Source file:line | Maestro-fillable? |
|---|-------|----------|------|-----------|-----------------------|-----------------|-------------------|
| 1 | Booking Info / Access Info | "Booking Info" card → "Edit" link → dialog | free-text multi-line | AccessInfoDialog → `onSubmit` → `viewModel.updateSiteAccessInfo()` → Save button | `visit.site.accessInfo` (UpdateSiteRequest) | `TaskDetailsSummaryTab.kt:284`, `AccessInfoDialog.kt` | **medium** (click Edit text, then type in dialog) |
| 2 | Visit Details — Description & Reference | "Description & Reference" inside expandable "Visit Details" | free-text multi-line | `onWaterSystemDescriptionChange` → ViewModel → Save button | `visit.waterSystemDescription` (UpdateVisitRequest) | `TaskDetailsSummaryTab.kt:322` | **easy** |
| 3 | Visit Details — Work Details | "Work Details" | free-text multi-line | `onWorkDetailsChange` → ViewModel → Save button | `visit.workDetails` (UpdateVisitRequest) | `TaskDetailsSummaryTab.kt:331` | **easy** |
| 4 | Visit Details — Water Sampling Details | "Water Sampling Details" | free-text multi-line | `onSamplingDetailsChange` → ViewModel → Save button | `visit.samplingDetails` (UpdateVisitRequest) | `TaskDetailsSummaryTab.kt:340` | **easy** |
| 5 | Client Signature — Client name | "Client name" text field inside "Client Signature" card | free-text single-line | `onSignatureNameChange` → ViewModel → Save button | `visit.signatureName` (UpdateVisitRequest) | `TaskDetailsSummaryTab.kt:362` | **easy** |
| 6 | Client Signature — drawing canvas | "Client Signature" dialog (tap "Add" / "Edit") | signature draw (finger on canvas) | SignatureDialog `onSubmit` → `viewModel.updateSignature()` → Save button | `visit.signature` as ByteArray PNG (UpdateVisitRequest) | `SignatureDialog.kt:63`, `TaskDetailsSummaryTab.kt:433` | **hard** (drawing gesture; Maestro can tap canvas but freehand draw is unreliable) |
| 7 | Actions (visit-level) | FAB → actions icon OR via expandable "Actions" card | predefined checklist + custom text + priority dropdown (NOT_SET/LOW/MEDIUM/HIGH) | AddActionsBottomSheet → Save → `viewModel.updateVisitActions()` → Save button | `visit.actions[]` (UpdateVisitRequest) | `TaskDetailsSummaryTab.kt:381`, `AddActionsBottomSheet.kt:66` | **medium** (open sheet, toggle checkbox, set priority dropdown) |
| 8 | Aborted Visit toggle | "Aborted visit" switch card at bottom of Summary tab | toggle/switch | `onAbortedVisitChange` → ViewModel → Save button | `visit.status = ABORTED` (UpdateVisitRequest) | `TaskDetailsSummaryTab.kt:411`, `AlertStatusToggleCard.kt:42` | **easy** |
| 9 | Save (visit-level) | "Save" button | button (submit form) | `viewModel.saveTaskDetails()` → `SaveTaskDetailsUseCase` → `UpdateVisitUseCase` + `UpdateSiteUseCase` | PATCH `/visits/{id}` + PATCH `/sites/{id}` | `SaveButton.kt`, `TaskDetailsSummaryTab.kt:416` | **easy** |

---

## Screen 2 — Tank Inspection (`TankInspectionScreen.kt`)

### 2A — Location display
| # | Input | UI label | Type | Save path | Maps to backend field | Source file:line | Maestro-fillable? |
|---|-------|----------|------|-----------|-----------------------|-----------------|-------------------|
| 10 | Item location | "Location" info card (no pin icon text) | display-only (read-only, value from `tankInspection.itemDetail ?? itemDetail.location`) | Not editable on mobile | `inspection.itemDetail` / `inspection.location` | `TankInspectionScreen.kt:509`, `LocationCard.kt` | **N/A** (display-only) |

### 2B — Notes
| # | Input | UI label | Type | Save path | Maps to backend field | Source file:line | Maestro-fillable? |
|---|-------|----------|------|-----------|-----------------------|-----------------|-------------------|
| 11 | Inspection notes | "Notes" card → "Edit" link → dialog | free-text multi-line (NotesEditDialog, maxLines=4) | NotesEditDialog → Save → `viewModel.updateNotes()` → Save button | `inspection.notes` (UpdateInspectionRequest) | `TankInspectionScreen.kt:491`, `NotesEditDialog.kt:51` | **medium** (click Edit text, then type in full-screen dialog) |

### 2C — Dynamic form sections (backend-driven)
Each `InspectionSection` is rendered as an `ExpandableCard`. Each `InspectionField` inside is rendered via `DynamicFormField` → `DynamicTextField`. Field types map as follows:

| # | Input | UI label | Type | Save path | Maps to backend field | Source file:line | Maestro-fillable? |
|---|-------|----------|------|-----------|-----------------------|-----------------|-------------------|
| 12 | Dynamic field — TEXT_SINGLE_LINE | `field.label` (backend-driven, e.g. "Engineer Name") | free-text single-line `OutlinedTextField` | `onFieldValueChange(fieldId, value)` → `viewModel.updateFieldValue()` → Save button | `inspectionCategoryField.value` (SubmitInspectionFormRequest) | `DynamicTextField.kt:279`, `TankInspectionScreen.kt:636` | **easy** |
| 13 | Dynamic field — TEXT_MULTI_LINE | `field.label` (backend-driven) | free-text multi-line `OutlinedTextField` (maxLines=4) | same as above | same | `DynamicTextField.kt:207` | **easy** |
| 14 | Dynamic field — NUMBER | `field.label` (backend-driven, e.g. "Temperature") | numeric input (decimal keyboard, digits/./- only) | same as above | same | `DynamicTextField.kt:223` | **easy** |
| 15 | Dynamic field — DROPDOWN (single-select) | `field.label` (backend-driven) | `ExposedDropdownMenuBox` — tap to expand, tap option | `onFieldValueChange(fieldId, selectedValue)` → Save button | same | `DynamicTextField.kt:194`, `DropdownField` | **medium** (tap to expand, then tap item; Maestro `tapOn` + `tapOn` works but selector requires exact label text) |
| 16 | Dynamic field — DROPDOWN (multi-select) | `field.label` (backend-driven) with `isMultiSelect=true` | `ExposedDropdownMenuBox` with `Checkbox` items; delimiter `\|#\|` | `onFieldValueChange(fieldId, joinedValues)` → Save button | same | `DynamicTextField.kt:183`, `MultiSelectDropdownField` | **hard** (multiple taps inside dropdown, checkboxes, combined via custom delimiter) |
| 17 | Dynamic field — TOGGLE/Switch | `field.label` (backend-driven) | `Switch` composable | `onToggleValueChange(fieldId, bool)` → Save button | same (bool as "true"/"false" string) | `DynamicTextField.kt:173`, `SwitchField` | **easy** (tapOn label or switch) |
| 18 | Dynamic field — DATE/DATETIME | `field.label` (backend-driven) | `DateTimeTextField` — read-only `OutlinedTextField` opens `DateTimePickerDialog` on tap | `onFieldValueChange(fieldId, formattedDateString)` → Save button | same (ISO string) | `DynamicTextField.kt:241` | **hard** (Material3 date + time picker dialogs; Maestro requires tapping through calendar picker then clock picker) |
| 19 | Dynamic field — BARCODE | any field whose label contains "barcode" or `fieldType==barcode` | `BarcodeTextField` — typeable + scan icon (camera scanner) | `onFieldValueChange(fieldId, value)` → Save button | same | `DynamicTextField.kt:259` | **medium** (can type directly; scan icon opens camera which is hard) |
| 20 | Dynamic field — N/A button | "N/A" checkbox card next to any field where `showNotApplicable=true` | checkbox / toggle (`NotApplicableButton`) | `onNotApplicableValueChange(fieldId, bool)` → Save button | `inspectionCategoryField.isNotApplicable` | `DynamicTextField.kt:318` | **easy** (tap the N/A card) |
| 21 | Dynamic field — INFO_LABEL | (informational card, non-editable) | display-only zinc card | N/A | read-only | `DynamicTextField.kt:149` | **N/A** |
| 22 | Dynamic field — LOCATION_LABEL | (location display card, non-editable) | display-only `LocationCard` with hydro_blue_50 background | N/A | read-only | `DynamicTextField.kt:155` | **N/A** |

> **Note on section names**: Known section titles include "Basic WRAS Compliance", "L8 / Water Hygiene", "Tank Internal Condition" (from `getIconForTankSection`). Actual field labels are 100% backend-driven from `InspectionCategoryField` → loaded via `TankInspectionUseCase`.

### 2D — Water Sampling section
| # | Input | UI label | Type | Save path | Maps to backend field | Source file:line | Maestro-fillable? |
|---|-------|----------|------|-----------|-----------------------|-----------------|-------------------|
| 23 | Add Sample (picker) | "Add Sample" button (empty state) or "Add New Samples" | `SelectWaterSamplesBottomSheet` — search field + checkbox list | `viewModel.addWaterSamplesToInspection(selectedSampleTypes)` → local DB | `WaterSampleEntity` → synced to `POST /inspections/{id}/samples` | `TankInspectionScreen.kt:663`, `SelectWaterSamplesBottomSheet.kt:57` | **medium** (open sheet, type in search, tap checkboxes, tap "Add Samples") |
| 24 | Navigate to water sampling | "Start Sampling" button on WaterSamplingGenericCard | navigation action | navigates to `WaterSamplingScreen` | — | `TankInspectionScreen.kt:671` | **easy** (tapOn button) |

### 2E — Actions (inspection-level via FAB)
| # | Input | UI label | Type | Save path | Maps to backend field | Source file:line | Maestro-fillable? |
|---|-------|----------|------|-----------|-----------------------|-----------------|-------------------|
| 25 | Inspection Actions | FAB (bottom-right) → actions icon → `AddActionsBottomSheet` | predefined checklist + custom text entry + priority dropdown (NOT_SET/LOW/MEDIUM/HIGH) per action | AddActionsBottomSheet → Save → `viewModel.updateActions()` → Save button | `inspection.actions[]` (`TankAction` → `CreateInspectionActionRequest`) | `TankInspectionScreen.kt:384`, `AddActionsBottomSheet.kt:361` | **medium** |

### 2F — Attachments (via FAB)
| # | Input | UI label | Type | Save path | Maps to backend field | Source file:line | Maestro-fillable? |
|---|-------|----------|------|-----------|-----------------------|-----------------|-------------------|
| 26 | Take photo (camera) | FAB → camera icon → camera intent | photo-capture (Camera permission required) | `viewModel.triggerTakePhoto()` → `PhotoCaptureHelper` → `PhotoLabelDialog` → `viewModel.addPhotoAttachment()` | `InspectionFileEntity` → `UploadFileSyncHandler` → `POST /inspections/{id}/files` | `TankInspectionScreen.kt:388`, `PhotoCaptureHelper.kt` | **hard** (requires camera permission grant + camera UI interaction) |
| 27 | Pick from gallery | FAB → gallery icon → photo picker | gallery multi-select (PhotoPicker) | `viewModel.triggerPickGallery()` → `GalleryPhotoPick` → optional `PhotoLabelDialog` → `viewModel.addPhotoAttachment()` | same as above | `TankInspectionScreen.kt:389`, `GalleryPhotoPick.kt` | **hard** (system photo picker UI outside app) |
| 28 | Photo label | `PhotoLabelDialog` — triggered after camera capture or single gallery pick | free-text single-line + predefined dropdown (13 options: "Service Report", "Before Photo", "After Photo", "Internal Photo", "External Photo", "Proofing", "Hygiene", "High Risk", "Medium Risk", "Storage", "Fly Control Unit", "Monitor Points", "Pest") | onSave(label) → `viewModel.addPhotoAttachment(label=...)` | `InspectionFileEntity.label` | `PhotoLabelDialog.kt:48`, `TankInspectionScreen.kt:193` | **medium** (type or pick predefined; dialog is app-level) |
| 29 | Reorder photos | "Reorder" handle — drag & drop in `ReorderablePhotosSection` | drag-and-drop reorder | `onReorderPhotos(newOrder)` → `viewModel.reorderInspectionAttachments()` → `BulkSortOrderRequest` | `InspectionFileEntity.sortOrder` | `ReorderablePhotosSection.kt` | **hard** (drag gesture) |
| 30 | Delete attachment | long-press or delete icon → `ConfirmationDialog` → Confirm | modal confirmation | `viewModel.removeAttachment(id)` → `DeleteFileSyncHandler` | `DELETE /inspections/{id}/files/{fileId}` | `TankInspectionScreen.kt:267`, `ConfirmationDialog.kt` | **medium** (tap delete icon, then tap Confirm in dialog) |
| 31 | Edit photo label (from viewer) | `PhotoViewerScreen` → overflow → "Edit label" | free-text same as #28 | `viewModel.persistInspectionAttachmentPhotoLabel()` | `InspectionFileEntity.label` (PATCH) | `TankInspectionScreen.kt:276`, `PhotoViewerScreen.kt` | **medium** |
| 32 | Upload document | FAB (visit-level `AttachmentOptionsBottomSheet`) → "Upload document" | file picker (system UI) | `FilePickerHelper` → `viewModel.addFileAttachment()` | same file entity | `AttachmentOptionsBottomSheet.kt:43` | **hard** (system file picker) |

> **Note**: On `TankInspectionScreen` the FAB only has camera, gallery, actions (no `AttachmentOptionsBottomSheet` bottom sheet). File upload appears on the visit-level `AttachmentsTab`. The inspection FAB is `QuickActionsFab` with `onCameraClick`, `onGalleryClick`, `onActionsClick`.

### 2G — Status toggle
| # | Input | UI label | Type | Save path | Maps to backend field | Source file:line | Maestro-fillable? |
|---|-------|----------|------|-----------|-----------------------|-----------------|-------------------|
| 33 | Missing Inspection toggle | "Unable to Inspect" switch card (bottom of inspection screen) | toggle/switch (`AlertStatusToggleCard`) | `onMissingInspectionChange` → `viewModel.updateInspectionMissedToggle()` → Save button | `inspection.inspectionStatus = MISSED` (UpdateInspectionRequest) | `TankInspectionScreen.kt:805`, `AlertStatusToggleCard.kt` | **easy** |

### 2H — Save
| # | Input | UI label | Type | Save path | Maps to backend field | Source file:line | Maestro-fillable? |
|---|-------|----------|------|-----------|-----------------------|-----------------|-------------------|
| 34 | Save inspection | "Save" button (blue, bottom of screen, enabled only when `hasChanges=true`) | submit button | `viewModel.saveTankInspection()` → `SaveTankInspectionUseCase` → `SubmitInspectionFormSyncHandler` + `UpdateInspectionSyncHandler` | PATCH `/inspections/{id}` + POST `/inspections/{id}/form` | `SaveButton.kt`, `TankInspectionScreen.kt:452` | **easy** |
| 35 | Unsaved data dialog | "Unsaved data" modal on back press | confirmation dialog ("Go back" / "Stay") | navigation guard only | — | `TankInspectionScreen.kt:371` | **easy** (tapOn "Stay" or "Go back") |

---

## Screen 3 — Water Sampling Screen (`WaterSamplingScreen.kt`)

| # | Input | UI label | Type | Save path | Maps to backend field | Source file:line | Maestro-fillable? |
|---|-------|----------|------|-----------|-----------------------|-----------------|-------------------|
| 36 | Add New Samples | "Add New Samples" button (generic mode, samples not empty) or empty-state panel | `SelectWaterSamplesBottomSheet` — search + checkbox list | `viewModel.addLocalWaterSamples(selectedSampleTypes)` → local DB | `WaterSampleEntity` | `WaterSamplingScreen.kt:296`, `SelectWaterSamplesBottomSheet.kt:57` | **medium** |
| 37 | Assign laboratory | per-sample bottom sheet (slides up when no lab assigned) — tap lab card (e.g. "NORMEC", "ALS") | single-select card tap | `viewModel.assignLaboratoryToSelected(lab.id)` | `waterSample.laboratoryId` | `WaterSamplingScreen.kt:500` | **easy** (tapOn lab card) |
| 38 | Select sample (checkbox, generic mode) | checkbox next to each sample item | checkbox toggle | `viewModel.toggleSampleSelection(id)` | in-memory selection for batch assign lab | `WaterSamplingScreen.kt:355` | **easy** |
| 39 | Delete sample (swipe) | swipe-left on sample item in generic mode → delete | swipe gesture → `ConfirmationDialog` | `viewModel.deleteWaterSample(id)` → local DB | `DELETE /water-samples/{id}` (sync) | `SwipeableSampleItem.kt` | **hard** (swipe gesture) |
| 40 | Submit Samples | "Submit Samples" button (bottom) | submit button (enabled when all collected samples ready) | `viewModel.submitBatchSync()` → `SubmitBatchUseCase` | POST `/labs/{labId}/batch` or ALS batch | `WaterSamplingScreen.kt:401` | **easy** |

---

## Screen 4 — Normec Sample Form (`WaterSamplingFormNormecScreen.kt` + `DetailsCard.kt`)

| # | Input | UI label | Type | Save path | Maps to backend field | Source file:line | Maestro-fillable? |
|---|-------|----------|------|-----------|-----------------------|-----------------|-------------------|
| 41 | Date & Time | "Date & Time" | date-time picker (tap → Material3 DatePicker + TimePicker sequence) | `viewModel.updateForm { it.copy(sampleDateTime = value) }` | `job.samples.sample.sampledatetime` | `WaterSamplingFormNormecScreen.kt:189`, `DynamicTextField.kt:241` | **hard** |
| 42 | Barcode | "Barcode" | free-text single-line + scan icon (camera barcode scanner) | `viewModel.updateForm { it.copy(sampleId = value) }` | `job.samples.sample.sampleid` | `DetailsCard.kt:81` | **medium** (type directly; scan = hard) |
| 43 | Description | "Description" | free-text multi-line (required) | `viewModel.updateForm { it.copy(sampleDescription = value) }` | `job.samples.sample.sampledescription` | `DetailsCard.kt:107` | **easy** |
| 44 | Asset | "Asset" | free-text single-line (required if `requireAssetAndTemperature`) | `viewModel.updateForm { it.copy(asset = value) }` | `job.samples.sample.asset` | `DetailsCard.kt:129` | **easy** |
| 45 | Temperature | "Temperature" | numeric field (decimal keyboard) | `viewModel.updateForm { it.copy(temperature = value) }` | `job.samples.sample.temperature` | `DetailsCard.kt:151` | **easy** |
| 46 | Matrix Option | "Matrix Option" | dropdown single-select (options: Process, Drinking, Recreation, Solid — from `matrixChoices` API) | `viewModel.updateForm { it.copy(matrix = storedValue) }` | `job.samples.sample.matrix` + `job.samples.sample.matrixsupertype` | `DetailsCard.kt:184` | **medium** |
| 47 | Suite Code | "Suite Code" | dropdown single-select (30+ options from `suiteChoices` API, e.g. "LEGIONELLA", "POTABLE-Micro") | `viewModel.updateForm { it.copy(suite = storedValue) }` | `job.samples.sample.suite` | `DetailsCard.kt:217` | **medium** |
| 48 | Additional Tests | "Additional Tests" | free-text multi-line (optional) | `viewModel.updateForm { it.copy(notes = value) }` | `job.samples.sample.additionaltests` | `DetailsCard.kt:241` | **easy** |
| 49 | Save Sample | "Save Sample" button | submit button | `viewModel.prepareFormForSaving(sampleId)` → `viewModel.submitForm()` → `SubmitInspectionFormSyncHandler` | POST/PATCH `/inspections/{id}/samples/{sampleId}/form` | `WaterSamplingFormNormecScreen.kt:221` | **easy** |

---

## Screen 5 — ALS Sample Form (`WaterSamplingFormAlsScreen.kt`)

ALS fields are fully dynamic from `AlsStaticFormSchema`. Fields displayed (barcode and testItem are hidden/excluded from UI):

| # | Input | UI label | Type | Save path | Maps to backend field | Source file:line | Maestro-fillable? |
|---|-------|----------|------|-----------|-----------------------|-----------------|-------------------|
| 50 | Laboratory Code | "Laboratory Code" | dropdown single-select (Trowbridge Laboratory / Sittingbourne Laboratory) | `viewModel.setAlsValue("order.labCode", value)` | `order.labCode` | `WaterSamplingFormAlsScreen.kt:229`, `AlsStaticFormSchema.kt` | **medium** |
| 51 | Sampling Point (free text) | "Sampling Point" | free-text single-line (required) | `viewModel.setAlsValue("order.samples[].Text02", value)` | `order.samples[].Text02` | same | **easy** |
| 52 | Temperature | "Temperature" | numeric (decimal) | `viewModel.setAlsValue("order.samples[].Text04", value)` | `order.samples[].Text04` | same | **easy** |
| 53 | Sample Date & Time | "Sample Date & Time" | date-time picker | `viewModel.setAlsValue("order.samples[].Date04", value)` | `order.samples[].Date04` | same | **hard** |
| 54 | Sample Type | "Sample Type" | dropdown single-select (Potable Water / Process Water / Recreational Water / Swabs) | `viewModel.setAlsValue("order.samples[].SampleTypeId", value)` | `order.samples[].SampleTypeId` | same | **medium** |
| 55 | Sample Point | "Sample Point" | dropdown single-select (21 options: LPFILTERED, POTABLE, DOMESTIC, COOLING, etc.) | `viewModel.setAlsValue("order.samples[].SamplePointId", value)` | `order.samples[].SamplePointId` | same | **medium** |
| 56 | Save Sample | "Save Sample" button | submit button | `viewModel.saveAlsDraft(sampleId)` → `SubmitAlsBatchSyncHandler` | ALS batch API | `WaterSamplingFormAlsScreen.kt:325` | **easy** |

> Note: Barcode (`order.samples[].WtSampleNo`) and Test Item (`order.samples[].testItems[].testItemId`) are explicitly filtered out of the display loop (`displayedFields = laboratoryFields.filterNot { ... }`).

---

## Screen 6 — Submit Samples / Drop-off (`SubmitSamplesScreen.kt`)

| # | Input | UI label | Type | Save path | Maps to backend field | Source file:line | Maestro-fillable? |
|---|-------|----------|------|-----------|-----------------------|-----------------|-------------------|
| 57 | Search drop-off point | "Search for a drop off point…" | free-text search field (local filter only, not sent to API) | local state `searchQuery` | display filter only | `SubmitSamplesScreen.kt:108` | **easy** |
| 58 | Drop-off point selection | "Left at site" / "Lab drop-off" / "Collection center" | single-select card tap | local state `selectedDropOffPoint` (enables Complete button; not currently sent to API) | currently UI-only | `SubmitSamplesScreen.kt:174` | **easy** |
| 59 | Complete | "Complete" button | submit button (enabled only when drop-off selected) | `viewModel.submitBatch(laboratoryId)` | triggers pending batch submission | `SubmitSamplesScreen.kt:215` | **easy** |

---

## Summary counts

| Category | Count | Hard-to-automate? |
|----------|-------|------------------|
| Free-text fields (single-line) | 10 | No |
| Free-text fields (multi-line) | 7 | No |
| Numeric fields | 3 | No |
| Toggle / Switch | 4 (Missing Inspection, Aborted Visit, 2× dynamic booleans) | No |
| Single-select dropdowns | 10 | Medium |
| Multi-select dropdowns | 1 (dynamic form, `isMultiSelect=true`) | **Hard** |
| Date / DateTime pickers | 3 | **Hard** |
| Barcode (type+scan) | 2 | Medium (type) / Hard (scan) |
| Signature (draw canvas) | 1 | **Hard** |
| Photo capture (camera) | 1 | **Hard** |
| Gallery picker | 1 | **Hard** |
| Photo label dialog | 1 | Medium |
| Sample type picker (checkbox bottom sheet) | 2 | Medium |
| Drop-off selection (card tap) | 1 | Easy |
| Navigation/action buttons (Save, Submit etc.) | 8 | Easy |
| Drag/swipe gestures (reorder, delete swipe) | 2 | **Hard** |
| **TOTAL settable inputs** | **57** | |
| **Hard to automate** | **8 categories → ~10 inputs** | Signature, camera, gallery, datetime ×3, multi-select dropdown, drag reorder, swipe delete |

---

## Maestro fill strategy by type

| Type | Maestro approach | Notes |
|------|-----------------|-------|
| Free-text OutlinedTextField | `tapOn: {text: "placeholder text"}` then `inputText: "value"` | Use placeholder as selector |
| Numeric field | same; keyboard auto-switches to decimal | |
| Single-select dropdown | `tapOn: {text: "Select"}` → `tapOn: {text: "Option label"}` | Two taps; dropdown must be visible |
| Multi-select dropdown | `tapOn` to open, then multiple `tapOn` for each checkbox label, then tap elsewhere to close | Hard: selector may need `id` or index |
| Toggle / Switch | `tapOn: {text: "Field label"}` | Taps the Switch row |
| Date/Time picker | `tapOn: {text: "placeholder"}` opens dialog → Material3 DatePicker uses `id="date_picker_confirm"` style internal IDs; may need Maestro `assertVisible` + conditional taps | Hard: multi-step dialog |
| Barcode field (type) | `tapOn: {text: "Enter a barcode"}` + `inputText: "12345"` | Avoid the scan icon |
| Notes dialog | `tapOn: {text: "Edit"}` → `inputText:` in dialog → `tapOn: {text: "Save"}` | |
| Photo label dialog | `tapOn: {text: "e.g. Before cleaning"}` + `inputText:` or `tapOn` dropdown arrow | |
| Signature canvas | `swipe` gesture across canvas area — unreliable; consider skipping or mocking | |
| Camera/Gallery | Cannot be fully automated with Maestro without OS-level mocking | Mark as **manual** |
| Select Water Samples sheet | `tapOn: {text: "Add Sample"}` → type in search → `tapOn` checkbox items → `tapOn: {text: "Add Samples"}` | |
| N/A button | `tapOn: {text: "N/A"}` | |
| Save / Submit buttons | `tapOn: {text: "Save"}` / `tapOn: {text: "Save Sample"}` etc. | |

---

## Backend field mapping quick reference

| Mobile input | Backend payload | Endpoint |
|-------------|----------------|----------|
| Visit Description/Work/Sampling Details, Signature, Actions, Aborted toggle | `UpdateVisitRequest` | `PATCH /visits/{visitId}` |
| Access Info | `UpdateSiteRequest` | `PATCH /sites/{siteId}` |
| Dynamic inspection form fields | `SubmitInspectionFormRequest` (fieldId → value map) | `POST /inspections/{id}/form` |
| Inspection notes, missing toggle, actions | `UpdateInspectionRequest` | `PATCH /inspections/{id}` |
| Inspection photos/documents | multipart upload | `POST /inspections/{id}/files` |
| Normec sample form | `SubmitBatchRequest` (job.* schema) | `POST /labs/normec/batch` |
| ALS sample form | `AlsSubmitBatchRequest` (order.* schema) | `POST /labs/als/batch` |
| Water sample add | local DB → sync | `POST /inspections/{id}/samples` (sync) |
