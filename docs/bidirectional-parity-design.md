# Bidirectional Parity Test — Design Spec

**Date:** 2026-05-26
**Repo:** DumitracheBogdan/Hydro-QA
**Status:** Design (pending implementation plan)
**Environment:** dev only (`dev.gen-cert.com` / `api.dev.gen-cert.com`)

---

## 1. Goal

A new, manually-runnable GitHub Actions workflow in Hydro-QA that verifies **data parity between the Hydrocert webapp/backend and the Android mobile app, in both directions**, on a fresh test visit per run:

- **Web → Mobile**: data created via the backend API appears correctly on the mobile app.
- **Mobile → Web**: data entered on the mobile app persists back to the backend.

It ports the existing local `/qa-parity` skill (which uses MCP against a local emulator) into a CI workflow (Maestro on an emulator-in-CI + direct REST API).

## 2. Non-goals

- **No changes to the 3 product repos** (`hydrocert-web`, `hydrocert-services`, `hydrocert-android`). Read-only source analysis only.
- Not testing the webapp's *create* buttons via UI — visit/inspection creation is done via the REST API (decision: API is faster and more robust for setup; web UI buttons are already covered by `post-deploy-regression.yml` / `webapp-ui-detector.yml`).
- (Scope updated per user request) — a **full button inventory of both apps** IS in scope, extracted deterministically from source. See §5.
- Not running on prod. Dev only.

## 3. The parity contract (what we verify)

Ported from `/qa-parity` — 6 checks, each worth 1 point, reported as `X/6 PASS`:

| # | Direction | Datum | Created via | Verified via |
|---|-----------|-------|-------------|--------------|
| 2a | Web → Mobile | Visit description (`PARITY-<run_id>`) | API | Mobile (Maestro) |
| 2b | Web → Mobile | 3 visit-level Actions (High/Med/Low) | API | Mobile |
| 2c | Web → Mobile | 3 inspection-level Actions (High/Med/Low) | API | Mobile |
| 3a | Mobile → Web | Client signature + client name | Mobile (Maestro) | API |
| 3b | Mobile → Web | Visit Info fields (Assisting 1/2, Site Induction, Works) | Mobile | API |
| 3c | Mobile → Web | Risk Assessment (Lone Working, Risk Managed, comments) | Mobile | API |

**Corrected parity model:** the mobile app has **no "Add New Visit"** screen (web-only — confirmed in `MOBILE-QA-BASELINE-REGISTRY.md` Web-vs-Mobile table). So "add on mobile" realistically means signature / inspection fields / actions, not a new visit. The visit+inspection skeleton is created on the web/API side; mobile fills in detail; web reads back.

## 4. Architecture — single job, 4 phases (Approach B)

One job on `ubuntu-latest` using `reactivecircus/android-emulator-runner@v2` (same pattern as `post-deploy-regression-mobile.yml`). All state passed between phases via local files in the workspace (no cross-job artifact passing). Orchestrated by `scripts/run-parity-test.sh`.

```
Phase 0 — SETUP (REST API; no emulator interaction)
  POST /auth/login (booking/admin user)        -> accessToken
  resolve fixtures: engineerId (mobile QA user), siteId, jobTypeId, bookingPersonId
  POST /visits  { title:"PARITY-<run_id>", from, to, engineerIds:[QA], bookingPersonId, siteId }
                -> server auto-generates visitReference
  POST /inspections { visitId, jobTypeId }
  POST /actions x3  (visitId, name:"PARITY-<run_id> Hi/Med/Lo", priority high/medium/low)
  POST /actions x3  (inspectionId, ...)
  write parity-context.json { visitRef, visitId, inspectionId, expected{...} }

Phase 1 — WEB->MOBILE  (Maestro, parameterized -e VISIT_REF)
  search Visits Home / History for the tagged visit by VISIT_REF
  assert: description text visible; 6 actions visible (visit + inspection)

Phase 2 — MOBILE->WEB  (Maestro)
  open same visit; Client Signature: draw + name -> Submit -> Save
  inspection Visit Info: Assisting 1/2, Site Induction=Yes, Works -> Save
  inspection Risk Assessment: Lone Working=Yes, Risk Managed=Yes, comments -> Save

Phase 3 — VERIFY + REPORT  (REST API)
  GET /visits/{id}      -> assert signature, signatureName
  GET /inspections/{id} -> assert visit-info + risk-assessment fields
  write summary.json + HTML report (qa-parity report style)
```

