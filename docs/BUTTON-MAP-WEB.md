# BUTTON-MAP-WEB — Hydrocert Web Interactive Element Inventory

> Generated 2026-05-26 — extracted from hydrocert-web source (React 19 + Vite + Tailwind).
> Covers: native `<button>`, `<Button>` component, `onClick` on non-button elements, `<Link>` / `useNavigate`, `TabsTrigger`, `AccordionTrigger`, `<span role="button">`, `Switch`, form-submit handlers.
> `data-testid` is sparse across the codebase (13 total occurrences). Most selector strategies are `text`.

---

## Summary Table

| Page / Surface | Interactive Elements |
|---|---|
| Login | 6 |
| Reset Password | 3 |
| Navigation (Sidebar) | 10 |
| Dashboard | 17 |
| Customers | 7 |
| Appointments (Calendar) | 7 |
| Visits List | 8 |
| Visit Details | 9 |
| Add New Visit | 18 |
| Edit Visit | 22 |
| Inspection Details | 10 |
| Reports | 3 |
| Planner | 10 |
| Add New Report | 2 |
| Shared — Actions Panel | 8 |
| Shared — Add Action Modal | 9 |
| Shared — Confirmation Modal | 2 |
| **TOTAL** | **151** |

---

## Login

| Element | Label | data-testid | Triggers | Selector strategy | Source (file:line) |
|---|---|---|---|---|---|
| `<Button type="submit">` | Sign in | `login-button` | form `onSubmit` → `handleSubmit(onSubmit)` → `POST /auth/login` | `data-testid=login-button` | `src/pages/Login/index.tsx:~95` |
| `<button type="button">` | Forgot password? | — | `setShowForgotPassword(true)` | `text=Forgot password?` | `src/pages/Login/index.tsx:~105` |
| `<Checkbox onCheckedChange>` | Keep me signed in | — | `setRememberMe(checked)` | `text=Keep me signed in` | `src/pages/Login/index.tsx:~110` |
| `<Button type="submit">` | Send Reset Link | — | form `onSubmit` → `handleSubmit(onSubmit)` → `POST /auth/forgot-password` | `text=Send Reset Link` | `src/pages/Login/index.tsx:~140` |
| `<Button variant="outline" type="button">` | Back to Login | — | `setShowForgotPassword(false)` | `text=Back to Login` | `src/pages/Login/index.tsx:~148` |
| `<Button>` | Back to Login | — | `setShowForgotPassword(false); setForgotPasswordSuccess(false)` | `text=Back to Login` | `src/pages/Login/index.tsx:~160` |

---

## Reset Password

| Element | Label | data-testid | Triggers | Selector strategy | Source (file:line) |
|---|---|---|---|---|---|
| `<Button type="submit">` | Reset Password | — | form `onSubmit` → `handleSubmit(onSubmit)` → `POST /auth/reset-password` | `text=Reset Password` | `src/pages/ResetPassword/index.tsx:~80` |
| `<Button variant="outline" type="button">` | Back to Login | — | `navigate('/login')` | `text=Back to Login` | `src/pages/ResetPassword/index.tsx:~90` |
| `<Button>` | Back to Login | — | `navigate('/login')` (invalid-token state) | `text=Back to Login` | `src/pages/ResetPassword/index.tsx:~100` |

---

## Navigation (Sidebar)

| Element | Label | data-testid | Triggers | Selector strategy | Source (file:line) |
|---|---|---|---|---|---|
| `<button>` (SidebarMenuButton) | Schedule ▼/▲ | — | `toggleMenu('Schedule')` — expand/collapse submenu | `text=Schedule` | `src/components/Navigation.tsx:~60` |
| `<Link to="/visits">` | Visits | — | navigate `/visits` | `text=Visits` | `src/components/Navigation.tsx:~70` |
| `<Link to="/planner">` | Planner | — | navigate `/planner` | `text=Planner` | `src/components/Navigation.tsx:~75` |
| `<Link to="/dashboard">` | Dashboard | — | navigate `/dashboard` (disabled) | `text=Dashboard` | `src/components/Navigation.tsx:~82` |
| `<Link to="/customers">` | Customers | — | navigate `/customers` (disabled) | `text=Customers` | `src/components/Navigation.tsx:~88` |
| `<Link to="/visits-list">` | Visits List | — | navigate `/visits-list` | `text=Visits List` | `src/components/Navigation.tsx:~94` |
| `<Link to="/team">` | Team Management | — | navigate `/team` (disabled) | `text=Team Management` | `src/components/Navigation.tsx:~100` |
| `<Link to="/settings">` | Settings | — | navigate `/settings` (disabled) | `text=Settings` | `src/components/Navigation.tsx:~106` |
| `<button aria-label="Toggle Sidebar">` | (SidebarRail — no visible text) | — | `toggleSidebar()` | `aria-label=Toggle Sidebar` | `src/components/Navigation.tsx:~130` |
| `<Button>` (SidebarTrigger) | (sr-only: Toggle Sidebar) | — | `toggleSidebar()` via Radix | `aria-label=Toggle Sidebar` | `src/components/Navigation.tsx:~125` |

