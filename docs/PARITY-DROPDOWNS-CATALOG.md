# Parity Dropdowns Catalog (Web ↔ Mobile, Exhaustive + Deduped)

**Date:** 2026-05-30 · **Status:** READ-ONLY analysis (no product-repo changes)
**Sources merged + deduped:** MOBILE dropdown inventory (`tmp-hydrocert-android`), WEB dropdown audit (`hydrocert-web/src`), API-PROBE of the parity jobType `658f27c1` (37 form-field dropdowns, cross-validated by `GET /inspections/{id}` and `GET /form-fields?jobTypeId=`), and SAMPLES+XREF (Normec/ALS laboratory-sample dropdowns).

This catalog is the dropdown-specific companion to `PARITY-ADD-VERIFY-CATALOG.md`. It inventories **every dropdown surface** on both platforms, deduplicates surfaces that are the same shared datum, marks what is **covered** vs **uncovered** by the parity suite, and produces a **prioritized new-check list**.

---

## ⚠️ ABSOLUTE GUARDRAIL — never submit to a real lab

The **only** paths that transmit to Normec/ALS are the batch-submit calls `POST /laboratory-samples/submit-batch`, wired to the mobile **"Submit Samples"** button (`WaterSamplingScreen.kt:402`) and **SubmitSamplesScreen "Complete"** (`SubmitSamplesScreen.kt:221`). **NEVER press those; NEVER call submit-batch.** Per-sample **"Save Sample"** on the Normec/ALS form is LOCAL-ONLY (Room) and safe. Keep every sample at `collectionStatus='pending_collection'` so it is not even batch-eligible. ALS = dry-run only; Normec = dummy creds only. This guardrail applies to **all 5 sample-form dropdowns** (the P4 block below).

---

## 1. Counting & dedupe model (read this first — it makes the numbers reconcile)

- **Denominator (`totalDropdowns` = 75)** = distinct dropdown **surfaces** after dedupe. It is *not* `newChecks.length` — many surfaces are uncovered but are **not** parity checks (filter-only, UI-only, preview-literals, phantom/derived). Those are flagged here so nothing is silently dropped, then excluded from `newChecks`.
- **`covered` = 1** (GIVEN): exactly one dropdown is automated by the parity suite today — **3e Site Induction** (`siteInductionRequiredCompleted`). Action-priority is *touched* by check `2c`, but `2c` is an API create→read action tautology, not a dropdown-parity check, so `covered` stays **1**.
- **`uncovered` = 74** = `totalDropdowns − covered`.
- **`newChecks` = 53** = the subset of uncovered surfaces that are *real, addable parity checks*: 36 P1 + 6 entity Selects + 3 web multi-select + 1 generic-mobile multi-select capability + 5 P4 sample + 2 P2 mobile-hardcoded.

### Key dedupe decisions

| Same surface (different sources) | Counted as | Rationale |
|---|---|---|
| WEB "Inspection form-field dropdown (F-02, one render path)" = MOBILE "Dynamic inspection DROPDOWN fields (generic)" = the **37 API-PROBE fields** | **37 concrete rows** (36 P1 + 1 covered) | Web's "one row not N" was a web-source-only limit; the API-probe resolves it. The 37 are the concrete realization for `658f27c1`. **Not** collapsed to 1, **not** double-counted as extra generic render-path dropdowns. |
| MOBILE 5 sample dropdowns = SAMPLES+XREF 5 sample dropdowns | **5 rows** | Identical surfaces. |
| WEB StatusSelector + WEB "Visit status Select (popup)" | **1 row** (`visit.status`) | Same datum, two web entry points. |
| MOBILE "Action Priority" = WEB "Action priority Select" | **1 row** (`actions[].priority`, direction=both) | Same shared datum. |
| Generic render-path **classes** (mobile DynamicTextField single, web F-02 read-only `<input>`) | **architecture notes, NOT counted** | They are the *mechanism* for the 37; counting them would double-count. The mobile generic **multi-select** capability IS counted once (real distinct capability with zero instance in this jobType). |