`continue-on-error` per phase so a single failure still produces a full report. Each of the 6 sub-checks scored independently.

## 5. Button mapping — full inventory from source

Mapped **deterministically from source code** (not by scraping the UI), because source is authoritative and complete. Source scale (counted 2026-05-26): web = 16 pages, ~190 `onClick`, ~136 `Button/IconButton`, 33 `<button>`, shared `Button` component; mobile = 23 `*Screen` composables, 58 `Button`, 63 `.clickable`, 110 `onClick`, 228 `strings.xml` entries. ≈300 interactive elements total — tractable.

**Produced by 3 parallel per-repo extraction agents** (fan-out). Deliverables:

- **`docs/BUTTON-MAP-WEB.md`** — every page/component → interactive element. Per element: visible label (text/children), `data-testid` (if present), the handler/route it triggers, `file:line`. Resolve the shared `Button` component variants. Source: `hydrocert-web/src/...` (React 19 + Vite + Tailwind, no i18n → literal text).
- **`docs/BUTTON-MAP-MOBILE.md`** — every `*Screen` → `Button`/`TextButton`/`IconButton`/`FAB`/`.clickable`. Per element: label resolved via `stringResource(R.string.x)` against `app/src/main/res/values/strings.xml` (or literal `Text`), `testTag`/`contentDescription` if present, the `onClick` action, `file:line`. Source: `tmp-hydrocert-android/app/src/main/...` (Jetpack Compose, Kotlin).
- **`docs/API-MAP-BE.md`** — NestJS controllers → endpoints (method, path, purpose, key DTO fields), linked to the web/mobile button that calls each, where traceable. Source: `hydrocert-services/src/...`.
- **`docs/PARITY-CONTRACT.md`** — the cross-platform subset the workflow actually uses, derived from the three maps above: one row per parity datum linking **web/API field ↔ mobile selector (+ strategy) ↔ BE field**, e.g.:

  | Datum | Web/API field | Mobile selector | Selector strategy | BE field (write→read) |
  |-------|---------------|-----------------|-------------------|-----------------------|
  | Client name | `signatureName` | "Client Name" field | text (no testTag) | `signatureName` |
  | Visit description | `notes` | "Description & Reference" EditText | label-adjacent (Compose) | `notes` |

**Selector reality:** stable hooks are sparse (mobile ~53/320 files use `testTag`/`contentDescription`; web 13/162 `.tsx` use `data-testid`). We cannot add testids (no repo changes), so where no stable hook exists the selector falls back to source-derived literal text. Each map documents the selector strategy per element so flow fragility is visible upfront.

## 6. Backend API reference (from `hydrocert-services`)

Auth: `POST /auth/login {email,password}` → `{tokens.accessToken}`; pass `Authorization: Bearer <accessToken>`.

| Method | Path | Purpose | Key fields |
|--------|------|---------|-----------|
| POST | `/visits` | create visit | `title`,`from`,`to`,`engineerIds[]`,`bookingPersonId`,`siteId`; `visitReference` auto-gen if omitted |
| POST | `/inspections` | create inspection | `visitId` (+`jobTypeId`/`jobId` for form template) |
| POST | `/actions` | create action | `siteId` (+`visitId` or `inspectionId`), `name`, `priority` (low/medium/high) |
| GET | `/visits/filter?visitReference=` | find visit by ref (partial) | — |
| GET | `/visits/{id}` | read visit | returns `signature`, `signatureName`, `inspections`, `actions` |
| GET | `/inspections/{id}` | read inspection | returns forms/fields; samples as `laboratorySamples` on read |
| GET | `/actions?visitId=&inspectionId=` | read actions | — |

**Engineer assignment:** `engineerIds[]` on `POST /visits` creates `visit_engineers` rows → visit shows on that engineer's mobile app. The mobile QA user (`HYDROCERT_MOBILE_QA_EMAIL`) must be in `engineerIds`.

**Field name write→read drift to watch:** `engineerIds`→`visitEngineers`; `samples`→`laboratorySamples`; `products`→`inspectionProducts`. (Plus memory: PATCH on inspections is additive/merge, not replace.)

## 7. Fixtures resolution

`POST /visits` needs `siteId`, `bookingPersonId`, `engineerId`, and ideally `jobTypeId`. Strategy:
1. Resolve `engineerId` from the mobile QA user (login as them, or look up via a users endpoint).
2. Discover a usable `siteId` / `jobTypeId` / `bookingPersonId` on dev at runtime via GET endpoints; if a stable set exists, pin them in `scripts/parity/fixtures.dev.json` with a runtime-validation fallback.
3. Fail Phase 0 loudly with a clear message if fixtures can't be resolved (don't proceed to a meaningless mobile run).

