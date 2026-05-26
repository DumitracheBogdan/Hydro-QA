# Bidirectional Parity Test — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a manually-triggered GitHub Actions workflow in Hydro-QA that verifies data parity between the Hydrocert backend/webapp and the Android app in both directions, on a fresh test visit per run, plus a full source-derived button map of all three product repos.

**Architecture:** One CI job on an Android emulator (Approach B, 4 phases): API setup → Maestro web→mobile assertions → Maestro mobile→web input → API verify + HTML report. State is passed between phases via local files. The button map is produced separately by reading source from the three product repos.

**Tech Stack:** GitHub Actions, `reactivecircus/android-emulator-runner`, Maestro (YAML flows), Node 22 (ESM, built-in `fetch` + `node:test`), Bash orchestrator, the user-provided `app-release.apk` delivered as a GitHub release asset.

**Spec:** `docs/bidirectional-parity-design.md`

**Repos (all local, read-only except Hydro-QA):**
- QA repo (target): `C:\Users\Coca-Cola\tmp-hydroqa\Hydro-QA` (remote `DumitracheBogdan/Hydro-QA`)
- Web FE: `C:\Users\Coca-Cola\hydrocert-web`
- Backend: `C:\Users\Coca-Cola\hydrocert-services`
- Mobile: `C:\Users\Coca-Cola\tmp-hydrocert-android`
- APK to publish: `C:\Users\Coca-Cola\tmp-hydroqa\app-release.apk`

**Conventions:** Hydro-QA pushes direct to `main`, no PR. No Claude attribution in commits. Dev only. Never modify product repo source.

---

## File Structure

**Created in Hydro-QA:**
- `docs/BUTTON-MAP-WEB.md` — full web button inventory (from source)
- `docs/BUTTON-MAP-MOBILE.md` — full mobile button inventory (from source)
- `docs/API-MAP-BE.md` — backend endpoint map linked to calling buttons
- `docs/PARITY-CONTRACT.md` — cross-platform parity subset used by the workflow
- `scripts/parity/api.mjs` — thin REST client (login/get/post), dependency-injected `fetch`
- `scripts/parity/setup-data.mjs` — Phase 0: create visit/inspection/actions, write `parity-context.json`
- `scripts/parity/verify-data.mjs` — Phase 3: read back via API, compare, write `summary.json`
- `scripts/parity/gen-report.mjs` — render `report.html` from `summary.json`
- `scripts/parity/discover-fixtures.mjs` — one-off: discover dev reference IDs
- `scripts/parity/fixtures.dev.json` — pinned dev reference IDs (engineerId, siteId, jobTypeId, bookingPersonId)
- `scripts/parity/api.test.mjs`, `setup-data.test.mjs`, `verify-data.test.mjs`, `gen-report.test.mjs` — unit tests (`node:test`)
- `scripts/run-parity-test.sh` — orchestrator invoked inside the emulator job
- `mobile-flows-parity/_shared/login.yaml` — Maestro login helper
- `mobile-flows-parity/_shared/open_tagged_visit.yaml` — find + open the run's visit by `VISIT_REF`
- `mobile-flows-parity/p01_web2mobile_verify.yaml` — assert description + 6 actions
- `mobile-flows-parity/p02_mobile2web_signature.yaml` — draw signature + name + Save
- `mobile-flows-parity/p03_mobile2web_visit_info.yaml` — Visit Info fields + Save
- `mobile-flows-parity/p04_mobile2web_risk_assessment.yaml` — Risk Assessment fields + Save
- `.github/workflows/bidirectional-parity.yml` — the workflow (1 job, emulator)

**Phases:** A=mapping, B=APK asset, C=API scripts (TDD), D=Maestro flows, E=orchestrator+report, F=workflow+CI iterate.

---

## Phase A — Source-derived button map (read-only)

These tasks read the three product repos and write Markdown. No TDD; verification is a spot-check against cited source lines. Run the three extraction tasks in parallel (one subagent per repo).

### Task A1: Web button map

**Files:**
- Create: `docs/BUTTON-MAP-WEB.md`

- [ ] **Step 1: Extract every interactive element from `hydrocert-web/src`**

Read `C:\Users\Coca-Cola\hydrocert-web\src`. For each page under `src/pages/*` and shared component, enumerate interactive elements: `<button>`, the shared `<Button>`/`<IconButton>` (`src/components/Button/`), `onClick=` handlers, `<Link>`, `MenuItem`, `Tab`. The app is React 19 + Vite + Tailwind with **no i18n** (text is literal).

For each element capture: **page/screen**, **visible label** (children text or `aria-label`), **`data-testid`** if present, **action/route triggered** (handler name, navigation target, or API call), **`file:line`**.

- [ ] **Step 2: Write `docs/BUTTON-MAP-WEB.md`**

Group by page. One table per page with columns: `Element | Label | data-testid | Triggers (handler/route/API) | Selector strategy | Source (file:line)`. "Selector strategy" = `data-testid` when present, else `text`. Add a top summary line with element counts per page.

- [ ] **Step 3: Spot-check 5 random rows**

Open the cited `file:line` for 5 rows and confirm the label/testid match the source. Fix mismatches.

- [ ] **Step 4: Commit**

```bash
cd /c/Users/Coca-Cola/tmp-hydroqa/Hydro-QA
git add docs/BUTTON-MAP-WEB.md
git -c commit.gpgsign=false commit -m "docs: full web button map from source"
```

### Task A2: Mobile button map

**Files:**
- Create: `docs/BUTTON-MAP-MOBILE.md`

- [ ] **Step 1: Build the strings lookup**

Read `C:\Users\Coca-Cola\tmp-hydrocert-android\app\src\main\res\values\strings.xml` (228 entries) into a name→value map. This resolves `stringResource(R.string.x)` to displayed text.

- [ ] **Step 2: Extract interactive elements per screen**

For each `*Screen` composable under `app/src/main/`, enumerate `Button`, `TextButton`, `OutlinedButton`, `IconButton`, `FloatingActionButton`, and `Modifier.clickable`. For each capture: **screen**, **label** (resolve `stringResource` via the map, or literal `Text`), **`testTag`** / **`contentDescription`** if present, **`onClick` action** (function/navigation), **`file:line`**.

- [ ] **Step 3: Write `docs/BUTTON-MAP-MOBILE.md`**

Group by screen. Columns: `Element | Label (resolved) | testTag/contentDesc | onClick action | Selector strategy | Source (file:line)`. "Selector strategy" = `testTag`/`contentDescription` when present, else `text`. Top summary with counts per screen.

