# QA Baseline Registry - dev.gen-cert.com (Hydrocert)

**Date Created:** 2026-04-09
**Application:** Hydrocert
**URL:** https://dev.gen-cert.com
**Test Account:** Admin account — see GitHub Secret `HYDROCERT_QA_EMAIL` (and `HYDROCERT_QA_PASSWORD`). Locally, export the same vars or use `.env` (see `.env.example`).

---

## How To Use This Document

This is the **master QA baseline** for dev.gen-cert.com. When developers add new features:

1. Compare this registry against the current UI to find NEW buttons/elements
2. Add the new elements to this registry
3. Create new Maestro YAML flows in `maestro-flows/` for the new elements
4. Run all existing flows to verify nothing broke (regression)

---

## Page Inventory

| # | Page | URL | Status |
|---|------|-----|--------|
| 1 | Login | /login | ACTIVE |
| 2 | Forgot Password | /login (sub-view) | ACTIVE |
| 3 | Dashboard / Visits (Day View) | /visits | ACTIVE |
| 4 | Dashboard / Visits (Month View) | /visits | ACTIVE |
| 5 | Planner | /planner | ACTIVE |
| 6 | Visits List | /visits-list | ACTIVE |
| 7 | Add New Visit | /visits/addnewvisit | ACTIVE |
| 8 | Visit Detail | /visits/details/{id} | ACTIVE |
| 9 | Customers | /visits (PLACEHOLDER) | NOT BUILT |
| 10 | Team Management | /visits (PLACEHOLDER) | NOT BUILT |
| 11 | Settings | /visits (PLACEHOLDER) | NOT BUILT |

---

## Maestro Flow Files

| # | File | Page Covered | Tags |
|---|------|-------------|------|
| 1 | 01_login.yaml | Login page | login, authentication, smoke |
| 2 | 02_forgot_password.yaml | Forgot Password flow | login, forgot-password, smoke |
| 3 | 03_dashboard_visits_day_view.yaml | Dashboard Day View | dashboard, visits, day-view, smoke |
| 4 | 04_dashboard_visits_month_view.yaml | Dashboard Month View | dashboard, visits, month-view |
| 5 | 05_add_new_visit.yaml | Add New Visit form | visits, add-new-visit, form, critical |
| 6 | 06_planner.yaml | Planner page | planner, schedule, smoke |
| 7 | 07_visits_list.yaml | Visits List page | visits-list, table, smoke |
| 8 | 08_visit_detail.yaml | Visit Detail page | visit-detail, tabs, smoke |
| 9 | 09_sidebar_navigation.yaml | Sidebar navigation | navigation, sidebar, smoke |
| 10 | 10_user_menu.yaml | User profile menu | user-menu, logout, smoke |

---

## Complete Element Registry Per Page

### PAGE 1: Login (/login)

| # | Element | Type | Text/Label | Working |
|---|---------|------|-----------|---------|
| 1 | Logo | image | LOGO | YES |
| 2 | Email input | textbox | placeholder: you@example.com | YES |
| 3 | Password input | textbox | placeholder: (dots) | YES |
| 4 | Keep me signed in | checkbox | Keep me signed in | YES |
| 5 | Forgot password? | button | Forgot password? | YES |
| 6 | Sign in | button | Sign in | YES |

### PAGE 2: Forgot Password (/login sub-view)

| # | Element | Type | Text/Label | Working |
|---|---------|------|-----------|---------|
| 1 | Email input | textbox | placeholder: you@example.com | YES |
| 2 | Send Reset Link | button | Send Reset Link | YES |
| 3 | Back to Login | button | Back to Login (with arrow icon) | YES |

### PAGE 3: Dashboard / Visits - Day View (/visits)

| # | Element | Type | Text/Label | Working |
|---|---------|------|-----------|---------|
| 1 | Add New Visit | button | + Add New Visit | YES |
| 2 | Today date | button | Today, Apr 8 | YES |
| 3 | Previous day arrow | button | < (left arrow) | YES |
| 4 | Next day arrow | button | > (right arrow) | YES |
| 5 | Day toggle | button | Day | YES |
| 6 | Month toggle | button | Month | YES |
| 7 | All Engineers dropdown | combobox | All Engineers | YES |
| 8 | Toggle Sidebar | button | Toggle Sidebar | YES |
| 9 | User menu | button | TQ Tech Quarter Admin | YES |
| 10 | Visit cards on timeline | clickable cards | Various visit names | YES |
| 11 | Engineer rows | list | ~60 engineers listed | YES |
| 12 | Breadcrumb | nav | Visits | YES |

