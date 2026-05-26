# R1 — Backend Inspection Data Inventory (QA Parity)

> Source: `C:\Users\Coca-Cola\hydrocert-services` (NestJS backend)  
> Generated: 2026-05-27  
> Purpose: Complete map of every settable data point on an Inspection for parity test construction.

---

## How to read this table

- **Set endpoint+method**: the HTTP method + path to write the value.
- **Set field/shape**: exact JSON key(s) in the request body (or query param for files).
- **Type**: validated/stored type.
- **Read-back path**: JSON path in the response body of `GET /inspections/{id}`.
- **Notes**: constraints, side-effects, caveats.

---

## Surface 1 — Inspection Core Fields

> Set via `POST /inspections` (create) or `PATCH /inspections/:id` (update).  
> Read-back: `GET /inspections/{id}` — top-level fields.  
> DTO sources: `src/inspection/dto/create-inspection.dto.ts` · `src/inspection/dto/update-inspection.dto.ts`

| Data point | Set endpoint+method | Set field / shape | Type | Read-back path | Notes |
|---|---|---|---|---|---|
| Visit ID | `POST /inspections` | `visitId` (required) | string (UUID) | `.visitId` | Immutable after create; required field |
| Job ID | `POST /inspections` | `jobId` | string (UUID) | `.jobId` | Optional; if provided copies `jobTypeId`, products, and samples from the job |
| Job Type ID | `POST /inspections` · `PATCH /inspections/:id` | `jobTypeId` | string (UUID) | `.jobTypeId` (also `.job.jobTypeId`) | Can be set directly or inherited from `jobId`; triggers auto-creation of InspectionForms on create |
| Inspection Reference | `POST /inspections` · `PATCH /inspections/:id` | `inspectionReference` | string | `.inspectionReference` | Auto-generated if omitted on create (7-char alphanumeric). Marked "internal use for bulk creation" |
| Inspection Status | `POST /inspections` · `PATCH /inspections/:id` | `inspectionStatus` | string | `.inspectionStatus` | Known values: `not-started` (default), `started`, `completed`, `missed`. `PATCH /inspections/:id/submit-form` **force-sets** it to `"completed"` regardless of this field |
| Notes | `POST /inspections` · `PATCH /inspections/:id` | `notes` | string (text) | `.notes` | Free text; stored as `text` column |
| Item Location | `POST /inspections` · `PATCH /inspections/:id` | `itemLocation` | string | `.itemLocation` | Asset location (e.g. "Second floor") |
| Item Reference | `POST /inspections` · `PATCH /inspections/:id` | `itemReference` | string | `.itemReference` | Asset reference code (e.g. "CWST 1") |
| Item Detail | `POST /inspections` · `PATCH /inspections/:id` | `itemDetail` | string | `.itemDetail` | Asset detail (e.g. "Second floor - CWST 1") |
| Has Custom Products | `POST /inspections` (implicit) · `PATCH /inspections/:id` via products array | derived from `products` array being non-empty | boolean | `.hasCustomProducts` | **Not directly settable as a standalone flag**. On create: set `true` if `products` array is non-empty, `false` otherwise. On update: managed by `updateInspectionProducts()`. No standalone boolean field in DTO |

---

## Surface 2 — Form Fields (Dynamic per-JobType Forms)

> Two-step process: (1) obtain `InspectionFormField` IDs from the inspection's forms, (2) submit values.  
> DTO sources: `src/inspection/dto/submit-inspection-form.dto.ts` · `src/inspection/dto/inspection-form-field.dto.ts`

### Step 2a — Obtain field IDs

| How | Endpoint | Response path |
|---|---|---|
| From inspection response | `GET /inspections/{id}` | `.inspectionForms[].formFields[].id` (these are `InspectionFormField` UUIDs, NOT `FormField` config UUIDs) |
| From form-field config | `GET /form-fields?jobTypeId={id}` | Returns `FormField` config records; each has `.id` — but submit-form takes `InspectionFormField.id`, not `FormField.id` |
| Generate forms if missing | `PATCH /inspections/:id/generate-form?formName=` | Creates `InspectionForm` + `InspectionFormField` rows if they don't exist; returns updated inspection |