---

## Dashboard

| Element | Label | data-testid | Triggers | Selector strategy | Source (file:line) |
|---|---|---|---|---|---|
| `<Button variant="outline">` (PopoverTrigger) | Start Date / date value | — | opens date-range Popover | `text=Start Date` | `src/pages/Dashboard/TableFilter.tsx:~30` |
| `<Button variant="ghost">` | Clear Filters | — | `clearFilters()` | `text=Clear Filters` | `src/pages/Dashboard/TableFilter.tsx:~42` |
| `<button>` (MonthSelector trigger) | Current month label | — | `setOpen(!open)` — opens month dropdown | `role=button` (month selector) | `src/pages/Dashboard/MonthSelector.tsx:~25` |
| `<button>` | ← (ChevronLeft) | — | `setCurrentYear(prev => prev - 1)` | `aria-label` or position | `src/pages/Dashboard/MonthSelector.tsx:~35` |
| `<button>` | → (ChevronRight) | — | `setCurrentYear(prev => prev + 1)` | `aria-label` or position | `src/pages/Dashboard/MonthSelector.tsx:~40` |
| `<button>` × 12 | Jan | — | `onSelect('Jan'); setOpen(false)` | `text=Jan` | `src/pages/Dashboard/MonthSelector.tsx:~55` |
| `<button>` × 12 | Feb | — | `onSelect('Feb'); setOpen(false)` | `text=Feb` | `src/pages/Dashboard/MonthSelector.tsx:~55` |
| `<button>` × 12 | Mar | — | `onSelect('Mar'); setOpen(false)` | `text=Mar` | `src/pages/Dashboard/MonthSelector.tsx:~55` |
| `<button>` × 12 | Apr | — | `onSelect('Apr'); setOpen(false)` | `text=Apr` | `src/pages/Dashboard/MonthSelector.tsx:~55` |
| `<button>` × 12 | May | — | `onSelect('May'); setOpen(false)` | `text=May` | `src/pages/Dashboard/MonthSelector.tsx:~55` |
| `<button>` × 12 | Jun | — | `onSelect('Jun'); setOpen(false)` | `text=Jun` | `src/pages/Dashboard/MonthSelector.tsx:~55` |
| `<button>` × 12 | Jul | — | `onSelect('Jul'); setOpen(false)` | `text=Jul` | `src/pages/Dashboard/MonthSelector.tsx:~55` |
| `<button>` × 12 | Aug | — | `onSelect('Aug'); setOpen(false)` | `text=Aug` | `src/pages/Dashboard/MonthSelector.tsx:~55` |
| `<button>` × 12 | Sep | — | `onSelect('Sep'); setOpen(false)` | `text=Sep` | `src/pages/Dashboard/MonthSelector.tsx:~55` |
| `<button>` × 12 | Oct | — | `onSelect('Oct'); setOpen(false)` | `text=Oct` | `src/pages/Dashboard/MonthSelector.tsx:~55` |
| `<button>` × 12 | Nov | — | `onSelect('Nov'); setOpen(false)` | `text=Nov` | `src/pages/Dashboard/MonthSelector.tsx:~55` |
| `<button>` × 12 | Dec | — | `onSelect('Dec'); setOpen(false)` | `text=Dec` | `src/pages/Dashboard/MonthSelector.tsx:~55` |

---

## Customers

| Element | Label | data-testid | Triggers | Selector strategy | Source (file:line) |
|---|---|---|---|---|---|
| `<X onClick>` (Lucide icon) | (Clear search) | — | `setSearch('')` | `aria-label=Clear search` | `src/pages/Customers/index.tsx:~55` |
| `<X onClick>` (Lucide icon) | (Clear customer name filter) | — | `setCustomerNameFilter('')` | `aria-label=Clear customer name filter` | `src/pages/Customers/index.tsx:~60` |
| `<X onClick>` (Lucide icon) | (Clear Contract Manager filter) | — | `setContractManagerFilter('')` | `aria-label=Clear Contract Manager filter` | `src/pages/Customers/index.tsx:~65` |
| `<div onClick>` (user option) | (user name — dynamic) | — | `setBookedByFilter(user.value)` — filter selection | `text={user.label}` | `src/pages/Customers/index.tsx:~80` |
| `<Button variant="ghost">` | Clear Filters | — | `clearAllFilters()` | `text=Clear Filters` | `src/pages/Customers/index.tsx:~95` |
| `<Button variant="ghost" size="icon">` | ← (Previous page) | — | `setPage(p => Math.max(1, p-1))` | `aria-label=Previous page` | `src/pages/Customers/index.tsx:~110` |
| `<Button variant="ghost" size="icon">` | → (Next page) | — | `setPage(p => Math.min(totalPages, p+1))` | `aria-label=Next page` | `src/pages/Customers/index.tsx:~115` |

