# R5 — Web Settable Data Points: Visits & Inspections

**Source repo:** `C:\Users\Coca-Cola\hydrocert-web`  
**Generated:** 2026-05-27  
**Scope:** Add New Visit, Edit Visit, Visit Details (inline), Inspection Details (inline), Actions panel + modal, Attachments upload.  
**Note:** `data-testid` attributes are absent across all surveyed forms (the codebase uses sparse testids as noted in the task brief — none were found in any of the listed components).

---

## Section 1 — Add New Visit (`/visits/new`)

**Source:** `src/pages/AddNewAppoitment/AddNewAppointmentForm.tsx` + `src/pages/AddNewAppoitment/index.tsx`  
**Submit mutation:** `useCreateVisitMutation` → `POST /visits`

| # | Data point | Field label | Input type | data-testid | Backend field / endpoint | Source file:line |
|---|-----------|------------|-----------|------------|--------------------------|-----------------|
| 1 | Visit title | Title * | text | — | `title` → `POST /visits` | AddNewAppointmentForm.tsx:469 |
| 2 | Visit status | (Status selector top-right) | select (custom StatusSelector) | — | `status` (values: scheduled / confirmed / pending) → `POST /visits` | AddNewAppointmentForm.tsx:454-467 |
| 3 | Site | Site * | searchable-select (≥2 chars) | — | `siteId` → `POST /visits` | AddNewAppointmentForm.tsx:567-586 |
| 4 | Customer contract | Customer contract | select / searchable-select | — | `bookingPersonId` (customer contract context) — not sent directly; visit links via siteId | AddNewAppointmentForm.tsx:589-626 |
| 5 | Date | Date * | date picker | — | `originalDate` → `POST /visits` | AddNewAppointmentForm.tsx:631 |
| 6 | Start time | from | select (15-min slots) | — | `from` (ISO) → `POST /visits` | AddNewAppointmentForm.tsx:638-647 |
| 7 | End time | to | select (filtered > from) | — | `to` (ISO) → `POST /visits` | AddNewAppointmentForm.tsx:652-660 |
| 8 | Points | Points * | number (pts suffix) | — | computed from from/to; stored as visit metadata (not in API payload directly) | AddNewAppointmentForm.tsx:661-683 |
| 9 | Fixed Visit | Fixed Visit | switch/toggle | — | `isFixed` → `POST /visits` | AddNewAppointmentForm.tsx:687 |
| 10 | Booking Info | Booking Info | textarea | — | written to `site.accessInfo` via `PATCH /sites/{id}` (separate call on submit) | AddNewAppointmentForm.tsx:1519-1524 |
| 11 | Description (visit notes) | Description | textarea | — | `notes` → `POST /visits` | AddNewAppointmentForm.tsx:1525-1529 |
| 12 | Booking Person | Person * | multi-select (single-select mode) | — | `bookingPersonId` → `POST /visits` | AddNewAppointmentForm.tsx:836-852 |
| 13 | Skill Requirement | Skill Requirement | checkbox group (6 options) | — | `skills` → stripped before POST (not sent) | AddNewAppointmentForm.tsx:1128-1146 |
| 14 | Engineers | Engineers * | multi-select | — | `engineerIds[]` → `POST /visits` | AddNewAppointmentForm.tsx:1149-1163 |

### Add Inspection (within Add New Visit — modal + accordion)

**Source:** `src/pages/AddNewAppoitment/forms/AddInspectionForm.tsx`  
**Modal opens from:** AddNewAppointmentForm.tsx:1171

| # | Data point | Field label | Input type | data-testid | Backend field / endpoint | Source file:line |
|---|-----------|------------|-----------|------------|--------------------------|-----------------|
| 15 | Job Type(s) | Job Type * | multi-select | — | `jobTypeId` per inspection → `POST /visits` body `.inspections[].jobTypeId` | AddInspectionForm.tsx:58-78 |
| 16 | Inspection quantity | Quantity | number (per job type) | — | expanded into N inspection objects → `POST /visits` body `.inspections[]` | AddInspectionForm.tsx:94-100 |
| 17 | Asset Reference (per inspection) | Asset Reference | text / combobox (if site assets exist) | — | `inspections[].itemReference` → `POST /visits` | AddNewAppointmentForm.tsx:1212-1230 |
| 18 | Asset Location (per inspection) | Asset Location | text | — | `inspections[].itemLocation` → `POST /visits` | AddNewAppointmentForm.tsx:1234-1249 |
| 19 | Inspection product | Product | select | — | `inspections[].products[].productId` + `quantity` → `POST /visits` | AddNewAppointmentForm.tsx:883-1009 |
| 20 | Inspection product quantity | Quantity | number | — | `inspections[].products[].quantity` → `POST /visits` | AddNewAppointmentForm.tsx:942-953 |
| 21 | Inspection water sample type | Sample Type * | multi-select (water sample types) | — | `inspections[].samples[].sampleTypeId` → `POST /visits` | AddNewAppointmentForm.tsx:1025-1038 |
| 22 | Inspection notes | Notes | textarea (modal) | — | `inspections[].notes` → `POST /visits` | AddNewAppointmentForm.tsx:1085-1090 |