### Step 2b — Submit/update field values

| Data point | Set endpoint+method | Set field / shape | Type | Read-back path | Notes |
|---|---|---|---|---|---|
| Form field value (single/string/number/bool) | `PATCH /inspections/:id/submit-form` | `{ formFields: [{ id: "<InspectionFormField UUID>", value: <any> }] }` | string \| number \| boolean \| null | `.inspectionForms[n].formFields[m].value` | `id` is the `InspectionFormField.id` (from `.inspectionForms[].formFields[].id`) NOT the `FormField` config id |
| Form field value (multi-select) | `PATCH /inspections/:id/submit-form` | `{ formFields: [{ id: "…", value: ["opt1","opt2"] }] }` | string[] | `.inspectionForms[n].formFields[m].value` | Must be array when `formField.isMultiSelect === true`; backend rejects non-array with 400 |
| Not-Applicable flag | `PATCH /inspections/:id/submit-form` | `{ formFields: [{ id: "…", isNotApplicable: true, value: null }] }` | boolean | `.inspectionForms[n].formFields[m].isNotApplicable` | When `true`, `value` is forced to `null`; when `false`, clears the flag and stores the value |
| **Side effect** | — | — | — | `.inspectionStatus` → `"completed"` | `submit-form` always sets `inspectionStatus = "completed"` and re-syncs parent visit status |

### Form structure read-back (GET /inspections/{id})

```
.inspectionForms[]
  .id                              — InspectionForm UUID
  .inspectionId
  .formName                        — e.g. "default", "Post Cleaning Conditions"
  .formOrder                       — display order within the job type
  .formFields[]
    .id                            — InspectionFormField UUID (use this in submit-form)
    .inspectionFormId
    .formFieldId                   — FK to FormField config
    .value                         — jsonb, any type
    .isNotApplicable               — boolean
    .formField                     — embedded FormField config:
      .id
      .fieldName
      .fieldPath
      .formName
      .dataType                    — "string"|"number"|"boolean"|"date"|"datetime"|"array"|"object"
      .isMultiSelect               — boolean
      .isFreeText
      .isMultiLine
      .fieldOptions[]              — [{label, value}] for select/multiselect
      .requiredLevel               — 0=optional, 1=required, 2=conditional
      .showNotApplicable           — boolean
      .sortOrder
      .formOrder
```

### Form field config lookup for a specific jobTypeId

- Endpoint: `GET /form-fields?jobTypeId=<uuid>` (no `formName` filter = all forms for that job type)
- Returns all `FormField` config rows; grouped by `formName` on the client.
- **The jobTypeId `658f27c1-9306-42a2-81a6-ad249d7eaef3` is NOT present in source/seeds** — it is a runtime DB value. Use `GET /form-fields?jobTypeId=658f27c1-9306-42a2-81a6-ad249d7eaef3` against the live API to enumerate its specific fields.

---

## Surface 3 — Laboratory Samples

> Two ways to add samples to an inspection:  
> (A) At create time via `POST /inspections` body  
> (B) Dedicated endpoint `POST /laboratory-samples` with `inspectionId` linkage (via `inspection_id` column in entity)  
> DTO sources: `src/inspection/dto/inspection-sample.dto.ts` · `src/laboratory-sample/dto/create-laboratory-sample.dto.ts`

### 3A — Samples at inspection creation (lightweight stub creation)

| Data point | Set endpoint+method | Set field / shape | Type | Read-back path | Notes |
|---|---|---|---|---|---|
| Sample type | `POST /inspections` | `samples[].sampleTypeId` (required) | string (UUID) | `.laboratorySamples[n].sampleTypeId` | References `SampleType` entity |
| Lab | `POST /inspections` | `samples[].labId` | string (UUID) | `.laboratorySamples[n].labId` | Optional |
| Quantity | `POST /inspections` | `samples[].quantity` (required, min 1) | integer | — | Creates `quantity` number of `LaboratorySample` rows; quantity not stored per row |