---

## 2. Master Table — every dropdown surface

Columns: **Name** · **Where** · **jobType** · **Options** · **Set method** · **Other-platform view** · **API verify** · **Single/Multi** · **Feasibility**.
Feasibility key: `auto-easy` / `auto-medium` / `auto-hard` (Maestro/API automatable) · `manual-only` (gesture/picker/forbidden).

### 2.1 Inspection form-field dropdowns — parity jobType `658f27c1` (the 37)

> All 37 reach mobile via the generic `DynamicTextField → DropdownField (ExposedDropdownMenuBox)`; on web all 37 render through the **F-02 read-only disabled `<input>`** (`DetailsPanel.tsx:35-42` — any field with non-empty `fieldOptions` is read-only). Value-setting is **API-only**: `PATCH /inspections/{id}/submit-form {formFields:[{id,value}]}`. The InspectionFormField **UUID** comes from `GET .inspectionForms[].formFields[].id` (not the FormField config id). Baseline: 36 Risk Assessment fields = `null`; Site Induction = `"Yes - Induction completed"`.

**Risk Assessment form — 18 hazard/risk-managed pairs (36 dropdowns, all `Yes | No`).** Each row: where = Risk Assessment form · jobType = `658f27c1` · options = `Yes | No` · set = API PATCH submit-form (web read-only) · other-platform = Android Risk Assessment form `ExposedDropdownMenuBox` · API verify = `GET /inspections/2b442e37 → formFields[fieldPath=<path>].value` · single · `auto-easy`.

| # | Name | fieldPath |
|---|---|---|
| 1 | Accessing Area/Lone Working | `accessingAreaLoneWorking` |
| 2 | Accessing Area/Lone Work - Risk Managed? | `accessingAreaLoneWorkRiskManaged` |
| 3 | Asbestos/Exposure | `asbestosExposure` |
| 4 | Asbestos/Exposure - Risk Managed? | `asbestosExposureRiskManaged` |
| 5 | Accessing High Areas | `accessingHighAreas` |
| 6 | Accessing High Areas - Risk Managed? | `accessingHighAreasRiskManaged` |
| 7 | Rodent, Bird, Insect Infestation | `rodentBirdInsectInfestation` |
| 8 | Rodent, Bird, Insect - Risk Managed? | `rodentBirdInsectRiskManaged` |
| 9 | Working Around Machinery | `workingAroundMachinery` |
| 10 | Working Around Machinery - Risk Managed? | `workingAroundMachineryRiskManaged` |
| 11 | Working In Plant Room | `workingInPlantRoom` |
| 12 | Working In Plant Room - Risk Managed? | `workingInPlantRoomRiskManaged` |
| 13 | Slipping on Water | `slippingOnWater` |
| 14 | Slipping on Water - Risk Managed? | `slippingOnWaterRiskManaged` |
| 15 | Drowning in Water | `drowningInWater` |
| 16 | Drowning in Water - Risk Managed? | `drowningInWaterRiskManaged` |
| 17 | Entering Confined Space | `enteringConfinedSpace` |
| 18 | Entering Confined Space - Risk Managed? | `enteringConfinedSpaceRiskManaged` |
| 19 | Cleaning Tanks, Towers etc | `cleaningTanksTowersEtc` |
| 20 | Cleaning Tanks, Towers - Risk Managed? | `cleaningTanksTowersEtcRiskManaged` |
| 21 | Electrical Equipment Around Water | `electricalEquipmentAroundWater` |
| 22 | Electrical Equip/Water - Risk Managed? | `electricalEquipWaterRiskManaged` |
| 23 | Opening Valves/Hatches | `openingValvesHatches` |
| 24 | Opening Valves/Hatches - Risk Managed? | `openingValvesHatchesRiskManaged` |
| 25 | Releasing Aerosols | `releasingAerosols` |
| 26 | Releasing Aerosols - Risks Managed? | `releasingAerosolsRiskManaged` |
| 27 | Hot Water Scalding | `hotWaterScalding` |
| 28 | Hot Water Scalding - Risk Managed? | `hotWaterScaldingRiskManaged` |
| 29 | Manual Handling | `manualHandling` |
| 30 | Manual Handling - Risk Managed? | `manualHandlingRiskManaged` |
| 31 | Assesing Chemical Dosing Equipment | `assesingChemicalDosingEquipment` |
| 32 | Dosing Equipment - Risk Managed? | `dosingEquipmentRiskManaged` |
| 33 | Handling Chemicals | `handlingChemicals` |
| 34 | Handling Chemicals - Risk Managed? | `handlingChemicalsRiskManaged` |
| 35 | Disinfecting Systems | `disinfectingSystems` |
| 36 | Disinfecting Systems - Risk Managed? | `disinfectingSystemsRiskManaged` |

