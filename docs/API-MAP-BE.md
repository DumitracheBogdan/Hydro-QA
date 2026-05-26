# Hydrocert Backend REST API Map

Generated: 2026-05-26. Extracted from `hydrocert-services` NestJS source (controllers + DTOs) and `openapi-spec.json`.

---

## Table of Contents

1. [Authentication](#authentication)
2. [Visits](#visits)
3. [Inspections](#inspections)
4. [Actions](#actions)
5. [Action Types](#action-types)
6. [Users](#users)
7. [Sites](#sites)
8. [Customers](#customers)
9. [Jobs](#jobs)
10. [Job Types](#job-types)
11. [Job Categories](#job-categories)
12. [Job Sample Types](#job-sample-types)
13. [Contracts](#contracts)
14. [Products](#products)
15. [Laboratory Samples](#laboratory-samples)
16. [Laboratory Fields](#laboratory-fields)
17. [Laboratory Sample Submission](#laboratory-sample-submission)
18. [Labs](#labs)
19. [Sample Types](#sample-types)
20. [Form Fields](#form-fields)
21. [Inspection Files](#inspection-files)
22. [Visit Files](#visit-files)
23. [Skills](#skills)
24. [Internal Jobs](#internal-jobs)
25. [Service Report (PDF)](#service-report-pdf)
26. [Activity Logs](#activity-logs)
27. [QA Tracker](#qa-tracker)
28. [ServiceTracker (Import)](#servicetracker-import)
29. [Health / App](#health--app)
30. [Write→Read Field Drift](#writeread-field-drift)
31. [Parity-Relevant Endpoints](#parity-relevant-endpoints)

---

## Authentication

Base path: `/auth` — **no global JWT required** (individual routes marked Public where applicable)

| Method | Path | Purpose | Key body/query fields | Auth | Source |
|--------|------|---------|----------------------|------|--------|
| POST | `/auth/register` | Register a new user | `email` (required), `password` (min 8), `passwordConfirmation` | Public (CASL guard) | auth.controller.ts:58 |
| POST | `/auth/login` | Log in, returns tokens + user | `email`, `password` (via LocalAuthGuard/strategy) | Public (LocalAuthGuard) | auth.controller.ts:74 |
| POST | `/auth/logout` | Invalidate session | — | JWT Bearer | auth.controller.ts:94 |
| POST | `/auth/refresh` | Refresh access token | `refreshToken` (body) | Public (JwtRefreshGuard) | auth.controller.ts:108 |
| PATCH | `/auth/change-password` | Change current user's password | `currentPassword`, `newPassword`, `newPasswordConfirmation` (ChangePasswordDto) | JWT Bearer | auth.controller.ts:126 |
| POST | `/auth/forgot-password` | Request password reset email | `email` | Public | auth.controller.ts:146 |
| POST | `/auth/reset-password` | Reset password with token | `token`, `newPassword`, `newPasswordConfirmation` (ResetPasswordDto) | Public | auth.controller.ts:163 |

**Endpoint count: 7**

---

## Visits

Base path: `/visits` — JWT Bearer required on all routes

| Method | Path | Purpose | Key body/query fields | Auth | Source |
|--------|------|---------|----------------------|------|--------|
| POST | `/visits` | Create a new visit | `title`\*, `from`\*, `to`\*, `engineerIds[]`\* (UUIDs, min 1), `bookingPersonId`\*, `siteId`, `notes`, `visitReference` (ignored—auto-generated), `status` (enum), `visitStatus`, `jobIds[]`, `updateJobsNextDate`, `isFixed`, `isException`, `originalDate`, `inspections[]` | JWT | visit.controller.ts:50 |
| GET | `/visits/detailed` | All visits paginated (detailed) | `page`, `limit` | JWT | visit.controller.ts:75 |
| GET | `/visits/filter-detailed` | Filter visits with expanded objects | `startDate`, `endDate`, `assignedEngineerId`, `jobTypeId`, `title`, `visitStatus[]`, `page`, `limit`, `sortOrder` (ASC/DESC), `isHistory` | JWT | visit.controller.ts:100 |
| GET | `/visits/filter` | Filter visits (basic) | `startDate`, `endDate`, `assignedEngineerId`, `jobTypeId`, `title`, `visitReference`, `siteId`, `search` | JWT | visit.controller.ts:148 |
| GET | `/visits/calendar-filter` | Filter visits for calendar view | `startDate`, `endDate`, `assignedEngineerId[]`, `jobTypeId`, `customerId`, `title`, `status`, `bookingPersonId[]`, `search`, `page`, `limit` | JWT | visit.controller.ts:168 |
| GET | `/visits/duplicates` | Find visits with duplicate visitReference | `page`, `limit`, `startDate`, `endDate` | JWT | visit.controller.ts:270 |
| POST | `/visits/generate-from-jobs` | Trigger daily cron-style visit generation | — | JWT | visit.controller.ts:62 |
| POST | `/visits/backfill-references` | Backfill visitReference for visits without one | `startDate`, `endDate` (body) | JWT | visit.controller.ts:303 |
| POST | `/visits/backfill-null-statuses` | Set visitStatus=not-started for null/given statuses | `fromStatus` (optional, BackfillVisitStatusesDto) | JWT | visit.controller.ts:338 |
| GET | `/visits/:id` | Get visit by ID | — | JWT | visit.controller.ts:367 |
| PATCH | `/visits/:id` | Update visit | `title`, `from`, `to`, `engineerIds[]`, `bookingPersonId`, `notes`, `status`, `visitStatus`, `siteId`, `jobIds[]`, `isFixed`, `signature`, `signatureName`, etc. (UpdateVisitDto) | JWT | visit.controller.ts:384 |
| DELETE | `/visits/:id` | Delete visit | — | JWT | visit.controller.ts:404 |

**Endpoint count: 12**

---

## Inspections

Base path: `/inspections` — JWT Bearer required on all routes

| Method | Path | Purpose | Key body/query fields | Auth | Source |
|--------|------|---------|----------------------|------|--------|
| POST | `/inspections` | Create a new inspection | `visitId`\*, `jobId`, `jobTypeId`, `samples[]` (`sampleTypeId`, `quantity`), `products[]` (`productId`, `quantity`, `price`), `notes`, `itemLocation`, `itemDetail`, `itemReference`, `inspectionReference`, `inspectionStatus` | JWT | inspection.controller.ts:41 |
| GET | `/inspections/:id` | Get inspection by ID | — | JWT | inspection.controller.ts:60 |
| GET | `/inspections/by-job/:jobId` | Get inspection by job ID | — | JWT | inspection.controller.ts:76 |
| GET | `/inspections/by-job/:jobId/visit/:visitId` | Get inspection by job + visit IDs | — | JWT | inspection.controller.ts:93 |
| PATCH | `/inspections/:id` | Update inspection | `notes`, `inspectionStatus`, `samples[]`, `products[]`, `itemLocation`, `itemDetail`, `itemReference` (UpdateInspectionDto) | JWT | inspection.controller.ts:113 |
| PATCH | `/inspections/:id/generate-form` | Generate inspection form(s) for a job type | `formName` (query, optional) | JWT | inspection.controller.ts:132 |
| PATCH | `/inspections/:id/submit-form` | Submit/update inspection form field values | `formFields[]` (`id` (InspectionFormField UUID), `value` (any: string/number/boolean/array/null), `isNotApplicable` bool) | JWT | inspection.controller.ts:155 |
| DELETE | `/inspections/:id` | Delete inspection | — | JWT | inspection.controller.ts:178 |

**Endpoint count: 8**

---

## Actions

Base path: `/actions` — JWT Bearer required on all routes

| Method | Path | Purpose | Key body/query fields | Auth | Source |
|--------|------|---------|----------------------|------|--------|
| GET | `/actions` | Get all actions with optional filters | `siteId`, `clientId`, `visitId`, `inspectionId`, `startDate`, `endDate` | JWT | action.controller.ts:41 |
| GET | `/actions/:id` | Get single action by ID | — | JWT | action.controller.ts:63 |
| POST | `/actions` | Create a new action | `siteId`\*, `visitId`, `inspectionId`, `actionTypeId`, `name` (required if no actionTypeId), `priority` (`low`/`medium`/`high`/null), `status` | JWT | action.controller.ts:80 |
| PATCH | `/actions/:id` | Update an action | `name`, `priority`, `status`, `visitId`, `inspectionId`, `actionTypeId` (UpdateActionDto) | JWT | action.controller.ts:100 |
| DELETE | `/actions/:id` | Delete an action | — | JWT | action.controller.ts:118 |
| GET | `/actions/export/excel` | Export actions to Excel file | `siteId`, `clientId`, `visitId`, `inspectionId`, `startDate`, `endDate` | JWT | action.controller.ts:131 |

**Endpoint count: 6**

---

## Action Types

Base path: `/action-types` — JWT Bearer required

| Method | Path | Purpose | Key body/query fields | Auth | Source |
|--------|------|---------|----------------------|------|--------|
| POST | `/action-types` | Create an action type | `name`\*, `description` (CreateActionTypeDto) | JWT | action-type.controller.ts:32 |
| GET | `/action-types` | Get all action types | — | JWT | action-type.controller.ts:45 |
| GET | `/action-types/:id` | Get action type by ID | — | JWT | action-type.controller.ts:57 |
| PATCH | `/action-types/:id` | Update an action type | `name`, `description` | JWT | action-type.controller.ts:70 |
| DELETE | `/action-types/:id` | Delete an action type | — | JWT | action-type.controller.ts:82 |

**Endpoint count: 5**

---

## Users

Base path: `/users` — JWT Bearer required

| Method | Path | Purpose | Key body/query fields | Auth | Source |
|--------|------|---------|----------------------|------|--------|
| POST | `/users` | Create a new user | `email`\*, `password`\*, `firstName`, `lastName`, `role`, `isEngineer`, `isBookingPerson` (CreateUserDto) | JWT + CASL Admin | user.controller.ts:70 |
| GET | `/users` | Get all users | `search`, `isBookingPerson` (bool), `isEngineer` (bool) | JWT | user.controller.ts:91 |
| POST | `/users/update-by-names` | Set isBookingPerson/isEngineer for users by name list | `names[]` (body); `isBookingPerson`, `isEngineer` (query) | JWT | user.controller.ts:126 |
| GET | `/users/absences` | Get engineers days off from BreatheHR | `startDate`, `endDate` | JWT | user.controller.ts:160 |
| GET | `/users/profile/me` | Get current user profile | — | JWT | user.controller.ts:174 |
| GET | `/users/workload` | Get user workload for a date | `date` (YYYY-MM-DD) | JWT | user.controller.ts:186 |
| POST | `/users/avatar/:userId` | Upload/replace user avatar | `file` (multipart/form-data, image only, max 5MB) | JWT | user.controller.ts:198 |
| GET | `/users/avatar/:userId` | Get signed URL for user avatar | `expiresIn` (seconds, default 3600) | JWT | user.controller.ts:224 |
| DELETE | `/users/avatar/:userId` | Delete user avatar | — | JWT | user.controller.ts:234 |
| GET | `/users/:id` | Get user by ID | — | JWT | user.controller.ts:243 |
| PATCH | `/users/:id` | Update user | `email`, `firstName`, `lastName`, `role`, `isEngineer`, `isBookingPerson`, `isActive` (UpdateUserDto) | JWT | user.controller.ts:259 |
| DELETE | `/users/:id` | Delete user | — | JWT | user.controller.ts:278 |

**Endpoint count: 12**

---

## Sites

Base path: `/sites` — JWT Bearer required

| Method | Path | Purpose | Key body/query fields | Auth | Source |
|--------|------|---------|----------------------|------|--------|
| POST | `/sites` | Create a site | `name`\*, `customerId`, `address`, `isActive` (CreateSiteDto) | JWT | site.controller.ts:44 |
| GET | `/sites` | List all active sites | — | JWT | site.controller.ts:53 |
| POST | `/sites/bulk` | Bulk create sites | `items[]` (`name`, `customerId` or `customerCompanyName`, `address`) (BulkCreateSitesDto) | JWT | site.controller.ts:62 |
| POST | `/sites/deactivate-inactive-by-name` | Deactivate sites matching keyword | `keyword` (query, default: "inactive") | JWT | site.controller.ts:70 |
| GET | `/sites/filtered` | Filter sites with pagination (50/page) | `search`, `customerName`, `siteName`, `page` | JWT | site.controller.ts:88 |
| GET | `/sites/:id` | Get site by ID | — | JWT | site.controller.ts:99 |
| PATCH | `/sites/:id` | Update site | fields from UpdateSiteDto | JWT | site.controller.ts:108 |
| DELETE | `/sites/:id` | Soft delete site | — | JWT | site.controller.ts:118 |

**Endpoint count: 8**

---

## Customers

Base path: `/customers` — JWT Bearer required

| Method | Path | Purpose | Key body/query fields | Auth | Source |
|--------|------|---------|----------------------|------|--------|
| POST | `/customers` | Create a customer | `name`\*, `email`, `phone`, `address` (CreateCustomerDto) | JWT + CASL | customer.controller.ts:43 |
| GET | `/customers` | Get all customers | — | JWT | customer.controller.ts:58 |
| GET | `/customers/filtered` | Filter customers | `search`, `name`, `page`, `limit` (FilterCustomersDto) | JWT | customer.controller.ts:67 |
| POST | `/customers/bulk` | Bulk create customers | `items[]` (BulkCreateCustomersDto) | JWT + CASL | customer.controller.ts:74 |
| POST | `/customers/deactivate-inactive-by-name` | Deactivate customers matching keyword | `keyword` (query) | JWT + CASL | customer.controller.ts:89 |
| GET | `/customers/:id` | Get customer by ID | — | JWT | customer.controller.ts:107 |
| PATCH | `/customers/:id` | Update customer | `name`, `email`, `phone`, `address`, `isActive` | JWT + CASL | customer.controller.ts:119 |
| DELETE | `/customers/:id` | Delete customer | — | JWT + CASL | customer.controller.ts:134 |

**Endpoint count: 8**

---

## Jobs

Base path: `/jobs` — JWT Bearer required

| Method | Path | Purpose | Key body/query fields | Auth | Source |
|--------|------|---------|----------------------|------|--------|
| POST | `/jobs` | Create a new job | `siteId`\*, `jobTypeId`\*, `reference`, `itemLocation`, `itemDetail`, `itemReference`, `frequency`, `nextInspectionDate`, `products[]`, `samples[]` (CreateJobDto) | JWT | job.controller.ts:37 |
| GET | `/jobs` | Get all jobs | — | JWT | job.controller.ts:52 |
| GET | `/jobs/site/:siteId` | Get jobs by site ID | — | JWT | job.controller.ts:62 |
| GET | `/jobs/assets/:siteId` | Get job assets (itemLocation, itemReference, itemDetail) by site | — | JWT | job.controller.ts:78 |
| GET | `/jobs/:id` | Get job by ID | — | JWT | job.controller.ts:96 |
| PATCH | `/jobs/:id` | Update job | `reference`, `itemLocation`, `itemDetail`, `itemReference`, `frequency`, `nextInspectionDate`, `products[]`, `samples[]` (UpdateJobDto) | JWT | job.controller.ts:111 |
| DELETE | `/jobs/:id` | Delete job | — | JWT | job.controller.ts:127 |

**Endpoint count: 7**

---

## Job Types

Base path: `/job-types` — JWT Bearer required

| Method | Path | Purpose | Key body/query fields | Auth | Source |
|--------|------|---------|----------------------|------|--------|
| POST | `/job-types` | Create a job type | `name`\*, `categoryId`, `formName`, `requiresWaterSample` (CreateJobTypeDto) | JWT + CASL | job-type.controller.ts:44 |
| POST | `/job-types/bulk` | Bulk create job types | `items[]` (category resolved by name) (BulkCreateJobTypesDto) | JWT + CASL | job-type.controller.ts:62 |
| GET | `/job-types` | Get all job types | — | JWT | job-type.controller.ts:80 |
| GET | `/job-types/:id` | Get job type by ID | — | JWT | job-type.controller.ts:93 |
| PATCH | `/job-types/:id` | Update job type | UpdateJobTypeDto fields | JWT + CASL | job-type.controller.ts:107 |
| DELETE | `/job-types/:id` | Delete job type | — | JWT + CASL | job-type.controller.ts:124 |

**Endpoint count: 6**

---

## Job Categories

Base path: `/job-categories` — JWT Bearer required

| Method | Path | Purpose | Key body/query fields | Auth | Source |
|--------|------|---------|----------------------|------|--------|
| POST | `/job-categories` | Create a job category | `name`\* (CreateJobCategoryDto) | JWT + CASL | job-category.controller.ts:48 |
| GET | `/job-categories` | Get all job categories | — | JWT | job-category.controller.ts:65 |
| GET | `/job-categories/filter` | Filter by name or job type name | `Search` (query) | JWT | job-category.controller.ts:78 |
| GET | `/job-categories/:id` | Get job category by ID | — | JWT | job-category.controller.ts:92 |
| PATCH | `/job-categories/:id` | Update job category | `name` | JWT + CASL | job-category.controller.ts:106 |
| DELETE | `/job-categories/:id` | Delete job category | — | JWT + CASL | job-category.controller.ts:123 |

**Endpoint count: 6**

---

## Job Sample Types

Base path: `/job-sample-types` — **No auth guard in controller** (no JWT/CASL decorators present)

| Method | Path | Purpose | Key body/query fields | Auth | Source |
|--------|------|---------|----------------------|------|--------|
| POST | `/job-sample-types` | Create a job sample type | `jobId`\*, `sampleTypeId`\* (CreateJobSampleTypeDto) | None (controller has no guard) | job-sample-type.controller.ts:17 |
| GET | `/job-sample-types/:jobId` | Get all sample types for a job | — | None | job-sample-type.controller.ts:23 |
| PATCH | `/job-sample-types/:id` | Update a job sample type | fields from UpdateJobSampleTypeDto | None | job-sample-type.controller.ts:28 |
| DELETE | `/job-sample-types/:id` | Delete a job sample type | — | None | job-sample-type.controller.ts:36 |

**Endpoint count: 4**

---

## Contracts

Base path: `/contracts` — JWT Bearer required

| Method | Path | Purpose | Key body/query fields | Auth | Source |
|--------|------|---------|----------------------|------|--------|
| POST | `/contracts` | Create a contract | `customerId`\*, `startDate`, `endDate`, `description`, `isActive` (CreateContractDto) | JWT | contract.controller.ts:31 |
| GET | `/contracts` | Get all contracts | `customerId` (query, optional filter) | JWT | contract.controller.ts:46 |
| GET | `/contracts/:id` | Get contract by ID | — | JWT | contract.controller.ts:62 |
| PATCH | `/contracts/:id` | Update contract | UpdateContractDto fields | JWT | contract.controller.ts:74 |
| DELETE | `/contracts/:id` | Delete contract | — | JWT | contract.controller.ts:87 |

**Endpoint count: 5**

---

## Products

Base path: `/products` — JWT Bearer + CASL required

| Method | Path | Purpose | Key body/query fields | Auth | Source |
|--------|------|---------|----------------------|------|--------|
| POST | `/products` | Create a product | `name`\*, `unit`, `price`, `jobTypeId` (CreateProductDto) | JWT + CASL Manage | product.controller.ts:24 |
| POST | `/products/bulk` | Bulk create products | `items[]` (BulkCreateProductsDto) | JWT + CASL Create | product.controller.ts:30 |
| GET | `/products` | List all products | — | JWT + CASL Read | product.controller.ts:42 |
| GET | `/products/filtered` | Filter by name and/or jobTypeId | `search`, `jobTypeId` | JWT + CASL Read | product.controller.ts:49 |
| PATCH | `/products/:id` | Update product | `name`, `unit`, `price`, `jobTypeId` | JWT + CASL Manage | product.controller.ts:60 |
| DELETE | `/products/:id` | Delete product | — | JWT + CASL Manage | product.controller.ts:66 |

**Endpoint count: 6**

---

## Laboratory Samples

Base path: `/laboratory-samples` — JWT Bearer required

| Method | Path | Purpose | Key body/query fields | Auth | Source |
|--------|------|---------|----------------------|------|--------|
| POST | `/laboratory-samples` | Create a laboratory sample | `inspectionId`\*, `siteId`, `officeCode`, `orderNumber`, `externalReference`, `sampleName`, `testSuite`, `collectionStatus`, `collectedAt`, `labId` (CreateLaboratorySampleDto) | JWT | laboratory-sample.controller.ts:55 |
| GET | `/laboratory-samples` | Get all laboratory samples | — | JWT | laboratory-sample.controller.ts:71 |
| GET | `/laboratory-samples/filter` | Filter samples | `site`, `officeCode`, `externalReference`, `orderNumber`, `sampleName`, `testSuite`, `collectionStatus` (enum: collected/pending_collection/could_not_collect), `collectedAtStart`, `collectedAtEnd`, `orderId` | JWT | laboratory-sample.controller.ts:82 |
| GET | `/laboratory-samples/:id` | Get sample by ID | — | JWT | laboratory-sample.controller.ts:118 |
| PATCH | `/laboratory-samples/:id` | Update sample | UpdateLaboratorySampleDto fields | JWT | laboratory-sample.controller.ts:133 |
| DELETE | `/laboratory-samples/:id` | Delete sample | — | JWT | laboratory-sample.controller.ts:152 |
| POST | `/laboratory-samples/:sampleId/notes` | Create or update note for a sample | `text`\* (CreateSampleNoteDto) | JWT | sample-note.controller.ts:58 |
| GET | `/laboratory-samples/:sampleId/notes` | Get note for a sample | — | JWT | sample-note.controller.ts:96 |
| PATCH | `/laboratory-samples/:sampleId/notes` | Update note for a sample | `text` (UpdateSampleNoteDto) | JWT | sample-note.controller.ts:128 |
| DELETE | `/laboratory-samples/:sampleId/notes` | Delete note for a sample | — | JWT | sample-note.controller.ts:162 |

**Endpoint count: 10**

---

## Laboratory Fields

Base path: `/laboratory-fields` — JWT Bearer required

| Method | Path | Purpose | Key body/query fields | Auth | Source |
|--------|------|---------|----------------------|------|--------|
| POST | `/laboratory-fields` | Create/upsert a laboratory field config | `labId`\*, `fieldPath`\*, `fieldName`\*, `dataType`, `fieldOptions[]`, `isMultiSelect`, `requiresWaterSample` (CreateLaboratoryFieldDto) | JWT + CASL | laboratory-field.controller.ts:32 |
| POST | `/laboratory-fields/bulk` | Bulk create laboratory fields | `items[]` (BulkCreateLaboratoryFieldDto) | JWT + CASL | laboratory-field.controller.ts:48 |
| GET | `/laboratory-fields` | Get all laboratory fields | `labId`, `fieldPath` | JWT + CASL | laboratory-field.controller.ts:62 |
| GET | `/laboratory-fields/:id` | Get laboratory field by ID | — | JWT + CASL | laboratory-field.controller.ts:80 |
| PATCH | `/laboratory-fields/:id` | Update laboratory field | UpdateLaboratoryFieldDto fields | JWT + CASL | laboratory-field.controller.ts:93 |
| DELETE | `/laboratory-fields/:id` | Soft delete laboratory field | — | JWT + CASL | laboratory-field.controller.ts:108 |
| GET | `/laboratory-fields/lab/:labId/integration-config` | Get field config for lab integration | — | JWT + CASL | laboratory-field.controller.ts:122 |

**Endpoint count: 7**

---

## Laboratory Sample Submission

Base path: `/laboratory-samples` (separate controller, same prefix) — mixed auth

| Method | Path | Purpose | Key body/query fields | Auth | Source |
|--------|------|---------|----------------------|------|--------|
| POST | `/laboratory-samples/submit-batch` | Submit sample batch to lab (ALS/Normec) | `sampleIds[]`\*, `labId`\* (SubmitSamplesDto) | JWT Bearer | laboratory-submission.controller.ts:108 |
| GET | `/laboratory-samples/submission-status/:id` | Get submission status for a sample | — | JWT Bearer | laboratory-submission.controller.ts:438 |
| POST | `/laboratory-samples/normec/results` | Receive Normec XML results (webhook) | XML body (multipart or raw) | X-API-Key guard | laboratory-submission.controller.ts:481 |
| POST | `/laboratory-samples/normec/certificates` | Receive Normec certificates (webhook) | XML/file body | X-API-Key guard | laboratory-submission.controller.ts:589 |

**Endpoint count: 4**

---

## Labs

Base path: `/labs` — JWT Bearer required

| Method | Path | Purpose | Key body/query fields | Auth | Source |
|--------|------|---------|----------------------|------|--------|
| POST | `/labs` | Create a laboratory | `name`\*, `code`, `apiEndpoint`, `apiKey` (CreateLabDto) | JWT + CASL | lab.controller.ts:47 |
| GET | `/labs` | Get all laboratories | — | JWT + CASL | lab.controller.ts:63 |
| GET | `/labs/:id` | Get laboratory by ID | — | JWT + CASL | lab.controller.ts:76 |
| PATCH | `/labs/:id` | Update laboratory | UpdateLabDto fields | JWT + CASL | lab.controller.ts:92 |
| DELETE | `/labs/:id` | Delete laboratory | — | JWT + CASL | lab.controller.ts:111 |

**Endpoint count: 5**

---

## Sample Types

Base path: `/sample-types` — JWT Bearer required

| Method | Path | Purpose | Key body/query fields | Auth | Source |
|--------|------|---------|----------------------|------|--------|
| POST | `/sample-types` | Create a sample type | `name`\*, `code` (CreateSampleTypeDto) | JWT | sample-type.controller.ts:15 |
| GET | `/sample-types` | Get all sample types | — | JWT | sample-type.controller.ts:20 |
| GET | `/sample-types/:id` | Get sample type by ID | — | JWT | sample-type.controller.ts:25 |
| PATCH | `/sample-types/:id` | Update sample type | UpdateSampleTypeDto fields | JWT | sample-type.controller.ts:30 |
| DELETE | `/sample-types/:id` | Delete sample type | — | JWT | sample-type.controller.ts:35 |

**Endpoint count: 5**

---

## Form Fields

Base path: `/form-fields` — JWT Bearer required

| Method | Path | Purpose | Key body/query fields | Auth | Source |
|--------|------|---------|----------------------|------|--------|
| POST | `/form-fields` | Create/upsert a form field config | `jobTypeId`\*, `fieldPath`\*, `fieldName`\*, `formName` (default: "default"), `dataType`, `requiredLevel`, `isFreeText`, `isMultiLine`, `isMultiSelect`, `fieldOptions[]`, `sortOrder`, `formOrder`, `showNotApplicable`, `defaultValue`, `validationRules`, `maxLength` (CreateFormFieldDto) | JWT + CASL | form-field.controller.ts:32 |
| POST | `/form-fields/bulk` | Bulk create form fields | `items[]` (BulkCreateFormFieldDto) | JWT + CASL | form-field.controller.ts:48 |
| GET | `/form-fields` | Get all form fields | `jobTypeId`, `formName`, `fieldPath` | JWT + CASL | form-field.controller.ts:62 |
| GET | `/form-fields/:id` | Get form field by ID | — | JWT + CASL | form-field.controller.ts:93 |
| PATCH | `/form-fields/:id` | Update form field config | UpdateFormFieldDto fields | JWT + CASL | form-field.controller.ts:104 |
| DELETE | `/form-fields/:id` | Soft delete form field | — | JWT + CASL | form-field.controller.ts:118 |
| POST | `/form-fields/create-inspection-forms/:jobTypeId` | Create inspection forms retroactively for all inspections of a job type | `startDate`, `endDate` (query, optional ISO 8601) | JWT + CASL | form-field.controller.ts:131 |
| POST | `/form-fields/update-inspection-forms/:jobTypeId` | Update inspection forms for all inspections of a job type | `startDate`, `endDate` (query, optional) | JWT + CASL | form-field.controller.ts:188 |
| POST | `/form-fields/update-required-level` | Set requiredLevel=1 for fields by job type name + field names | `jobTypeName`\*, `formFieldNames[]`\* (UpdateRequiredLevelDto) | JWT + CASL | form-field.controller.ts:245 |
| POST | `/form-fields/remove-field-option` | Remove a field option by label from all form fields | `label`\* (RemoveFieldOptionDto) | JWT + CASL | form-field.controller.ts:270 |
| PATCH | `/form-fields/form-order` | Update formOrder for all fields with same formName + jobTypeId | `jobTypeId`\*, `formName`, `formOrder`\* (UpdateFormOrderDto) | JWT + CASL | form-field.controller.ts:289 |

**Endpoint count: 11**

---

## Inspection Files

Base path: `/inspections-file` — JWT Bearer required

| Method | Path | Purpose | Key body/query fields | Auth | Source |
|--------|------|---------|----------------------|------|--------|
| POST | `/inspections-file/:inspectionId` | Upload files for an inspection | `files` (multipart, up to 10); `label` (query) | JWT | inspection-file.controller.ts:56 |
| GET | `/inspections-file/by-visit/:visitId` | List all inspection files for a visit | `includeDeleted` (bool) | JWT | inspection-file.controller.ts:89 |
| GET | `/inspections-file/:inspectionId` | List files for an inspection | `includeDeleted` (bool) | JWT | inspection-file.controller.ts:108 |
| GET | `/inspections-file/:fileId/url` | Get signed URL for a file | `expiresIn` (seconds) | JWT | inspection-file.controller.ts:124 |
| PATCH | `/inspections-file/bulk-sort-order` | Bulk update sort order for files | `files[]` (`id`, `sortOrder`) (BulkUpdateSortOrderDto) | JWT | inspection-file.controller.ts:137 |
| PATCH | `/inspections-file/:fileId` | Update inspection file (label, sortOrder) | `label`, `sortOrder` (UpdateInspectionFileDto) | JWT | inspection-file.controller.ts:160 |
| DELETE | `/inspections-file/:fileId` | Soft delete a file | — | JWT | inspection-file.controller.ts:178 |
| PATCH | `/inspections-file/:fileId/restore` | Restore a soft-deleted file | — | JWT | inspection-file.controller.ts:192 |

**Endpoint count: 8**

---

## Visit Files

Base path: `/visits-file` — JWT Bearer required

| Method | Path | Purpose | Key body/query fields | Auth | Source |
|--------|------|---------|----------------------|------|--------|
| POST | `/visits-file/:visitId` | Upload files for a visit | `files` (multipart, up to 10); `label` (query) | JWT | visit-file.controller.ts:56 |
| GET | `/visits-file/:visitId` | List files for a visit | `includeDeleted` (bool) | JWT | visit-file.controller.ts:89 |
| GET | `/visits-file/:fileId/url` | Get signed URL for a file | `expiresIn` (seconds) | JWT | visit-file.controller.ts:105 |
| PATCH | `/visits-file/bulk-sort-order` | Bulk update sort order for files | `files[]` (`id`, `sortOrder`) | JWT | visit-file.controller.ts:119 |
| DELETE | `/visits-file/:fileId` | Soft delete a file | — | JWT | visit-file.controller.ts:138 |
| PATCH | `/visits-file/:fileId` | Update visit file (label, sortOrder) | `label`, `sortOrder` | JWT | visit-file.controller.ts:151 |
| PATCH | `/visits-file/:fileId/restore` | Restore a soft-deleted file | — | JWT | visit-file.controller.ts:167 |

**Endpoint count: 7**

---

## Skills

Base path: `/skills` — JWT Bearer required

| Method | Path | Purpose | Key body/query fields | Auth | Source |
|--------|------|---------|----------------------|------|--------|
| POST | `/skills` | Create a skill | `name`\*, `description` (CreateSkillDto) | JWT + CASL | skill.controller.ts:42 |
| GET | `/skills` | Get all active skills | — | JWT + CASL | skill.controller.ts:56 |
| GET | `/skills/:id` | Get skill by ID | — | JWT + CASL | skill.controller.ts:68 |
| PATCH | `/skills/:id` | Update skill | `name`, `description` (UpdateSkillDto) | JWT + CASL | skill.controller.ts:81 |
| DELETE | `/skills/:id` | Soft delete skill | — | JWT + CASL | skill.controller.ts:97 |

**Endpoint count: 5**

---

## Internal Jobs

Base path: `/internal-jobs` — JWT Bearer required

| Method | Path | Purpose | Key body/query fields | Auth | Source |
|--------|------|---------|----------------------|------|--------|
| POST | `/internal-jobs` | Create an internal job | `name`\*, `siteId`\*, `jobTypeId`, `frequency`, `scheduledDate`, `engineerIds[]` (CreateInternalJobDto) | JWT + CASL | internal-job.controller.ts:38 |
| GET | `/internal-jobs` | List all internal jobs | — | JWT + CASL | internal-job.controller.ts:50 |
| GET | `/internal-jobs/:id` | Get internal job by ID | — | JWT + CASL | internal-job.controller.ts:58 |
| PATCH | `/internal-jobs/:id` | Update internal job | UpdateInternalJobDto fields | JWT + CASL | internal-job.controller.ts:69 |
| DELETE | `/internal-jobs/:id` | Delete internal job | — | JWT + CASL | internal-job.controller.ts:82 |
| POST | `/internal-jobs/generate` | Generate visits+inspections for all internal jobs (date defaults to today) | `date` (optional, GenerateInternalJobsDto) | JWT + CASL | internal-job.controller.ts:94 |
| POST | `/internal-jobs/:id/generate` | Manually generate visits+inspections for one internal job | `date` (optional) | JWT + CASL | internal-job.controller.ts:113 |

**Endpoint count: 7**

---

## Service Report (PDF)

Base path: `/service-report` — JWT Bearer required

| Method | Path | Purpose | Key body/query fields | Auth | Source |
|--------|------|---------|----------------------|------|--------|
| GET | `/service-report` | Generate and download service report PDF for a visit | `visitId`\* (query UUID) | JWT | service-report.controller.ts (root GET) |
| GET | `/pdf-test/sample` | Download sample PDF to test pdfmake setup | — | None (no guard) | pdf-test.controller.ts:15 |

**Endpoint count: 2**

---

## Activity Logs

Base path: `/activity-logs` — JWT Bearer required

| Method | Path | Purpose | Key body/query fields | Auth | Source |
|--------|------|---------|----------------------|------|--------|
| GET | `/activity-logs` | Get activity logs (own for USER, all for ADMIN) | `userId`, `entityType`, `entityId`, `action`, `startDate`, `endDate`, `page`, `limit` (ActivityLogQueryDto) | JWT | activity-log.controller.ts:33 |
| GET | `/activity-logs/my-activities` | Get current user's activity logs | `limit` (default 50) | JWT | activity-log.controller.ts:56 |
| GET | `/activity-logs/stats` | Get activity statistics | — | JWT | activity-log.controller.ts:77 |
| GET | `/activity-logs/entity` | Get logs for a specific entity | `entityType`\*, `entityId`\* | JWT | activity-log.controller.ts:100 |

**Endpoint count: 4**

---

## QA Tracker

Base path: `/qa` — **No auth guard** (controller has no JWT/CASL decorators)

| Method | Path | Purpose | Key body/query fields | Auth | Source |
|--------|------|---------|----------------------|------|--------|
| GET | `/qa/health` | Check QA tracker health | — | None | qa-tracker.controller.ts:24 |
| GET | `/qa/tasks` | List QA tasks from GitHub issues | — | None | qa-tracker.controller.ts:30 |
| GET | `/qa/tasks/deleted` | List deleted QA tasks | — | None | qa-tracker.controller.ts:37 |
| GET | `/qa/tasks/archived` | List archived QA tasks | — | None | qa-tracker.controller.ts:44 |
| POST | `/qa/tasks` | Create a QA task in GitHub issues | arbitrary JSON payload | None | qa-tracker.controller.ts:51 |
| PATCH | `/qa/tasks/:issueNumber` | Update a QA task by issue number | arbitrary JSON payload | None | qa-tracker.controller.ts:59 |
| POST | `/qa/tasks/:issueNumber/archive` | Archive a QA task | — | None | qa-tracker.controller.ts:68 |
| POST | `/qa/tasks/:issueNumber/archive-to-deleted` | Move archived task to deleted | — | None | qa-tracker.controller.ts:77 |
| POST | `/qa/tasks/:issueNumber/restore` | Restore a deleted task | — | None | qa-tracker.controller.ts:86 |
| DELETE | `/qa/tasks/:issueNumber` | Close a QA task (GitHub issue) | — | None | qa-tracker.controller.ts:95 |
| DELETE | `/qa/tasks/:issueNumber/permanent` | Permanently remove from indexing | — | None | qa-tracker.controller.ts:107 |

**Endpoint count: 11**

---

## ServiceTracker (Import)

Base path: `/servicetracker` — JWT Bearer required

| Method | Path | Purpose | Key body/query fields | Auth | Source |
|--------|------|---------|----------------------|------|--------|
| POST | `/servicetracker/sync` | Trigger manual full sync | — | JWT | servicetracker.controller.ts:51 |
| GET | `/servicetracker/status` | Get sync schedule + connection status | — | JWT | servicetracker.controller.ts:57 |
| GET | `/servicetracker/limits` | Get API limits | — | JWT | servicetracker.controller.ts:66 |
| POST | `/servicetracker/sync/skills` | Trigger skills sync | — | JWT | servicetracker.controller.ts:71 |
| POST | `/servicetracker/sync/skills/custom` | Trigger skills sync with custom mapping | `mapping[]` (body) | JWT | servicetracker.controller.ts:94 |
| POST | `/servicetracker/sync/users` | Trigger users import | — | JWT | servicetracker.controller.ts:116 |
| POST | `/servicetracker/sync/customers` | Trigger customers import | — | JWT | servicetracker.controller.ts:130 |
| POST | `/servicetracker/sync/appointments` | DEPRECATED — delegates to visits import | — | JWT | servicetracker.controller.ts:144 |
| POST | `/servicetracker/sync/visits` | Trigger visits import (fire-and-forget, 202) | — | JWT | servicetracker.controller.ts:161 |
| POST | `/servicetracker/sync/visits/updated` | Trigger updated visits import | — | JWT | servicetracker.controller.ts:178 |
| POST | `/servicetracker/sync/visits/by-reference` | Import a single visit by reference | `visitReference`\* | JWT | servicetracker.controller.ts:195 |
| POST | `/servicetracker/sync/visits/by-date-range` | Import visits by date range (fire-and-forget, 202) | `startDate`\*, `endDate`\* | JWT | servicetracker.controller.ts:224 |
| POST | `/servicetracker/sync/inspection-parameters/by-date-range` | Sync inspection parameters by date range (202) | `startDate`\*, `endDate`\* | JWT | servicetracker.controller.ts:263 |
| POST | `/servicetracker/sync/inspections/update` | Update single inspection by reference | `inspectionReference`\* | JWT | servicetracker.controller.ts:302 |
| POST | `/servicetracker/sync/inspections/update/batch` | Batch update inspections by references | `inspectionReferences[]`\* | JWT | servicetracker.controller.ts:326 |
| POST | `/servicetracker/sync/inspections/update/all` | Update all inspections (202) | `startDate`, `endDate` (query) | JWT | servicetracker.controller.ts:358 |

**Endpoint count: 16**

---

## Health / App

| Method | Path | Purpose | Key body/query fields | Auth | Source |
|--------|------|---------|----------------------|------|--------|
| GET | `/health` | Basic health check, returns "OK" | — | None | health.controller.ts:5 |
| GET | `/` | Hello world | — | None | app.controller.ts:14 |
| GET | `/test-report` | Test storage report upload | — | None | app.controller.ts:19 |

**Endpoint count: 3**

---

## Write→Read Field Drift

Fields whose name differs between the create/update payload and the read response.

| Write field (request) | Read field (response) | Object | Notes |
|-----------------------|-----------------------|--------|-------|
| `engineerIds` | `visitEngineers` | Visit | Write: `string[]` UUIDs; Read: `VisitEngineerDto[]` objects (each has `id`, `engineerId`, full user object) |
| `samples` | `laboratorySamples` | Inspection (via Job) | Write in CreateInspectionDto: `samples[]` (InspectionSampleItemDto); Read in job/inspection: `laboratorySamples[]` |
| `products` | `inspectionProducts` | Inspection | Write: `products[]` (InspectionProductItemDto: `productId`, `quantity`, `price`); Read: `inspectionProducts[]` (InspectionProductDto with full `product` object) |
| `visitReference` (client-supplied) | `visitReference` (auto-generated) | Visit | Client can send `visitReference` in POST body but it is **always overridden** by the server-generated value (see service line 257: explicit assignment after spread) |
| `bookingPersonId` | `bookingPerson` | Visit | Write: UUID string; Read: full `UserDto` object |
| `siteId` | `site` | Visit / Site | Write: UUID; Read: full `SiteDto` |
| `jobId` | `job` | Inspection | Write: UUID; Read: `JobInspectionDto` object |
| `actionTypeId` | `actionType` | Action | Write: UUID; Read: full `ActionType` object |

---

## Parity-Relevant Endpoints

Detailed specifications for endpoints used by the QA verification script.

### POST /auth/login

- **Purpose:** Authenticate and receive JWT tokens
- **Auth:** Public (LocalAuthGuard validates credentials)
- **Body (exact fields):**
  ```json
  {
    "email": "user@example.com",
    "password": "Str0ngP@ssw0rd!"
  }
  ```
  - `email`: string, required, valid email format
  - `password`: string, required, min 8 characters
- **Response 200:**
  ```json
  {
    "tokens": {
      "accessToken": "...",
      "refreshToken": "..."
    },
    "user": { "id": "...", "email": "...", "role": "...", ... }
  }
  ```
- **Source:** `auth.controller.ts:74`, `auth/dto/login-user.dto.ts`

---

### POST /visits

- **Purpose:** Create a new visit with assigned engineers
- **Auth:** JWT Bearer
- **Body (exact DTO fields — `CreateVisitDto`):**
  - `title`: string, required, max 100 chars
  - `from`: ISO datetime, required
  - `to`: ISO datetime, required
  - `engineerIds`: string[] (UUIDs), required, min 1 — **Write field; becomes `visitEngineers[]` in response**
  - `bookingPersonId`: UUID string, required
  - `siteId`: UUID string, optional
  - `notes`: string, optional
  - `visitReference`: string, optional — **IGNORED: always overridden by server-generated value**
  - `status`: enum `scheduled|confirmed|cancelled|pending`, optional (default: `scheduled`)
  - `visitStatus`: string, optional (default: `not-started`)
  - `jobIds`: UUID[], optional — jobs to schedule into visit
  - `updateJobsNextDate`: boolean, optional
  - `isFixed`: boolean, optional
  - `isException`: boolean, optional
  - `originalDate`: ISO datetime, optional
  - `inspections`: `CreateInspectionForVisitDto[]`, optional

- **visitReference format and validation:**
  - Format: `VN` prefix + 6-digit zero-padded number, e.g. `VN500001`, `VN500002`
  - **Client-supplied value is always overridden.** The service calls `generateNextVisitReference()` unconditionally and assigns it at line 257, after the spread of `...visitData` (which would include client's value), so the explicit assignment wins.
  - Generation logic: `MAX(visitReference)` WHERE `visitReference > 'VN500000'`; increments by 1; seeds at `VN500001` if no prior references found.
  - **No DTO validator enforces the `VN\d{6}` format** — the field is `@IsOptional() @IsString()` only.

- **Source:** `visit.controller.ts:50`, `visit/dto/create-visit.dto.ts`, `visit/services/visit.service.ts:247-258`

---

### POST /inspections

- **Purpose:** Create a new inspection linked to a visit
- **Auth:** JWT Bearer
- **Body (exact DTO fields — `CreateInspectionDto`):**
  - `visitId`: UUID, required
  - `jobId`: UUID, optional — if provided, copies `jobTypeId`, `products`, and `samples` from the job
  - `jobTypeId`: UUID, optional — can be set directly or copied from job
  - `samples`: `InspectionSampleItemDto[]`, optional — `{ sampleTypeId: UUID, quantity?: number }`
  - `products`: `InspectionProductItemDto[]`, optional — `{ productId: UUID, quantity?: number, price?: number }` → **becomes `inspectionProducts` in response**
  - `notes`: string, optional
  - `itemLocation`: string, optional
  - `itemDetail`: string, optional
  - `itemReference`: string, optional
  - `inspectionReference`: string, optional (pre-generated, internal use)
  - `inspectionStatus`: string, optional (default: `not-started`)
- **Source:** `inspection.controller.ts:41`, `inspection/dto/create-inspection.dto.ts`

---

### POST /actions

- **Purpose:** Create a new remedial/follow-up action
- **Auth:** JWT Bearer
- **Body (exact DTO fields — `CreateActionDto`):**
  - `siteId`: UUID, required
  - `visitId`: UUID, optional
  - `inspectionId`: UUID, optional
  - `actionTypeId`: UUID, optional (if provided, name is taken from action type)
  - `name`: string, required **only if `actionTypeId` not provided**
  - `priority`: enum, optional — values: `"low"`, `"medium"`, `"high"`, or `null`
  - `status`: string, optional (e.g. `"pending"`, `"resolved"`)
- **Source:** `action.controller.ts:80`, `action/dto/create-action.dto.ts`, `action/entities/action.entity.ts:16-20`

---

### GET /visits/:id

- **Purpose:** Get full visit details by UUID
- **Auth:** JWT Bearer
- **Response (`VisitDto`):** Includes `signature` (base64 string, nullable), `signatureName` (string, nullable), `visitEngineers[]`, `inspections[]` (each with `inspectionForms[]`), `actions[]`, `site`, `totalPoints`, `wasServiceReportSent`, `visitReference`, `status`, `visitStatus`
- **Note:** `signature` and `signatureName` ARE present in the `VisitDto` and the `visit.entity.ts` — they are stored as `TEXT` and `VARCHAR(255)` columns respectively.
- **Source:** `visit.controller.ts:367`, `visit/dto/visit.dto.ts`, `visit/entities/visit.entity.ts`

---

### GET /visits/filter

- **Purpose:** Filter visits with basic query params (no pagination on the simple filter)
- **Auth:** JWT Bearer
- **Query params:** `startDate`, `endDate`, `assignedEngineerId` (UUID), `jobTypeId` (UUID), `title` (partial match), `visitReference` (partial match), `siteId` (UUID), `search` (generic: site name, customer name, address, title)
- **Response:** `VisitDto[]` array (basic, not expanded)
- **Source:** `visit.controller.ts:148`, `visit/dto/filter-visits.dto.ts`

---

### GET /inspections/:id

- **Purpose:** Get full inspection details including forms and field values
- **Auth:** JWT Bearer
- **Response structure (`InspectionDto`):**

```
InspectionDto {
  id: string
  jobId: string
  visitId: string
  job?: JobInspectionDto
  inspectionProducts?: InspectionProductDto[]
  inspectionForms?: InspectionFormDto[]        ← array of forms
  actions?: ActionDto[]
  notes?: string
  inspectionStatus?: string
  createdAt: Date
  updatedAt: Date
}

InspectionFormDto {
  id: string
  inspectionId: string
  formName: string              ← e.g. "Visit Information", "Risk Assessment", "default"
  formOrder: number
  formFields?: InspectionFormFieldDto[]  ← array of field values
  createdAt: Date
  updatedAt: Date
}

InspectionFormFieldDto {
  id: string
  inspectionFormId: string
  formFieldId: string
  formField?: FormFieldDto {    ← the field configuration (name, path, type, options)
    id: string
    jobTypeId: string
    formName: string
    fieldPath: string           ← dot-notation path, e.g. "visit_information.assisting_engineer_1"
    fieldName: string           ← human-readable label, e.g. "Assisting 1"
    dataType: FieldDataType
    requiredLevel: FieldRequiredLevel
    isFreeText: boolean
    isMultiLine: boolean
    isMultiSelect: boolean
    fieldOptions?: FieldOption[]
    sortOrder: number
    formOrder: number
    showNotApplicable: boolean
    ...
  }
  value?: unknown               ← string | number | boolean | array | null
  isNotApplicable: boolean
  createdAt: Date
  updatedAt: Date
}
```

**EXACT PATHS for Visit Information and Risk Assessment fields:**

The saved Visit Information and Risk Assessment field values live in:

```
response.inspectionForms[]
  .where(f => f.formName === "Visit Information")     ← or exact form name set in form-field config
    .formFields[]
      .formField.fieldName     ← "Assisting 1", "Assisting 2", "Site Induction", "Works being carried out"
      .value                   ← the saved value
      .isNotApplicable         ← boolean

response.inspectionForms[]
  .where(f => f.formName === "Risk Assessment")
    .formFields[]
      .formField.fieldName     ← "Lone Working", "Risk Managed", "Comments"
      .value
      .isNotApplicable
```

**There is NO hardcoded key path** like `visitInformation.assistingEngineer1`. All form field names and values are stored generically in the `InspectionForm` → `InspectionFormField` → `FormField` structure. The `formName` of the `InspectionForm` record corresponds to the `formName` column in `form_fields` table (configured per job type). The `fieldName` on the `FormField` entity is the human-readable label (e.g. "Assisting 1"). The `fieldPath` is a dot-notation identifier (e.g. could be `visit_information.assisting_1`).

**For a verification script to access specific fields:**
1. Find the form by `inspectionForms[].formName === "<target form name>"`
2. Within that form, find `formFields[].formField.fieldName === "<field label>"` OR `formFields[].formField.fieldPath === "<path>"`
3. Read `.value` and `.isNotApplicable`

**UNCERTAINTY:** The exact values of `formName`, `fieldName`, and `fieldPath` for "Visit Information" / "Risk Assessment" forms are **runtime data configured in the `form_fields` table** — they are not hardcoded in TypeScript source. A `GET /form-fields?jobTypeId=<id>` call is needed to discover the exact strings for each job type.

- **Source:** `inspection.controller.ts:60`, `inspection/dto/inspection.dto.ts`, `inspection/dto/inspection-form.dto.ts`, `inspection/dto/inspection-form-field.dto.ts`, `form-field/dto/form-field.dto.ts`

---

### GET /actions

- **Purpose:** Get all actions with optional filters
- **Auth:** JWT Bearer
- **Query params:** `siteId`, `clientId` (customer ID — returns all actions from all sites of that customer), `visitId`, `inspectionId`, `startDate`, `endDate`
- **Response:** `ActionDto[]`
- **Source:** `action.controller.ts:41`, `action/dto/filter-actions.dto.ts`

---

## Summary: Total Endpoint Count by Resource

| Resource | Count |
|----------|-------|
| Authentication | 7 |
| Visits | 12 |
| Inspections | 8 |
| Actions | 6 |
| Action Types | 5 |
| Users | 12 |
| Sites | 8 |
| Customers | 8 |
| Jobs | 7 |
| Job Types | 6 |
| Job Categories | 6 |
| Job Sample Types | 4 |
| Contracts | 5 |
| Products | 6 |
| Laboratory Samples + Notes | 10 |
| Laboratory Fields | 7 |
| Laboratory Sample Submission | 4 |
| Labs | 5 |
| Sample Types | 5 |
| Form Fields | 11 |
| Inspection Files | 8 |
| Visit Files | 7 |
| Skills | 5 |
| Internal Jobs | 7 |
| Service Report / PDF | 2 |
| Activity Logs | 4 |
| QA Tracker | 11 |
| ServiceTracker (Import) | 16 |
| Health / App | 3 |
| **TOTAL** | **201** |