### 3B — Full sample creation / update via dedicated endpoint

| Data point | Set endpoint+method | Set field / shape | Type | Read-back path | Notes |
|---|---|---|---|---|---|
| Office code | `POST /laboratory-samples` · `PATCH /laboratory-samples/:id` | `officeCode` | string | `.laboratorySamples[n].officeCode` (from inspection GET) / `GET /laboratory-samples/:id` → `.officeCode` | Optional |
| External reference | `POST /laboratory-samples` · `PATCH /laboratory-samples/:id` | `externalReference` | string | `.externalReference` | Optional |
| Order number | `POST /laboratory-samples` · `PATCH /laboratory-samples/:id` | `orderNumber` | string | `.orderNumber` | Optional |
| Sample name | `POST /laboratory-samples` · `PATCH /laboratory-samples/:id` | `sampleName` (required) | string | `.sampleName` | |
| Test suite | `POST /laboratory-samples` · `PATCH /laboratory-samples/:id` | `testSuite` (required) | string | `.testSuite` | |
| Collection status | `POST /laboratory-samples` · `PATCH /laboratory-samples/:id` | `collectionStatus` | enum: `pending_collection` \| `collected` \| `could_not_collect` | `.collectionStatus` | Default: `pending_collection` |
| Collected at | `POST /laboratory-samples` · `PATCH /laboratory-samples/:id` | `collectedAt` | Date (ISO 8601) | `.collectedAt` | Optional |
| Order ID | `POST /laboratory-samples` · `PATCH /laboratory-samples/:id` | `orderId` | string (UUID) | `.orderId` | Optional |
| Sample identifier | `POST /laboratory-samples` · `PATCH /laboratory-samples/:id` | `sampleIdentifier` (required, max 50 chars) | string | `.sampleIdentifier` | |
| Engineer ID | `POST /laboratory-samples` · `PATCH /laboratory-samples/:id` | `engineerId` (required) | string (UUID) | `.engineer.id` | Must be a valid User UUID |
| Temperature | `POST /laboratory-samples` · `PATCH /laboratory-samples/:id` | `temperature` | number (decimal 10,2) | `.temperature` | Optional |
| Matrix | `POST /laboratory-samples` · `PATCH /laboratory-samples/:id` | `matrix` (required) | string | `.matrix` (not in LaboratorySampleDto — see entity) | |
| Matrix supertype | `POST /laboratory-samples` · `PATCH /laboratory-samples/:id` | `matrixSupertype` (required) | string | `.matrixSupertype` (not in LaboratorySampleDto) | |
| Additional tests | `POST /laboratory-samples` · `PATCH /laboratory-samples/:id` | `additionalTests` | string | `.additionalTests` (not in LaboratorySampleDto) | |
| Asset | `POST /laboratory-samples` · `PATCH /laboratory-samples/:id` | `asset` | string | `.asset` | Optional |
| Sampling point | `POST /laboratory-samples` · `PATCH /laboratory-samples/:id` | `samplingPoint` | string | `.samplingPoint` | Optional |
| Sample type ID | `POST /laboratory-samples` · `PATCH /laboratory-samples/:id` | `sampleTypeId` | string (UUID) | `.sampleTypeId` | Optional — also used to link lab via SampleType |
| Notes (sample-level) | `POST /laboratory-samples/:id/notes` · `PATCH /laboratory-samples/:id/notes` | `noteText` (required, min 1 char) | string | `GET /laboratory-samples/:id` → `.sampleNote.noteText`; also embedded in `GET /inspections/{id}` → `.laboratorySamples[n].sampleNote` | One note per sample; POST is create-or-update |

> **Inspection linkage**: `LaboratorySample` records are linked by `inspectionId` column in the DB but `inspectionId` is **not** in `CreateLaboratorySampleDto`. The service links samples to the inspection during the `POST /inspections` flow (via `createSamplesForInspection`). For standalone `POST /laboratory-samples`, the inspection link mechanism needs verification — the `inspectionId` column is required (`nullable: false`) but not present in the create DTO. This may be set server-side or via a different flow.