**Total Add New Visit fields: 22**

---

## Section 2 — Edit Visit (`/visits/edit/:id`)

**Source:** `src/pages/EditAppointment/index.tsx` + individual form files  
All edits use `PATCH /visits/{id}` or `PATCH /inspections/{id}` via RTK mutations.

### 2a — Edit Main Details modal

**Source:** `src/pages/EditAppointment/forms/EditMainDetailsForm.tsx`  
**Mutation:** `useUpdateVisitMutation` → `PATCH /visits/{id}`

| # | Data point | Field label | Input type | data-testid | Backend field / endpoint | Source file:line |
|---|-----------|------------|-----------|------------|--------------------------|-----------------|
| 23 | Visit title | Job Title * | text | — | `title` → `PATCH /visits/{id}` | EditMainDetailsForm.tsx:119 |
| 24 | Engineer(s) | Engineer * | multi-select | — | `engineerIds` → `PATCH /visits/{id}` | EditMainDetailsForm.tsx:121-129 |
| 25 | Booking person | Booking Person * | select | — | `bookingPersonId` → `PATCH /visits/{id}` | EditMainDetailsForm.tsx:131-138 |

### 2b — Edit Date & Time modal

**Source:** `src/pages/EditAppointment/forms/EditDateAndTimeForm.tsx`  
**Mutation:** `useUpdateVisitMutation` → `PATCH /visits/{id}`

| # | Data point | Field label | Input type | data-testid | Backend field / endpoint | Source file:line |
|---|-----------|------------|-----------|------------|--------------------------|-----------------|
| 26 | Visit date | Date * | date picker | — | `originalDate` (ISO) → `PATCH /visits/{id}` | EditDateAndTimeForm.tsx:161 |
| 27 | Start time | From | select | — | `from` (ISO datetime) → `PATCH /visits/{id}` | EditDateAndTimeForm.tsx:163-164 |
| 28 | End time | To | select | — | `to` (ISO datetime) → `PATCH /visits/{id}` | EditDateAndTimeForm.tsx:166-169 |
| 29 | Points (read-only calc) | Points | number (disabled — auto-calculated) | — | not sent; display only | EditDateAndTimeForm.tsx:174 |
| 30 | Fixed Visit | Fixed Visit | switch/toggle | — | `isFixed` → `PATCH /visits/{id}` | EditDateAndTimeForm.tsx:176 |

### 2c — Edit Notes/Description modal

**Source:** `src/pages/EditAppointment/forms/EditNotesForm.tsx`  
**Mutation:** `useUpdateVisitMutation` → `PATCH /visits/{id}` (or `useUpdateInspectionMutation` → `PATCH /inspections/{id}` when inspectionId provided)

| # | Data point | Field label | Input type | data-testid | Backend field / endpoint | Source file:line |
|---|-----------|------------|-----------|------------|--------------------------|-----------------|
| 31 | Visit description | Description | textarea | — | `notes` → `PATCH /visits/{id}` | EditNotesForm.tsx:73-76 |
| 32 | Inspection notes (same form, different context) | Notes | textarea | — | `notes` → `PATCH /inspections/{id}` | EditNotesForm.tsx:45-48 |

### 2d — Edit Booking Info modal

**Source:** `src/pages/EditAppointment/modals/EditBookingInfoModal.tsx`  
**Mutation:** `useUpdateSiteMutation` → `PATCH /sites/{id}` (updates `accessInfo`)

| # | Data point | Field label | Input type | data-testid | Backend field / endpoint | Source file:line |
|---|-----------|------------|-----------|------------|--------------------------|-----------------|
| 33 | Booking Info | Booking Info | textarea | — | `accessInfo` → `PATCH /sites/{siteId}` | EditBookingInfoModal.tsx:35 |

### 2e — Visit Status (inline on Edit Visit page)