**Visit Information form — 1 dropdown (3 options).**

| Name | fieldPath | Options | Set | Other-platform view | API verify | S/M | Feas. | Status |
|---|---|---|---|---|---|---|---|---|
| Site Induction required & Completed | `siteInductionRequiredCompleted` | No Induction required \| Yes - Induction completed \| Yes - Induction not completed (3) | API PATCH submit-form (web read-only) | Android Visit Information form `ExposedDropdownMenuBox` | `GET /inspections/2b442e37 → formFields[fieldPath=siteInductionRequiredCompleted].value` (baseline `"Yes - Induction completed"`) | single | auto-easy | **✅ COVERED — check 3e** |

> ⚠️ **Trap:** check `3c` covers the **18 Risk Assessment "- Comments" free-text fields** (catalog §2.4). Those are **NOT** the 36 Yes/No dropdowns above — different fields. `3c` existing does **not** make any of these 36 dropdowns covered.

### 2.2 Entity-level settable Selects (visit / action / inspection / product)

| Name | Where | jobType | Options | Set method | Other-platform view | API verify | S/M | Feas. |
|---|---|---|---|---|---|---|---|---|
| Visit status (`status`) | WEB AddNew + AppointmentDetailsPopup StatusSelector | any visit | scheduled \| pending \| confirmed \| cancelled | **web** SETTABLE → `updateVisit({status})` | mobile status badge (read-only) | `GET /visits/{id}.status` | single | auto-easy |
| Action priority (`actions[].priority`) | WEB ActionCard/AddActionModal + MOB ActionCard chip | visit- or inspection-level | high \| medium \| low \| unset | **both** → `updateVisit/updateInspection({actions:[{priority}]})`; mobile `not_set`→`low` | other-platform action priority | `GET .actions[].priority` | single | auto-medium |
| Action status (`actions[].status`) | WEB ActionCard Status Select | visit/inspection action | 1 New \| 2 Follow Up \| 3 Completed \| 4 Cancelled | **web-only** setter → `updateVisit/updateInspection` | mobile action status (read-only) | `GET .actions[].status` | single | auto-medium |
| Product (`products[].productId`) | WEB Add/Edit Product modal | any inspection | DYNAMIC `GET /products` (active) | **web** → `updateInspection({products})` | unknown (mobile product display) | `GET inspection.products[].productId` | single | auto-medium |
| Booking Person (`bookingPersonId`) | WEB AddNew + EditMainDetails | any visit | DYNAMIC users `isBookingPerson` | **web** single → create / `updateVisit({bookingPersonId})` | none (web-only datum) | `GET /visits/{id}.bookingPersonId` | single | auto-medium |
| From/To time (`from`/`to`) | WEB AddNew + EditDateAndTime | any visit | 15-min slot lists | **web** → create / `updateVisit({from,to})` | mobile date/time display | `GET /visits/{id}.from/.to` | single | auto-easy |

### 2.3 Multi-select dropdowns