### PAGE 4: Dashboard / Visits - Month View (/visits)

| # | Element | Type | Text/Label | Working |
|---|---------|------|-----------|---------|
| 1 | Add New Visit | button | + Add New Visit | YES |
| 2 | Month/Year display | button | April 2026 | YES |
| 3 | Day toggle | button | Day | YES |
| 4 | Month toggle | button | Month | YES |
| 5 | All Engineers dropdown | combobox | All Engineers | YES |

### PAGE 5: Planner (/planner)

| # | Element | Type | Text/Label | Working |
|---|---------|------|-----------|---------|
| 1 | Month View | button | Month View | YES |
| 2 | Events View | button | Events View | YES |
| 3 | Month selector | button | April 2026 | YES |
| 4 | Search locations | input | Search locations, clients... | YES |
| 5 | Search Customer | input | Search Customer... | YES |
| 6 | Status filter | dropdown/button | Status | YES |
| 7 | Job Type filter | dropdown/button | Job Type | YES |
| 8 | Assigned To filter | dropdown/button | Assigned To | YES |
| 9 | Booked By filter | dropdown/button | Booked By | YES |
| 10 | Sort | button | Sort | YES |
| 11 | Clear | button | Clear | YES |

### PAGE 6: Visits List (/visits-list)

| # | Element | Type | Text/Label | Working |
|---|---------|------|-----------|---------|
| 1 | Search visits | input | Search visits, locations, clients... | YES |
| 2 | Visit reference search | input | Visit reference | YES |
| 3 | Start Date filter | button | Start Date | YES |
| 4 | End Date filter | button | End Date | YES |
| 5 | Assigned To filter | dropdown | Assigned To | YES |
| 6 | Booked By filter | dropdown | Booked By | YES |
| 7 | Clear Filters | button | Clear Filters | YES |
| 8 | Table header: Visit Reference | column header | Visit Reference | YES |
| 9 | Table header: Title | column header | Title | YES |
| 10 | Table header: Customer & Site | column header | Customer & Site | YES |
| 11 | Table header: Visit Type | column header | Visit Type | YES |
| 12 | Table header: Visit Date | column header | Visit Date | YES |
| 13 | Table header: Booking Person | column header | Booking Person | YES |
| 14 | Table header: Assigned Engineer | column header | Assigned Engineer | YES |
| 15 | Table header: Status | column header | Status | YES |
| 16 | Table rows | clickable row | Navigates to /visits/details/{id} | YES |

### PAGE 7: Add New Visit (/visits/addnewvisit)

| # | Element | Type | Text/Label | Working |
|---|---------|------|-----------|---------|
| 1 | Title input | textbox | Enter title... | YES |
| 2 | Search Site | textbox | Search Site... | YES |
| 3 | Search Customer | textbox | Search Customer... | YES |
| 4 | Status dropdown | combobox | Scheduled (default) | YES |
| 5 | Select date | button | Select date | YES |
| 6 | Start time | combobox | Start time | YES |
| 7 | End time | combobox | End time | YES |
| 8 | Points | number input | points | YES |
| 9 | Notes | textarea | Enter notes... | YES |
| 10 | Inspection button | button | Inspection | YES |
| 11 | Chemistry Level 4 | checkbox | Chemistry Level 4 | YES |
| 12 | Biology | checkbox | Biology | YES |
| 13 | Physics | checkbox | Physics | YES |
| 14 | Plumbing | checkbox | Plumbing | YES |
| 15 | Electrical | checkbox | Electrical | YES |
| 16 | Safety Certified | checkbox | Safety Certified | YES |
| 17 | Booking Person select | combobox/select | Select | YES |
| 18 | Engineer select | combobox/select | Select | YES |
| 19 | Cancel | button | Cancel | YES |
| 20 | Create Visit | button | Create Visit | YES |

