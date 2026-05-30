# Parity Coverage Gap Audit — web ↔ mobile

**Date:** 2026-05-30
**Question answered:** _"Are there more dropdowns, or other things to verify web ↔ mobile, that we are missing?"_
**Method:** Four read-only sub-audits (MOBILE `tmp-hydrocert-android`, WEB `hydrocert-web/src`, API dev-probe, MEDIA/LAB) enumerated every set-able field and every display-of-backend-value, then classified each datum against the **20 hard-gated checks** (= COVERED), the two backlog catalogs **PARITY-ADD-VERIFY-CATALOG.md** (68 datums / 35 checks) + **PARITY-DROPDOWNS-CATALOG.md** (75 surfaces / 53 checks) (= KNOWN-BACKLOG), and anything in neither (= NEW-GAP). All NEW-GAP candidates were then re-tested with one symmetric discriminator: **does the datum render (or set) on BOTH platforms' LIVE UI — not a mock page, not dead/unwired code?**

---

## 1. Direct answer

**No — there is no missing dropdown, and only two genuinely new web ↔ mobile parity surfaces.** Every dropdown the auditors found (the 36 Risk-Assessment Yes/No, the 13-option Photo Label, action priority, Normec Suite/Matrix, ALS Lab Code/Sample Type/Sample Point, product select, from/to time, mobile MULTI-SELECT capability) is already enumerated in PARITY-DROPDOWNS-CATALOG, and every settable form-field TYPE (number / toggle / N/A / date / multiselect / barcode) is already in PARITY-ADD-VERIFY 2.4 — so on dropdowns specifically we are **not** missing anything. The only datums in neither the 20 nor either catalog that survive the "both-platforms-live" test are two **read-only display-of-backend-identity** fields: `visit.visitReference` (rendered on the live web header AND the live mobile Summary "Visit Ref." card, never cross-asserted) and the `site` **shipping-address composite** (rendered on the live web header location card AND the live mobile header, never asserted). Both are pure web→mobile (and back) render-parity, easy/medium to automate via PATCH-upstream + dual GET. Everything else the sub-audits flagged as "NEW-GAP" was demoted on inspection: the `site.bookingInfo / parkingInfo / contactDetails / description` cluster is **not** real parity (mobile deserializes them but renders only `accessInfo` under the "Booking Info" label, and `UpdateSiteRequest` can write only `accessInfo`); `orderNumber` and `site.code` render on **mobile-live only** (web shows them solely on the mock `ReportDetails` page — `DetailHeaderCard` is imported only there); and `inspectionReference`, Client name, Job Reference, the History tab, the Lab-Results-return table, `hasCustomProducts`, and `isContract` are web-only / dead / unwired / BE-derived — none are actionable web↔mobile checks. So the reassuring bottom line: coverage is in good shape, **2 small read-parity gaps** are worth adding, nothing dropdown-shaped is missing.

---

## 2. NEW-GAP items (NOT in the 20, NOT in either catalog, render/set on BOTH platforms' LIVE UI)

| # | Name | fieldType | direction | entity.field | automatable | priority | Why it was missed / why it matters |
|---|------|-----------|-----------|--------------|-------------|----------|------------------------------------|
| 1 | **Visit Reference** (display-only identity) | text | web→mobile (display both) | `visit.visitReference` (mobile falls back to `jobReference`) | auto-easy | **P1-easy** | Read-only on both platforms (live web header `index.tsx:176-180` "Visit Reference:" + live mobile Summary `TaskDetailsSummaryTab.kt:126` "Visit Ref."). Absent from both catalogs (grep = 0). **Distinct from check 2a**, which asserts a *tagged superstring inside `visit.notes`* (confirmed `2a-description = visit.notes`); `visitReference` is a separate backend identifier rendered separately and never cross-asserted. Mobile uses it as the primary search/match key, so render-parity matters. Set upstream (BE/Salesforce sync); verify identical string on both via `GET /visits/{id}.visitReference`. |
| 2 | **Site shipping address** (composite, display-only) | structural (street + city + postcode [+ state]) | web→mobile (display both) | `site.shippingStreet` + `site.shippingCity` + `site.shippingPostalCode` (+ `shippingState`) | auto-medium | **P2-medium** | Read-only on both platforms (live web header `location` DetailsCard `index.tsx:274-283`, comma-joined; live mobile header `TaskDetailsHeader`/`VisitDetailsCard.kt:62,78-87` via `getAddress()`, tappable to map). Absent from both catalogs. **NOT the cataloged `siteId`-reassignment check** — that asks "does the new site *name* propagate after a siteId swap"; this asks "for the **same** site, does the composed address render identically on both." Formatting differs (web comma-joined vs mobile `getAddress()`) → assert address **components**, not the exact string. New assertion shape: "mobile header address matches web header address for the run site (and updates after a web siteId change)." |

