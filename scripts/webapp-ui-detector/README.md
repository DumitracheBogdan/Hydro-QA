# UI Change Detector — web-app

Detects unintended UI changes (missing buttons, renamed labels, removed pages, new elements) on
`https://dev.gen-cert.com` by walking each route with Playwright, capturing a structural inventory of
every interactive element, and diffing against a committed baseline. Produces an Excel report with
annotated PNGs.

Modeled after the existing mobile UI detector (`.github/workflows/mobile-ui-detector.yml`) but for web.

---

## What it does

Every nightly run (or on-demand from the Actions tab):

1. Logs into `dev.gen-cert.com` as the QA admin.
2. Visits a fixed set of routes + interaction states (8 captures total, see below).
3. For each capture: takes a full-page screenshot and walks the DOM for every visible
   `button | a[href] | input | select | textarea | [role=...] | h1 | h2 | h3 | label | th`,
   recording `{role, accessibleName, text, selectorHint, bbox}`.
4. Filters out dynamic noise (`<tbody>` rows, calendar cards, dates, currency, percentages,
   integers, "Showing X of Y", weekdays).
5. Diffs the cleaned inventory against `webapp-baseline/pages.json`.
6. Runs the **same crawl a second time** and asserts both summaries are identical — if they
   diverge, hard-fails with `FLAKE DETECTED` (stability self-check).
7. Renders an Excel report with one sheet per changed route and annotated screenshots
   (red circles around Missing/Introduced elements, with cropped per-element thumbnails embedded
   in a "Print-screen" column).
8. Uploads everything as a workflow artifact.

The detector **never fails the build** on a real diff (warn-only). The only thing that does fail
the build is the stability self-check (a flake = a bug in the detector itself, not in the webapp).

---

## Routes + states monitored

| Canonical key | URL | Elements | Notes |
|---|---|---|---|
| `/dashboard` | `/dashboard` | 29 | Welcome heading, stat-card labels, "Latest jobs" + "Latest Lab Results" toolbars. Stat values & growth deltas filtered. |
| `/visits` | `/visits` | 16 | Calendar header: Add New Visit, Day/Month toggle, All Engineers combobox. Visit cards filtered by `aria-label^="Scheduled visit"`. |
| `/customers` | `/customers` | 22 | Page heading, search + filter inputs, 7 column headers. Table rows filtered. |
| `/visits-list` | `/visits-list` | 25 | Page heading, filter toolbar (Search / Visit reference / Start Date / End Date / Assigned To / Booked By / Clear Filters), 8 column headers. Row buttons filtered. |
| `/visits/addnewvisit` | `/visits/addnewvisit` | 49 | Pure form: Cancel / Create Visit, all field labels, time comboboxes, Skill Requirement chips. |
| `/visits/details/qa-pinned` | `/visits/details/c7687462-9a25-4969-a35f-70c8dbfe7c2a` | 22 | The pinned QA visit `[qa]testing visit` — Back to Visits, Download Report, Visit Details / Inspections / Attachments tabs, Visit Details + Actions accordions (collapsed). |
| `/visits/details/qa-pinned@actions-expanded` | same URL, after clicking **Actions** | 23 | Adds `button "New Action"`. |
| `/visits/details/qa-pinned@new-action-modal` | same URL, after clicking **Actions → New Action** | 28 | Adds `heading "Add Action"`, `textbox "Search actions..."`, `button "Add Custom Action"`, `button "Cancel"`, `button "Add Action"`. |

`/planner` is intentionally excluded — the page is 100% dynamic site-card grid with no static chrome
worth detecting.

The pinned QA visit UUID `c7687462-9a25-4969-a35f-70c8dbfe7c2a` is hard-coded in
[`route-config.mjs`](./route-config.mjs). The visit must remain in the database; if it's deleted the
detector will report `lostPages` for the three QA-pinned states.

---

## Determinism strategy

Three independent layers eliminate noise from user-data churn, time, and dynamic counters:

### 1. DOM-level ancestor exclusion

In [`collect-inventory.mjs`](./collect-inventory.mjs), elements whose `closest()` matches any of
these selectors are dropped before they enter the inventory:

```js
EXCLUDE_ANCESTOR_SELECTORS = [
  'tbody',                                // table rows on /dashboard, /customers, /visits-list
  '[role="row"]',                         // generic row pattern
  '[role="rowgroup"]:not(:first-of-type)',
  '[aria-label^="Scheduled visit"]',      // /visits calendar visit cards
];
```

### 2. Browser-side text-pattern filter

In [`chrome-filter.mjs`](./chrome-filter.mjs), elements whose accessible name matches any pattern
are dropped after collection:

```js
DYNAMIC_TEXT_PATTERNS = [
  /^[£$€]\s?[\d,]+(\.\d+)?$/,             // £1,399,003.25
  /^[+-]?\d+(\.\d+)?\s?%$/,               // +12.5%, -20%
  /^\d{1,3}(,\d{3})+$/,                   // 1,399,003
  /^\d{1,6}$/,                            // plain integers (KPI counters)
  /^Showing\s+\d+\s+of\s+\d+/i,           // "Showing 20 of 570 results"
  /^Page\s+\d+\s+of\s+\d+/i,              // "Page 1 of 29"
  /^\(\d+\)$/,                            // (0), (12)
  /^(Today|Yesterday|Tomorrow)([\s,]|$)/i,
  /^(Sunday|Monday|...|Sat)\b/i,          // weekday names
  /^(Jan|Feb|...|Dec)\w*\s+\d{1,2}.../i,  // Apr 16, April 16 2026
  /^(Jan|Feb|...|Dec)\w*\s+\d{4}$/i,      // Apr 2026
  /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,          // 10/04/2026
  /^\d{4}-\d{2}-\d{2}/,                   // 2026-04-16
  /^\d{1,2}:\d{2}(:\d{2})?(\s*[AP]M)?$/i, // 16:20, 4:20 PM
];
```

Elements with empty accessible names are also dropped (icon-only buttons, unlabeled checkboxes
inside the action catalog).

### 3. Frozen clock + pinned locale/timezone

In [`../lib/webapp-login.mjs`](../lib/webapp-login.mjs):

```js
const FROZEN_CLOCK = new Date('2026-04-16T09:00:00.000Z');
// ...
const context = await browser.newContext({ viewport, locale: 'en-US', timezoneId: 'UTC' });
const page = await context.newPage();
await page.clock.setFixedTime(FROZEN_CLOCK);
```

This freezes `Date.now()`, `new Date()`, and time displays everywhere in the webapp. The "Today,
Apr 16" button on `/visits` will render the same string forever, so even if the regex filter were
removed, the page would still produce a stable inventory.

### 4. Pinned QA entity

Instead of crawling "the first row" of `/visits-list` (which changes constantly as agents create
test visits), the detector navigates directly to the QA visit `c7687462-9a25-4969-a35f-70c8dbfe7c2a`
(`[qa]testing visit`). This visit is created in the dev environment specifically for QA stability
and is not modified by other tests.

---

## Stability self-check

`compare-summaries.mjs` runs after the detector and compares the per-route counts of two
back-to-back runs. If any route's `missing` / `introduced` / `textChanged` differs between
run 1 and run 2, it exits non-zero with `FLAKE DETECTED` and lists the divergent routes.

This is the canonical "same commit, conflicting outcome = flake" signal used by Datadog,
CircleCI, and Cypress flake-detection. A passing self-check means: any diff the detector
reports is real, not flake.

In `nightly-regression.yml` the step has `continue-on-error: true` so a flake doesn't kill the
nightly run — the signal still appears in logs and the artifact contains both `summary-run1.json`
and `summary-run2.json` for inspection. In the dedicated `webapp-ui-detector.yml` workflow
the self-check is a hard gate.

---

## File map

```
scripts/
├── lib/
│   └── webapp-login.mjs          # launchAuthed() + clock freeze + locale/tz pin
├── webapp-ui-detector/
│   ├── README.md                 # this file
│   ├── route-config.mjs          # ROUTES list, EXCLUDE_ANCESTOR_SELECTORS, DYNAMIC_TEXT_PATTERNS
│   ├── crawler.mjs               # crawlRoutes() — visits each route+state, captures inventory + screenshot
│   ├── collect-inventory.mjs     # DOM walker (runs in page.evaluate)
│   ├── chrome-filter.mjs         # text-pattern filter (post-process)
│   ├── diff.mjs                  # diffPage / diffAll — set diff by ${role}::${name}
│   ├── annotate.mjs              # red-circle SVG composite via sharp
│   ├── publish-summary.mjs       # writes markdown to $GITHUB_STEP_SUMMARY
│   └── compare-summaries.mjs     # stability self-check
├── run_webapp_ui_detector.mjs    # orchestrator (login → crawl → diff → annotate → write artifacts)
└── generate_webapp_ui_detector_excel.py   # openpyxl report builder

webapp-baseline/                  # committed reference state (8 captures)
├── pages.json
└── screenshots/
    ├── dashboard.png
    ├── visits.png
    ├── customers.png
    ├── visits-list.png
    ├── visits-addnewvisit.png
    ├── visits-details-qa-pinned.png
    ├── visits-details-qa-pinned-actions-expanded.png
    └── visits-details-qa-pinned-new-action-modal.png

.github/workflows/
├── webapp-ui-detector.yml        # standalone manual workflow
└── nightly-regression.yml        # nightly integration (UI Change Detector web-app checkbox)
```

---

## Running it

### Locally

```bash
# from C:/Users/Coca-Cola/tmp-hydroqa/Hydro-QA
npm ci
npx playwright install --with-deps chromium

export HYDROCERT_WEB_BASE=https://dev.gen-cert.com
export HYDROCERT_QA_EMAIL=qa-admin@example.com
export HYDROCERT_QA_PASSWORD='***REMOVED***'

# Compare against committed baseline (default mode)
WEBAPP_UI_MODE=compare node scripts/run_webapp_ui_detector.mjs

# Build the Excel report
python scripts/generate_webapp_ui_detector_excel.py \
  --diff-json   qa-artifacts/webapp-ui-detector/diff.json \
  --screenshots qa-artifacts/webapp-ui-detector \
  --output      qa-artifacts/webapp-ui-detector/webapp-ui-detector.xlsx

# Self-check (run detector twice, verify identical results)
cp qa-artifacts/webapp-ui-detector/summary.json /tmp/run1.json
node scripts/run_webapp_ui_detector.mjs
cp qa-artifacts/webapp-ui-detector/summary.json /tmp/run2.json
node scripts/webapp-ui-detector/compare-summaries.mjs /tmp/run1.json /tmp/run2.json
```