| Name | Where | jobType | Options | Set method | Other-platform view | API verify | S/M | Feas. |
|---|---|---|---|---|---|---|---|---|
| Engineers (`engineerIds[]`) | WEB AppointmentDetailsPopup + AddNew + EditMainDetails MultiSelect | any visit | DYNAMIC users `isEngineer` | **web** multi → `updateVisit({engineerIds})` | mobile engineer chips (read-only) | `GET /visits/{id}.engineers/.engineerIds` | multi | auto-medium |
| Water Sample Type (`samples[].sampleTypeId`) | WEB Add Water Sample modal + EditWaterSamplesForm MultiSelect | jobType `requiresWaterSample` | DYNAMIC `GET water-sample-types` | **web** multi → `updateInspection({samples:[{sampleTypeId,quantity}]})` (PATCH additive) | unknown (mobile sample entry) | `GET inspection.laboratorySamples[]` (GET field ≠ PATCH `samples`) | multi | auto-medium |
| Job Type (`inspections[].jobTypeId`) | WEB AddInspectionForm MultiSelect | drives `requiresWaterSample` | DYNAMIC `GET job-types` | **web** multi (per-type qty) → builds `inspections[]` | mobile inspection job-type display | `GET /visits/{id}.inspections[].jobType.id` | multi | auto-medium |
| Generic mobile MULTI-SELECT form-field (capability) | MOB `MultiSelectDropdownField` for any backend field with `isMultiSelect=true` | any jobType whose field config sets `isMultiSelect` (per MEMORY Apr-2026: Outlet Temp, Domestic Sample, CWST Clean&Spray, Cooling Tower) | DATA-DRIVEN `fieldOptions`; values joined `\|#\|` | mobile checkbox rows; `isMultiSelect`+options SET via backend API (`/hydro-swagger`), submit → `valueList[]` | same field read-only on web (F-02) | `GET schema fields[].isMultiSelect==true & .fieldOptions` | multi | auto-hard |

> **`658f27c1` has ZERO multi-select form fields.** To exercise form-field multi-select parity you must toggle `isMultiSelect=true` on a field (via `/hydro-swagger`) or pick a different jobType.

### 2.4 Laboratory-sample dropdowns (Normec + ALS) — GUARDRAIL applies

> All 5 surface **mobile-only**, **only** under a `requiresWaterSample` jobType (`658f27c1` has no mobile water-sampling section). No web form exists for Normec/ALS. **No safe pre-submit API read-back** — values live in device Room until the FORBIDDEN `submit-batch`. → all **manual-only**, screenshot-verified on mobile.

| Name | Where | jobType | Options | Set method | Other-platform view | API verify | S/M | Feas. |
|---|---|---|---|---|---|---|---|---|
| Normec — Matrix Option (`job.samples.sample.matrix`) | Normec form DetailsCard | `requiresWaterSample` | 4 static: Process, Drinking, Recreation, Solid (live = API `laboratoryFields`) | **mobile-only** DROPDOWN; "Save Sample" = Room-local (SAFE). NEVER Submit Samples | n/a (no web Normec form) | NONE safe pre-submit (only `GET /laboratory-samples/{id}.matrix` AFTER forbidden submit) | single | manual-only |
| Normec — Suite Code (`job.samples.sample.suite`) | Normec form DetailsCard | `requiresWaterSample` | 33 static labels / 31 distinct values (COUPONS, DEP twice); e.g. Chem BASIC→`AHCERTCBSNA`, COOLING TVC→`30TVC`, LEGIONELLA→`1LEGP` | **mobile-only** DROPDOWN; "Save Sample" Room-local. NEVER Submit | n/a | NONE safe pre-submit (`.testSuite` only after forbidden submit) | single | manual-only |
| ALS — Laboratory Code (`order.labCode`) | ALS form (AlsStaticFormSchema) | `requiresWaterSample` | 2: Trowbridge→`CCY`, Sittingbourne→`SBN` | **mobile-only** DROPDOWN; `saveAlsDraft`=Room-local (SAFE, dry-run). NEVER Submit | n/a (no web ALS form) | NONE safe (only via forbidden ALS submit-batch) | single | manual-only |
| ALS — Sample Type (`order.samples[].SampleTypeId`) | ALS form | `requiresWaterSample` | 4: Potable Water→`Potable`, Process Water→`Process`, Recreational Water→`RECREATIONAL`, Swabs→`Swabs` | **mobile-only** DROPDOWN; `saveAlsDraft` Room-local. NEVER Submit | n/a | NONE safe | single | manual-only |
| ALS — Sample Point (`order.samples[].SamplePointId`) | ALS form | `requiresWaterSample` | 21: LPFILTERED, POTABLE, DOMESTIC, COOLING, … HYDROCERT_LEAD (values prefixed `HYDROCERTLIMITED\|`); selecting auto-fills hidden Test Item | **mobile-only** DROPDOWN; `saveAlsDraft` Room-local. NEVER Submit | n/a | NONE safe | single | manual-only |