> Note: `<tr onClick>` on customer rows navigates, but navigation is currently disabled (`setOpen(false)` only) — `src/pages/Customers/CustomersTable.tsx:~40`.

---

## Appointments (Calendar)

| Element | Label | data-testid | Triggers | Selector strategy | Source (file:line) |
|---|---|---|---|---|---|
| `<Button>` | Add New Visit | — | `handleAddNewAppoitment()` → navigate `/visits/addnewvisit` | `text=Add New Visit` | `src/pages/Appointments/CalendarViewSelector.tsx:~28` |
| `<Button variant="ghost">` (PopoverTrigger) | (current date label) | — | opens date Popover | `text={dateLabel}` | `src/pages/Appointments/CalendarViewSelector.tsx:~35` |
| `<Button variant="ghost" size="icon">` | ← (ChevronLeft) | — | `goToPrevious()` | position / `aria-label` | `src/pages/Appointments/CalendarViewSelector.tsx:~42` |
| `<Button variant="ghost" size="icon">` | → (ChevronRight) | — | `goToNext()` | position / `aria-label` | `src/pages/Appointments/CalendarViewSelector.tsx:~48` |
| `<Button>` | Day | — | `handleViewChange('day')` | `text=Day` | `src/pages/Appointments/CalendarViewSelector.tsx:~58` |
| `<Button>` | Month | — | `handleViewChange('month')` | `text=Month` | `src/pages/Appointments/CalendarViewSelector.tsx:~62` |
| `<div/span onClick>` (calendar event) | (visit title — dynamic) | — | opens visit detail or edit modal | event card click handler | `src/pages/Appointments/` (BigCalendar event) |

---

## Visits List

| Element | Label | data-testid | Triggers | Selector strategy | Source (file:line) |
|---|---|---|---|---|---|
| `<button type="button">` | ← (scroll left) | — | `scroll('left')` — filter row scroll (conditional) | position / `aria-label` | `src/pages/VisitsList/VisitsListFilter.tsx:~35` |
| `<button type="button">` | → (scroll right) | — | `scroll('right')` — filter row scroll (conditional) | position / `aria-label` | `src/pages/VisitsList/VisitsListFilter.tsx:~40` |
| `<Button variant="outline">` (PopoverTrigger) | Start Date | — | opens start date Popover | `text=Start Date` | `src/pages/VisitsList/VisitsListFilter.tsx:~55` |
| `<Button variant="outline">` (PopoverTrigger) | End Date | — | opens end date Popover | `text=End Date` | `src/pages/VisitsList/VisitsListFilter.tsx:~65` |
| `<Button variant="outline">` | Sort | — | `onSortOrderChange(nextOrder)` | `text=Sort` | `src/pages/VisitsList/VisitsListFilter.tsx:~78` |
| `<Button variant="ghost">` | Clear | — | `onClear()` — clear all filters | `text=Clear` | `src/pages/VisitsList/VisitsListFilter.tsx:~85` |
| `<tr onClick>` | (visit row — dynamic) | — | `navigate('/visits/details/${row.id}')` | row navigation | `src/pages/VisitsList/VisitsListTable.tsx:~120` |
| `<Switch onCheckedChange>` | Report Sent | — | `updateVisit({ id, wasServiceReportSent: next })` → `PATCH /visits/{id}` | `role=switch` (Report Sent) | `src/pages/VisitsList/VisitsListTable.tsx:~73` |

---

## Visit Details

