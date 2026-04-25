# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository scope

This repo contains two coupled but distinct things:

1. **Hydro QA Tracker** — a standalone single-page bug/case tracker. UI is `index.html` (no build step), backend is `server.js` (Express, ESM). The tracker stores cases as **GitHub Issues** in the same repo using a server-side `GITHUB_TOKEN`; there is no database.
2. **QA automation suite for Hydrocert** (`https://dev.gen-cert.com`) — a large set of Playwright/Maestro/Node scripts under `scripts/`, plus YAML flows under `maestro-flows/` (web) and `mobile-flows-v2/` (Android), plus the change detectors under `scripts/webapp-ui-detector/` and `exploration-2026-04-12/change-detector/`. These tests target a *different* product (Hydrocert) than the tracker UI.

Do not conflate the two: changing the tracker (`index.html`/`server.js`) is unrelated to changing the QA test scripts, and they have separate dependencies (`express` for the tracker, `playwright`+`sharp` for QA).

## Commands

Tracker app:
- `npm start` — runs `node --env-file=.env server.js`, serves UI at `http://localhost:3000/qa` and API at `/qa/api/qa` (legacy `/api/qa` also routed).
- `npm run dev` — same with `--watch`.
- Requires `GITHUB_TOKEN` in `.env` (template in `.env.example`). Optional: `GITHUB_OWNER`, `GITHUB_REPO`, `PORT`.

Regression / QA automation:
- `npm run regression:bundle` — runs `scripts/run_regression_bundle.mjs`, the orchestrator. It picks a suite list based on `HYDROCERT_TARGET_ENV` (`dev`|`prod`) and `HYDROCERT_REGRESSION_MODE` (`standard`|`full`), writes everything under `qa-artifacts/infra-regression/<runLabel>/`, and produces `combined-summary.json`, `report.md`, and an Excel via `scripts/generate_regression_excel_dashboard.py` (requires `python3` + `openpyxl`).
- `npm run regression:bundle -- --dry-run` — prints the planned suite list without running anything.
- `npm run regression:role-access` — single-suite shortcut.
- `node scripts/run_webapp_ui_detector.mjs` — webapp UI change detector (run twice + `compare-summaries.mjs` for the stability self-check; see `scripts/webapp-ui-detector/README.md`).
- Playwright smoke: `npx playwright test --config=playwright.qasmoke.config.ts inspection-page.smoke.spec.ts` — note `baseURL` is `http://localhost:5173` and it reuses `playwright-auth-state.json` (gitignored), so a separate auth bootstrap must populate that file first.

There is **no `npm test`, no lint, no typecheck script** configured. Don't invent one.

## Required environment

QA scripts read these from the env (see `.env.example`):
- `HYDROCERT_QA_EMAIL`, `HYDROCERT_QA_PASSWORD` — admin login on `dev.gen-cert.com`.
- `HYDROCERT_WEB_BASE` (default `https://dev.gen-cert.com`), `HYDROCERT_API_BASE`.
- `MAESTRO_APP_EMAIL`, `MAESTRO_APP_PASSWORD` — Maestro flows interpolate these as `${MAESTRO_APP_EMAIL}` / `${MAESTRO_APP_PASSWORD}`. Never hardcode credentials in YAML or `.mjs` (commit `912bd0e` enforced this).

In CI these come from GitHub Secrets / repo Variables (see `.github/workflows/*.yml`). `.env` is gitignored; `.env.example` must contain placeholders only.

## Tracker architecture (`server.js` + `index.html`)

- **Storage model**: each QA case is a GitHub Issue in `${GITHUB_OWNER}/${GITHUB_REPO}` (defaults `DumitracheBogdan/Hydro-QA`). Issues are tagged with the `qa-tracker` label plus derived `status:*`, `priority:*`, `severity:*`, `qa:*` labels (slugified). The full structured payload is round-tripped via a JSON block in the issue body delimited by `<!-- QA_TRACKER_META_START ... QA_TRACKER_META_END -->` (see `buildIssueBody` / `parseIssueMeta` in `server.js`). When editing the schema, update *both* `sanitizeTaskPayload` and `issueToTask` symmetrically — they are the serialization contract.
- **Routing**: API is mounted twice (`/api/qa` and `/qa/api/qa`) so the app can be hosted under a `/qa` path on a shared host. Static files for `/qa` come from the repo root via `express.static(__dirname)`. Root `/` returns plaintext on purpose; do not redirect it.
- **List endpoint** paginates GitHub up to 10 pages × 100 issues and filters by `qa-tracker` label *or* presence of the meta marker — keep both filters when changing the query.
- **Strict team mode**: the UI assumes the backend is reachable; if not, create/edit is blocked client-side to prevent local-only state divergence. Don't add a localStorage fallback.

## QA suite architecture