> **Read-back from GET /inspections/:id**: `.laboratorySamples[]` — includes `id`, `officeCode`, `externalReference`, `orderNumber`, `sampleName`, `testSuite`, `collectionStatus`, `collectedAt`, `orderId`, `labId`, `lab`, `asset`, `samplingPoint`, `createdAt`, `updatedAt`, `sampleNote`. Fields `matrix`, `matrixSupertype`, `additionalTests`, `temperature`, `engineerId` are in the entity but **omitted from `LaboratorySampleDto`** — they will not appear in the inspection GET response unless the backend returns the raw entity.

---

## Surface 4 — Products (inspectionProducts)

> Set at create time or via `PATCH /inspections/:id` products array.  
> DTO sources: `src/inspection/dto/create-inspection.dto.ts` (line 6–22) · `src/inspection/dto/update-inspection.dto.ts` (line 14–30)

| Data point | Set endpoint+method | Set field / shape | Type | Read-back path | Notes |
|---|---|---|---|---|---|
| Product ID | `POST /inspections` or `PATCH /inspections/:id` | `products[].productId` (required) | string (UUID) | `.inspectionProducts[n].productId` | |
| Quantity | `POST /inspections` or `PATCH /inspections/:id` | `products[].quantity` | number (min 1, default 1) | `.inspectionProducts[n].quantity` | Optional |
| Price | `POST /inspections` or `PATCH /inspections/:id` | `products[].price` | number (min 0, default 0) | `.inspectionProducts[n].price` | Optional |
| Has Custom Products flag | — | Derived automatically | boolean | `.hasCustomProducts` | Set to `true` when `products` array provided on create. On PATCH: managed by `updateInspectionProducts()` |

> **Update semantics**: On `PATCH`, the products array is a **replace** operation — products omitted from the array are deleted. To delete all products, send `products: []`.

> **Read-back**: `.inspectionProducts[]` includes `.id`, `.productId`, `.product` (full product object, eager-loaded), `.quantity`, `.price`, `.createdAt`, `.updatedAt`.

---

## Surface 5 — Inspection Files / Photos / Attachments

> DTO sources: `src/inspection-file/dto/upload-files.dto.ts` · `src/inspection-file/dto/update-inspection-file.dto.ts` · `src/inspection-file/dto/inspection-file.dto.ts`  
> Controller: `src/inspection-file/controllers/inspection-file.controller.ts`  
> Base path: `/inspections-file` (note the hyphen — this is NOT under `/inspections`)

| Data point | Set endpoint+method | Set field / shape | Type | Read-back path | Notes |
|---|---|---|---|---|---|
| Upload file(s) | `POST /inspections-file/:inspectionId` | `multipart/form-data` field `files` (up to 10 files) + optional query param `?label=` | binary | `GET /inspections-file/:inspectionId` → `[].filePath`, `.originalName`, `.mimeType`, `.size` | Returns array of `InspectionFileDto`. URL not included in upload response; use `GET /inspections-file/:fileId/url` for signed URL |
| File label | `PATCH /inspections-file/:fileId` | `{ label: "After cleaning" }` | string \| null | `GET /inspections-file/:inspectionId` → `[n].label` | Can be set at upload time via `?label=` query param or updated later |
| Sort order | `PATCH /inspections-file/:fileId` | `{ sortOrder: 1 }` | number | `GET /inspections-file/:inspectionId` → `[n].sortOrder` | |
| Bulk sort order | `PATCH /inspections-file/bulk-sort-order` | `{ files: [{ id: "uuid", sortOrder: 0 }] }` | array | `GET /inspections-file/:inspectionId` → `[n].sortOrder` | Batch update |

> **Read-back**: `GET /inspections-file/:inspectionId` returns `InspectionFileDto[]` with: `.id`, `.inspectionId`, `.originalName`, `.filePath`, `.mimeType`, `.size`, `.label`, `.sortOrder`, `.uploadedBy`, `.createdAt`, `.updatedAt`, `.deletedAt`.  
> Files are **NOT** embedded in `GET /inspections/:id` — they require a separate GET to `/inspections-file/:inspectionId`.  
> Soft-delete: `DELETE /inspections-file/:fileId` (reversible via `PATCH /inspections-file/:fileId/restore`).  
> By-visit: `GET /inspections-file/by-visit/:visitId`.

