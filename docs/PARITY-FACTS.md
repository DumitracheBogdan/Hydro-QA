# Parity Test — Confirmed Dev API Facts

Verified empirically against the dev backend on 2026-05-26 (admin login `tq@hydrocert.com`).
These supersede assumptions in the design spec where they differ.

**API base (dev):** `https://hydrocert-dev-api-exajhpd0brg2bcar.ukwest-01.azurewebsites.net` (GH var `HYDROCERT_DEV_API_BASE`)

## Auth
- `POST /auth/login {email,password}` → `{ tokens: { accessToken }, user: { id, email, role } }`. Bearer token.
- Admin `tq@hydrocert.com` works (role `admin`). Stored as GH secrets `HYDROCERT_DEV_API_EMAIL` / `HYDROCERT_DEV_API_PASSWORD`.
- Mobile QA user: use existing GH secrets `HYDROCERT_MOBILE_QA_EMAIL` / `HYDROCERT_MOBILE_QA_PASSWORD` (proven by the existing mobile workflow). The plaintext `qa.user.20260317...@example.com` creds returned 401 on this API — do NOT use them; rely on the GH secret.

## Visit creation + retrieval (KEY)
- `POST /visits` returns **`201` with an EMPTY body** (`Promise<void>`). You CANNOT get the id from the response.
- `visitReference` is **always overridden** by the server (`generateNextVisitReference()` runs unconditionally) → cannot set our own ref.
- **Retrieval that works:** `GET /visits/filter-detailed?title=<exactTitle>` returns `{ items: [...] }` including `id`, `visitReference`, `title`. Filter by a **unique title** `PARITY-<runId>`. (`/visits/filter` only matches `visitReference`, ignores title/search — do NOT use it for this.)
- `CreateVisitDto` whitelist is strict: `waterSystemDescription` is **rejected** at create (400). Allowed/relevant fields: `title`, `from`, `to`, `engineerIds[]`, `bookingPersonId`, `siteId`, `notes`, `status`, `visitStatus`.
- **Description for web→mobile check = `notes`** (persists; shows in the mobile read-only "Description" card). The editable mobile "Description & Reference" field maps to `waterSystemDescription` (a different, non-create field) — do NOT target it for the web→mobile check.

## Inspection (KEY)
- `POST /inspections { visitId, jobTypeId }` returns `201` **with the created inspection including `id`** (direct, no retrieval needed).
- An inspection created **without** a `jobTypeId` has `inspectionForms: []` → NO Visit Information / Risk Assessment fields. **Must pass a jobTypeId** that defines those forms.
- **Magic fixture `jobTypeId = 658f27c1-9306-42a2-81a6-ad249d7eaef3`** ("Health and Safty Risk Assessment") → a new inspection with it populates exactly `["Risk Assessment", "Visit Information"]`. Confirmed by creating a fresh inspection.

## Inspection form field shape (for verify-data)
`GET /inspections/{id}` →
```
inspectionForms[]            // array
  .formName                  // "Visit Information" | "Risk Assessment"
  .formFields[]
    .id                      // InspectionFormField id (used by PATCH submit-form)
    .formField.fieldName     // human label (matches mobile UI label)
    .formField.fieldPath     // camelCase config key
    .value                   // saved value (string/…/null)
```
Lookup helper: `inspectionForms.find(f=>f.formName==='Visit Information').formFields.find(ff=>ff.formField.fieldName==='Assisting 1').value`

### Exact field labels (= mobile UI labels AND verify keys)
**Visit Information:** `Assisting 1` (path `assisting1`), `Assisting 2` (`assisting2`), `Assisting 3` (`assisting3`), `Works being carried out` (`works...`), `Site Induction required & Completed` (note: full label, not "Site Induction").
**Risk Assessment:** `Accessing Area/Lone Working- Comments` (path `accessingAreaLoneWorkingComments`), `Accessing Area/Lone Work - Risk Managed?` (`accessingAreaLoneWorkRiskManaged`), plus Asbestos/High Areas/Rodent/Machinery variants (each with `- Comments` and `- Risk Managed?`).
→ Parity 3b targets the 3 Visit-Information text fields; 3c targets `Accessing Area/Lone Working- Comments` (free-text, reliable to assert).