**Source:** `src/pages/EditAppointment/index.tsx:110-122`  
**Mutation:** `useUpdateVisitMutation` → `PATCH /visits/{id}`

| # | Data point | Field label | Input type | data-testid | Backend field / endpoint | Source file:line |
|---|-----------|------------|-----------|------------|--------------------------|-----------------|
| 34 | Visit status | (StatusSelector) | select (custom) | — | `status` → `PATCH /visits/{id}` | EditAppointment/index.tsx:111-116 |

### 2f — Inspection edits on Edit Visit page

**Source:** `src/pages/EditAppointment/index.tsx:350-435`  
**Mutations:** `useUpdateInspectionMutation` → `PATCH /inspections/{id}`, `useAddInspectionMutation` → `POST /inspections`, `useDeleteInspectionMutation` → `DELETE /inspections/{id}`

| # | Data point | Field label | Input type | data-testid | Backend field / endpoint | Source file:line |
|---|-----------|------------|-----------|------------|--------------------------|-----------------|
| 35 | Add inspection (job type + qty) | Job Type * / Quantity | multi-select + number | — | `jobTypeId` + `visitId` → `POST /inspections` | EditAppointment/index.tsx:405-415 |
| 36 | Inspection asset reference | Asset Reference | text / combobox | — | `itemReference` → `PATCH /inspections/{id}` | EditAppointment/index.tsx:351-375 |
| 37 | Inspection asset location | Asset Location | text | — | `itemLocation` → `PATCH /inspections/{id}` | EditAppointment/index.tsx:351-375 |
| 38 | Inspection product (add/edit) | Product | select | — | `products[].productId` → `PATCH /inspections/{id}` | EditProductsForm.tsx:151-157 |
| 39 | Inspection product quantity | Quantity | number | — | `products[].quantity` → `PATCH /inspections/{id}` | EditProductsForm.tsx:228-233 |
| 40 | Water sample type (add) | Sample Type * | multi-select | — | `samples[].sampleTypeId` → `PATCH /inspections/{id}` | EditWaterSamplesForm.tsx:109-116 |

---

## Section 3 — Visit Details page (`/visits/details/:id`) — Inline editable fields

**Source:** `src/pages/VisitDetails/VisitDetailsPanel.tsx`  
**Mutations:** `useUpdateVisitMutation` → `PATCH /visits/{id}`, `useUpdateSiteMutation` → `PATCH /sites/{id}`

| # | Data point | Field label | Input type | data-testid | Backend field / endpoint | Source file:line |
|---|-----------|------------|-----------|------------|--------------------------|-----------------|
| 41 | Description & Reference | Description & Reference | textarea (onBlur save) | — | `waterSystemDescription` → `PATCH /visits/{id}` | VisitDetailsPanel.tsx:158-173 |
| 42 | Work Details | Work Details | textarea (onBlur save) | — | `workDetails` → `PATCH /visits/{id}` | VisitDetailsPanel.tsx:176-191 |
| 43 | Water Sampling Details | Water Sampling Details | textarea (onBlur save) | — | `samplingDetails` → `PATCH /visits/{id}` | VisitDetailsPanel.tsx:194-211 |
| 44 | Booking Info (via modal) | Booking Info | textarea (modal) | — | `accessInfo` → `PATCH /sites/{siteId}` | VisitDetailsPanel.tsx:104-113, EditBookingInfoModal.tsx:35 |
| 45 | Client Signature | (display only) | read-only render | — | **NOT settable on web** — captured on mobile only; displayed as base64 image | VisitDetailsPanel.tsx:39-46, 263-286 |

### Visit-level attachments (Visit Details page)

**Source:** `src/pages/VisitDetails/AttachmentsPanel.tsx`  
**Mutations:** `useUploadVisitFilesMutation` → `POST /visits-file/{visitId}`, `useUploadInspectionFilesMutation` → `POST /inspections-file/{inspectionId}`

