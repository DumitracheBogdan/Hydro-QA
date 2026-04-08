# Mobile QA Baseline Registry - Hydrocert (com.hydrocert.app)

**Date Created:** 2026-04-09
**App Package:** com.hydrocert.app
**Platform:** Android (Samsung R3CR90XLJLP)
**Test User:** Bogdan Dumitrache (Engineer role)
**Framework:** Jetpack Compose (androidx.compose)

---

## How To Use This Document

This is the **master QA baseline** for the Hydrocert mobile app (engineer version).
When developers add new features:

1. Compare this registry against the current app to find NEW elements
2. Add the new elements to this registry
3. Create new Maestro YAML flows in `mobile-flows/`
4. Run all existing flows to verify nothing broke (regression)

---

## Screen Inventory

| # | Screen | Access | Status |
|---|--------|--------|--------|
| 1 | Visits Home | Default landing screen | ACTIVE |
| 2 | History | Bottom tab: History | ACTIVE |
| 3 | Activity | Bottom tab: Activity | ACTIVE |
| 4 | Account | Bottom tab: Account | ACTIVE |
| 5 | My Signature | Account > My signature | ACTIVE |
| 6 | Change Password | Account > Change Password | ACTIVE |
| 7 | Visit Detail (Visit Details tab) | Tap "View Visit Details" on card | ACTIVE |
| 8 | Visit Detail (Inspections tab) | Visit Detail > Inspections tab | ACTIVE |
| 9 | Visit Detail (Attachments tab) | Visit Detail > Attachments tab | ACTIVE |

---

## Maestro Flow Files

| # | File | Screen Covered | Tags |
|---|------|---------------|------|
| 1 | 01_visits_home.yaml | Visits home screen | visits, home, smoke |
| 2 | 02_history.yaml | History screen | history, smoke |
| 3 | 03_activity.yaml | Activity screen | activity, smoke |
| 4 | 04_account.yaml | Account screen + sub-screens | account, settings, smoke |
| 5 | 05_visit_detail.yaml | Visit detail (all 3 tabs) | visit-detail, tabs, critical |
| 6 | 06_bottom_navigation.yaml | All 4 bottom nav tabs | navigation, smoke |
| 7 | 07_search_and_filters.yaml | Search + filter chips | search, filters, smoke |

---

## Complete Element Registry Per Screen

### SCREEN 1: Visits Home (Default)

| # | Element | Type | Text/Label | Working |
|---|---------|------|-----------|---------|
| 1 | Welcome header | text | "Welcome, [Name]!" | YES |
| 2 | Subtitle | text | "Here's an overview of your visits." | YES |
| 3 | Profile avatar | button (clickable) | Initials "BD" (top-right) | YES |
| 4 | Search input | EditText | "Type to search..." | YES |
| 5 | Today filter | chip (checkable) | Today | YES |
| 6 | Tomorrow filter | chip (checkable) | Tomorrow | YES |
| 7 | Next week filter | chip (checkable) | Next week | YES |
| 8 | Visit card | display card | Title + Status + Address + Time + Date + Ref# | YES |
| 9 | Status icon | image | content-desc: "Status icon" | YES |
| 10 | Inspections count | text | "INSPECTIONS (x)" | YES |
| 11 | View Visit Details | button (clickable) | "View Visit Details" | YES |
| 12 | Bottom nav: Visits | tab (selected) | Visits | YES |
| 13 | Bottom nav: History | tab | History | YES |
| 14 | Bottom nav: Activity | tab | Activity | YES |
| 15 | Bottom nav: Account | tab | Account | YES |

### SCREEN 2: History

| # | Element | Type | Text/Label | Working |
|---|---------|------|-----------|---------|
| 1 | Profile avatar | button (clickable) | Initials "BD" (top-right) | YES |
| 2 | Search input | EditText | "Type to search..." | YES |
| 3 | Visit cards | display cards | Past visits listed | YES |
| 4 | View Visit Details | button (clickable) | "View Visit Details" | YES |
| 5 | Bottom nav bar | 4 tabs | Visits, History, Activity, Account | YES |

### SCREEN 3: Activity

| # | Element | Type | Text/Label | Working |
|---|---------|------|-----------|---------|
| 1 | Profile avatar | button (clickable) | Initials "BD" (top-right) | YES |
| 2 | Empty state | text | "No activities found." | YES |
| 3 | Bottom nav bar | 4 tabs | Visits, History, Activity, Account | YES |

### SCREEN 4: Account

| # | Element | Type | Text/Label | Working |
|---|---------|------|-----------|---------|
| 1 | Account title | text | "Account" | YES |
| 2 | User avatar | display | Initials "BD" | YES |
| 3 | User name | text | "Bogdan Dumitrache" | YES |
| 4 | Role badge | text | "User" | YES |
| 5 | Phone | display | "-" (with phone icon) | YES |
| 6 | Email | display | email address (with email icon) | YES |
| 7 | My signature | row (clickable) | "My signature" with chevron | YES |
| 8 | Change Password | row (clickable) | "Change Password" | YES |
| 9 | Logout | row (clickable) | "Logout" | YES |
| 10 | Bottom nav bar | 4 tabs | Visits, History, Activity, Account | YES |