## 8. APK delivery

The mobile build to test is the user-provided **`app-release.apk`** (build 2026-05-11, extracted to `tmp-hydroqa/app-release.apk`). CI can't read local `Downloads`, so it will be uploaded as a **GitHub release asset** in Hydro-QA (e.g. release tag `parity-apk`, asset `app-release.apk`); the workflow downloads it with `gh release download parity-apk -p app-release.apk`. This replaces the `mobile-apk-v1` / `app-debug.apk` source used by other workflows. Release build (not debug) — fine for Maestro (text/UI based).

## 9. Error handling / flakiness

CI on a cold emulator is flakier than the local emulator. Mitigations (some proven in `mobile-flows-v2/38_e2e_save_flow.yaml`):
- Pull-to-refresh + `extendedWaitUntil` before every Web→Mobile assertion.
- Async save: after tapping **Save**, scroll UP to a stable header to give the in-flight API call time to commit before navigating back (proven pattern).
- Fresh visit per run avoids the text-accumulation problem of reusing a fixed visit.
- Generous `emulator-boot-timeout`; `continue-on-error` per phase; explicit retry windows, not implicit sleeps.

## 10. Workflow interface

- Trigger: `workflow_dispatch` only (manual). Optional input `visit_ref` to reuse a specific visit for debugging (skips Phase 0 create).
- Reuses existing GH config: vars `HYDROCERT_DEV_WEB_BASE`, `HYDROCERT_DEV_API_BASE`; secrets `HYDROCERT_MOBILE_QA_EMAIL`, `HYDROCERT_MOBILE_QA_PASSWORD`. New secret needed for the API booking/admin user that can create visits (e.g. `HYDROCERT_DEV_API_EMAIL` / `_PASSWORD`) if different from the mobile QA user.
- Artifacts: screenshots, logs, `summary.json`, `report.html` (14-day retention, matching other workflows).

## 11. Components / files to create (all in Hydro-QA)

- `.github/workflows/bidirectional-parity.yml` — workflow (1 job, emulator).
- `scripts/run-parity-test.sh` — orchestrator (phases 0–3).
- `scripts/parity/setup-data.mjs` — Phase 0 (API create + write `parity-context.json`).
- `scripts/parity/verify-data.mjs` — Phase 3 (API read-back + compare).
- `scripts/parity/gen-report.mjs` — HTML report (qa-parity style).
- `scripts/parity/fixtures.dev.json` — pinned dev reference IDs (+ runtime fallback).
- `mobile-flows-parity/p01_web2mobile_verify.yaml` — find visit by `VISIT_REF`, assert description + 6 actions.
- `mobile-flows-parity/p02_mobile2web_signature.yaml`
- `mobile-flows-parity/p03_mobile2web_visit_info.yaml`
- `mobile-flows-parity/p04_mobile2web_risk_assessment.yaml`
- `mobile-flows-parity/_shared/` — login + navigate-to-tagged-visit helpers.
- `docs/BUTTON-MAP-WEB.md` — full web button inventory (from source).
- `docs/BUTTON-MAP-MOBILE.md` — full mobile button inventory (from source).
- `docs/API-MAP-BE.md` — backend endpoint map, linked to calling buttons.
- `docs/PARITY-CONTRACT.md` — the cross-platform parity subset (derived from the three maps).

## 12. Testing approach

- API scripts: dry-run against dev with a throwaway visit; assert created IDs come back on GET before wiring into the workflow.
- Maestro flows: validate locally against the running emulator (`hydrocert_QA_play_API35`) first, then in CI.
- Whole workflow: first CI run is the integration test; iterate on selectors/timing using uploaded screenshots+logs.

## 13. Open risks

1. **APK freshness** — `app-release.apk` (2026-05-11) must contain the inspection screens used by Phases 1–2. Verify on first run.
2. **Fixtures on dev** — if no stable site/jobType, Phase 0 must discover or create them.
3. **Sparse selectors** — text-based selectors are inherently more fragile than testids; the contract documents each, and CI screenshots make breakage diagnosable.
4. **Release-build differences** — minification could alter some nodes vs the debug build the other workflows use; validate on first run.

## 14. Constraints (from project memory)

- Hydro-QA: push direct to `main`, no PR.
- No Claude attribution in commits.
- Everything on dev; never touch product repo source.