### 2.5 Mobile-only hardcoded dropdowns (non-form-field)

| Name | Where | jobType | Options | Set method | Other-platform view | API verify | S/M | Feas. |
|---|---|---|---|---|---|---|---|---|
| Predefined Action type | MOB Tank inspection → ActionsWidget/ActionInputSection "Select action type" | any tank-inspection jobType | 11 hardcoded action strings (CWS tank cleaning, low temps, etc.) | mobile DropdownField → "Add Action" appends to `visitActions[]` | web Actions/Recommendations list (`visitActions[].name`) | `GET visit.visitActions[]` | single | auto-medium |
| Photo Label | MOB Task details → PhotoLabelDialog | any jobType (photo attachments) | 13: Service Report, Before/After Photo, Internal/External, Proofing, Hygiene, High/Medium Risk, Storage, Fly Control Unit, Monitor Points, Pest (also free-text) | mobile DropdownMenu combo-box → `onSave(label)` | web inspection photo/media label field | `GET inspection.photos/attachments[].label` | single | auto-medium |
| Action Priority (mobile) | MOB Tank inspection ActionCard chip | any tank-inspection jobType | ActionPriority enum LOW/MEDIUM/HIGH | (deduped → counted once with web Action priority in §2.2) | — | — | single | — |

### 2.6 Accounted-for, EXCLUDED from new checks (uncovered but NOT parity dropdowns)

| Group | Surfaces | Why excluded |
|---|---|---|
| **Web filter-only Selects** (7) | Reports filter (Status/JobType/Sites), VisitsList (Report Sent + Status/Assigned/Booked), Planner (Status/JobType + Assigned/Booked), Dashboard TableFilter Status, Calendar engineers filter, Customers Booked-By, Calendar CustomDropdown (month/year) | No persistence — list query params / redux / date-picker UI only. No shared backend datum → not parity. |
| **Web typeahead (not Select)** (3) | Site (searchable-select), Customer contract, Asset Reference Combobox | Popover/typeahead inputs, not dropdowns; Asset Reference covered separately by catalog §2.3 (`itemReference`). |
| **Phantom / derived** (2) | Normec Matrix Supertype (`matrixsupertype`, derived W/S from Matrix), ALS Test Item (`testItemId`, UI-filtered, auto-filled from Sample Point) | Not user-selectable; no picker rendered. |
| **DEV-MOCK tank-condition** (7) | Sediment, Biofilm/Scale Visible, Corrosion, Mould, Water Clarity, Other Contaminants, External Condition | `MockDataGenerator` DEV-ONLY. In prod these are **backend-driven** = same class as the §2.1 form-field dropdowns (data-driven), not real hardcoded mobile dropdowns. Not separate prod checks. |
| **Compose preview literals** (2) | DetailsCard Matrix preview (Water/Soil/Air/Other), DetailsCard Suite preview (Basic/Standard/Extended/Other) | `@Preview` literals, never shipped at runtime (runtime uses NormecStaticFormSchema/API). |

> The 2 generic render-path **classes** (mobile `DynamicTextField` single + web F-02 read-only `<input>`) are the *mechanism* for the 37 §2.1 dropdowns and are intentionally **not** counted as separate surfaces (would double-count).