### SCREEN 5: My Signature (sub-screen of Account)

| # | Element | Type | Text/Label | Working |
|---|---------|------|-----------|---------|
| 1 | Back button | button | Navigate back | YES |
| 2 | Signature display/pad | view | Signature area | YES |

### SCREEN 6: Visit Detail - Visit Details Tab

| # | Element | Type | Text/Label | Working |
|---|---------|------|-----------|---------|
| 1 | Back button | button (clickable) | content-desc: "Back" | YES |
| 2 | Address display | text | Full address | YES |
| 3 | Location icon | button (clickable) | content-desc: "Location" | YES |
| 4 | Time range | text | e.g., "10:00 -> 12:30" | YES |
| 5 | Date | text | e.g., "15.04.2026" | YES |
| 6 | Visit reference | text | e.g., "#VN011710" | YES |
| 7 | Booking person avatar | display | Initials | YES |
| 8 | Booking person name | text | Name | YES |
| 9 | Booking person label | text | "Booking Person" | YES |
| 10 | Visit Details tab | tab (clickable) | "Visit Details" | YES |
| 11 | Inspections tab | tab (clickable) | "Inspections (x)" | YES |
| 12 | Attachments tab | tab (clickable) | "Attachments (x)" | YES |
| 13 | Description section | text | Visit description | YES |
| 14 | Visit Details row | row (clickable) | Expandable with chevron | YES |
| 15 | Client Signature row | row (clickable) | "Client Signature" | YES |
| 16 | Actions row | row (clickable) | "Actions" | YES |
| 17 | Quick actions FAB | button (clickable) | content-desc: "Quick actions" | YES |

### SCREEN 7: Visit Detail - Inspections Tab

| # | Element | Type | Text/Label | Working |
|---|---------|------|-----------|---------|
| 1 | Inspection items | list | Numbered inspection forms | YES |
| 2 | Start Inspection | button (clickable) | "Start Inspection" (per item) | YES |
| 3 | Quick actions FAB | button (clickable) | content-desc: "Quick actions" | YES |
| 4 | Back button | button | content-desc: "Back" | YES |

### SCREEN 8: Visit Detail - Attachments Tab

| # | Element | Type | Text/Label | Working |
|---|---------|------|-----------|---------|
| 1 | Empty state | text | "No attachments available." | YES |
| 2 | Quick actions FAB | button (clickable) | content-desc: "Quick actions" | YES |
| 3 | Back button | button | content-desc: "Back" | YES |

### GLOBAL: Bottom Navigation Bar (all main screens)

| # | Element | Type | Text/Label | Working |
|---|---------|------|-----------|---------|
| 1 | Visits tab | nav tab | "Visits" (icon + text) | YES |
| 2 | History tab | nav tab | "History" (icon + text) | YES |
| 3 | Activity tab | nav tab | "Activity" (icon + text) | YES |
| 4 | Account tab | nav tab | "Account" (icon + text) | YES |

---

## Total Element Count

| Screen | Buttons | Inputs | Tabs/Chips | Other | Total |
|--------|---------|--------|------------|-------|-------|
| Visits Home | 2 | 1 | 3 | 9 | 15 |
| History | 2 | 1 | 0 | 2 | 5 |
| Activity | 1 | 0 | 0 | 2 | 3 |
| Account | 3 | 0 | 0 | 7 | 10 |
| My Signature | 1 | 0 | 0 | 1 | 2 |
| Visit Detail (Details) | 4 | 0 | 3 | 10 | 17 |
| Visit Detail (Inspections) | 2+ | 0 | 0 | 2 | 4+ |
| Visit Detail (Attachments) | 2 | 0 | 0 | 1 | 3 |
| Bottom Nav (global) | 0 | 0 | 4 | 0 | 4 |
| **TOTAL** | **17+** | **2** | **10** | **34** | **63+** |

---

## Web vs Mobile Comparison

| Feature | Web (Admin) | Mobile (Engineer) |
|---------|------------|-------------------|
| Login | Yes (email/password form) | Auto-login / separate |
| Dashboard/Visits | Calendar day/month view | Card list with filter chips |
| Planner | Full planner with filters | NOT IN MOBILE |
| Visits List | Table with search/filters | NOT IN MOBILE |
| Add New Visit | Full form (20 fields) | NOT IN MOBILE |
| Visit Detail | Tabs + sidebar | Tabs (same 3) |
| Start Inspection | Not visible | YES (per inspection) |
| History | NOT IN WEB | Yes |
| Activity | NOT IN WEB | Yes |
| Account/Profile | User menu (Logout only) | Full profile + signature |
| Quick Actions | NOT IN WEB | Floating button (FAB) |
| Team Management | Placeholder | NOT IN MOBILE |
| Settings | Placeholder | NOT IN MOBILE |
| Customers | Placeholder | NOT IN MOBILE |

---

## Changelog

| Date | Change | By |
|------|--------|-----|
| 2026-04-09 | Initial mobile baseline created - 63+ elements across 9 screens | QA Automation |
