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
- **Navigate to the run's visit:** Visits Home search box ("Type to search...") + the visit reference (`VISIT_REF`) → "View Visit Details". Search finds future-dated visits (the fresh visit is scheduled +24h).

## Mobile surfaces (from source map)
- Inspection-level Actions DO exist on mobile (`TankInspectionScreen.kt:727` ExpandableCard "Actions") → 2c can be mobile-asserted.
- Zero `testTag` in the app → all Maestro selectors use `text` or `contentDescription`.

## Fixtures summary (`scripts/parity/fixtures.dev.json` + runtime resolution)
- `jobTypeId`: `658f27c1-9306-42a2-81a6-ad249d7eaef3` (hardcode).
- `engineerId`: resolve at runtime = login as mobile QA user → `user.id`.
- `bookingPersonId`: e.g. `a5521817-8791-4a6d-9e5e-8f6028a8d28a` (or resolve at runtime from a sample visit).
- `siteId`: resolve at runtime (first visit with non-null `siteId`, or `GET /sites`).