---

## 3. Covered vs Uncovered

### ✅ Covered (1)
- **3e — Site Induction** (`siteInductionRequiredCompleted`, Visit Information form). Automated mobile→web via `p03b → API inspection formFields` (PARITY-COVERAGE-LEDGER §A). This is the **only** automated dropdown — and it is an inspection form-field dropdown, **not** a laboratory-sample dropdown.

### ❌ Uncovered (74)
- **36** Risk Assessment Yes/No dropdowns (§2.1) — the bulk; not covered (3c covers the separate "- Comments" free-text fields, not these).
- **6** entity Selects (§2.2): visit status, action priority, action status, product, booking person, from/to time.
- **3** web multi-select (§2.3) + **1** generic-mobile multi-select capability.
- **5** Normec/ALS sample dropdowns (§2.4) — GUARDRAIL, manual-only.
- **2** mobile hardcoded (§2.5): Predefined Action type, Photo Label.
- **21** accounted-for-but-not-parity (§2.6): 7 filter-only + 3 typeahead + 2 phantom + 7 dev-mock + 2 preview-literals. **Uncovered but deliberately NOT new checks.**

> `uncovered (74) − newChecks (53) = 21` = exactly the §2.6 accounted-for-not-parity set. The gap is intentional, not a coverage hole.

---

## 4. Prioritized NEW-CHECK list

**P1 — API-set web→mobile (easiest, the bulk).** `PATCH /inspections/{id}/submit-form {formFields:[{id,value}]}` to set the value (web UI is read-only per F-02), then verify (a) mobile renders it in the `ExposedDropdownMenuBox`, (b) web read-only display matches, (c) `GET /inspections/{id}` `.value` matches. 36 checks — the 36 Risk Assessment Yes/No dropdowns of `658f27c1`. All `auto-easy`, all baseline `null`, set to `"Yes"` or `"No"`. (Site Induction is the proven template — already green as 3e.)

**P2 — mobile-set (ExposedDropdownMenuBox / DropdownMenu, flaky tap geometry).** Mobile picker → verify on web/API. 2 checks: Predefined Action type (→ `visitActions[].name`), Photo Label (→ attachments label). Entity Selects from §2.2 also fit here when driven mobile-side, but are listed as their settable direction.

**P2b — entity Selects (web-settable, auto-medium).** 6 checks: visit status, action priority (both-direction), action status, product, booking person, from/to time. Mostly web→mobile (set via RTK mutation, verify mobile badge/display + GET).

**P3 — multi-select (hard).** 4 checks: Engineers, Water Sample Type, Job Type (web multi-select), and the generic mobile multi-select capability. **Note:** `658f27c1` has zero multi-select form fields — form-field multi-select parity needs `isMultiSelect=true` toggled via `/hydro-swagger` or a different jobType.

**P4 — sample-form dropdowns (mobile-only, GUARDRAIL, manual).** 5 checks: Normec Matrix Option, Normec Suite Code, ALS Laboratory Code, ALS Sample Type, ALS Sample Point. **Manual screenshot-only** — no safe pre-submit API read-back; **NEVER submit-batch**; "Save Sample" = Room-local only. Require a `requiresWaterSample` jobType to even reach the form.

**Total new checks = 36 (P1) + 6 (P2b entity) + 2 (P2 mobile) + 4 (P3) + 5 (P4) = 53.**

See the machine-usable `newChecks` array returned alongside this document for exact `id`/`dropdown`/`where`/`direction`/`setMethod`/`feasibility`/`priority`.

---

## 5. Recommended first wave
Implement **P1** first: it is 36 of the 53 checks, all `auto-easy`, all use the identical proven 3e pattern (API PATCH submit-form → assert mobile `ExposedDropdownMenuBox` + web read-only `<input>` + GET). One parameterized flow over the 36 fieldPaths covers the entire Risk Assessment form. Defer P3 (needs an `isMultiSelect` toggle) and P4 (guardrailed, manual) to later cycles.