`scripts/run_regression_bundle.mjs` is the central conductor. The contract every suite script must satisfy:
- Be runnable as `node scripts/<name>.mjs` with no args.
- Write artifacts under `qa-artifacts/.../<runName>/` and on stdout print exactly:
  - `SUMMARY_JSON=<absolute path to summary.json>`
  - `REPORT_MD=<absolute path to report.md>` (optional but expected)
- The `summary.json` shape is `{ totals: {pass,fail,skip,total}, checks: [{id, area, test, status, details}, ...] }`. The bundle merges `checks[]` across suites and tags each with the originating `suite` id.

Suite registry (`SUITES` map in `run_regression_bundle.mjs`) maps a key → `{id, label, script, tests}`. `selectedSuiteKeys(env, mode)` decides what runs:
- `dev` + `standard` → deep, api, roleaccess, ui, maestro
- `dev` + `full` → deep, api, roleaccess, ui, essential, soak, advanced, maestro
- `prod` + `standard` → deep, roleaccessreadonly, postdeployhardening, maestro
- `prod` + `full` → swaps `roleaccess` for `roleaccessreadonly` (prod must never run write-side role tests)

When adding a suite: register it in `SUITES`, add it to `selectedSuiteKeys` for the right env/mode, and make sure it emits the `SUMMARY_JSON=` / `REPORT_MD=` lines or the bundle throws.

Mobile V2 is intentionally **not** in the bundle — it runs in its own emulator job in `.github/workflows/nightly-regression.yml` and writes `qa-artifacts/mobile-v2/test/summary.json` directly.

## Change detectors

Two independent detectors, both diff a committed baseline against a fresh capture and warn-only on drift:

- **Webapp** (`scripts/webapp-ui-detector/` + `scripts/run_webapp_ui_detector.mjs`): Playwright crawls a fixed list of routes/states defined in `route-config.mjs`, captures `{role, accessibleName, text, selectorHint, bbox}` for every visible interactive element, runs `chrome-filter.mjs` to strip dynamic noise, and diffs against `webapp-baseline/pages.json`. The CI workflow runs the crawl **twice** and fails only if the two summaries diverge (flake guard) — real diffs are surfaced in an Excel report but never fail the build. The pinned QA visit UUID `c7687462-9a25-4969-a35f-70c8dbfe7c2a` must remain in the database; deleting it breaks the detector.
- **Mobile** (`exploration-2026-04-12/change-detector/`): Python (`scanner.py`/`reporter.py`/`alerter.py`/`run_detector.py`) against the Android app via Maestro. Baseline at `exploration-2026-04-12/change-detector/baseline.json`.

## Maestro flows

- `maestro-flows/` — web smoke (10 numbered files), targets `https://dev.gen-cert.com`. Run via `qa-maestro-web-smoke.mjs`.
- `mobile-flows-v2/` — Android app flows (38 numbered files + `_shared/` reusable subflows + `_discovery/`). Sequence is positional (the leading number matters); `_shared/login.yaml` etc. are included via `runFlow:` from other YAMLs.
- All credentials in YAML use `${MAESTRO_APP_EMAIL}` / `${MAESTRO_APP_PASSWORD}` — keep it that way.

## Baseline registries

`QA-BASELINE-REGISTRY.md` and `MOBILE-QA-BASELINE-REGISTRY.md` are the manually-maintained source of truth for "what UI elements exist on each page/screen." When the dev team adds new UI:
1. Update the registry table with the new elements.
2. Add a new numbered Maestro YAML in the matching folder.
3. Re-run existing flows to confirm no regression.

These docs are referenced by the registries themselves as the workflow — keep them in sync with the YAML inventory.

## CI/CD (`.github/workflows/`)

- `nightly-regression.yml` — Mon–Fri 00:00 UTC `standard`, Sun 00:00 UTC `full`. Sunday and `full` runs also trigger the mobile job (`post-deploy-regression-mobile.yml`) and webapp UI detector. Posts an Adaptive Card to Teams via `TEAMS_WEBHOOK_URL` secret.
- `post-deploy-regression.yml` — `workflow_dispatch` only, parameterized by `environment` (dev/prod) and `run_full_regression`.
- `mobile-ui-detector.yml`, `webapp-ui-detector.yml` — standalone detector runs.

Node version is pinned to **22** in workflows, Python to **3.12**. The bundle script writes machine-readable outputs to `$GITHUB_OUTPUT` (`output_dir`, `excel_path`, `total_tests`, `failed_tests`, …) — downstream steps depend on those names.

## Conventions

- ESM only (`"type": "module"`); use `import` + `.mjs` for scripts.
- Node 22+ features assumed (e.g. `--env-file=.env`, top-level `await`, `fs.cpSync`).
- All run artifacts go under `qa-artifacts/` (gitignored). Never commit them.
- `tmp-*.mjs` and `inspection-*.png` are gitignored — they are scratch/evidence files; don't promote them into the repo without renaming.
- Scripts under `scripts/tmp-dev-infra-*.mjs` are *not* tmp despite the prefix — they are wired into the regression bundle. Don't delete them based on the name.