- [ ] **Step 4: Spot-check 5 rows + verify 3 string resolutions** against `strings.xml`. Fix mismatches.

- [ ] **Step 5: Commit**

```bash
git add docs/BUTTON-MAP-MOBILE.md
git -c commit.gpgsign=false commit -m "docs: full mobile button map from source"
```

### Task A3: Backend endpoint map

**Files:**
- Create: `docs/API-MAP-BE.md`

- [ ] **Step 1: Enumerate endpoints from controllers + OpenAPI**

Read controllers under `C:\Users\Coca-Cola\hydrocert-services\src\**\controllers` and `C:\Users\Coca-Cola\hydrocert-services\openapi-spec.json`. List every route: method, path, purpose, key request DTO fields, auth requirement.

- [ ] **Step 2: Write `docs/API-MAP-BE.md`**

One table grouped by resource (auth, visits, inspections, actions, users, sites, jobs, ...). Columns: `Method | Path | Purpose | Key body/query fields | Auth | Source (file:line)`. Add a "Write→Read field drift" note section (`engineerIds`→`visitEngineers`, `samples`→`laboratorySamples`, `products`→`inspectionProducts`).

- [ ] **Step 3: Spot-check 5 endpoints** against controller source. Fix mismatches.

- [ ] **Step 4: Commit**

```bash
git add docs/API-MAP-BE.md
git -c commit.gpgsign=false commit -m "docs: backend endpoint map from source"
```

### Task A4: Parity contract

**Files:**
- Create: `docs/PARITY-CONTRACT.md`

- [ ] **Step 1: Derive the parity subset**

Using A1–A3, build the cross-platform contract for the 6 parity checks (description, visit actions, inspection actions, signature, visit-info fields, risk-assessment fields). For each datum, one row: `Datum | Web/API field | Mobile selector (+strategy) | BE write field → read field`.

- [ ] **Step 2: Write `docs/PARITY-CONTRACT.md`** with that table + a short note that mobile selectors fall back to source-derived text where no `testTag` exists.

- [ ] **Step 3: Commit**

```bash
git add docs/PARITY-CONTRACT.md
git -c commit.gpgsign=false commit -m "docs: cross-platform parity contract"
```

---

## Phase B — Publish the APK as a release asset

### Task B1: Upload `app-release.apk` to a GitHub release

**Files:** none (GitHub release asset only)

- [ ] **Step 1: Verify the APK exists and is valid**

Run: `ls -la /c/Users/Coca-Cola/tmp-hydroqa/app-release.apk && unzip -l /c/Users/Coca-Cola/tmp-hydroqa/app-release.apk | grep -E "AndroidManifest|classes.dex"`
Expected: ~60MB file; `AndroidManifest.xml` and `classes.dex` listed.

- [ ] **Step 2: Create/replace the `parity-apk` release and upload the asset**

```bash
cd /c/Users/Coca-Cola/tmp-hydroqa/Hydro-QA
gh release view parity-apk -R DumitracheBogdan/Hydro-QA >/dev/null 2>&1 \
  && gh release upload parity-apk /c/Users/Coca-Cola/tmp-hydroqa/app-release.apk --clobber -R DumitracheBogdan/Hydro-QA \
  || gh release create parity-apk /c/Users/Coca-Cola/tmp-hydroqa/app-release.apk \
       -R DumitracheBogdan/Hydro-QA -t "Parity test APK" -n "app-release.apk (build 2026-05-11) for bidirectional-parity workflow"
```

- [ ] **Step 3: Verify the asset is downloadable**

Run: `gh release download parity-apk -p app-release.apk -D /tmp -R DumitracheBogdan/Hydro-QA --clobber && ls -la /tmp/app-release.apk`
Expected: file downloads, ~60MB.

---

## Phase C — API scripts (TDD, Node 22 ESM)

All scripts use built-in `fetch`; no npm deps. Tests use `node:test`. Run tests with `node --test scripts/parity/`.

### Task C1: REST client `api.mjs`

**Files:**
- Create: `scripts/parity/api.mjs`
- Test: `scripts/parity/api.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// scripts/parity/api.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeClient } from './api.mjs';

test('login posts credentials and stores bearer token', async () => {
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, status: 200, json: async () => ({ tokens: { accessToken: 'TKN' }, user: { id: 'U1' } }) };
  };
  const c = makeClient('https://api.dev.example', fakeFetch);
  const user = await c.login('a@b.c', 'pw');
  assert.equal(user.id, 'U1');
  assert.equal(calls[0].url, 'https://api.dev.example/auth/login');
  assert.equal(JSON.parse(calls[0].opts.body).email, 'a@b.c');
});

test('get sends bearer token after login', async () => {
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, opts });
    if (url.endsWith('/auth/login')) return { ok: true, status: 200, json: async () => ({ tokens: { accessToken: 'TKN' }, user: { id: 'U1' } }) };
    return { ok: true, status: 200, json: async () => ([{ id: 'V1' }]) };
  };
  const c = makeClient('https://api.dev.example', fakeFetch);
  await c.login('a@b.c', 'pw');
  await c.get('/visits/filter?visitReference=VN1');
  assert.equal(calls[1].opts.headers.Authorization, 'Bearer TKN');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/parity/api.test.mjs`
Expected: FAIL — `makeClient` not exported / module not found.

- [ ] **Step 3: Implement `api.mjs`**