**NEW-GAP count: 2.** Both are display-of-backend-value read-parity (set upstream, verify via dual GET). Neither is a dropdown.

---

## 3. Demoted candidates — flagged by a sub-audit but NOT new gaps (with reason)

| Candidate | Source audit verdict | Real classification | Evidence that demotes it |
|-----------|----------------------|---------------------|--------------------------|
| `site.bookingInfo` ("strongest new gap") | API: NEW-GAP | **Not parity** (dead/CRM DTO field) | Web "Booking Info" UI writes `site.accessInfo` (`EditBookingInfoModal` → `accessInfo`); mobile "Booking Info" card displays `getAccessInfo()` (`TaskDetailsSummaryTab.kt:236/247`); mobile `UpdateSiteRequest` carries **only** `accessInfo`. `bookingInfo` is deserialized into the mobile DTO (`VisitResponseSchema.kt:255`) but has **no getter and no composable** → never rendered. The named check `4b-booking-info` literally tests `accessInfo` (`verify-data.mjs:306`), so accessInfo IS covered; bookingInfo is a separate **unrendered** field. |
| `site.parkingInfo` | API: NEW-GAP | **Not parity** | Same as above — deserialized (`VisitResponseSchema.kt:253`), no mobile getter/render. Web `site.parkingInfo` only appears in a data-mapping util, not rendered as an editable field (the `Customers` table shows the distinct customer-level `parkingInformation`). |
| `site.contactDetails` | API: NEW-GAP | **Web-only display** (not parity) | Rendered read-only on web (`EditAppointment/index.tsx:1069`, as a phone fallback) but **no mobile render** (deserialized only, `VisitResponseSchema.kt:254`). One-platform → not web↔mobile parity. |
| `site.description` | API: NEW-GAP | **Not parity** | No confirmed render on either live platform; CRM-synced free-text. |
| `visit.orderNumber` / "Purchase Ord." | MOBILE + WEB: NEW-GAP | **Mobile-only-live display** (flag, not gate) | Live mobile renders it (`TaskDetailsSummaryTab.kt:122`); web renders `purchaseOrder` **only** on the mock `ReportDetails/DetailHeaderCard` — `DetailHeaderCard` is imported solely by `ReportDetails/DetailsPanel.tsx`. Live `VisitDetails` has **zero** orderNumber/purchaseOrder references. No live web surface to compare → not a clean parity check. Mapping also uncertain (web `purchaseOrder` vs mobile `orderNumber`). |
| `site.code` / "Site Code" | MOBILE + WEB: NEW-GAP | **Mobile-only-live display** (flag, not gate) | Live mobile renders it (`TaskDetailsSummaryTab.kt:124`); web shows Site Code **only** on the mock `ReportDetails` page. Live web inspection/visit pages do not render it. Same mock-only `DetailHeaderCard` situation. |
| `inspection.inspectionReference` | WEB: NEW-GAP | **Web-only display** | Live web header renders it (`InspectionDetailsHeader.tsx:61-64`); no distinct per-inspection reference confirmed on mobile. One-platform. |
| Customer / Client name | WEB: NEW-GAP | **Web-only display** | Web "Client" DetailsCard (`index.tsx:284-289`); mobile shows address + booking person, no separate client-name card. No `updateCustomer` mutation exists. |
| Job Reference (`job.jobReference`) | WEB: NEW-GAP | **Dead/unwired both** | Web = mock `DetailHeaderCard` only; mobile `RefItem` renderer defined but **not called** (`VisitDetailsCard.kt:255-278`). In both data models, rendered on neither live page. |
| History / Activity tab | WEB: NEW-GAP | **Unwired web, absent mobile** | Live inspection History tab fed `history={[]}` (`index.tsx:141`); no feeder query exists; no mobile history view. Dead UI shell — would become a gap only once a feeder is added. |
| Lab Results return table (testName/unit/results/dates/submissionStatus, etc.) | WEB + MEDIA/LAB: NEW-GAP | **Web-only, external-lab data** | Set by Normec/ALS on results return, displayed web-only (`LabResultsPanel`); mobile is collection-only (zero lab-results Kotlin files). `otherPlatformView = none`. The one settable item here (per-sample note) is already **check 2k (COVERED)**. Reaching real results needs a real lab submission — **forbidden**. Document only. |
| `inspection.hasCustomProducts` | API: NEW-GAP (lowest confidence) | **BE-derived, not parity** | Boolean flag, no direct UI setter; derived from custom-priced products. Reclassify as non-parity (like tags/points). |
| `visit.isContract` | API: NEW-GAP (weak) | **BE/CRM-derived, not parity** | No add/edit path; null on test record; pure DTO pass-through (mobile echoes it back unchanged, never via UI). |
| `inspection.itemReference` distinct mobile render | catalog note | **COVERED** | itemReference=4c, itemLocation=4d, itemDetail=2g are all in the 20. (Catalog flags a render refinement, but the datums are gated.) |
| `visit.signature` freehand-draw nuance | — | **COVERED** | Datum is check 3a (signature + name); only the freehand gesture is manual → pre-populate via API. |