| Element | Label | data-testid | Triggers | Selector strategy | Source (file:line) |
|---|---|---|---|---|---|
| `<button>` (native) | Back to Visits | — | `navigate('/visits-list')` | `text=Back to Visits` | `src/pages/VisitDetails/index.tsx:~161` |
| `<Switch onCheckedChange>` | Report Sent | — | `handleReportSentToggle(checked)` → `PATCH /visits/{id}` | `role=switch` (Report Sent) | `src/pages/VisitDetails/index.tsx:~184` |
| `<Button variant="outline" size="sm">` | Download Report | — | `handleDownloadReport()` → `GET /visits/{id}/service-report` | `text=Download Report` | `src/pages/VisitDetails/index.tsx:~194` |
| `<TabsTrigger value="details">` | Visit Details | — | switch tab to details | `text=Visit Details` | `src/pages/VisitDetails/VisitDetailsTabs.tsx:~(tabs)` |
| `<TabsTrigger value="inspections">` | Inspections | — | switch tab to inspections | `text=Inspections` | `src/pages/VisitDetails/VisitDetailsTabs.tsx:~(tabs)` |
| `<TabsTrigger value="attachments">` | Attachments | — | switch tab to attachments | `text=Attachments` | `src/pages/VisitDetails/VisitDetailsTabs.tsx:~(tabs)` |
| `<Button variant="ghost">` | ✏ (PencilLine — Edit Booking Info) | — | `setIsEditBookingInfoModalOpen(true)` | `aria-label` or position | `src/pages/VisitDetails/VisitDetailsPanel.tsx:~107` |
| `<AccordionTrigger>` | Visit Details | — | expand/collapse Visit Details accordion | `text=Visit Details` | `src/pages/VisitDetails/VisitDetailsPanel.tsx:~146` |
| `<AccordionTrigger>` | Actions | — | expand/collapse Actions accordion | `text=Actions` | `src/pages/VisitDetails/VisitDetailsPanel.tsx:~220` |

> Also: `<div onClick>` per inspection row (InspectionsPanel:~40) → `onInspectionClick(inspection.id)` → navigate `/visits/inspection/{id}`.
> `<span role="button">` Upload (visit-level and per-inspection) in AttachmentsPanel → `openUploader(...)`.

---

## Add New Visit

> Page: `/visits/addnewvisit`

| Element | Label | data-testid | Triggers | Selector strategy | Source (file:line) |
|---|---|---|---|---|---|
| `<Button>` | Cancel | — | `navigate(-1)` | `text=Cancel` | `src/pages/AddNewAppoitment/AddNewAppointmentHeader.tsx:~18` |
| `<Button>` | Create Visit | — | `onSubmit()` → form submit → `POST /visits` | `text=Create Visit` | `src/pages/AddNewAppoitment/AddNewAppointmentHeader.tsx:~22` |
| `<Button>` | + Inspection | — | `setIsAddInspectionModalOpen(true)` | `text=Inspection` | `src/pages/AddNewAppoitment/AddNewAppointmentForm.tsx:~(add inspection btn)` |
| `<div onClick>` (Trash2 icon) | 🗑 (Delete inspection) | — | `setInspectionToDelete(id); setIsDeleteInspectionConfirmationModalOpen(true)` | position / role | `src/pages/AddNewAppoitment/AddNewAppointmentForm.tsx:~(trash inspection)` |
| `<Button>` | + Product | — | `openEditInspectionProductsModal(inspection.id)` | `text=Product` | `src/pages/AddNewAppoitment/AddNewAppointmentForm.tsx:~(add product btn)` |
| `<PencilLine onClick>` | ✏ (Edit product) | — | `openEditInspectionProductsModal(inspection.id, product.id)` | position | `src/pages/AddNewAppoitment/AddNewAppointmentForm.tsx:~(edit product icon)` |
| `<Trash2 onClick>` | 🗑 (Delete product) | — | `setProductToDelete({...}); setIsDeleteProductConfirmationModalOpen(true)` | position | `src/pages/AddNewAppoitment/AddNewAppointmentForm.tsx:~(trash product icon)` |
| `<Button>` | + Sample | — | `setSelectedInspectionId(id); setIsEditInspectionSamplesModalOpen(true)` (if requiresWaterSample) | `text=Sample` | `src/pages/AddNewAppoitment/AddNewAppointmentForm.tsx:~(add sample btn)` |
| `<Trash2 onClick>` | 🗑 (Delete sample) | — | `setSampleToDelete({...}); setIsDeleteSampleConfirmationModalOpen(true)` | position | `src/pages/AddNewAppoitment/AddNewAppointmentForm.tsx:~(trash sample icon)` |
| `<Button>` | ✏ (Edit notes) | — | `setIsEditInspectionNotesModalOpen(true)` | position | `src/pages/AddNewAppoitment/AddNewAppointmentForm.tsx:~(edit notes btn)` |
| `<Button variant="outline">` | Cancel (product modal) | — | `setIsEditInspectionProductsModalOpen(false)` | `text=Cancel` (in product modal) | `src/pages/AddNewAppoitment/AddNewAppointmentForm.tsx:~(product modal cancel)` |
| `<Button>` | Add / Update (product modal) | — | save product to inspection state | `text=Add` or `text=Update` | `src/pages/AddNewAppoitment/AddNewAppointmentForm.tsx:~(product modal save)` |
| `<Button variant="outline">` | Cancel (sample modal) | — | close sample modal | `text=Cancel` (in sample modal) | `src/pages/AddNewAppoitment/AddNewAppointmentForm.tsx:~(sample modal cancel)` |
| `<Button>` | Add Sample Type(s) (sample modal) | — | add water samples to inspection state | `text=Add Sample Type` | `src/pages/AddNewAppoitment/AddNewAppointmentForm.tsx:~(sample modal save)` |
| `<Button variant="outline">` | Cancel (notes modal) | — | close notes modal | `text=Cancel` (in notes modal) | `src/pages/AddNewAppoitment/AddNewAppointmentForm.tsx:~(notes modal cancel)` |
| `<Button>` | Save (notes modal) | — | save inspection notes | `text=Save` (in notes modal) | `src/pages/AddNewAppoitment/AddNewAppointmentForm.tsx:~(notes modal save)` |
| `<Button type="button" variant="outline">` | Cancel (Add Inspection form) | — | `onCancel()` — close inspection modal | `text=Cancel` (in Add Inspection modal) | `src/pages/AddNewAppoitment/forms/AddInspectionForm.tsx:~(cancel)` |
| `<Button type="button">` | Save (Add Inspection form) | — | `handleSave()` → add inspection to visit state | `text=Save` (in Add Inspection modal) | `src/pages/AddNewAppoitment/forms/AddInspectionForm.tsx:~(save)` |