```js
// scripts/parity/api.mjs
export function makeClient(baseUrl, fetchImpl = fetch) {
  let token = null;
  const base = baseUrl.replace(/\/$/, '');
  async function parse(res, method, path) {
    if (!res.ok) {
      let body = '';
      try { body = JSON.stringify(await res.json()); } catch { /* non-json */ }
      throw new Error(`${method} ${path} -> ${res.status} ${body}`);
    }
    if (res.status === 204) return null;
    try { return await res.json(); } catch { return null; }
  }
  return {
    async login(email, password) {
      const res = await fetchImpl(`${base}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await parse(res, 'POST', '/auth/login');
      token = data?.tokens?.accessToken;
      if (!token) throw new Error('login: no accessToken in response');
      return data.user;
    },
    async get(path) {
      const res = await fetchImpl(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
      return parse(res, 'GET', path);
    },
    async post(path, body) {
      const res = await fetchImpl(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      return parse(res, 'POST', path);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/parity/api.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/parity/api.mjs scripts/parity/api.test.mjs
git -c commit.gpgsign=false commit -m "feat(parity): REST client with injectable fetch"
```

### Task C2: Fixture discovery `discover-fixtures.mjs`

**Files:**
- Create: `scripts/parity/discover-fixtures.mjs`
- Create: `scripts/parity/fixtures.dev.json`

- [ ] **Step 1: Implement the discovery script**

This is an interactive/one-off script run by a human against dev to obtain real reference IDs. It uses `API-MAP-BE.md` (Task A3) to choose the read endpoints. If a list endpoint differs from the guesses below, adjust the paths to match `API-MAP-BE.md`.

```js
// scripts/parity/discover-fixtures.mjs
// Usage: HYDROCERT_API_BASE=... API_EMAIL=... API_PASSWORD=... QA_EMAIL=... node scripts/parity/discover-fixtures.mjs
import { makeClient } from './api.mjs';

const base = process.env.HYDROCERT_API_BASE;
const c = makeClient(base);
await c.login(process.env.API_EMAIL, process.env.API_PASSWORD);

// Engineer (mobile QA user) id — adjust path per API-MAP-BE.md if needed
const users = await c.get(`/users?search=${encodeURIComponent(process.env.QA_EMAIL)}`).catch(() => null);
const engineer = Array.isArray(users?.items ? users.items : users)
  ? (users.items ?? users).find(u => u.email === process.env.QA_EMAIL) : null;

// A usable site + jobType + booking person from the first detailed visit
const detailed = await c.get('/visits/detailed?page=1&limit=5');
const sample = detailed.items?.[0] ?? {};

console.log(JSON.stringify({
  engineerId: engineer?.id ?? 'RESOLVE_MANUALLY',
  bookingPersonId: sample.bookingPerson?.id ?? 'RESOLVE_MANUALLY',
  siteId: sample.site?.id ?? 'RESOLVE_MANUALLY',
  jobTypeId: sample.inspections?.[0]?.jobTypeId ?? 'RESOLVE_MANUALLY',
}, null, 2));
```

- [ ] **Step 2: Run against dev and capture real IDs**

Run (PowerShell): `$env:HYDROCERT_API_BASE=...; $env:API_EMAIL=...; $env:API_PASSWORD=...; $env:QA_EMAIL=...; node scripts/parity/discover-fixtures.mjs`
Expected: JSON with four real UUIDs and no `RESOLVE_MANUALLY`. If any is `RESOLVE_MANUALLY`, consult `API-MAP-BE.md` for the correct list endpoint and re-run.

- [ ] **Step 3: Write the resolved IDs to `scripts/parity/fixtures.dev.json`**

```json
{
  "engineerId": "<uuid from step 2>",
  "bookingPersonId": "<uuid from step 2>",
  "siteId": "<uuid from step 2>",
  "jobTypeId": "<uuid from step 2>"
}
```

- [ ] **Step 4: Commit**

```bash
git add scripts/parity/discover-fixtures.mjs scripts/parity/fixtures.dev.json
git -c commit.gpgsign=false commit -m "feat(parity): dev fixture discovery + pinned reference IDs"
```

### Task C3: Setup data `setup-data.mjs`

**Files:**
- Create: `scripts/parity/setup-data.mjs`
- Test: `scripts/parity/setup-data.test.mjs`

- [ ] **Step 1: Write the failing test (pure payload builder)**

```js
// scripts/parity/setup-data.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildVisitPayload, buildExpected } from './setup-data.mjs';

test('buildVisitPayload tags the title and assigns the engineer', () => {
  const fx = { engineerId: 'E1', bookingPersonId: 'B1', siteId: 'S1', jobTypeId: 'J1' };
  const p = buildVisitPayload('RUN42', fx, new Date('2026-05-26T10:00:00Z'));
  assert.equal(p.title, 'PARITY-RUN42');
  assert.deepEqual(p.engineerIds, ['E1']);
  assert.equal(p.bookingPersonId, 'B1');
  assert.equal(p.siteId, 'S1');
  assert.ok(p.from && p.to && new Date(p.to) > new Date(p.from));
  assert.equal('visitReference' in p, false); // server auto-generates
});

test('buildExpected lists the 6 parity datapoints with the run tag', () => {
  const e = buildExpected('RUN42');
  assert.match(e.description, /PARITY-RUN42/);
  assert.equal(e.visitActions.length, 3);
  assert.equal(e.inspectionActions.length, 3);
  assert.deepEqual(e.visitActions.map(a => a.priority).sort(), ['high', 'low', 'medium']);
  assert.match(e.signatureName, /PARITY-RUN42/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/parity/setup-data.test.mjs`
Expected: FAIL — exports not found.

- [ ] **Step 3: Implement `setup-data.mjs`**

```js
// scripts/parity/setup-data.mjs
import { writeFileSync, readFileSync } from 'node:fs';
import { makeClient } from './api.mjs';

export function buildVisitPayload(runId, fx, now = new Date()) {
  const from = new Date(now.getTime() + 24 * 3600 * 1000);
  const to = new Date(from.getTime() + 2 * 3600 * 1000);
  return {
    title: `PARITY-${runId}`,
    from: from.toISOString(),
    to: to.toISOString(),
    engineerIds: [fx.engineerId],
    bookingPersonId: fx.bookingPersonId,
    siteId: fx.siteId,
  };
}

export function buildExpected(runId) {
  const tag = `PARITY-${runId}`;
  const acts = [
    { name: `${tag} Hi`, priority: 'high' },
    { name: `${tag} Med`, priority: 'medium' },
    { name: `${tag} Lo`, priority: 'low' },
  ];
  return {
    tag,
    description: `${tag} description`,
    visitActions: acts,
    inspectionActions: acts,
    signatureName: `${tag} Client`,
    visitInfo: { assisting1: `${tag} Inspector 1`, assisting2: `${tag} Inspector 2`, works: `${tag} Works` },
    riskAssessment: { comments: `${tag} risk area comment` },
  };
}

async function main() {
  const runId = process.env.RUN_ID || String(Date.now());
  const base = process.env.HYDROCERT_API_BASE;
  const fx = JSON.parse(readFileSync(new URL('./fixtures.dev.json', import.meta.url)));
  const c = makeClient(base);
  await c.login(process.env.API_EMAIL, process.env.API_PASSWORD);

  const expected = buildExpected(runId);
  const visitPayload = { ...buildVisitPayload(runId, fx), notes: expected.description };
  await c.post('/visits', visitPayload);

  // Server auto-generates the reference; find our visit by the tagged title via filter, newest first.
  const matches = await c.get(`/visits/filter?visitReference=PARITY`).catch(() => []);
  // Fallback: list detailed and match by title (filter is by reference; title match is the reliable key).
  const detailed = await c.get('/visits/detailed?page=1&limit=25');
  const visit = (detailed.items || []).find(v => v.title === expected.tag);
  if (!visit) throw new Error(`setup: created visit titled ${expected.tag} not found`);

  const inspection = await c.post('/inspections', { visitId: visit.id, jobTypeId: fx.jobTypeId });

  for (const a of expected.visitActions) await c.post('/actions', { siteId: fx.siteId, visitId: visit.id, name: a.name, priority: a.priority });
  for (const a of expected.inspectionActions) await c.post('/actions', { siteId: fx.siteId, inspectionId: inspection.id, name: a.name, priority: a.priority });

  const ctx = { runId, visitId: visit.id, visitRef: visit.visitReference, inspectionId: inspection.id, expected };
  writeFileSync('parity-context.json', JSON.stringify(ctx, null, 2));
  console.log(`SETUP OK visitRef=${visit.visitReference} visitId=${visit.id} inspectionId=${inspection.id}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/parity/setup-data.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Dry-run against dev** (integration)

Run (PowerShell): `$env:RUN_ID='LOCAL1'; $env:HYDROCERT_API_BASE=...; $env:API_EMAIL=...; $env:API_PASSWORD=...; node scripts/parity/setup-data.mjs`
Expected: prints `SETUP OK visitRef=VN... visitId=... inspectionId=...`; `parity-context.json` written. Open the visit in the dev webapp and confirm the 6 actions + description exist.

- [ ] **Step 6: Commit**

```bash
git add scripts/parity/setup-data.mjs scripts/parity/setup-data.test.mjs
git -c commit.gpgsign=false commit -m "feat(parity): API setup creates tagged visit/inspection/actions"
```

### Task C4: Verify data `verify-data.mjs`

**Files:**
- Create: `scripts/parity/verify-data.mjs`
- Test: `scripts/parity/verify-data.test.mjs`

- [ ] **Step 1: Write the failing test (pure comparator)**

```js
// scripts/parity/verify-data.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSignature, checkVisitInfo } from './verify-data.mjs';

test('checkSignature passes when name + signature present', () => {
  const r = checkSignature({ signature: 'data:image/png;base64,AAA', signatureName: 'PARITY-RUN42 Client' }, { signatureName: 'PARITY-RUN42 Client' });
  assert.equal(r.status, 'PASS');
});

test('checkSignature fails when signature missing', () => {
  const r = checkSignature({ signature: '', signatureName: '' }, { signatureName: 'PARITY-RUN42 Client' });
  assert.equal(r.status, 'FAIL');
});

test('checkVisitInfo reports per-field results', () => {
  const r = checkVisitInfo({ assisting1: 'PARITY-RUN42 Inspector 1' }, { assisting1: 'PARITY-RUN42 Inspector 1', assisting2: 'x', works: 'y' });
  assert.equal(r.status, 'FAIL'); // assisting2 + works missing
  assert.equal(r.fields.assisting1, true);
  assert.equal(r.fields.assisting2, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/parity/verify-data.test.mjs`
Expected: FAIL — exports not found.

- [ ] **Step 3: Implement `verify-data.mjs`**

The read-side field paths (where signature/visit-info/risk-assessment live in the inspection response) must be confirmed against `inspection.dto.ts` / `API-MAP-BE.md`. The functions below take already-extracted flat objects so the extraction layer is the only part that needs those paths.

```js
// scripts/parity/verify-data.mjs
import { writeFileSync, readFileSync } from 'node:fs';
import { makeClient } from './api.mjs';

export function checkSignature(visit, expected) {
  const ok = !!visit.signature && visit.signatureName === expected.signatureName;
  return { id: '3a-signature', direction: 'Mobile→Web', status: ok ? 'PASS' : 'FAIL',
    details: `name="${visit.signatureName}" hasImage=${!!visit.signature}` };
}

export function checkVisitInfo(actual, expected) {
  const fields = {};
  for (const k of Object.keys(expected)) fields[k] = (actual[k] || '') === expected[k];
  const ok = Object.values(fields).every(Boolean);
  return { id: '3b-visit-info', direction: 'Mobile→Web', status: ok ? 'PASS' : 'FAIL', fields,
    details: JSON.stringify(fields) };
}

export function checkRisk(actual, expected) {
  const ok = (actual.comments || '') === expected.comments;
  return { id: '3c-risk', direction: 'Mobile→Web', status: ok ? 'PASS' : 'FAIL',
    details: `comments match=${ok}` };
}

// Extraction: map the inspection form response to flat visitInfo/risk objects.
// Confirm these field paths against inspection.dto.ts before relying on them.
export function extractInspectionFields(inspection) {
  const forms = inspection.inspectionForms || [];
  const flat = {};
  for (const f of forms) for (const field of (f.fields || [])) flat[field.key ?? field.name] = field.value;
  return {
    visitInfo: { assisting1: flat.assisting1, assisting2: flat.assisting2, works: flat.works },
    risk: { comments: flat.loneWorkingComments ?? flat.riskComments },
  };
}

async function main() {
  const ctx = JSON.parse(readFileSync('parity-context.json'));
  const c = makeClient(process.env.HYDROCERT_API_BASE);
  await c.login(process.env.API_EMAIL, process.env.API_PASSWORD);

  const visit = await c.get(`/visits/${ctx.visitId}`);
  const inspection = await c.get(`/inspections/${ctx.inspectionId}`);
  const { visitInfo, risk } = extractInspectionFields(inspection);

  const checks = [
    checkSignature(visit, ctx.expected),
    checkVisitInfo(visitInfo, ctx.expected.visitInfo),
    checkRisk(risk, ctx.expected.riskAssessment),
  ];
  // Web→Mobile checks (2a/2b/2c) come from the Maestro phase result file.
  let mobileChecks = [];
  try { mobileChecks = JSON.parse(readFileSync('parity-mobile-results.json')).checks || []; } catch { /* may be absent on early failure */ }

  const all = [...mobileChecks, ...checks];
  const passed = all.filter(c => c.status === 'PASS').length;
  const summary = { runId: ctx.runId, visitRef: ctx.visitRef, total: all.length, passed, failed: all.length - passed, checks: all };
  writeFileSync('summary.json', JSON.stringify(summary, null, 2));
  console.log(`VERIFY ${passed}/${all.length} PASS`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/parity/verify-data.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Confirm read-side field paths**

Open `C:\Users\Coca-Cola\hydrocert-services\src\inspection\dto\inspection.dto.ts` and confirm how visit-info / risk-assessment field values are represented in the GET response. Adjust `extractInspectionFields` keys to match. Re-run the dry-run from C3, then `node scripts/parity/verify-data.mjs` and confirm `summary.json`.

- [ ] **Step 6: Commit**

```bash
git add scripts/parity/verify-data.mjs scripts/parity/verify-data.test.mjs
git -c commit.gpgsign=false commit -m "feat(parity): API verify + summary.json"
```

### Task C5: HTML report `gen-report.mjs`

**Files:**
- Create: `scripts/parity/gen-report.mjs`
- Test: `scripts/parity/gen-report.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// scripts/parity/gen-report.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderReport } from './gen-report.mjs';

test('renderReport shows score banner and a row per check', () => {
  const html = renderReport({ runId: 'R1', visitRef: 'VN9', total: 2, passed: 1, failed: 1,
    checks: [ { id: '2a', direction: 'Web→Mobile', status: 'PASS', details: 'ok' },
              { id: '3a', direction: 'Mobile→Web', status: 'FAIL', details: 'no sig' } ] });
  assert.match(html, /1\/2 PASS/);
  assert.match(html, /VN9/);
  assert.match(html, /2a/);
  assert.match(html, /3a/);
  assert.match(html, /FAIL/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/parity/gen-report.test.mjs`
Expected: FAIL — `renderReport` not found.

- [ ] **Step 3: Implement `gen-report.mjs`**

```js
// scripts/parity/gen-report.mjs
import { writeFileSync, readFileSync } from 'node:fs';

export function renderReport(s) {
  const badge = v => `<span class="b ${v.toLowerCase()}">${v}</span>`;
  const rows = s.checks.map(c =>
    `<tr><td><code>${c.id}</code></td><td>${c.direction}</td><td>${badge(c.status)}</td><td>${c.details || ''}</td></tr>`).join('');
  const overall = s.failed === 0 ? 'PASS' : 'ATTENTION';
  return `<!doctype html><meta charset="utf-8"><title>Parity ${s.runId}</title>
<style>body{font:14px system-ui;margin:24px;color:#111}.banner{padding:16px;border-radius:8px;font-size:20px;font-weight:600;color:#fff;background:${s.failed === 0 ? '#16a34a' : '#dc2626'}}
table{border-collapse:collapse;margin-top:16px;width:100%}td,th{border:1px solid #ddd;padding:8px;text-align:left}
.b{padding:2px 8px;border-radius:4px;color:#fff;font-size:12px}.b.pass{background:#16a34a}.b.fail{background:#dc2626}
code{background:#f3f4f6;padding:1px 4px;border-radius:3px}.grid{display:flex;gap:24px;margin-top:12px}</style>
<div class="banner">${s.passed}/${s.total} PASS — ${overall}</div>
<div class="grid"><div>Run: <code>${s.runId}</code></div><div>Visit: <code>${s.visitRef}</code></div>
<div>Passed: ${s.passed}</div><div>Failed: ${s.failed}</div></div>
<table><tr><th>Check</th><th>Direction</th><th>Result</th><th>Details</th></tr>${rows}</table>
<footer style="margin-top:24px;color:#888">Generated by Hydro-QA bidirectional-parity — ${s.runId}</footer>`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = JSON.parse(readFileSync('summary.json'));
  writeFileSync('report.html', renderReport(s));
  console.log('report.html written');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/parity/gen-report.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/parity/gen-report.mjs scripts/parity/gen-report.test.mjs
git -c commit.gpgsign=false commit -m "feat(parity): HTML report generator"
```

---

## Phase D — Maestro parity flows

Author against the running local emulator first (`adb devices` should show the API35 device), then in CI. Pass the run's visit via `-e VISIT_REF`. Selectors come from `PARITY-CONTRACT.md` / `BUTTON-MAP-MOBILE.md`. Reuse the proven async-save pattern from `mobile-flows-v2/38_e2e_save_flow.yaml` (scroll UP after Save before navigating back).

### Task D1: Shared helpers

**Files:**
- Create: `mobile-flows-parity/_shared/login.yaml`
- Create: `mobile-flows-parity/_shared/open_tagged_visit.yaml`

- [ ] **Step 1: Write `_shared/login.yaml`** (adapt from `mobile-flows-v2/_shared` login if present)

```yaml
appId: com.hydrocert.app
---
- launchApp:
    clearState: true
- runFlow:
    when:
      visible: "Email.*"
    commands:
      - tapOn: { below: { text: "Email.*" } }
      - inputText: ${MAESTRO_APP_EMAIL}
      - tapOn: { below: { text: "Password.*" } }
      - inputText: ${MAESTRO_APP_PASSWORD}
      - hideKeyboard
      - tapOn: "Login"
- extendedWaitUntil:
    visible: "Welcome.*"
    timeout: 30000
```

- [ ] **Step 2: Write `_shared/open_tagged_visit.yaml`** — find the visit by `VISIT_REF` and open it

```yaml
appId: com.hydrocert.app
---
- tapOn:
    id: "search"
    optional: true
- tapOn:
    text: "Type to search.*"
    optional: true
- inputText: ${VISIT_REF}
- hideKeyboard
- extendedWaitUntil:
    visible: ".*${VISIT_REF}.*"
    timeout: 20000
- scrollUntilVisible:
    element: { text: "View Visit Details" }
    direction: DOWN
    timeout: 20000
- tapOn: "View Visit Details"
- extendedWaitUntil:
    visible: "Inspections.*"
    timeout: 15000
```

- [ ] **Step 3: Verify login + open flow locally**

Run: `maestro test -e MAESTRO_APP_EMAIL=$QA_EMAIL -e MAESTRO_APP_PASSWORD=$QA_PW -e VISIT_REF=<a real dev visit ref> mobile-flows-parity/_shared/open_tagged_visit.yaml`
Expected: flow reaches the visit detail (Inspections tab visible). Adjust search-box selector against `BUTTON-MAP-MOBILE.md` if the tap misses.

- [ ] **Step 4: Commit**

```bash
git add mobile-flows-parity/_shared
git -c commit.gpgsign=false commit -m "feat(parity): Maestro login + open-tagged-visit helpers"
```

### Task D2: `p01_web2mobile_verify.yaml` (checks 2a/2b/2c)

**Files:**
- Create: `mobile-flows-parity/p01_web2mobile_verify.yaml`

- [ ] **Step 1: Write the flow**

```yaml
appId: com.hydrocert.app
name: "PARITY p01 - web->mobile (description + actions)"
tags: [parity, web2mobile]
---
- runFlow: _shared/login.yaml
- runFlow: _shared/open_tagged_visit.yaml

# 2a description
- tapOn: "Visit Details"
- assertVisible: ".*PARITY-${RUN_ID} description.*"

# 2b visit-level actions
- tapOn: "Actions"
- assertVisible: ".*PARITY-${RUN_ID} Hi.*"
- assertVisible: ".*PARITY-${RUN_ID} Med.*"
- assertVisible: ".*PARITY-${RUN_ID} Lo.*"

# 2c inspection-level actions
- tapOn: "Inspections.*"
- tapOn: "Start Inspection"
- tapOn:
    text: "Actions"
    optional: true
- assertVisible: ".*PARITY-${RUN_ID} Hi.*"
```

- [ ] **Step 2: Verify locally against the visit from the C3 dry-run**

Run: `maestro test -e MAESTRO_APP_EMAIL=$QA_EMAIL -e MAESTRO_APP_PASSWORD=$QA_PW -e VISIT_REF=$VN -e RUN_ID=LOCAL1 mobile-flows-parity/p01_web2mobile_verify.yaml`
Expected: PASS. If an `assertVisible` fails, fix the navigation/selector using `BUTTON-MAP-MOBILE.md` (actions panel labels, inspection entry).

- [ ] **Step 3: Commit**

```bash
git add mobile-flows-parity/p01_web2mobile_verify.yaml
git -c commit.gpgsign=false commit -m "feat(parity): web->mobile verification flow"
```

### Task D3: `p02_mobile2web_signature.yaml` (check 3a)

**Files:**
- Create: `mobile-flows-parity/p02_mobile2web_signature.yaml`

- [ ] **Step 1: Write the flow** (Submit on RIGHT of modal x≈830; explicit bottom Save; scroll UP after Save)

```yaml
appId: com.hydrocert.app
name: "PARITY p02 - mobile->web signature"
tags: [parity, mobile2web]
---
- runFlow: _shared/login.yaml
- runFlow: _shared/open_tagged_visit.yaml
- tapOn: "Visit Details"
- scrollUntilVisible: { element: { text: "Client Signature" }, direction: DOWN, timeout: 15000 }
- tapOn: "Client Signature"
- tapOn: "Tap to sign"
# draw strokes
- swipe: { start: "20%, 70%", end: "80%, 70%" }
- swipe: { start: "30%, 60%", end: "70%, 80%" }
- tapOn: { below: { text: "Client Name" } }
- inputText: "PARITY-${RUN_ID} Client"
- hideKeyboard
- tapOn: { point: "830,1500" }   # Submit (right side of modal) — confirm Y against device list at runtime
- scrollUntilVisible: { element: { text: "Save" }, direction: DOWN, timeout: 25000, speed: 40 }
- tapOn: "Save"
- scrollUntilVisible: { element: { text: "Visit Details" }, direction: UP, timeout: 10000, speed: 40 }
- assertVisible:
    text: "Task details saved successfully.*"
    optional: true
```

- [ ] **Step 2: Verify locally** (re-uses the dry-run visit)

Run: `maestro test -e MAESTRO_APP_EMAIL=$QA_EMAIL -e MAESTRO_APP_PASSWORD=$QA_PW -e VISIT_REF=$VN -e RUN_ID=LOCAL1 mobile-flows-parity/p02_mobile2web_signature.yaml`
Expected: PASS; afterwards `node scripts/parity/verify-data.mjs` shows the 3a signature check PASS. If Submit hit Clear, adjust the modal X using `mobile_list_elements_on_screen` coordinates documented in `qa-parity.md`.

- [ ] **Step 3: Commit**

```bash
git add mobile-flows-parity/p02_mobile2web_signature.yaml
git -c commit.gpgsign=false commit -m "feat(parity): mobile->web signature flow"
```

### Task D4: `p03_mobile2web_visit_info.yaml` (check 3b)

**Files:**
- Create: `mobile-flows-parity/p03_mobile2web_visit_info.yaml`

- [ ] **Step 1: Write the flow**

```yaml
appId: com.hydrocert.app
name: "PARITY p03 - mobile->web visit info"
tags: [parity, mobile2web]
---
- runFlow: _shared/login.yaml
- runFlow: _shared/open_tagged_visit.yaml
- tapOn: "Inspections.*"
- tapOn: "Start Inspection"
- tapOn:
    text: "Visit Information"
    optional: true
- scrollUntilVisible: { element: { text: "Assisting 1" }, direction: DOWN, timeout: 15000 }
- tapOn: { below: { text: "Assisting 1" } }
- inputText: "PARITY-${RUN_ID} Inspector 1"
- hideKeyboard
- tapOn: { below: { text: "Assisting 2" } }
- inputText: "PARITY-${RUN_ID} Inspector 2"
- hideKeyboard
- scrollUntilVisible: { element: { text: "Works being carried out" }, direction: DOWN, timeout: 15000 }
- tapOn: { below: { text: "Works being carried out" } }
- inputText: "PARITY-${RUN_ID} Works"
- hideKeyboard
- scrollUntilVisible: { element: { text: "Save" }, direction: DOWN, timeout: 25000, speed: 40 }
- tapOn: "Save"
- scrollUntilVisible: { element: { text: "Visit Information" }, direction: UP, timeout: 10000, speed: 40 }
```

- [ ] **Step 2: Verify locally**

Run: `maestro test -e MAESTRO_APP_EMAIL=$QA_EMAIL -e MAESTRO_APP_PASSWORD=$QA_PW -e VISIT_REF=$VN -e RUN_ID=LOCAL1 mobile-flows-parity/p03_mobile2web_visit_info.yaml`
Expected: PASS; `node scripts/parity/verify-data.mjs` shows 3b visit-info fields PASS. Adjust field labels against `BUTTON-MAP-MOBILE.md` if a `tapOn below` misses.

- [ ] **Step 3: Commit**

```bash
git add mobile-flows-parity/p03_mobile2web_visit_info.yaml
git -c commit.gpgsign=false commit -m "feat(parity): mobile->web visit-info flow"
```

### Task D5: `p04_mobile2web_risk_assessment.yaml` (check 3c)

**Files:**
- Create: `mobile-flows-parity/p04_mobile2web_risk_assessment.yaml`

- [ ] **Step 1: Write the flow**

```yaml
appId: com.hydrocert.app
name: "PARITY p04 - mobile->web risk assessment"
tags: [parity, mobile2web]
---
- runFlow: _shared/login.yaml
- runFlow: _shared/open_tagged_visit.yaml
- tapOn: "Inspections.*"
- tapOn: "Start Inspection"
- tapOn:
    text: "Risk Assessment"
    optional: true
- scrollUntilVisible: { element: { text: "Accessing Area/Lone Working" }, direction: DOWN, timeout: 15000 }
- tapOn: { right: { text: "Accessing Area/Lone Working" }, text: "Yes" }
- scrollUntilVisible: { element: { text: "Risk Managed" }, direction: DOWN, timeout: 10000 }
- tapOn: { right: { text: "Risk Managed" }, text: "Yes" }
- scrollUntilVisible: { element: { text: "Comments" }, direction: DOWN, timeout: 10000 }
- tapOn: { below: { text: "Comments" } }
- inputText: "PARITY-${RUN_ID} risk area comment"
- hideKeyboard
- scrollUntilVisible: { element: { text: "Save" }, direction: DOWN, timeout: 25000, speed: 40 }
- tapOn: "Save"
- scrollUntilVisible: { element: { text: "Risk Assessment" }, direction: UP, timeout: 10000, speed: 40 }
```

- [ ] **Step 2: Verify locally**

Run: `maestro test -e MAESTRO_APP_EMAIL=$QA_EMAIL -e MAESTRO_APP_PASSWORD=$QA_PW -e VISIT_REF=$VN -e RUN_ID=LOCAL1 mobile-flows-parity/p04_mobile2web_risk_assessment.yaml`
Expected: PASS; `node scripts/parity/verify-data.mjs` shows 3c risk PASS.

- [ ] **Step 3: Commit**

```bash
git add mobile-flows-parity/p04_mobile2web_risk_assessment.yaml
git -c commit.gpgsign=false commit -m "feat(parity): mobile->web risk-assessment flow"
```

---

## Phase E — Orchestrator + mobile result emitter

### Task E1: `run-parity-test.sh`

**Files:**
- Create: `scripts/run-parity-test.sh`

- [ ] **Step 1: Write the orchestrator**

Mirrors `scripts/run-mobile-v2-test.sh` (APK download + Maestro install) but runs the 4 phases. The p01 flow's PASS/FAIL is captured into `parity-mobile-results.json` (web→mobile checks) which `verify-data.mjs` merges.

```bash
#!/bin/bash
set +e
WS="$GITHUB_WORKSPACE"; cd "$WS"
ART="$WS/qa-artifacts/parity"; SHOTS="$ART/screenshots"; LOGS="$ART/logs"
mkdir -p "$SHOTS" "$LOGS"

echo "=== Install Maestro ==="
curl -Ls "https://get.maestro.mobile.dev" | bash
export PATH="$HOME/.maestro/bin:$PATH"; maestro --version || { echo "maestro install failed"; exit 1; }

echo "=== Download + install APK (parity-apk release) ==="
gh release download parity-apk -p app-release.apk -D /tmp -R "$GITHUB_REPOSITORY" --clobber
adb install -r /tmp/app-release.apk && echo "APK installed" || { echo "APK install failed"; exit 1; }

run_flow () { # $1 = flow file, $2 = check-id label
  local f="$1" label="$2" name; name=$(basename "$f" .yaml)
  adb exec-out screencap -p > "$SHOTS/${name}-before.png" 2>/dev/null
  maestro test -e MAESTRO_APP_EMAIL="$MAESTRO_APP_EMAIL" -e MAESTRO_APP_PASSWORD="$MAESTRO_APP_PASSWORD" \
    -e VISIT_REF="$VISIT_REF" -e RUN_ID="$RUN_ID" "$f" 2>&1 | tee "$LOGS/${name}.log"
  local code=${PIPESTATUS[0]}
  adb exec-out screencap -p > "$SHOTS/${name}-after.png" 2>/dev/null
  return $code
}

# Phase 0 — setup (API)
echo "=== Phase 0: setup ==="
node scripts/parity/setup-data.mjs || { echo "setup failed"; exit 1; }
VISIT_REF=$(node -e "console.log(require('./parity-context.json').visitRef)")
export VISIT_REF
echo "visitRef=$VISIT_REF"

# Phase 1 — web -> mobile
echo "=== Phase 1: web->mobile ==="
run_flow mobile-flows-parity/p01_web2mobile_verify.yaml "web2mobile"; P1=$?
node -e "const fs=require('fs');const ok=$P1===0;fs.writeFileSync('parity-mobile-results.json',JSON.stringify({checks:[
 {id:'2a-description',direction:'Web→Mobile',status:ok?'PASS':'FAIL',details:'see p01 log'},
 {id:'2b-visit-actions',direction:'Web→Mobile',status:ok?'PASS':'FAIL',details:'see p01 log'},
 {id:'2c-inspection-actions',direction:'Web→Mobile',status:ok?'PASS':'FAIL',details:'see p01 log'}]}))"

# Phase 2 — mobile -> web (input)
echo "=== Phase 2: mobile->web ==="
run_flow mobile-flows-parity/p02_mobile2web_signature.yaml "sig"
run_flow mobile-flows-parity/p03_mobile2web_visit_info.yaml "info"
run_flow mobile-flows-parity/p04_mobile2web_risk_assessment.yaml "risk"

# Phase 3 — verify (API) + report
echo "=== Phase 3: verify + report ==="
node scripts/parity/verify-data.mjs
node scripts/parity/gen-report.mjs
cp -f summary.json report.html "$ART/" 2>/dev/null
echo "=== DONE ==="
cat summary.json
```

- [ ] **Step 2: Make it executable + shellcheck**

Run: `chmod +x scripts/run-parity-test.sh && bash -n scripts/run-parity-test.sh`
Expected: no syntax errors.

- [ ] **Step 3: Commit**

```bash
git add scripts/run-parity-test.sh
git -c commit.gpgsign=false commit -m "feat(parity): 4-phase orchestrator"
```

---

## Phase F — Workflow + CI iteration

### Task F1: `bidirectional-parity.yml`

**Files:**
- Create: `.github/workflows/bidirectional-parity.yml`

- [ ] **Step 1: Confirm required GH config exists**

Run: `gh variable list -R DumitracheBogdan/Hydro-QA; gh secret list -R DumitracheBogdan/Hydro-QA`
Expected: vars `HYDROCERT_DEV_API_BASE`, `HYDROCERT_DEV_WEB_BASE`; secrets `HYDROCERT_MOBILE_QA_EMAIL`, `HYDROCERT_MOBILE_QA_PASSWORD`. If the API-creating user differs from the mobile QA user, add secrets `HYDROCERT_DEV_API_EMAIL` / `HYDROCERT_DEV_API_PASSWORD`:
`gh secret set HYDROCERT_DEV_API_EMAIL -R DumitracheBogdan/Hydro-QA` (and `_PASSWORD`). Otherwise the workflow reuses the mobile QA creds for the API.

- [ ] **Step 2: Write the workflow** (emulator pattern copied from `post-deploy-regression-mobile.yml`)

```yaml
name: Bidirectional Parity (dev)
run-name: "Bidirectional Parity - ${{ github.event_name }}"

on:
  workflow_dispatch:
    inputs:
      visit_ref:
        description: "Reuse an existing visit ref (skip create). Leave blank for a fresh visit."
        required: false
        default: ""

permissions:
  contents: read

concurrency:
  group: bidirectional-parity-dev
  cancel-in-progress: false

jobs:
  parity:
    runs-on: ubuntu-latest
    timeout-minutes: 75
    environment: Development
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Enable KVM
        run: |
          echo 'KERNEL=="kvm", GROUP="kvm", MODE="0666", OPTIONS+="static_node=kvm"' | sudo tee /etc/udev/rules.d/99-kvm4all.rules
          sudo udevadm control --reload-rules
          sudo udevadm trigger --name-match=kvm
      - name: Unit tests (API scripts)
        run: node --test scripts/parity/
      - name: Run parity (Android emulator)
        id: parity
        continue-on-error: true
        uses: reactivecircus/android-emulator-runner@v2
        with:
          api-level: 30
          target: default
          arch: x86_64
          force-avd-creation: false
          emulator-options: -no-window -gpu swiftshader_indirect -no-snapshot -noaudio -no-boot-anim
          disable-animations: true
          emulator-boot-timeout: 600
          script: bash $GITHUB_WORKSPACE/scripts/run-parity-test.sh
        env:
          GH_TOKEN: ${{ github.token }}
          RUN_ID: ${{ github.run_id }}
          VISIT_REF: ${{ github.event.inputs.visit_ref }}
          HYDROCERT_API_BASE: ${{ vars.HYDROCERT_DEV_API_BASE }}
          HYDROCERT_WEB_BASE: ${{ vars.HYDROCERT_DEV_WEB_BASE }}
          API_EMAIL: ${{ secrets.HYDROCERT_DEV_API_EMAIL || secrets.HYDROCERT_MOBILE_QA_EMAIL }}
          API_PASSWORD: ${{ secrets.HYDROCERT_DEV_API_PASSWORD || secrets.HYDROCERT_MOBILE_QA_PASSWORD }}
          MAESTRO_APP_EMAIL: ${{ secrets.HYDROCERT_MOBILE_QA_EMAIL }}
          MAESTRO_APP_PASSWORD: ${{ secrets.HYDROCERT_MOBILE_QA_PASSWORD }}
      - name: Upload artifacts
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: parity-report
          path: |
            qa-artifacts/parity/**
            summary.json
            report.html
          retention-days: 14
      - name: Job summary
        if: always()
        run: |
          echo "## Bidirectional Parity" >> $GITHUB_STEP_SUMMARY
          if [ -f summary.json ]; then
            node -e "const s=require('./summary.json');console.log(\`**\${s.passed}/\${s.total} PASS** — visit \${s.visitRef}\`)" >> $GITHUB_STEP_SUMMARY
          else
            echo "No summary produced (early failure — see logs)." >> $GITHUB_STEP_SUMMARY
          fi
```

- [ ] **Step 3: Lint the YAML**

Run: `node -e "require('js-yaml')" 2>/dev/null && npx --yes js-yaml .github/workflows/bidirectional-parity.yml >/dev/null && echo "yaml ok" || python -c "import yaml,sys;yaml.safe_load(open('.github/workflows/bidirectional-parity.yml'));print('yaml ok')"`
Expected: `yaml ok`.

- [ ] **Step 4: Commit + push to main**

```bash
git add .github/workflows/bidirectional-parity.yml
git -c commit.gpgsign=false commit -m "ci(parity): bidirectional parity workflow (manual)"
git push origin main
```

### Task F2: First CI run + iterate

- [ ] **Step 1: Trigger the workflow (fresh visit)**

Run: `gh workflow run bidirectional-parity.yml -R DumitracheBogdan/Hydro-QA`
Then: `gh run watch -R DumitracheBogdan/Hydro-QA`
Expected: job completes (may have FAIL checks on first run).

- [ ] **Step 2: Download artifacts + review**

Run: `gh run download -R DumitracheBogdan/Hydro-QA -n parity-report -D ./_parity-run` then open `report.html` and the before/after screenshots.
Expected: a `report.html` with `X/6` score. Triage any FAIL using screenshots + logs.

- [ ] **Step 3: Fix selectors/timing and re-run**

For each failing check, adjust the corresponding Maestro flow selector (using `BUTTON-MAP-MOBILE.md`) or the wait windows. Commit each fix (`fix(parity): ...`), push, and re-run `gh workflow run` until `6/6 PASS` (or the documented expected score). Iterate via screenshots — do not guess.

- [ ] **Step 4: Final commit of the green state** (if any flow edits were needed)

```bash
git add -A && git -c commit.gpgsign=false commit -m "fix(parity): stabilize flows to green on CI" && git push origin main
```

---

## Self-Review

**Spec coverage:**
- §3 parity contract (6 checks) → D2 (2a/2b/2c), D3 (3a), D4 (3b), D5 (3c), C4 verify. ✓
- §4 4-phase single job → E1 orchestrator + F1 workflow. ✓
- §5 full button map (4 docs) → A1–A4. ✓
- §6 BE API reference → used in C1/C3/C4 + documented A3. ✓
- §7 fixtures resolution → C2. ✓
- §8 APK delivery → B1. ✓
- §9 flakiness handling → D flows (scroll-UP-after-Save), F1 `emulator-boot-timeout` + `continue-on-error`, fresh visit (C3). ✓
- §10 workflow interface (dispatch, `visit_ref`, secrets/vars, artifacts) → F1. ✓
- §11 file list → all created across phases. ✓
- §13 risks (APK freshness, fixtures, sparse selectors, release build) → surfaced in B1/C2/D/F2 iteration. ✓

**Placeholder scan:** Fixture UUIDs in `fixtures.dev.json` are filled by the real output of C2 step 2 (a command, not a placeholder). `extractInspectionFields` keys flagged for confirmation against `inspection.dto.ts` in C4 step 5. Maestro modal Y-coordinate (830,1500) flagged for runtime confirmation in D3. No `TODO`/`TBD` left.

**Type/name consistency:** `parity-context.json` shape written by `setup-data.mjs` (`runId/visitId/visitRef/inspectionId/expected`) matches reads in `verify-data.mjs` and `run-parity-test.sh`. `summary.json` shape written by `verify-data.mjs` matches `renderReport()` input and the job-summary reader. `expected` keys (`description/visitActions/inspectionActions/signatureName/visitInfo/riskAssessment`) consistent across C3 and C4. ✓