### PAGE 8: Visit Detail (/visits/details/{id})

| # | Element | Type | Text/Label | Working |
|---|---------|------|-----------|---------|
| 1 | Back to Visits | button | Back to Visits | YES |
| 2 | Download Report | button | Download Report | YES |
| 3 | Status badge | badge | Not started / In Progress / etc. | YES |
| 4 | Visit Details tab | tab | Visit Details | YES |
| 5 | Inspections tab | tab | Inspections | YES |
| 6 | Attachments tab | tab | Attachments | YES |
| 7 | Actions section | sidebar section | Actions | YES |
| 8 | Client Signature | sidebar section | Client Signature | YES |
| 9 | Visit info cards | display | Site, Location, Client, Date | YES |
| 10 | Description section | expandable | Description | YES |
| 11 | Visit Details section | expandable | Visit Details | YES |

### GLOBAL / SIDEBAR (Present on all authenticated pages)

| # | Element | Type | Text/Label | Working |
|---|---------|------|-----------|---------|
| 1 | Hydrocert Logo | image/link | LOGO | YES |
| 2 | Dashboard | nav link | Dashboard -> /visits | YES |
| 3 | Customers | nav link | Customers -> /visits (PLACEHOLDER) | YES |
| 4 | Schedule | nav dropdown | Schedule (expandable) | YES |
| 5 | Schedule > Visits | nav link | Visits -> /visits | YES |
| 6 | Schedule > Planner | nav link | Planner -> /planner | YES |
| 7 | Visits List | nav link | Visits List -> /visits-list | YES |
| 8 | Team Management | nav link | Team Management -> /visits (PLACEHOLDER) | YES |
| 9 | Settings | nav link | Settings -> /visits (PLACEHOLDER) | YES |
| 10 | Toggle Sidebar | button | Toggle Sidebar | YES |
| 11 | User Profile Menu | button | TQ Tech Quarter Admin | YES |
| 12 | Logout | menu item | Logout (in user menu) | YES |
| 13 | Skip to content | link | Skip to content | YES |
| 14 | Breadcrumb navigation | nav | breadcrumb | YES |
| 15 | Notifications region | region | Notifications Alt+T | YES |

---

## Total Element Count

| Page | Buttons | Inputs | Dropdowns | Tabs | Other | Total |
|------|---------|--------|-----------|------|-------|-------|
| Login | 2 | 2 | 0 | 0 | 2 | 6 |
| Forgot Password | 2 | 1 | 0 | 0 | 0 | 3 |
| Dashboard Day View | 7 | 0 | 1 | 0 | 4 | 12 |
| Dashboard Month View | 4 | 0 | 1 | 0 | 0 | 5 |
| Planner | 5 | 2 | 4 | 0 | 0 | 11 |
| Visits List | 3 | 2 | 2 | 0 | 9 | 16 |
| Add New Visit | 4 | 5 | 3 | 0 | 8 | 20 |
| Visit Detail | 2 | 0 | 0 | 3 | 6 | 11 |
| Global / Sidebar | 3 | 0 | 0 | 0 | 12 | 15 |
| **TOTAL** | **32** | **12** | **11** | **3** | **41** | **99** |

---

## Known Issues / Observations

1. **Customers page NOT BUILT** - Sidebar link points to /visits (same as Dashboard)
2. **Team Management page NOT BUILT** - Sidebar link points to /visits
3. **Settings page NOT BUILT** - Sidebar link points to /visits
4. **Visit cards on timeline** - Clicking a visit card on the Day View dashboard does NOT navigate to detail. Clicking a row in Visits List DOES navigate to detail.
5. **Console error on Visit Detail** - 1 console error logged when loading visit detail page

---

## Placeholder Pages Tracker

When devs build these pages, create new Maestro flows and update this registry:

- [ ] Customers page (dedicated /customers route)
- [ ] Team Management page (dedicated /team-management route)
- [ ] Settings page (dedicated /settings route)

---

## Changelog

| Date | Change | By |
|------|--------|-----|
| 2026-04-09 | Initial baseline created - 99 elements across 8 pages + global | QA Automation |