> Also: 3× ConfirmationModals (delete product / delete sample / delete inspection) — see Shared — Confirmation Modal section.

---

## Edit Visit

> Page: `/visits/edit/{id}` (EditAppointment)

| Element | Label | data-testid | Triggers | Selector strategy | Source (file:line) |
|---|---|---|---|---|---|
| `<Button>` | Change Main Details | — | `openChangeMainDetailsModal()` → opens EditMainDetailsModal | `text=Change Main Details` | `src/pages/EditAppointment/index.tsx:~(main details btn)` |
| `<Button type="button" variant="ghost">` | ✏ (Edit date/time) | — | `openChangeDateAndTimeModal()` → opens EditDateAndTimeModal | position / `aria-label` | `src/pages/EditAppointment/index.tsx:~(date edit btn)` |
| `<Button>` | + Inspection | — | `openAddInspectionModal()` | `text=Inspection` | `src/pages/EditAppointment/index.tsx:~(add inspection btn)` |
| `<div onClick>` (Trash2 icon) | 🗑 (Delete inspection) | — | `openDeleteInspectionConfirmationModal(inspection.id)` | position | `src/pages/EditAppointment/index.tsx:~(trash inspection)` |
| `<Button type="button" variant="ghost">` | + Product | — | `openEditInspectionProductsModal(inspection.id)` | `text=Product` | `src/pages/EditAppointment/index.tsx:~(add product btn)` |
| `<PencilLine onClick>` | ✏ (Edit product) | — | `openEditInspectionProductsModal(inspection.id, product.id)` | position | `src/pages/EditAppointment/index.tsx:~(edit product icon)` |
| `<Trash2 onClick>` | 🗑 (Delete product) | — | `openDeleteProductConfirmationModal(product.id, inspection.id)` | position | `src/pages/EditAppointment/index.tsx:~(trash product icon)` |
| `<Button type="button" variant="ghost">` | + Sample | — | `openChangeWaterSamplesModal(undefined, inspection.id)` | `text=Sample` | `src/pages/EditAppointment/index.tsx:~(add sample btn)` |
| `<Trash2 onClick>` | 🗑 (Delete water sample) | — | `openDeleteWaterSampleConfirmationModal(sample.id, inspection.id)` | position | `src/pages/EditAppointment/index.tsx:~(trash sample icon)` |
| `<Button type="button" variant="ghost">` | ✏ (Edit inspection notes) | — | `openChangeInspectionNotesModal(inspection.id)` | position | `src/pages/EditAppointment/index.tsx:~(edit inspection notes btn)` |
| `<Button type="button" variant="ghost">` | ✏ (Edit description/notes) | — | `openChangeNotesModal()` | position | `src/pages/EditAppointment/index.tsx:~(edit notes btn)` |
| `<Button type="button" variant="ghost">` | ✏ (Edit booking info) | — | `setIsEditBookingInfoModalOpen(true)` | position | `src/pages/EditAppointment/index.tsx:~(edit booking info btn)` |
| `<Button type="button" variant="outline">` | Cancel (EditMainDetails) | — | `onCancel()` | `text=Cancel` (in Edit Main Details modal) | `src/pages/EditAppointment/forms/EditMainDetailsForm.tsx:141` |
| `<Button type="submit">` | Save (EditMainDetails) | — | form submit → `PATCH /visits/{id}` (title, engineerIds, bookingPersonId) | `text=Save` (in Edit Main Details modal) | `src/pages/EditAppointment/forms/EditMainDetailsForm.tsx:144` |
| `<Button type="button" variant="outline">` | Cancel (EditDateAndTime) | — | `onCancel()` | `text=Cancel` (in Edit Date & Time modal) | `src/pages/EditAppointment/forms/EditDateAndTimeForm.tsx:179` |
| `<Button type="submit">` | Save (EditDateAndTime) | — | form submit → `PATCH /visits/{id}` (from, to, originalDate, isFixed) | `text=Save` (in Edit Date & Time modal) | `src/pages/EditAppointment/forms/EditDateAndTimeForm.tsx:182` |
| `<Button type="button" variant="outline">` | Cancel (EditNotes) | — | `onCancel()` | `text=Cancel` (in Edit Notes/Description modal) | `src/pages/EditAppointment/forms/EditNotesForm.tsx:78` |
| `<Button type="submit">` | Save (EditNotes) | — | form submit → `PATCH /visits/{id}` or `PATCH /inspections/{id}` (notes) | `text=Save` (in Edit Notes modal) | `src/pages/EditAppointment/forms/EditNotesForm.tsx:81` |
| `<Button variant="outline">` | Cancel (EditProducts) | — | `onCancel()` | `text=Cancel` (in Edit Products modal) | `src/pages/EditAppointment/forms/EditProductsForm.tsx:238` |
| `<Button>` | Add / Update (EditProducts) | — | `handleSaveProduct()` → `PATCH /inspections/{id}` (products) | `text=Add` or `text=Update` | `src/pages/EditAppointment/forms/EditProductsForm.tsx:241` |
| `<Button variant="outline">` | Cancel (EditWaterSamples) | — | `onCancel()` | `text=Cancel` (in Edit Water Samples modal) | `src/pages/EditAppointment/forms/EditWaterSamplesForm.tsx:162` |
| `<Button>` | Add / Update (EditWaterSamples) | — | `handleSaveWaterSample()` → `PATCH /inspections/{id}` (samples) | `text=Add` or `text=Update` | `src/pages/EditAppointment/forms/EditWaterSamplesForm.tsx:165` |

