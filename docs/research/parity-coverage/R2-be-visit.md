# R2 — Backend Visit API: Complete Settable-Data Inventory

> Source: `C:\Users\Coca-Cola\hydrocert-services\src\visit\` + related modules  
> Purpose: QA parity test — every data point that can be created/set on a Visit via REST API, with read-back path.

---

## 1. Visit Core Fields

### 1a. `POST /visits` — CreateVisitDto (`src/visit/dto/create-visit.dto.ts`)

| Data point | Field | Type | Required | Notes |
|---|---|---|---|---|
| title | `title` | `string` (max 100) | yes | |
| from (start time) | `from` | `Date` (ISO timestamptz) | yes | Must be before `to` |
| to (end time) | `to` | `Date` (ISO timestamptz) | yes | |
| visit reference | `visitReference` | `string` | no | Auto-generated if omitted (sequential) |
| notes | `notes` | `string` | no | |
| is exception | `isException` | `boolean` | no | default false |
| original date | `originalDate` | `Date` | no | For exceptions only |
| engineer IDs | `engineerIds` | `string[]` (UUID[]) | yes (min 1) | Creates VisitEngineer join rows |
| booking person ID | `bookingPersonId` | `string` (UUID) | yes | Must be active user |
| status | `status` | `enum: scheduled\|confirmed\|cancelled\|pending` | no | default `scheduled` |
| visit status | `visitStatus` | `string` | no | default `not-started` |
| site ID | `siteId` | `string` (UUID) | no | |
| job IDs | `jobIds` | `string[]` (UUID[]) | no | Creates inspections for these jobs |
| update jobs next date | `updateJobsNextDate` | `boolean` | no | default false; updates job.lastInspectionDate |
| is fixed | `isFixed` | `boolean` | no | Non-movable visit flag |
| inspections (inline) | `inspections` | `CreateInspectionForVisitDto[]` | no | See §4 |

**Source**: `src/visit/dto/create-visit.dto.ts` lines 25–182  
**Controller**: `POST /visits` → `src/visit/controllers/visit.controller.ts` line 61

---

### 1b. `PATCH /visits/:id` — UpdateVisitDto (`src/visit/dto/update-visit.dto.ts`)

`UpdateVisitDto extends PartialType(CreateVisitDto)` — all create fields become optional, PLUS the following extra fields:

| Data point | Field | Type | Notes |
|---|---|---|---|
| All create fields (optional) | (see §1a) | partial | title, from, to, notes, isException, originalDate, status, siteId, jobIds, isFixed, visitReference |
| engineer IDs | `engineerIds` | `string[]` (UUID[]) | Empty array removes all engineers |
| samples (visit-level) | `samples` | `VisitSampleItemDto[]` | Extracted from DTO but **NOT persisted** — dead field, see §5 |
| signature | `signature` | `string` (base64) | Update-only; not on create DTO |
| signature name | `signatureName` | `string` | Update-only; not on create DTO |
| water system description | `waterSystemDescription` | `string` | Update-only; not on create DTO |
| work details | `workDetails` | `string` | Update-only; not on create DTO |
| sampling details | `samplingDetails` | `string` | Update-only; not on create DTO |
| actions (inline upsert) | `actions` | `ActionUpdateItemDto[]` | Upsert/delete visit-level actions inline |
| visit status | `visitStatus` | `string` | Overrides; accepted values: `not-started`, `started`, `completed`, `missed`, `aborted` |
| was service report sent | `wasServiceReportSent` | `boolean` | Update-only; not on create DTO |

**Source**: `src/visit/dto/update-visit.dto.ts` lines 1–101  
**Controller**: `PATCH /visits/:id` → `src/visit/controllers/visit.controller.ts` line 537

**Service logic notes** (`src/visit/services/visit.service.ts` lines 1055–1247):
- `samples`, `engineerIds`, `actions`, `visitStatus` are extracted separately from `visitUpdateData` before merge.
- `samples` is destructured but **never processed** — passing it has no effect.
- `visitStatus` is applied directly to `visitToUpdate.visitStatus` if provided.
- `isContract` is **not** in either DTO — it is NOT settable via REST API (written only by ServiceTracker import at `src/servicetracker/services/visits-import.service.ts` line 814).
- When `signature`, `signatureName`, `waterSystemDescription`, `workDetails`, or `samplingDetails` actually change (WORKFLOW_TRIGGER_FIELDS, line 69–75), `syncVisitStatusFromInspections()` is called to auto-advance `visitStatus` from `not-started` — unless `visitStatus` was explicitly sent or the visit is form-only.

---

## 2. Full Inventory Table

| Data point | Settable on (create/update/endpoint) | Field/shape | Type | Read-back path | Notes |
|---|---|---|---|---|---|
| **title** | CREATE + UPDATE | `title` | `string` max 100 | `GET /visits/{id}` → `.title` | Required on create |
| **from** | CREATE + UPDATE | `from` | ISO 8601 timestamptz | `GET /visits/{id}` → `.from` | Required on create; must be before `to` |
| **to** | CREATE + UPDATE | `to` | ISO 8601 timestamptz | `GET /visits/{id}` → `.to` | Required on create |
| **notes** | CREATE + UPDATE | `notes` | `string` (text) | `GET /visits/{id}` → `.notes` | Optional |
| **isException** | CREATE + UPDATE | `isException` | `boolean` | `GET /visits/{id}` → `.isException` | Default false |
| **originalDate** | CREATE + UPDATE | `originalDate` | ISO 8601 timestamptz | `GET /visits/{id}` → `.originalDate` | For exceptions only |
| **engineerIds** | CREATE + UPDATE | `engineerIds` | `string[]` UUID[] | `GET /visits/{id}` → `.visitEngineers[].engineer.id` | Min 1 on create; empty array removes all on update |
| **bookingPersonId** | CREATE only | `bookingPersonId` | `string` UUID | `GET /visits/{id}` → `.bookingPerson.id` / `.bookingPersonId` | Required on create; not in UpdateVisitDto explicitly but inherited via PartialType |
| **status** | CREATE + UPDATE | `status` | `enum: scheduled\|confirmed\|cancelled\|pending` | `GET /visits/{id}` → `.status` | Default `scheduled` |
| **visitStatus** | CREATE + UPDATE | `visitStatus` | `string` | `GET /visits/{id}` → `.visitStatus` | Known values: `not-started`, `started`, `completed`, `missed`, `aborted`; default `not-started` |
| **siteId** | CREATE + UPDATE | `siteId` | `string` UUID | `GET /visits/{id}` → `.siteId` / `.site.id` | Optional |
| **jobIds** | CREATE only (inspection creation) | `jobIds` | `string[]` UUID[] | `GET /visits/{id}` → `.inspections[].job.id` | Creates inspections; not stored directly on visit |
| **updateJobsNextDate** | CREATE only | `updateJobsNextDate` | `boolean` | (side-effect on Job entity) | Not stored on visit |
| **isFixed** | CREATE + UPDATE | `isFixed` | `boolean` | `GET /visits/{id}` → `.isFixed` | |
| **visitReference** | CREATE + UPDATE | `visitReference` | `string` | `GET /visits/{id}` → `.visitReference` | Auto-generated if omitted |
| **inspections** (inline) | CREATE only | `inspections` | `CreateInspectionForVisitDto[]` | `GET /visits/{id}` → `.inspections[]` | See §4 for inspection shape |
| **signature** | UPDATE only | `signature` | `string` (base64) | `GET /visits/{id}` → `.signature` | Triggers workflow status advancement |
| **signatureName** | UPDATE only | `signatureName` | `string` | `GET /visits/{id}` → `.signatureName` | Triggers workflow status advancement |
| **waterSystemDescription** | UPDATE only | `waterSystemDescription` | `string` (text) | `GET /visits/{id}` → `.waterSystemDescription` | Triggers workflow status advancement |
| **workDetails** | UPDATE only | `workDetails` | `string` (text) | `GET /visits/{id}` → `.workDetails` | Triggers workflow status advancement |
| **samplingDetails** | UPDATE only | `samplingDetails` | `string` (text) | `GET /visits/{id}` → `.samplingDetails` | Triggers workflow status advancement |
| **wasServiceReportSent** | UPDATE only | `wasServiceReportSent` | `boolean` | `GET /visits/{id}` → `.wasServiceReportSent` | Default false |
| **actions** (inline upsert) | UPDATE only | `actions: ActionUpdateItemDto[]` | array (see §3) | `GET /visits/{id}` → `.actions[]` | Upsert/delete inline; omit entry to delete existing |
| **samples** (visit-level) | UPDATE — **DEAD FIELD** | `samples: VisitSampleItemDto[]` | array | N/A | Extracted from DTO but never processed; no effect |
| **isContract** | NOT settable via REST API | — | `boolean` | `GET /visits/{id}` → `.isContract` | Written only by ServiceTracker import |
| **totalPoints** | NOT settable | — | computed `number` | `GET /visits/{id}` → `.totalPoints` | `round((to - from) / 30min)` |
| **tags** | NOT settable | — | computed `string[]` | `GET /visits/{id}` → `.tags` | Derived from actions + inspections rollup |
| **createdBy** | NOT settable (auto) | — | `string` UUID | `GET /visits/{id}` → `.createdBy` | Set to currentUser.id on create |
| **visitEngineers** (relation) | via `engineerIds` | — | VisitEngineer[] | `GET /visits/{id}` → `.visitEngineers[]` | |

---

## 3. Actions at Visit Level

### 3a. Create action — `POST /actions`

| Data point | Field | Type | Required | Notes |
|---|---|---|---|---|
| site ID | `siteId` | `string` UUID | yes | |
| visit ID | `visitId` | `string` UUID | no | Link to visit |
| inspection ID | `inspectionId` | `string` UUID | no | Link to inspection |
| action type ID | `actionTypeId` | `string` UUID | no | If set, name comes from ActionType |
| name | `name` | `string` | required if no `actionTypeId` | |
| priority | `priority` | `enum: low\|medium\|high` | no | nullable |
| status | `status` | `string` | no | e.g. `pending`, `completed` |

**Source**: `src/action/dto/create-action.dto.ts`  
**Controller**: `POST /actions` → `src/action/controllers/action.controller.ts` line 91  
**Read-back**: `GET /actions?visitId={id}` → array of ActionDto  
**Also read back**: `GET /visits/{id}` → `.actions[]` (actions loaded via `actionRepository.find({ where: { visitId: id } })`)

### 3b. Update action — `PATCH /actions/:id`

| Data point | Field | Type | Notes |
|---|---|---|---|
| siteId | `siteId` | `string` UUID | optional |
| visitId | `visitId` | `string` UUID | optional |
| inspectionId | `inspectionId` | `string` UUID | optional |
| actionTypeId | `actionTypeId` | `string` UUID | optional |
| name | `name` | `string` | required if no actionTypeId |
| priority | `priority` | `enum: low\|medium\|high\|null` | nullable |
| status | `status` | `string\|null` | e.g. `completed` |

**Source**: `src/action/dto/update-action.dto.ts`

### 3c. Inline action upsert — via `PATCH /visits/:id` body `actions[]`

Uses `ActionUpdateItemDto` (`src/action/dto/action-update-item.dto.ts`):

| Field | Type | Notes |
|---|---|---|
| `id` | `string` UUID | Omit to create new; include to update existing |
| `actionTypeId` | `string` UUID | Optional |
| `name` | `string` | Required if no actionTypeId |
| `priority` | `enum: low\|medium\|high\|null` | Optional |
| `status` | `string\|null` | Optional |

Omitting an existing action ID from the array deletes it.

---

## 4. Inline Inspections on Visit Create

`CreateInspectionForVisitDto` (`src/visit/dto/create-inspection-for-visit.dto.ts`):

| Field | Type | Notes |
|---|---|---|
| `jobId` | `string` UUID | Optional — copies jobTypeId/products/samples from job |
| `jobTypeId` | `string` UUID | Optional override |
| `samples` | `InspectionSampleItemDto[]` | `{ sampleTypeId, labId?, quantity }` |
| `products` | `InspectionProductItemForVisitDto[]` | `{ productId, quantity?, price? }` |
| `notes` | `string` | Optional |
| `itemLocation` | `string` | Optional |
| `itemDetail` | `string` | Optional |
| `itemReference` | `string` | Optional |

Read-back: `GET /visits/{id}` → `.inspections[]`

---

## 5. Visit Files / Attachments

**Controller**: `src/visit-file/controllers/visit-file.controller.ts`

| Operation | Endpoint | Fields | Read-back |
|---|---|---|---|
| Upload files | `POST /visits-file/:visitId` (multipart/form-data) | `files` (binary[], max 10); `?label` query param (string) | `GET /visits-file/:visitId` → `VisitFileDto[]` |
| Update file metadata | `PATCH /visits-file/:fileId` | `{ label?: string\|null, sortOrder?: number }` | `GET /visits-file/:visitId` |
| Bulk update sort order | `PATCH /visits-file/bulk-sort-order` | `{ files: [{ id, sortOrder }] }` | `GET /visits-file/:visitId` |
| Soft delete | `DELETE /visits-file/:fileId` | — | `GET /visits-file/:visitId?includeDeleted=true` → `.deletedAt` |
| Restore | `PATCH /visits-file/:fileId/restore` | — | `GET /visits-file/:visitId` |
| Get signed URL | `GET /visits-file/:fileId/url?expiresIn=3600` | — | returns `{ url }` |

`VisitFileDto` fields (read): `id`, `visitId`, `originalName`, `filePath`, `mimeType`, `size`, `label`, `sortOrder`, `uploadedBy`, `createdAt`, `updatedAt`, `deletedAt`  
**Source**: `src/visit-file/dto/visit-file.dto.ts`, `src/visit-file/entities/visit-file.entity.ts`

---

## 6. Visit Status Transitions (visitStatus)

Known values used across codebase:
- `not-started` — default on create
- `started` — auto-advanced when workflow trigger fields change
- `completed` — set via PATCH or auto from inspections
- `missed` — set via PATCH or inspection rollup
- `aborted` — set via PATCH (manual abort)

Set via: `PATCH /visits/:id` body `{ visitStatus: "aborted" }` (or other values)  
Read-back: `GET /visits/{id}` → `.visitStatus`  
History filter: `GET /visits/filter-detailed?visitStatus[]=completed&visitStatus[]=aborted`

---

## 7. Read-back Endpoints Reference

| Endpoint | Returns |
|---|---|
| `GET /visits/:id` | Full visit with inspections, actions, visitEngineers, site, bookingPerson, tags, totalPoints |
| `GET /visits/filter-detailed` | Paginated filtered visits with same relations; supports visitStatus, startDate, endDate, assignedEngineerId, jobTypeId, title, siteId filters |
| `GET /visits/detailed` | Paginated all visits (detailed) |
| `GET /visits/filter` | Calendar-light visit list (id, status, visitStatus, tags, title, notes, from, to, site, engineers, bookingPerson, points, isContract, isFixed) |
| `GET /visits/calendar-filter` | Calendar view (same shape as filter) |
| `GET /actions?visitId={id}` | Actions for a visit |
| `GET /visits-file/:visitId` | Files attached to visit |

---

## 8. Fields NOT Settable via REST API

| Field | Entity column | Why not settable | Where set |
|---|---|---|---|
| `isContract` | `visit.is_contract` | Not in any DTO | ServiceTracker sync import (`visits-import.service.ts:814`) |
| `totalPoints` | computed | Derived from `(to - from) / 30min` | Computed on every read in service |
| `tags` | computed | Derived from actions + inspection rollup | Computed on every read via `attachVisitTags()` |
| `createdBy` | `visit.created_by` | Auto-set on create | Set to `currentUser.id` in `visit.service.ts:257` |
| `createdAt` | `visit.created_at` | TypeORM CreateDateColumn | Auto |
| `updatedAt` | `visit.updated_at` | TypeORM UpdateDateColumn | Auto |
| `visitReference` (auto) | `visit.visit_reference` | Auto-generated sequential | Generated via `generateNextVisitReference()` if not provided |
| `samples` (update) | — | Dead field in UpdateVisitDto | Extracted but not processed in `update()` at line 1106 |

---

## 9. Summary Count

**Distinct settable data points (via REST API):**

### Create-only (`POST /visits`):
1. title
2. from
3. to
4. notes
5. isException
6. originalDate
7. engineerIds
8. bookingPersonId
9. status
10. visitStatus
11. siteId
12. jobIds (→ creates inspections)
13. updateJobsNextDate (side effect)
14. isFixed
15. visitReference
16. inspections[] (inline inspection creation)

**Total create: 16 fields**

### Update-only (`PATCH /visits/:id`, not in create DTO):
17. signature
18. signatureName
19. waterSystemDescription
20. workDetails
21. samplingDetails
22. wasServiceReportSent
23. actions[] (inline upsert)

**Total update-only: 7 fields**

### Create + Update (shared, inherited via PartialType):
All 15 non-inline create fields (excluding `inspections`) are available on update.

### Action fields (`POST /actions` or inline):
24. action.name
25. action.priority
26. action.status
27. action.actionTypeId
28. action.visitId (link)

### File/attachment fields (`POST /visits-file/:visitId`):
29. file binary content
30. file label
31. file sortOrder (via PATCH)

**Grand total: ~30 distinct settable data points**

### NOT settable (read-only/computed):
- `isContract` — ServiceTracker import only
- `totalPoints` — computed
- `tags` — computed
- `createdBy`, `createdAt`, `updatedAt` — auto
- `samples` in UpdateVisitDto — dead field (no effect)

---

## 10. Key Source Files

- Entity: `src/visit/entities/visit.entity.ts`
- Create DTO: `src/visit/dto/create-visit.dto.ts`
- Update DTO: `src/visit/dto/update-visit.dto.ts`
- Controller: `src/visit/controllers/visit.controller.ts`
- Service: `src/visit/services/visit.service.ts`
- Action entity: `src/action/entities/action.entity.ts`
- Action controller: `src/action/controllers/action.controller.ts`
- Create action DTO: `src/action/dto/create-action.dto.ts`
- ActionUpdateItem DTO: `src/action/dto/action-update-item.dto.ts`
- Visit file controller: `src/visit-file/controllers/visit-file.controller.ts`
- Visit file entity: `src/visit-file/entities/visit-file.entity.ts`
- Tag utils: `src/tag/tag.utils.ts`