## Actions
- `POST /actions { siteId (REQUIRED), visitId | inspectionId, name, priority }`. Priority enum: `low|medium|high`.
- `GET /actions?visitId=` / `?inspectionId=` returns the array.
- **siteId is required** for actions → fixtures must include a valid `siteId` (resolve at runtime from a visit that has a non-null `siteId`, or `GET /sites`). Many sample visits have `siteId: null`.

## Signature (3a)
- `GET /visits/{id}` returns `signature` and `signatureName`. Fresh visit: `signatureName: null`. After mobile signs → `signatureName` = entered name, `signature` = image data. Check both.

## Mobile build & launch (CRITICAL — verified 2026-05-26)
- **Must use the DEBUG apk** (`app-debug.apk` from release `mobile-apk-v1`, package `com.hydrocert.app`). The user-provided `app-release.apk` is **hardwired to PROD**: release defaults to PROD (`getDefaultEnvironment()` returns PROD when `!BuildConfig.DEBUG`) AND the env switcher (triple-tap logo) is gated behind `if (BuildConfig.DEBUG)` — so release cannot target dev at all. Debug defaults to dev.
- **Maestro 2.4 `launchApp` does not reliably foreground this build.** Launch via adb instead: `adb shell pm clear com.hydrocert.app && adb shell am start -n com.hydrocert.app/.MainActivity`. The flow's login.yaml does NOT launch — it drives the already-open login screen.
- **Debug build cold-starts slowly and can ANR.** Settle ~20s after launch, then dismiss the "Hydrocert isn't responding" dialog (tap "Wait") before running Maestro. `run-parity-test.sh` `launch_login`/`dismiss_anr` handle this.
- **Mobile login user:** dedicated engineer `parity.bot@hydrocert.com` / `ParityBot2026` (created via admin, `isEngineer:true`, GH secrets `HYDROCERT_PARITY_MOBILE_EMAIL/PASSWORD`). Password is alphanumeric on purpose — Maestro `inputText` mistypes special chars like `!`, which caused false "Invalid Credentials".
- **Navigate to the run's visit:** Visits Home search box ("Type to search...") + the visit reference (`VISIT_REF`) → "View Visit Details".
- **Schedule the visit for TODAY (near-future), NOT +24h (CRITICAL — verified 2026-05-27).** The mobile Visits Home list/search default scope reliably includes TODAY's visits; a `+24h` ("Tomorrow") visit intermittently does **not** appear in the list at all → the search finds nothing → every mobile flow fails at "View Visit Details" (whole run scores 1/9, only the API-only 2c passes). `buildVisitPayload` sets `from = now + 2h`. (Empirically: a `+24h`-dated visit returned "No visits found"; PATCHing the same visit's `from` to today made it appear and be found immediately.)

## FINDING (confirmed 2026-05-26): inspection actions don't render on mobile
Inspection-level actions created via the API (`POST /actions` with `inspectionId`) are **confirmed present in the backend** (`GET /actions?inspectionId=` returns all 3) but **do NOT render** in the mobile inspection's "Actions" ExpandableCard (`TankInspectionScreen.kt:727`). When expanded, the card shows only its header + the next "Missing inspection" toggle — no action rows. Visit-level actions (same call with `visitId`) DO render correctly on the visit-detail Actions card. This is a real web↔mobile parity gap — candidate for a QA bug (`/qa-case`). The parity suite therefore verifies check 2c via API (`checkInspectionActions`) and does not assert it on the mobile UI; re-add the mobile assertion (p01c) once the app renders these.

## Mobile surfaces (from source map)
- Inspection "Actions" ExpandableCard exists (`TankInspectionScreen.kt:727`) but renders empty for API-created actions (see FINDING above).
- Zero `testTag` in the app → all Maestro selectors use `text` or `contentDescription`.