| # | Data point | Field label | Input type | data-testid | Backend field / endpoint | Source file:line |
|---|-----------|------------|-----------|------------|--------------------------|-----------------|
| 46 | Visit-level image upload | Upload | file (image/*, multiple) | — | files → `POST /visits-file/{visitId}` | VisitDetails/AttachmentsPanel.tsx:84-107 |
| 47 | Inspection-level image upload (from Visit Details) | Upload | file (image/*, multiple) | — | files → `POST /inspections-file/{inspectionId}` | VisitDetails/AttachmentsPanel.tsx:113-137 |

---

## Section 4 — Inspection Details page (`/inspections/:id`)

### 4a — Inspection form fields (inline editable)

**Source:** `src/pages/InspectionDetails/DetailsPanel.tsx`  
**Mutation:** `useSubmitInspectionFormMutation` → `PATCH /inspections/{inspectionId}/submit-form`

| # | Data point | Field label | Input type | data-testid | Backend field / endpoint | Source file:line |
|---|-----------|------------|-----------|------------|--------------------------|-----------------|
| 48 | Inspection form field (string, non-dropdown) | `formField.fieldName` (dynamic) | text or textarea (isMultiLine) — **editable only when value already exists and field has no dropdown options** | — | `formFields[{id, value}]` → `PATCH /inspections/{id}/submit-form` | DetailsPanel.tsx:36-42, 63-74 |
| 49 | Inspection form field (dropdown / no value) | `formField.fieldName` | text (disabled / read-only) — **not settable on web when has fieldOptions or has no prior value** | — | read-only; not submittable from web | DetailsPanel.tsx:133-140 |

**Important constraint:** The web `isEditableStringField` check (line 36-42) allows edit only if: (a) `value` is a non-empty string AND (b) `fieldOptions` array is empty. This means dropdown-type fields and blank fields are read-only on web — they must be set on mobile.

### 4b — Inspection-level attachments

**Source:** `src/pages/InspectionDetails/AttachmentsPanel.tsx`  
**Mutation:** `useUploadInspectionFilesMutation` → `POST /inspections-file/{inspectionId}`

| # | Data point | Field label | Input type | data-testid | Backend field / endpoint | Source file:line |
|---|-----------|------------|-----------|------------|--------------------------|-----------------|
| 50 | Inspection image upload | Upload | file (image/*, multiple) | — | files → `POST /inspections-file/{inspectionId}` | InspectionDetails/AttachmentsPanel.tsx:55-60 |

---

## Section 5 — Actions Panel + Add Action Modal

**Source:** `src/components/Actions/ActionsPanel.tsx`, `src/components/Actions/AddActionModal.tsx`, `src/components/Actions/actionsConstants.tsx`  
**Mutations:** `useUpdateVisitMutation` → `PATCH /visits/{id}` (visit actions), `useUpdateInspectionMutation` → `PATCH /inspections/{id}` (inspection actions)  
**Available contexts:** Visit Details panel (accordion), Inspection Details tab

| # | Data point | Field label | Input type | data-testid | Backend field / endpoint | Source file:line |
|---|-----------|------------|-----------|------------|--------------------------|-----------------|
| 51 | Action name (from template) | (template checkbox list with search) | checkbox + text search | — | `actions[].name` → `PATCH /visits/{id}` or `PATCH /inspections/{id}` | AddActionModal.tsx:399-456 |
| 52 | Action name (custom) | Type custom action here... | textarea | — | `actions[].name` → `PATCH /visits/{id}` or `PATCH /inspections/{id}` | AddActionModal.tsx:243-248 |
| 53 | Action priority (on add) | Priority | select (High / Medium / Low / Unset) | — | `actions[].priority` → `PATCH /visits/{id}` or `PATCH /inspections/{id}` | AddActionModal.tsx:251-284 |
| 54 | Action priority (on existing) | Priority | select (inline on ActionCard) | — | `actions[].priority` → `PATCH /visits/{id}` or `PATCH /inspections/{id}` | ActionsPanel.tsx:56-83 |
| 55 | Action status (on existing) | Status | select (New / Follow Up / Completed / Cancelled) | — | `actions[].status` → `PATCH /visits/{id}` or `PATCH /inspections/{id}` | ActionsPanel.tsx:88-110 |

---

## Summary counts

| Section | Settable data points |
|---------|---------------------|
| Add New Visit (main form) | 14 |
| Add Inspection (within Add New Visit) | 8 |
| Edit Visit — Main Details modal | 3 |
| Edit Visit — Date & Time modal | 4 (1 read-only calc) |
| Edit Visit — Notes/Description modal | 2 |
| Edit Visit — Booking Info modal | 1 |
| Edit Visit — Status inline | 1 |
| Edit Visit — Inspection edits | 6 |
| Visit Details page — inline text fields | 3 |
| Visit Details page — Booking Info modal | 1 |
| Visit Details page — Attachments upload | 2 |
| Inspection Details — Form fields (conditional) | 1 (dynamic, conditional) |
| Inspection Details — Attachments upload | 1 |
| Actions panel + modal | 5 |
| **TOTAL** | **52 distinct settable data points** |

*(Some fields appear in both Add New Visit and Edit contexts — counted once per distinct input surface. Client Signature is NOT included — web is read-only display only.)*

---

## Web → Mobile Parity Candidates

These are data points that exist on web AND are expected to be settable on mobile, making them high-value parity test candidates:

| Data point | Web sets via | Mobile expected path | Parity test value |
|-----------|-------------|---------------------|------------------|
| Visit status | Edit Visit page (StatusSelector inline) | Visit screen status change | HIGH |
| Visit title | Add/Edit main details | Create/Edit visit | HIGH |
| Engineers | Add/Edit main details | Assign engineer | HIGH |
| Date / Start time / End time | Add/Edit date & time | Schedule visit | HIGH |
| Fixed Visit toggle | Add/Edit date & time | Visit settings | MEDIUM |
| Site | Add New Visit | Create visit | HIGH |
| Notes / Description | Edit Notes modal | Visit notes field | HIGH |
| Booking Info (accessInfo) | Booking Info modal | Site info field | MEDIUM |
| Asset Reference (per inspection) | Edit Appointment / inline | Inspection screen | HIGH |
| Asset Location (per inspection) | Edit Appointment / inline | Inspection screen | HIGH |
| Inspection product + quantity | Edit Products modal | Inspection products | HIGH |
| Water sample type | Edit Water Samples modal | Inspection samples | HIGH |
| Inspection notes | Edit Notes modal (inspection context) | Inspection notes | HIGH |
| Inspection form fields (string type) | DetailsPanel inline text/textarea | Inspection form screen | HIGH |
| Inspection form fields (dropdown type) | **NOT settable on web** — read-only | Mobile only | MOBILE-ONLY (gap) |
| Client Signature | **NOT settable on web** — display only | Mobile signature capture | MOBILE-ONLY |
| Image upload (visit) | AttachmentsPanel file input | Camera / photo picker | MEDIUM |
| Image upload (inspection) | AttachmentsPanel file input | Camera / photo picker | MEDIUM |
| Action name | AddActionModal | Actions screen | HIGH |
| Action priority | AddActionModal / ActionsPanel inline | Actions screen | HIGH |
| Action status | ActionsPanel inline | Actions screen | HIGH |
| Water Sampling Details | VisitDetailsPanel textarea inline | Visit details screen | MEDIUM |
| Work Details | VisitDetailsPanel textarea inline | Visit details screen | MEDIUM |
| Description & Reference | VisitDetailsPanel textarea inline | Visit details screen | MEDIUM |

### Web-only / no mobile parity needed
- Skill Requirement checkboxes: stripped before API submit, not sent — UI cosmetic only, no backend field
- Points field: auto-calculated display, not a direct API field
- Customer contract: contextual selection during visit creation, not a separate editable field

### Mobile-only data points (gap — these must be set on mobile, cannot be validated on web)
1. **Client Signature** (`signature`, `signatureName`) — web shows read-only base64 image
2. **Inspection form fields with `fieldOptions`** (dropdown-type) — web renders them as read-only disabled inputs
3. **Inspection form fields with no pre-existing value** — `isEditableStringField` returns false → read-only on web

---

## Concerns

- **DONE_WITH_CONCERNS**
- **Signature is fully web read-only.** The `signatureName` and `signature` fields on VisitDetails are displayed but there is no `<input>` or mutation to capture a signature from the web — this is a confirmed mobile-only data point. Any parity test comparing signature state between platforms must set it on mobile and verify read-only display on web.
- **Inspection form fields edit gate is narrow.** The `isEditableStringField` predicate (DetailsPanel.tsx:36-42) means only fields that already have a non-empty string value AND have no dropdown options are editable on web. Blank fields and all dropdown fields are read-only web-side even if they show an input element. Mobile may allow setting these from scratch.
- **`points` field** is computed from `from`/`to` times client-side and is not sent in the `POST /visits` body as a named field. On the Edit Date & Time form it is explicitly `disabled`. Any mobile "points" field should be treated as a derived display value, not a settable API field for parity.
- **Skill Requirement checkboxes** (`Chemistry Level 4`, `Biology`, `Physics`, `Plumbing`, `Electrical`, `Safety Certified`) are present in the Add New Visit form UI but are stripped from the payload before the API call (`const { skills: _skills, ... } = rest`). They have no backend effect and should NOT be included in functional parity tests.
- **No `data-testid` attributes found** in any surveyed form/component. All automation selectors will need to use label text, placeholder, role, or structural CSS selectors.