> Also: 3× ConfirmationModals (delete product / delete water sample / delete inspection) — see Shared — Confirmation Modal section.
> AddInspectionModal shares `src/pages/EditAppointment/forms/AddInspectionForm.tsx` — same Cancel/Save buttons.

---

## Inspection Details

> Page: `/visits/inspection/{id}`

| Element | Label | data-testid | Triggers | Selector strategy | Source (file:line) |
|---|---|---|---|---|---|
| `<button>` (native) | Back to Visit | — | `navigate('/visits/details/${visit?.id}')` | `text=Back to Visit` | `src/pages/InspectionDetails/InspectionDetailsHeader.tsx:~18` |
| `<TabsTrigger value="details">` | Inspection Details | — | switch to Inspection Details tab | `text=Inspection Details` | `src/pages/InspectionDetails/JobRecordTabs.tsx:59` |
| `<TabsTrigger value="labResults">` | Lab Results | — | switch to Lab Results tab | `text=Lab Results` | `src/pages/InspectionDetails/JobRecordTabs.tsx:59` |
| `<TabsTrigger value="attachments">` | Attachments | — | switch to Attachments tab | `text=Attachments` | `src/pages/InspectionDetails/JobRecordTabs.tsx:59` |
| `<TabsTrigger value="actions">` | Actions | — | switch to Actions tab | `text=Actions` | `src/pages/InspectionDetails/JobRecordTabs.tsx:59` |
| `<TabsTrigger value="history">` | History | — | switch to History tab | `text=History` | `src/pages/InspectionDetails/JobRecordTabs.tsx:59` |
| `<Button>` | Upload | — | `openUploader()` → upload attachment to inspection | `text=Upload` | `src/pages/InspectionDetails/AttachmentsPanel.tsx:~30` |
| `<Button>` | New Action | — | `handleAddAction()` → opens AddActionModal | `text=New Action` | `src/components/Actions/ActionsPanel.tsx:~(empty state btn)` |
| `<TabsTrigger value="high">` | High N | — | filter actions by High priority | `text=High` | `src/components/Actions/ActionsPanel.tsx:~(priority tabs)` |
| `<TabsTrigger value="medium">` | Medium N | — | filter actions by Medium priority | `text=Medium` | `src/components/Actions/ActionsPanel.tsx:~(priority tabs)` |

---

## Reports

> Page: `/reports` (inspection reports list)