---

## Surface 6 — Actions (at Inspection Level)

> DTO sources: `src/action/dto/create-action.dto.ts` · `src/action/dto/update-action.dto.ts` · `src/action/dto/action-update-item.dto.ts`  
> Two ways to manage actions on an inspection:  
> (A) Standalone `POST /actions` with `inspectionId`  
> (B) Inline via `PATCH /inspections/:id` using `actions` array (replaces all actions on the inspection)

| Data point | Set endpoint+method | Set field / shape | Type | Read-back path | Notes |
|---|---|---|---|---|---|
| Action — name | `POST /actions` | `{ siteId, inspectionId, name }` | string | `GET /actions?inspectionId=` → `[n].name`; also `GET /inspections/:id` → `.actions[n].name` | Required if `actionTypeId` not provided |
| Action — action type | `POST /actions` | `{ siteId, inspectionId, actionTypeId }` | string (UUID) | `.actions[n].actionTypeId` | Optional; if provided, `name` is derived from the action type's description |
| Action — priority | `POST /actions` | `{ ..., priority: "low"\|"medium"\|"high"\|"critical" }` | enum (ActionPriority) \| null | `.actions[n].priority` | Optional; nullable |
| Action — status | `POST /actions` | `{ ..., status: "pending"\|"completed"\|... }` | string \| null | `.actions[n].status` | Optional; free string |
| Action — visitId | `POST /actions` | `{ siteId, visitId, inspectionId, ... }` | string (UUID) | `.actions[n].visitId` | Optional; links to visit |
| Action (inline update) | `PATCH /inspections/:id` | `{ actions: [{ id?: UUID, name, actionTypeId?, priority?, status? }] }` | array of `ActionUpdateItemDto` | `.actions[]` | **Replace semantics**: actions omitted from array are deleted; items without `id` are created |

> **Read-back from GET /inspections/:id**: `.actions[]` — includes `.id`, `.siteId`, `.visitId`, `.inspectionId`, `.actionTypeId`, `.name`, `.priority`, `.status`, `.createdByUserId`, `.createdByUser`, `.createdAt`, `.updatedAt`.  
> **Read-back from dedicated endpoint**: `GET /actions?inspectionId={id}` — same shape.  
> Tags: if `.actions.length > 0`, the inspection will have tag `"needs_actions"` in `.tags[]`.

---

## Surface 7 — Inspection Status / Toggles / Computed Fields

| Data point | How set | Value | Read-back path | Notes |
|---|---|---|---|---|
| `inspectionStatus` | `PATCH /inspections/:id` with `{ inspectionStatus: "missed" }` | `"not-started"` \| `"started"` \| `"completed"` \| `"missed"` (and any free string) | `.inspectionStatus` | `submit-form` always overrides to `"completed"` |
| `tags` (computed) | Read-only, computed server-side | `"missed_inspection"` \| `"needs_actions"` \| `"waiting_for_samples"` | `.tags[]` | Derived from `inspectionStatus`, `actions`, `laboratorySamples.submissionStatus`. NOT settable — UI-computed field surfaced via API |
| `createdAt` / `updatedAt` | Automatic (TypeORM) | timestamptz | `.createdAt` / `.updatedAt` | Not settable |
| `hasCustomProducts` | Derived (see Surface 4) | boolean | `.hasCustomProducts` | Not directly settable as standalone field |

---

## Summary — Settable Data Points by Surface