### From GitHub Actions

**Standalone:** `Actions → UI Change Detector web-app → Run workflow`. Choose `mode = compare`
(default) or `mode = rebuild-baseline`. Artifact: `webapp-ui-detector-<mode>-<run_id>`.

**Nightly:** `Actions → Nightly Regression (DEV) → Run workflow → tick "UI Change Detector
web-app"`. Or set `mode = full` to enable everything automatically. Artifact:
`webapp-ui-detector-<run_id>`.

---

## Updating the baseline

When intentional UI changes ship to dev:

1. Confirm the change is live on `dev.gen-cert.com`.
2. Run `Actions → UI Change Detector web-app → Run workflow` with `mode = rebuild-baseline`.
3. Download the artifact. The `webapp-baseline/` folder inside contains the new baseline.
4. Replace the local `webapp-baseline/` folder with the downloaded one.
5. Commit + push:
   ```bash
   git add webapp-baseline/
   git commit -m "Update webapp UI baseline — <reason>"
   git push
   ```
6. The next compare run will be clean.

---

## Adding a new route

Edit [`route-config.mjs`](./route-config.mjs) and append to `ROUTES`:

```js
{ path: '/some-new-route', mode: 'chrome' },
```

For routes with dynamic IDs in the URL, pin a stable entity and set `canonicalAs`:

```js
{ path: '/orders/12345', mode: 'chrome', canonicalAs: '/orders/qa-pinned' },
```

Then run `mode = rebuild-baseline` and commit the new entry.

---

## Adding interaction states

Routes can capture multiple states by listing them in `states`. Each state runs a sequence of
clicks before capturing inventory + screenshot. Example:

```js
{
  path: '/some/page',
  mode: 'chrome',
  states: [
    { id: null },                        // default — just load the page
    {
      id: 'menu-open',
      interactions: [
        { kind: 'click', role: 'button', name: 'Open menu', exact: true, waitMs: 400 },
      ],
    },
  ],
},
```

The state id is appended to the canonical key as `@<id>`, producing distinct baseline entries
(`/some/page` and `/some/page@menu-open`). Each state navigates fresh so prior-state side effects
don't leak.

---

## Excel report structure

Per-route sheets (only for routes with non-zero diffs):

| Column | Content |
|---|---|
| Change Type | Missing / Introduced / TextChanged |
| Role | `button`, `link`, `heading`, `tab`, `combobox`, etc. |
| Accessible Name | The element's accessible name |
| Text | Inner text snippet |
| Selector Hint | CSS selector path (debugging only) |
| BBox (x, y, w, h) | Position in the captured screenshot |
| Print-screen | Cropped PNG of the element + 30 px padding with a red circle drawn around it |

Below the table, the full annotated baseline + current screenshots are embedded side-by-side at
~400 px wide for context.

A `Summary` sheet lists every monitored route with totals; cell color (teal / amber / red) reuses
the palette from `generate_regression_excel_dashboard.py`.

---

## Maintenance scenarios

| Scenario | Action |
|---|---|
| Real UI change shipped intentionally | Re-run `rebuild-baseline`, commit the new `webapp-baseline/`. |
| Detector reports phantom diff every nightly | Inspect the diff entry, identify the dynamic axis, add a regex to `DYNAMIC_TEXT_PATTERNS` or a selector to `EXCLUDE_ANCESTOR_SELECTORS`, rebuild baseline. |
| Self-check starts failing (`FLAKE DETECTED`) | A new dynamic element slipped through. Compare `summary-run1.json` vs `summary-run2.json` in the artifact, find the route with diverging counts, look at `crops/<slug>.{missing,introduced}-N.png` to see the element. Add it to the filter, rebuild baseline. |
| QA visit UUID becomes invalid | Create a new dummy visit named `[qa]testing visit`, copy its UUID, update `QA_PINNED_VISIT_UUID` in `route-config.mjs`, rebuild baseline. |
| Frozen clock date no longer makes sense | Bump `FROZEN_CLOCK` in `webapp-login.mjs`, rebuild baseline. |

---

## What it does NOT detect (by design)

- Pixel-level visual regressions (font rendering, color shifts, spacing tweaks). For that, layer
  Playwright `toHaveScreenshot()` on top — orthogonal concern.
- Server-side data correctness. The detector only sees what's in the DOM.
- Routes not in `ROUTES`. Adding `/planner` back, for instance, requires either explicit chrome
  selectors or accepting the noise from its dynamic site-card grid.
- Element behavior (does the button actually do something when clicked). The detector only
  asserts presence, not function — that's what end-to-end tests cover.