| Element | Label | data-testid | Triggers | Selector strategy | Source (file:line) |
|---|---|---|---|---|---|
| `<Button variant="ghost">` | Clear Filters | — | `onClear()` — clear report filters | `text=Clear Filters` | `src/pages/Reports/ReportsFilter.tsx:~45` |
| `<tr onClick>` | (report row — dynamic) | — | `navigate('/inspections/${row.id}')` | row navigation | `src/pages/Reports/ReportsTable.tsx:~40` |
| `<TabsTrigger>` × N | (status filter tabs) | — | filter reports by status | `text={status}` | `src/pages/Reports/index.tsx:~(status tabs)` |

---

## Planner

| Element | Label | data-testid | Triggers | Selector strategy | Source (file:line) |
|---|---|---|---|---|---|
| `<Button>` | Month View | — | `handleViewChange('month')` | `text=Month View` | `src/pages/Planner/PlannerViewSelector.tsx:~28` |
| `<Button>` | Events View | — | `handleViewChange('events')` | `text=Events View` | `src/pages/Planner/PlannerViewSelector.tsx:~32` |
| `<Button variant="ghost">` (PopoverTrigger) | (current month/year label) | — | opens date Popover | `text={monthYearLabel}` | `src/pages/Planner/PlannerViewSelector.tsx:~40` |
| `<Button variant="ghost" size="icon">` | ← (ChevronLeft) | — | `goToPrevious()` | position / `aria-label` | `src/pages/Planner/PlannerViewSelector.tsx:~48` |
| `<Button variant="ghost" size="icon">` | → (ChevronRight) | — | `goToNext()` | position / `aria-label` | `src/pages/Planner/PlannerViewSelector.tsx:~54` |
| `<button type="button" aria-label="Clear customer">` | ✕ (Clear customer) | — | `handleClearCustomer()` — clear customer filter | `aria-label=Clear customer` | `src/pages/Planner/PlannerViewSelector.tsx:~68` |
| `<button type="button">` (customer option — dynamic) | (customer name) | — | `handleCustomerSelect(option.value, option.label)` | `text={option.label}` | `src/pages/Planner/PlannerViewSelector.tsx:~80` |
| `<Button variant="outline">` | Sort | — | `handleSortToggle()` | `text=Sort` | `src/pages/Planner/PlannerViewSelector.tsx:~92` |
| `<Button variant="ghost">` | Clear | — | `handleClearFilters()` | `text=Clear` | `src/pages/Planner/PlannerViewSelector.tsx:~98` |
| `<div/event onClick>` (calendar event) | (engineer name / visit title — dynamic) | — | open event detail or navigate | event card click | `src/pages/Planner/` (event handler) |

---

## Add New Report

> Page: `/reports/add` (AddNewReport — static demo form, partially hardcoded)

| Element | Label | data-testid | Triggers | Selector strategy | Source (file:line) |
|---|---|---|---|---|---|
| `<Button>` | Save as Draft | — | `navigate(-1)` | `text=Save as Draft` | `src/pages/AddNewReport/AddNewReportHeader.tsx:21` |
| `<Button>` | Create Report | — | `onSubmit()` → form submit | `text=Create Report` | `src/pages/AddNewReport/AddNewReportHeader.tsx:28` |

---

## Shared — Actions Panel

> Used in: Visit Details (VisitDetailsPanel), Inspection Details (JobRecordTabs → ActionsPanel)

| Element | Label | data-testid | Triggers | Selector strategy | Source (file:line) |
|---|---|---|---|---|---|
| `<Button>` | New Action | — | `handleAddAction()` → opens AddActionModal | `text=New Action` | `src/components/Actions/ActionsPanel.tsx:~(new action btn)` |
| `<TabsTrigger value="high">` | High N | — | filter to High priority actions | `text=High` | `src/components/Actions/ActionsPanel.tsx:~(priority tabs)` |
| `<TabsTrigger value="medium">` | Medium N | — | filter to Medium priority actions | `text=Medium` | `src/components/Actions/ActionsPanel.tsx:~(priority tabs)` |
| `<TabsTrigger value="low">` | Low N | — | filter to Low priority actions | `text=Low` | `src/components/Actions/ActionsPanel.tsx:~(priority tabs)` |
| `<TabsTrigger value="unset">` | Unset N (conditional) | — | filter to Unset priority actions | `text=Unset` | `src/components/Actions/ActionsPanel.tsx:~(priority tabs)` |
| `<SelectTrigger>` (priority badge) | (current priority — High/Medium/Low/Unset) | — | `onValueChange` → `PATCH /actions/{id}` (priority) | `role=combobox` near action card | `src/components/Actions/ActionsPanel.tsx:~(action card priority)` |
| `<SelectTrigger>` (status) | (current status) | — | `onValueChange` → `PATCH /actions/{id}` (status) | `role=combobox` near action card (status) | `src/components/Actions/ActionsPanel.tsx:~(action card status)` |
| `<Button variant="ghost" size="sm">` | 🗑 (Delete action) | — | `onDelete(action)` → opens delete confirmation | position | `src/components/Actions/ActionsPanel.tsx:~(delete action btn)` |