| Surface | Data points settable via API | Count |
|---|---|---|
| **1 — Core fields** | `visitId`, `jobId`, `jobTypeId`, `inspectionReference`, `inspectionStatus`, `notes`, `itemLocation`, `itemReference`, `itemDetail` | **9** |
| **2 — Form fields** | `value` (single/multi), `isNotApplicable` per `InspectionFormField` | **2 per field × N fields** (N = jobType-specific) |
| **3 — Laboratory samples** | `sampleTypeId`, `labId`, `quantity` (create-stub); `officeCode`, `externalReference`, `orderNumber`, `sampleName`, `testSuite`, `collectionStatus`, `collectedAt`, `orderId`, `sampleIdentifier`, `engineerId`, `temperature`, `matrix`, `matrixSupertype`, `additionalTests`, `asset`, `samplingPoint`; `sampleNote.noteText` | **21** |
| **4 — Products** | `productId`, `quantity`, `price` per product | **3 per product** |
| **5 — Files** | file content (binary upload), `label`, `sortOrder` | **3** |
| **6 — Actions** | `name`, `actionTypeId`, `priority`, `status`, `visitId` per action | **5 per action** |
| **7 — Computed/toggles** | `inspectionStatus` = `"missed"` (toggle for missed-inspection tag) | — |

**Total distinct settable data-point types: ~43** (excluding per-item multipliers).

---

## Data Points NOT Settable via API (UI-only or read-only)

| Field | Reason |
|---|---|
| `tags[]` (`missed_inspection`, `needs_actions`, `waiting_for_samples`) | Computed server-side; read-only in API response |
| `hasCustomProducts` | Derived from products array state; no standalone setter |
| `inspectionId` on `LaboratorySample` (standalone create) | `inspectionId` required in DB but absent from `CreateLaboratorySampleDto` — the standalone `POST /laboratory-samples` flow requires further investigation; samples can only be reliably linked to an inspection via `POST /inspections` body or `PATCH /inspections/:id` samples array |
| `collectedAt` (auto on collection scan) | Can be set via PATCH but in practice set by the mobile collection scanner |
| `submissionStatus` / `submittedAt` / `submissionReference` on LaboratorySample | Managed by `laboratory-submission` controller (separate flow); see `src/laboratory-sample/controllers/laboratory-submission.controller.ts` |
| `sampleIdentifier` auto-generation | Must be provided explicitly; no auto-gen in create DTO |
| `matrix` / `matrixSupertype` in GET /inspections/:id response | Present in entity and settable via `POST/PATCH /laboratory-samples`, but **absent from `LaboratorySampleDto`** — will not appear in embedded `.laboratorySamples[]` in the inspection GET response. Must be read via `GET /laboratory-samples/:id` directly |
| Signed file URL | `GET /inspections-file/:fileId/url?expiresIn=` — generated dynamically, not stored |

---

## Concerns for QA Parity Test

1. **`inspectionId` not in `CreateLaboratorySampleDto`** (line 1–172): standalone `POST /laboratory-samples` cannot explicitly set `inspectionId`. Verify in the service whether it is injected server-side or whether samples can only be attached via the inspection body. If UI-only, mark as NOT testable via API.

2. **`matrix` / `matrixSupertype` / `additionalTests` / `temperature` / `engineerId` absent from `LaboratorySampleDto`** read-back: these are stored but not returned in the embedded inspection response. QA must call `GET /laboratory-samples/:id` separately to verify them.

3. **Form field IDs are `InspectionFormField.id` not `FormField.id`**: a common source of test confusion. The correct ID for `submit-form` comes from `.inspectionForms[].formFields[].id` on the inspection object.

4. **`submit-form` side-effect**: always sets `inspectionStatus = "completed"`. Any test that submits form values must account for this status change.

5. **Products PATCH is replace, not merge**: sending `products: []` deletes all products.

6. **Actions PATCH (inline) is replace, not merge**: actions array in `PATCH /inspections/:id` replaces all actions.

7. **Files endpoint is `/inspections-file` not `/inspections`**: separate controller, different base path.

8. **jobTypeId `658f27c1-9306-42a2-81a6-ad249d7eaef3`**: not present in source/migrations — it is a live DB value. Use `GET /form-fields?jobTypeId=658f27c1-9306-42a2-81a6-ad249d7eaef3` against the live API to discover exact form names and fields for this job type.