---

## 4. Recap — the full picture

### Already COVERED — the 20 hard-gated checks (do NOT re-report)
`2a` visit.notes (Description) · `2b` visit actions (3) · `2c` inspection actions (API) · `2d` visit-text 3 fields (waterSystemDescription / workDetails / samplingDetails) · `2g` inspection.itemDetail · `2h` 16 water-sample types · `2i` 2nd inspection · `2j` visit.status (booking) · `2k` laboratory-sample note · `2l` 2nd engineer · `3a` signature + name · `3b` Visit Information 4 fields (Assisting 1/2/3 + Works) · `3c` Risk-Assessment "- Comments" (1 of 18) · `3d` visit-text ×3 (mobile→web) · `3e` Site Induction dropdown · `4a` inspection.notes · `4b` site.accessInfo (booking) · `4c` inspection.itemReference · `4d` inspection.itemLocation · `4f` 36 Risk-Assessment Yes/No dropdowns. **= 20.**

### Already MAPPED — KNOWN-BACKLOG (in the catalogs, not yet gated; treat as KNOWN, not new)
- **Visit-level (ADD-VERIFY 2.1):** title, engineers, bookingPerson (web-only), from/to/originalDate/isFixed/points, visitStatus workflow (incl. aborted toggle, completed badge), wasServiceReportSent (web-only, incl. VisitsList row entry point), isException/isContract DTO pass-through.
- **Inspection (2.3):** inspection.notes (both, on the NEW-CHECK P1 list), inspectionStatus = missed (Missing-inspection toggle), add/delete inspection, computed tags/pills.
- **Form-field TYPES (2.4) + dropdowns (DROPDOWNS 2.1/2.3):** number, toggle/boolean, N/A flag, date/datetime (manual), MULTI-SELECT capability, barcode, the 36 RA Yes/No dropdowns, the 17 remaining RA "- Comments" free-text (3c capped at 1 on CI). Confirmed system-wide via API census: 614 string / 166 number / 29 boolean / 0 date form-fields; parity jobType `658f27c1` has 0 number/boolean → needs a jobType swap to exercise.
- **Actions (2.2 + DROPDOWNS 2.2):** mobile→web visit/inspection action add, priority chip, action delete (omit-id PATCH).
- **Attachments (2.6 + DROPDOWNS 2.5):** upload (visit/inspection, camera/gallery/document → API multipart), 13-option Photo Label, reorder (bulk-sort API), delete (soft). Endpoints confirmed live (`?includeDeleted=false`).
- **Samples / lab (2.5 + DROPDOWNS 2.4):** per-sample lab assignment (labId), per-sample note read-back + delete, Normec field set (barcode/description/Suite/Matrix/temperature/etc. — mobile-screenshot only, guardrailed), ALS dynamic-schema set (dry-run), collectionStatus. **GUARDRAIL: never `submit-batch`; keep `collectionStatus='pending_collection'`; ALS dry-run, Normec dummy.** Mobile→web base sample-add = **confirmed documented GAP** (Room-only, never reaches BE).
- **Products (2.7):** web→mobile inspection products (Name + Quantity) read-only display; per-line qty/price (REPLACE semantics; write `products` → read `inspectionProducts`).

### Counts
- **coveredCount = 20** (hard-gated checks)
- **knownBacklogCount ≈ 35** (PARITY-ADD-VERIFY-CATALOG distinct checks; +53 dropdown surfaces in PARITY-DROPDOWNS-CATALOG already overlap these)
- **newGapCount = 2** (visitReference, site shipping-address composite)

### Non-parity / excluded (documented so nothing is silently dropped)
BE-generated identifiers (visitReference is the **rendered** one we keep; raw inspectionReference/sampleIdentifier read-only IDs otherwise), computed tags/totalPoints, CRM-synced site identity cluster (billing/shipping/phone/email/name/code as raw identity), web-only Lab-Results return table, unwired History tab, dead `bookingInfo/parkingInfo/contactDetails/description` DTO fields, mock-only `orderNumber`/`site.code` web renders, no completion-date datum exists (completion = `visitStatus='completed'` / `inspectionStatus='completed'` enums, already cataloged).