## Fixtures summary (`scripts/parity/fixtures.dev.json` + runtime resolution)
- `jobTypeId`: `658f27c1-9306-42a2-81a6-ad249d7eaef3` (hardcode).
- `engineerId`: resolve at runtime = login as mobile QA user → `user.id`.
- `bookingPersonId`: e.g. `a5521817-8791-4a6d-9e5e-8f6028a8d28a` (or resolve at runtime from a sample visit).
- `siteId`: resolve at runtime (first visit with non-null `siteId`, or `GET /sites`).

## Full-coverage extension (verified 2026-05-27)
The suite now scores **9 checks** across both directions:

| Check | Dir | Flow | Field(s) |
|---|---|---|---|
| 2a-description | web→mobile | p01a | `visit.notes` → read-only "Description" card |
| 2b-visit-actions | web→mobile | p01b | 3 visit actions Hi/Med/Lo |
| 2c-inspection-actions | web→mobile (API) | — | 3 inspection actions (API-only; mobile render gap, F-01) |
| 2d-visit-text | web→mobile | p01d | `visit.waterSystemDescription` (API PATCH) → "Description & Reference" field |
| 3a-signature | mobile→web | p02 | `signature` + `signatureName` |
| 3b-visit-info | mobile→web | p03 | Assisting 1/2/**3** + Works being carried out |
| 3c-risk | mobile→web | p04 | **all 18** Risk Assessment "- Comments" fields |
| 3d-visit-text | mobile→web | p05 | waterSystemDescription / workDetails / samplingDetails (Visit Details card) |
| 3e-site-induction | mobile→web | p03b | "Site Induction required & Completed" dropdown |

- **`PATCH /visits/{id}` ACCEPTS `waterSystemDescription`** (→ 200, persists) even though `CreateVisitDto` rejects it. `UpdateVisitDto` is a different, permissive DTO. This is the web→mobile path for 2d.
- **`waterSystemDescription` ≠ `notes`.** `notes` shows in the read-only "Description" card (2a). `waterSystemDescription` shows in the editable "Description & Reference" field inside the expandable "Visit Details" card (2d / 3d). Two different widgets.
- **Mobile "Visit Details" card field labels** (expandable card on the visit screen, NOT the tab): `Description & Reference`→`waterSystemDescription`, `Work Details`→`workDetails`, `Water Sampling Details`→`samplingDetails`. Save = the visit-level "Save" button at the bottom.
- **"Visit Details" is ambiguous** — it is both a TAB (above the read-only "Description" notes card) and the editable CARD (below it). Maestro `tapOn "Visit Details"` hits the tab (a no-op). Disambiguate with a relative selector: `tapOn: { text: "Visit Details", below: { text: "Description" } }` → selects the card and expands it.
- **Site Induction dropdown options** (Visit Information form, jobType 658f27c1): `No Induction required`, `Yes - Induction completed`, `Yes - Induction not completed (see "other comments"...)`. p03b selects `Yes - Induction completed` (anchored `^...$` so it does not also match the "not completed" option). label === value, so the stored value equals the option text.
- **18 Risk Assessment "- Comments" fields** — p04 is generated from `RISK_COMMENT_FIELDS` in `setup-data.mjs` by `scripts/parity/gen-p04.mjs` (single source of truth). RA is the LAST card → after the final field, scroll DOWN to "Save" directly (collapsing by scrolling UP to the header is unreliable from the bottom of the long card).

## Emulator launch — cold-start ANR (debug build)
- The debug build ANRs repeatedly on cold start. **Set `adb shell settings put global hide_error_dialogs 1`** so the system "isn't responding" dialog never overlays the login screen (the dialog blocks Maestro, which cannot dismiss it). CI emulators benefit from the same.
- `uiautomator dump` returns **empty** for this Compose UI — do not poll it to detect screen readiness. Poll window focus (`dumpsys window | grep mCurrentFocus` → `com.hydrocert.app/.MainActivity`) instead.
- Local helper `runflow.sh` reads `runId` via `require('C:/Users/.../parity-context.json')` — must be a **Windows** path (`C:/...`), not a Git-Bash path (`/c/...`), or node throws and falls back to a stale RUN_ID, mistagging all typed values.