---

## Shared — Add Action Modal

| Element | Label | data-testid | Triggers | Selector strategy | Source (file:line) |
|---|---|---|---|---|---|
| `<button type="button">` (native) | + Add Custom Action | — | `handleAddCustomActionClick()` — show custom action editor | `text=Add Custom Action` | `src/components/Actions/AddActionModal.tsx:~(add custom btn)` |
| `<Button variant="outline">` | Cancel (custom action editor) | — | `handleCancelCustom()` | `text=Cancel` (custom editor) | `src/components/Actions/AddActionModal.tsx:~(custom cancel)` |
| `<Button>` | Save (custom action editor) | — | `handleSaveEditedCustom()` | `text=Save` (custom editor) | `src/components/Actions/AddActionModal.tsx:~(custom save)` |
| `<Button>` | Add to list (custom action editor) | — | `handleAddCustomToList()` | `text=Add to list` | `src/components/Actions/AddActionModal.tsx:~(add to list)` |
| `<Button>` | ✏ (Edit custom action) | — | `handleEditCustomAction(custom)` | position / icon | `src/components/Actions/AddActionModal.tsx:~(edit custom icon)` |
| `<Button>` | 🗑 (Delete custom action) | — | `handleDeleteCustomAction(custom.id)` | position / icon | `src/components/Actions/AddActionModal.tsx:~(delete custom icon)` |
| `<SelectTrigger>` (priority — custom action) | (priority value) | — | set priority on custom action | `role=combobox` (priority in add modal) | `src/components/Actions/AddActionModal.tsx:~(custom priority select)` |
| `<Button variant="outline">` | Cancel | — | `handleClose()` — close modal | `text=Cancel` (modal footer) | `src/components/Actions/AddActionModal.tsx:~(modal cancel)` |
| `<Button>` | Add Action (N) | — | `handleSubmit()` → `POST /actions` | `text=Add Action` | `src/components/Actions/AddActionModal.tsx:~(modal submit)` |

---

## Shared — Confirmation Modal

> Used throughout: delete product, delete inspection, delete sample, delete action, etc.

| Element | Label | data-testid | Triggers | Selector strategy | Source (file:line) |
|---|---|---|---|---|---|
| `<Button variant="outline">` | Cancel (default: "Cancel") | — | `onClose()` — dismiss modal | `text=Cancel` | `src/components/ConfirmationModal/index.tsx:~45` |
| `<Button variant={variant}>` | Proceed (default: "Proceed") | — | `onConfirm()` — execute destructive action | `text=Proceed` | `src/components/ConfirmationModal/index.tsx:~48` |

---

## Notes & Uncertainties

1. **Line numbers marked `~`** are approximate (nearest 5-10 lines) — exact lines shift as code evolves. Lines without `~` are exact from the read performed during this session.
2. **Dashboard MonthSelector months (×12)** — each month button is rendered dynamically in a loop. They share the same source line range (`~55`). In tests, target by `text=Jan`, `text=Feb`, etc.
3. **Planner customer options** — rendered dynamically from API; label is customer name at runtime.
4. **Calendar event clicks** (Appointments / Planner) — handled inside BigCalendar / CalendarTimeline sub-components not fully extracted. The handler navigates to visit detail or opens a modal; exact file:line was not confirmed in this pass.
5. **InspectionsPanel `<button>` × 2** (`Samples (N)` / `Products (N)`) — these call `e.stopPropagation()` only; they do not navigate or mutate. Not listed as meaningful interactive elements above but exist at `src/pages/VisitDetails/InspectionsPanel.tsx:~(samples/products buttons)`.
6. **ReportDetails page** — static demo page, no interactive elements.
7. **QaTracker page** — iframe embed of external app; no React interactive elements.
8. **`data-testid`** — only Login (7), Appointments calendar (1), Planner (1), Toaster (4) have testids. All other elements use `text` or `role` selector strategy.
9. **EditAppointment AddInspectionForm** — `src/pages/EditAppointment/forms/AddInspectionForm.tsx` also contains Cancel/Save, same pattern as AddNewAppoitment version.
10. **AddNewReport form** — no interactive buttons inside the form body (only `<FormInput>` wrappers); the two action buttons are in the header only.
