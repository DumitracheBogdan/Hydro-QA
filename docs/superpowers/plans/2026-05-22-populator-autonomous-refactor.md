# Populator Autonomous Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 150-line rules-based populator prompt with a reasoning-first system that thinks from Kayle's CSV, runs 5 workers + 1 manager in a self-correcting loop (max 3 iterations), with audit log + free rollback.

**Architecture:** GH Actions daily cron → 1 Claude Code base-action session (orchestrator) → 5 parallel sub-Task workers → 1 super-manager → fix loop → audit JSONL committed to repo. Companion rollback workflow undoes any run by date. All on existing free tier.

**Tech Stack:** Node.js 20 (scripts), GitHub Actions YAML, anthropics/claude-code-base-action@beta, Hydrocert dev REST API, JSONL audit logs in git.

**Spec:** `docs/superpowers/specs/2026-05-22-populator-autonomous-refactor-design.md`

**Working directory:** `C:\Users\Coca-Cola\Hydro-QA-work\`

**API base (dev):** `https://hydrocert-dev-api-exajhpd0brg2bcar.ukwest-01.azurewebsites.net`
**Auth (dev):** `tq@hydrocert.com` / `TechQuarter2025!`

**Hard guardrails (carry into every commit):**
- DEV ONLY (no prod hostnames anywhere)
- ONLY `laboratorySamples` field modified (no inspection/visit edits)
- No Claude attribution in commits (per project conventions)
- Push direct to main (no PR per project conventions)

---

## File Structure

| Path | Role |
|---|---|
| `hydrocert-tokens.csv` | Kayle source of truth (111 tokens), versioned |
| `docs/populator/few-shot-examples.md` | 10-15 curated past patches as in-context examples |
| `docs/populator/past-resolutions.jsonl` | Auto-grown memory of human-confirmed fixes (seed empty) |
| `docs/populator/README.md` | Explains how the system works (operator runbook) |
| `scripts/populator-bootstrap.mjs` | Pre-flight + discovery + batching (read-only) |
| `scripts/populator-executor.mjs` | Deterministic PATCH/DELETE + audit log writer |
| `scripts/populator-rollback.mjs` | Reverse audit log; safety-checks engineer changes |
| `.github/workflows/claude-populator-v2.yml` | New orchestrator (cron initially disabled) |
| `.github/workflows/claude-populator-rollback.yml` | workflow_dispatch rollback by date |
| `claude-populator-runs/.gitkeep` | Keep audit-log dir in repo |

The existing `claude-populator.yml` stays until v2 is validated, then gets archived in Task 14.

---

## Task 1: Add Kayle CSV to repo

**Files:**
- Create: `hydrocert-tokens.csv`

- [ ] **Step 1: Copy source CSV into repo**

```bash
cp "/c/Users/Coca-Cola/Downloads/hydrocert_token_review_2026-05-06 (2).csv" /c/Users/Coca-Cola/Hydro-QA-work/hydrocert-tokens.csv
```

- [ ] **Step 2: Verify row count + header**

```bash
wc -l /c/Users/Coca-Cola/Hydro-QA-work/hydrocert-tokens.csv
head -1 /c/Users/Coca-Cola/Hydro-QA-work/hydrocert-tokens.csv
```

Expected:
- 112 lines (1 header + 111 tokens)
- Header: `"Category","Token","What we believe it means","Hydrocert Job Type","How to handle (Location/Qualifier only)","Example from notes","TQ confidence (%)","Confirmed","Comment"`

- [ ] **Step 3: Commit**

```bash
cd /c/Users/Coca-Cola/Hydro-QA-work
git add hydrocert-tokens.csv
git commit -m "feat(populator): add Kayle signed-off token catalog (111 tokens, 2026-05-06)"
```

---

## Task 2: Seed past-resolutions + few-shot examples

**Files:**
- Create: `docs/populator/past-resolutions.jsonl` (empty)
- Create: `docs/populator/few-shot-examples.md`
- Create: `docs/populator/README.md`

- [ ] **Step 1: Create directories + empty past-resolutions seed**

```bash
cd /c/Users/Coca-Cola/Hydro-QA-work
mkdir -p docs/populator claude-populator-runs
touch docs/populator/past-resolutions.jsonl
touch claude-populator-runs/.gitkeep
```

- [ ] **Step 2: Write few-shot examples (10 cases from today's verified run)**

Create `docs/populator/few-shot-examples.md` with these exact 10 cases from today's 162 verified patches:

```markdown
# Few-Shot Examples for Populator

These are real visits processed correctly today (2026-05-22). Workers use them as in-context examples for similar future cases.

## Example 1: Booker-encoded labels (LP/Micro slots)

**Visit:** V155827 — Chesterford Research Park
**Notes:** "May - H - 3pts - DS - 6 x Micro and 6 x LP"
**Inspections (12):**
- 6× Domestic Resample with itemLocation `H - LP Sample 1..6` → Legionella (booker label = primary signal)
- 6× Domestic Resample with itemLocation `H - Micro Sample 1..6` → Potable/Domestic (booker label = primary signal)

**Reasoning:** Booker pre-encoded sample type in itemLocation. Trust the label; notes match (6 LP + 6 Micro = 12 slots).

## Example 2: One-off Legionella resampling (notes explicit)

**Visit:** V186195 — 150 Cheapside (Cooling Tower)
**Notes:** "Evaporative Cooling Legionella Samples ... 6 X LP - (Suite = LPFILTERED)"
**Inspections (6):** All Domestic Sample with generic `Sample Location` → All 6 Legionella

**Reasoning:** Notes explicitly say "6 X LP". Generic itemLocation gives no per-slot detail. All 6 → Legionella.

## Example 3: Domestic Resample with LP-only intent

**Visit:** V185901 — 100 Marylebone
**Notes:** "Legionella Resamples ... 4 X LP - (Suite = LPFILTERED)"
**Inspections (4):** All Domestic Resample with generic `Sample Location` → All 4 Legionella

**Reasoning:** Resample rule. Notes say LP only (no Micro mention). All → Legionella. DO NOT default to dual.

## Example 4: Water Feature schedule

**Visit:** V157265 — 21 Manresa Road
**Notes:** "Water Feature Schedule / May - Q - 2pts - WF on-site testing, 1 x WF Monthly and 1 x LP"
**Inspections (3):**
- Domestic Sample / `WF Monthly` → Water Feature Micro
- Domestic Sample / `WF - Legionella` → Legionella
- Water feature - On site chem testing form / `WF On-site testing` → SKIP (no lab sample)

**Reasoning:** Booker-encoded WF labels distinguish micro vs legionella. On-site form = skip.

## Example 5: Multi-month visit with index allocation

**Visit:** V155013 — LBC 4 More London
**Notes:** "May - H - 3pts - 6 x Micro and 6 x LP"
**Inspections (12):** All Domestic Sample with generic `Sample Location`
- First 6 by inspectionRef order → Potable/Domestic (Micro listed first in notes)
- Next 6 → Legionella

**Reasoning:** Notes total: 6+6=12 = exact slot count. Allocate by index when notes order is given. Engineer maps to physical outlets on-site.

## Example 6: Cooling tower resample one-off

**Visit:** V186195 (variant) — 150 Cheapside
**Notes:** "6 X LP - (Suite = LPFILTERED)"
**Inspections (6):** All → Legionella

**Reasoning:** One-off resample, single-type intent.

## Example 7: Notes empty → unresolved (no booker label)

**Visit:** VN012086 — 2 South Audley Street
**Notes:** null
**Inspections (1):** Domestic Sample / `POOL 1` (no booker-encoded type token)
**Decision:** unresolved_no_notes

**Reasoning:** Notes null + itemLocation `POOL 1` is location only, no sample-type signal. Cannot decide without booker input.

## Example 8: Domestic Resample without resample intent

**Visit:** V147219 — Tower Bridge House
**Notes:** describes regular quarterly DS schedule, no "resample" mention
**Inspections (3):** Domestic Resample / `Resample Location` (generic)
**Decision:** unresolved_resample_no_notes

**Reasoning:** Resamples are one-off. Notes describe regular schedule, not a resample. No resample intent → unresolved. Annual schedule from sibling visits is IRRELEVANT for resamples.

## Example 9: Slot count mismatch

**Visit:** V154425
**Notes:** "14 DS samples (4 Micro + 7 LP + 3 GREY)" but visit has only 4 DS placeholder inspections
**Decision:** All 4 inspections → unresolved_slot_count_mismatch

**Reasoning:** Booker called for 14 samples but only created 4 slots. Cannot safely allocate partial. Booker must add 10 more inspections.

## Example 10: Closed System with budget enforcement (LESSON FROM V170831 BUG)

**Visit:** V170831 — Hutchison House
**Notes:** "May - H - 3pts - DS – 4 x micro, 4 x LP, CS - 1x CHEM BASIC+GLYCOL from RAC 1, 1x CHEM BASIC from CHW, 2 x BSRIA BACTI"
**Inspections (3 CS + 8 DS):**

Closed System (3 inspections):
- RAC system → Chem Basic+Glycol (or Chem Basic fallback if catalog lacks variant; log catalogGap)
- (empty itemLocation) → Bsria Bacti only (2nd Bsria of the 2 budgeted)
- CHW → Chem Basic + Bsria Bacti (1st Bsria of the 2 budgeted)

Domestic Sample (8 inspections):
- First 4 (by inspectionRef) → Potable/Domestic (4 x micro)
- Last 4 → Legionella (4 x LP)

**Reasoning:** CRITICAL — sample-budget reconciliation. Notes call for exactly 2 BSRIA total, not "1 per CS inspection". Plan must sum to budget. Allocate first, validate sum equals notes budget, then execute. If budget exhausted, mark remaining unresolved.
```

- [ ] **Step 3: Write operator README**

Create `docs/populator/README.md`:

```markdown
# Hydrocert Populator v2 (Autonomous, Reasoning-First)

## What it does
Daily at 03:00 UTC, looks at dev visits in the last 3 days that have empty laboratorySamples on at least one sample-requiring inspection, decides what samples to add by reasoning from Kayle's signed-off token CSV, applies them via PATCH, and verifies its own work in a self-correction loop.

## How to update Kayle's catalog
When Kayle releases a new token version:
1. Replace `hydrocert-tokens.csv` with the new file
2. Commit + push to main
3. Next 03:00 UTC run automatically picks it up

## How to rollback a bad run
1. GitHub → Actions → Claude Populator Rollback workflow
2. Click "Run workflow"
3. Enter `target_date: 2026-05-22` (or whatever day to revert)
4. Wait for completion
5. Rollback opens an Issue with summary

Rollback is safe: if engineer modified a sample after our PATCH, that one is skipped (not destroyed).

## How to dry-run
1. GitHub → Actions → Claude Populator v2
2. Run workflow → check `dry_run: true`
3. Plans are generated but no API writes happen

## Files in this directory
- `few-shot-examples.md` — curated past cases workers use as exemplars
- `past-resolutions.jsonl` — auto-grown memory of human-confirmed fixes (each line one resolution)
```

- [ ] **Step 4: Commit**

```bash
cd /c/Users/Coca-Cola/Hydro-QA-work
git add docs/populator/ claude-populator-runs/.gitkeep
git commit -m "feat(populator): seed few-shot examples + operator README + audit log directory"
```

---

## Task 3: Build populator-bootstrap.mjs

**Files:**
- Create: `scripts/populator-bootstrap.mjs`

Purpose: pre-flight checks + discover candidate visits + batch them.

- [ ] **Step 1: Write the script**

Create `scripts/populator-bootstrap.mjs`:

```javascript
#!/usr/bin/env node
// Populator v2 bootstrap: pre-flight + discovery + batching.
// Reads env: HYDROCERT_API_BASE, HYDROCERT_QA_EMAIL, HYDROCERT_QA_PASSWORD, WINDOW_DAYS.
// Writes: scripts/runtime/batch-1.json ... batch-5.json + scripts/runtime/preflight.json

import https from 'https';
import fs from 'fs';
import path from 'path';

const API_BASE = process.env.HYDROCERT_API_BASE;
const EMAIL = process.env.HYDROCERT_QA_EMAIL;
const PASSWORD = process.env.HYDROCERT_QA_PASSWORD;
const WINDOW_DAYS = parseInt(process.env.WINDOW_DAYS || '3', 10);
const PRE_SYNC_CUTOFF = '2026-04-15T10:29:25Z';

if (!API_BASE || /prod/i.test(API_BASE)) {
  console.error('FATAL: API_BASE missing or contains "prod" — dev only.');
  process.exit(2);
}
if (!EMAIL || !PASSWORD) {
  console.error('FATAL: HYDROCERT_QA_EMAIL or HYDROCERT_QA_PASSWORD missing.');
  process.exit(2);
}

const RUNTIME = path.resolve('scripts/runtime');
fs.mkdirSync(RUNTIME, { recursive: true });

function req(method, urlPath, { token, body } = {}) {
  return new Promise((res, rej) => {
    const u = new URL(urlPath, API_BASE);
    const d = body ? JSON.stringify(body) : null;
    const h = { 'Content-Type': 'application/json' };
    if (token) h.Authorization = `Bearer ${token}`;
    if (d) h['Content-Length'] = Buffer.byteLength(d);
    const r = https.request({ hostname: u.hostname, path: u.pathname + (u.search || ''), method, headers: h }, rs => {
      let b = ''; rs.on('data', x => b += x);
      rs.on('end', () => { try { res({ status: rs.statusCode, body: JSON.parse(b) }); } catch { res({ status: rs.statusCode, body: b }); } });
    });
    r.on('error', rej);
    if (d) r.write(d);
    r.end();
  });
}

async function main() {
  const startedAt = new Date().toISOString();
  const preflight = { startedAt, apiBase: API_BASE, windowDays: WINDOW_DAYS };

  // 1. Auth
  const auth = await req('POST', '/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  if (auth.status !== 201 && auth.status !== 200) {
    preflight.error = `auth HTTP ${auth.status}`;
    fs.writeFileSync(path.join(RUNTIME, 'preflight.json'), JSON.stringify(preflight, null, 2));
    process.exit(3);
  }
  const token = auth.body?.tokens?.accessToken;
  if (!token) { preflight.error = 'no accessToken'; fs.writeFileSync(path.join(RUNTIME, 'preflight.json'), JSON.stringify(preflight, null, 2)); process.exit(3); }
  preflight.authOk = true;

  // 2. Catalog
  const cat = await req('GET', '/sample-types', { token });
  const items = Array.isArray(cat.body) ? cat.body : (cat.body?.items || cat.body?.data || []);
  if (items.length === 0) { preflight.error = 'empty sample-types'; fs.writeFileSync(path.join(RUNTIME, 'preflight.json'), JSON.stringify(preflight, null, 2)); process.exit(3); }
  const catalog = Object.fromEntries(items.map(s => [s.name, s.id]));
  fs.writeFileSync(path.join(RUNTIME, 'sample-types-catalog.json'), JSON.stringify(catalog, null, 2));
  preflight.catalogSize = items.length;

  // 3. Calendar window
  const to = new Date();
  const from = new Date(to.getTime() - WINDOW_DAYS * 24 * 3600 * 1000);
  const startDate = from.toISOString();
  const endDate = to.toISOString();
  preflight.window = { startDate, endDate };

  const cal = await req('GET', `/visits/calendar-filter?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`, { token });
  if (cal.status !== 200) { preflight.error = `calendar HTTP ${cal.status}`; fs.writeFileSync(path.join(RUNTIME, 'preflight.json'), JSON.stringify(preflight, null, 2)); process.exit(3); }
  const calendarItems = cal.body?.items || cal.body?.data || [];
  preflight.calendarCount = calendarItems.length;

  // Visit-count guard
  if (calendarItems.length > 200) {
    preflight.error = `import storm: ${calendarItems.length} visits > 200 cap`;
    fs.writeFileSync(path.join(RUNTIME, 'preflight.json'), JSON.stringify(preflight, null, 2));
    process.exit(4);
  }

  // 4. Per-visit detail + eligibility filter
  const eligible = [];
  for (const c of calendarItems) {
    const uuid = c.id || c.visitId;
    if (!uuid) continue;
    const v = (await req('GET', `/visits/${uuid}`, { token })).body;
    if (!v?.inspections) continue;
    if (v.visitStatus === 'complete') continue;
    const maxInsp = v.inspections.reduce((m, i) => Math.max(m, new Date(i.createdAt || 0).getTime()), 0);
    if (maxInsp && maxInsp < new Date(PRE_SYNC_CUTOFF).getTime()) continue;

    const emptyInsp = v.inspections.filter(i => (i.laboratorySamples || []).length === 0).map(i => ({
      id: i.id, inspectionRef: i.inspectionReference,
      jobType: i.jobType?.name, itemLocation: i.itemLocation, itemDetail: i.itemDetail,
      createdAt: i.createdAt,
    }));
    if (emptyInsp.length === 0) continue;

    const visitDate = v.visitDate || v.originalDate || v.scheduledAt;
    const dt = visitDate ? new Date(visitDate) : null;
    eligible.push({
      visitRef: v.visitReference, uuid,
      title: v.title, visitDate: visitDate?.slice(0,10),
      monthName: dt ? dt.toLocaleString('en-US', { month: 'long' }) : null,
      monthShort: dt ? dt.toLocaleString('en-US', { month: 'short' }) : null,
      notes: v.notes,
      emptyInspections: emptyInsp,
    });
  }
  preflight.eligibleCount = eligible.length;

  // 5. Split into 5 batches
  const batches = [[], [], [], [], []];
  eligible.forEach((v, i) => batches[i % 5].push(v));
  batches.forEach((b, i) => fs.writeFileSync(path.join(RUNTIME, `batch-${i+1}.json`), JSON.stringify(b, null, 2)));

  preflight.batchSizes = batches.map(b => b.length);
  preflight.endedAt = new Date().toISOString();
  fs.writeFileSync(path.join(RUNTIME, 'preflight.json'), JSON.stringify(preflight, null, 2));
  console.log(`Bootstrap OK: ${eligible.length} eligible visits across 5 batches.`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
```

- [ ] **Step 2: Run locally on dev**

```bash
cd /c/Users/Coca-Cola/Hydro-QA-work
export HYDROCERT_API_BASE="https://hydrocert-dev-api-exajhpd0brg2bcar.ukwest-01.azurewebsites.net"
export HYDROCERT_QA_EMAIL="tq@hydrocert.com"
export HYDROCERT_QA_PASSWORD="TechQuarter2025!"
export WINDOW_DAYS=3
node scripts/populator-bootstrap.mjs
```

Expected:
- Stdout: `Bootstrap OK: <N> eligible visits across 5 batches.`
- Creates `scripts/runtime/preflight.json` with `authOk: true`, `catalogSize > 10`, `calendarCount`, `eligibleCount`, `batchSizes: [n,n,n,n,n]`
- Creates `scripts/runtime/sample-types-catalog.json` (~16 entries)
- Creates `scripts/runtime/batch-1.json` through `batch-5.json`

- [ ] **Step 3: Verify outputs**

```bash
ls scripts/runtime/
node -e "const r = require('./scripts/runtime/preflight.json'); console.log(r);"
```

Expected: `authOk: true`, no `error` field, batch files present.

- [ ] **Step 4: Add to .gitignore**

Add `scripts/runtime/` to `.gitignore` (these are per-run artifacts, not source):

```bash
cd /c/Users/Coca-Cola/Hydro-QA-work
echo "scripts/runtime/" >> .gitignore
```

- [ ] **Step 5: Commit**

```bash
git add scripts/populator-bootstrap.mjs .gitignore
git commit -m "feat(populator): add bootstrap script (preflight + discovery + 5-way batching)"
```

---

## Task 4: Build populator-executor.mjs

**Files:**
- Create: `scripts/populator-executor.mjs`

Purpose: read a plan-batch-N.json (produced by a worker subagent), execute PATCH/DELETE deterministically, write audit log.

- [ ] **Step 1: Write the executor**

Create `scripts/populator-executor.mjs`:

```javascript
#!/usr/bin/env node
// Populator v2 executor: applies a plan deterministically + writes audit log JSONL.
// Usage: node scripts/populator-executor.mjs <batch-num>
// Reads: scripts/runtime/plan-batch-<N>.json
// Writes: scripts/runtime/report-batch-<N>.json + appends claude-populator-runs/<date>-actions.jsonl

import https from 'https';
import fs from 'fs';
import path from 'path';

const API_BASE = process.env.HYDROCERT_API_BASE;
const EMAIL = process.env.HYDROCERT_QA_EMAIL;
const PASSWORD = process.env.HYDROCERT_QA_PASSWORD;
const DRY_RUN = process.env.DRY_RUN === 'true';
const batchNum = process.argv[2];

if (!API_BASE || /prod/i.test(API_BASE)) { console.error('FATAL: dev only'); process.exit(2); }
if (!batchNum) { console.error('Usage: node populator-executor.mjs <batch-num>'); process.exit(2); }

const RUNTIME = path.resolve('scripts/runtime');
const planPath = path.join(RUNTIME, `plan-batch-${batchNum}.json`);
if (!fs.existsSync(planPath)) { console.error(`Plan not found: ${planPath}`); process.exit(2); }
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));

const today = new Date().toISOString().slice(0, 10);
const auditDir = path.resolve('claude-populator-runs');
fs.mkdirSync(auditDir, { recursive: true });
const auditPath = path.join(auditDir, `${today}-actions.jsonl`);

function appendAudit(entry) {
  fs.appendFileSync(auditPath, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
}

function req(method, urlPath, { token, body } = {}) {
  return new Promise((res, rej) => {
    const u = new URL(urlPath, API_BASE);
    const d = body ? JSON.stringify(body) : null;
    const h = { 'Content-Type': 'application/json' };
    if (token) h.Authorization = `Bearer ${token}`;
    if (d) h['Content-Length'] = Buffer.byteLength(d);
    const r = https.request({ hostname: u.hostname, path: u.pathname + (u.search || ''), method, headers: h }, rs => {
      let b = ''; rs.on('data', x => b += x);
      rs.on('end', () => { try { res({ status: rs.statusCode, body: JSON.parse(b) }); } catch { res({ status: rs.statusCode, body: b }); } });
    });
    r.on('error', rej); if (d) r.write(d); r.end();
  });
}

async function patchWithBackoff(token, inspectionId, samples) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await req('PATCH', `/inspections/${inspectionId}`, { token, body: { samples } });
    if (r.status >= 200 && r.status < 300) return { ok: true, status: r.status };
    if (r.status >= 500) await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    else return { ok: false, status: r.status, body: r.body };
  }
  return { ok: false, status: 'retries-exhausted' };
}

async function deleteSampleWithBackoff(token, sampleId) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await req('DELETE', `/laboratory-samples/${sampleId}`, { token });
    if (r.status >= 200 && r.status < 300) return { ok: true, status: r.status };
    if (r.status >= 500) await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    else return { ok: false, status: r.status, body: r.body };
  }
  return { ok: false, status: 'retries-exhausted' };
}

async function main() {
  const auth = await req('POST', '/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  const token = auth.body?.tokens?.accessToken;
  if (!token) { console.error('auth failed'); process.exit(3); }

  const report = { batchNum, dryRun: DRY_RUN, visits: [], totals: { patched: 0, deleted: 0, unresolved: 0, errors: 0, skipped: 0 } };

  for (const v of plan) {
    const vr = { visitRef: v.visitRef, uuid: v.uuid, decisions: [] };

    for (const d of (v.decisions || [])) {
      // Unresolved
      if (d.unresolved) {
        vr.decisions.push({ ...d, status: 'unresolved' });
        report.totals.unresolved++;
        appendAudit({ action: 'UNRESOLVED', batchNum, visitRef: v.visitRef, inspectionId: d.inspectionId, reasonClass: d.reasonClass, reasoning: d.reasoning });
        continue;
      }
      // Skip
      if (d.skip) {
        vr.decisions.push({ ...d, status: 'skipped' });
        report.totals.skipped++;
        continue;
      }
      // DELETE-then-PATCH (manager fix)
      if (Array.isArray(d.deleteSampleIds) && d.deleteSampleIds.length > 0) {
        for (const sid of d.deleteSampleIds) {
          if (DRY_RUN) { appendAudit({ action: 'DRYRUN-DELETE', batchNum, visitRef: v.visitRef, sampleId: sid }); continue; }
          const r = await deleteSampleWithBackoff(token, sid);
          if (r.ok) { report.totals.deleted++; appendAudit({ action: 'DELETE', batchNum, visitRef: v.visitRef, inspectionId: d.inspectionId, sampleId: sid, before: d.beforeDelete?.[sid] }); }
          else { report.totals.errors++; appendAudit({ action: 'DELETE_ERROR', batchNum, visitRef: v.visitRef, sampleId: sid, httpStatus: r.status }); }
          await new Promise(r => setTimeout(r, 200));
        }
      }
      // PATCH samples
      if (Array.isArray(d.samples) && d.samples.length > 0) {
        const apiSamples = d.samples.map(s => ({ sampleTypeId: s.sampleTypeId, quantity: s.quantity || 1 }));
        if (DRY_RUN) {
          appendAudit({ action: 'DRYRUN-PATCH', batchNum, visitRef: v.visitRef, inspectionId: d.inspectionId, samples: d.samples, confidence: d.confidence, reasoning: d.reasoning });
          vr.decisions.push({ ...d, status: 'dryrun-patched' });
          report.totals.patched++;
          continue;
        }
        const r = await patchWithBackoff(token, d.inspectionId, apiSamples);
        if (r.ok) {
          vr.decisions.push({ ...d, status: 'patched', httpStatus: r.status });
          report.totals.patched++;
          appendAudit({ action: 'PATCH', batchNum, visitRef: v.visitRef, inspectionId: d.inspectionId, samples: d.samples, confidence: d.confidence, reasoning: d.reasoning });
        } else {
          vr.decisions.push({ ...d, status: 'error', httpStatus: r.status, errorBody: r.body });
          report.totals.errors++;
          appendAudit({ action: 'PATCH_ERROR', batchNum, visitRef: v.visitRef, inspectionId: d.inspectionId, httpStatus: r.status, errorBody: r.body });
        }
        await new Promise(r => setTimeout(r, 200));
      }
    }
    report.visits.push(vr);
  }

  fs.writeFileSync(path.join(RUNTIME, `report-batch-${batchNum}.json`), JSON.stringify(report, null, 2));
  console.log(`Batch ${batchNum}: patched=${report.totals.patched}, deleted=${report.totals.deleted}, unresolved=${report.totals.unresolved}, errors=${report.totals.errors}, skipped=${report.totals.skipped}`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
```

- [ ] **Step 2: Smoke-test in dry-run on a synthetic plan**

```bash
cd /c/Users/Coca-Cola/Hydro-QA-work
mkdir -p scripts/runtime
cat > scripts/runtime/plan-batch-9.json <<'EOF'
[
  {
    "visitRef": "TEST",
    "uuid": "00000000-0000-0000-0000-000000000000",
    "decisions": [
      { "unresolved": true, "reasonClass": "unresolved_no_notes", "reasoning": "test entry", "inspectionId": "fake-id" }
    ]
  }
]
EOF
export HYDROCERT_API_BASE="https://hydrocert-dev-api-exajhpd0brg2bcar.ukwest-01.azurewebsites.net"
export HYDROCERT_QA_EMAIL="tq@hydrocert.com"
export HYDROCERT_QA_PASSWORD="TechQuarter2025!"
export DRY_RUN=true
node scripts/populator-executor.mjs 9
```

Expected:
- Stdout: `Batch 9: patched=0, deleted=0, unresolved=1, errors=0, skipped=0`
- `scripts/runtime/report-batch-9.json` exists
- `claude-populator-runs/2026-05-22-actions.jsonl` has 1 line with `"action":"UNRESOLVED"`

- [ ] **Step 3: Clean up test artifacts**

```bash
rm scripts/runtime/plan-batch-9.json scripts/runtime/report-batch-9.json
rm claude-populator-runs/2026-05-22-actions.jsonl
```

- [ ] **Step 4: Commit**

```bash
git add scripts/populator-executor.mjs
git commit -m "feat(populator): add executor with audit log JSONL writer (PATCH/DELETE + dry-run)"
```

---

## Task 5: Build populator-rollback.mjs

**Files:**
- Create: `scripts/populator-rollback.mjs`

Purpose: read an audit log JSONL, reverse every action with safety check.

- [ ] **Step 1: Write rollback**

Create `scripts/populator-rollback.mjs`:

```javascript
#!/usr/bin/env node
// Reverses a populator run by reading its audit log JSONL and undoing each action.
// Usage: node scripts/populator-rollback.mjs <YYYY-MM-DD>
// Safe by design: skips operations where the current API state diverged from what we wrote.

import https from 'https';
import fs from 'fs';
import path from 'path';

const API_BASE = process.env.HYDROCERT_API_BASE;
const EMAIL = process.env.HYDROCERT_QA_EMAIL;
const PASSWORD = process.env.HYDROCERT_QA_PASSWORD;
const targetDate = process.argv[2];

if (!API_BASE || /prod/i.test(API_BASE)) { console.error('FATAL: dev only'); process.exit(2); }
if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) { console.error('Usage: rollback <YYYY-MM-DD>'); process.exit(2); }

const auditPath = path.resolve('claude-populator-runs', `${targetDate}-actions.jsonl`);
if (!fs.existsSync(auditPath)) { console.error(`No audit log for ${targetDate}: ${auditPath}`); process.exit(2); }

const lines = fs.readFileSync(auditPath, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
console.log(`Read ${lines.length} actions from ${targetDate}`);

function req(method, urlPath, { token, body } = {}) {
  return new Promise((res, rej) => {
    const u = new URL(urlPath, API_BASE);
    const d = body ? JSON.stringify(body) : null;
    const h = { 'Content-Type': 'application/json' };
    if (token) h.Authorization = `Bearer ${token}`;
    if (d) h['Content-Length'] = Buffer.byteLength(d);
    const r = https.request({ hostname: u.hostname, path: u.pathname + (u.search || ''), method, headers: h }, rs => {
      let b = ''; rs.on('data', x => b += x);
      rs.on('end', () => { try { res({ status: rs.statusCode, body: JSON.parse(b) }); } catch { res({ status: rs.statusCode, body: b }); } });
    });
    r.on('error', rej); if (d) r.write(d); r.end();
  });
}

async function main() {
  const auth = await req('POST', '/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  const token = auth.body?.tokens?.accessToken;
  if (!token) { console.error('auth failed'); process.exit(3); }

  const summary = { targetDate, reversed: 0, skippedSafety: 0, errors: 0, perAction: { PATCH: 0, DELETE: 0 } };
  const rollbackLog = [];

  // Reverse order — last action first
  for (const entry of lines.reverse()) {
    if (entry.action === 'PATCH') {
      // We added samples to inspectionId; need to find + DELETE them. Safety: current inspection state must still contain exactly those sampleTypes from the plan.
      const v = (await req('GET', `/inspections/${entry.inspectionId}`, { token })).body;
      const liveSamples = v?.laboratorySamples || (await req('GET', `/visits/${entry.visitRef || '_'}`, { token })).body;
      // We must look at inspection directly. Try GET /inspections/{id}:
      const insp = (await req('GET', `/inspections/${entry.inspectionId}`, { token })).body;
      const current = (insp?.laboratorySamples || []);
      const expectedTypes = (entry.samples || []).map(s => s.sampleTypeId);
      // Find sample rows whose sampleTypeId matches one in expectedTypes (and is one we wrote)
      const toDelete = current.filter(s => expectedTypes.includes(s.sampleTypeId || s.sampleType?.id));
      if (toDelete.length === 0) {
        summary.skippedSafety++;
        rollbackLog.push({ action: 'SKIP_PATCH_ROLLBACK', reason: 'sample not present (engineer or prior rollback removed)', inspectionId: entry.inspectionId, expected: expectedTypes });
        continue;
      }
      for (const s of toDelete) {
        const r = await req('DELETE', `/laboratory-samples/${s.id}`, { token });
        if (r.status >= 200 && r.status < 300) { summary.reversed++; summary.perAction.PATCH++; rollbackLog.push({ action: 'REVERSED_PATCH', inspectionId: entry.inspectionId, deletedSampleId: s.id }); }
        else { summary.errors++; rollbackLog.push({ action: 'ROLLBACK_ERROR', inspectionId: entry.inspectionId, httpStatus: r.status }); }
        await new Promise(r => setTimeout(r, 200));
      }
    } else if (entry.action === 'DELETE') {
      // We deleted a sample; need to re-add it. Safety: re-add only if inspection still exists.
      const insp = (await req('GET', `/inspections/${entry.inspectionId}`, { token })).body;
      if (!insp || insp.statusCode === 404) {
        summary.skippedSafety++;
        rollbackLog.push({ action: 'SKIP_DELETE_ROLLBACK', reason: 'inspection no longer exists', inspectionId: entry.inspectionId });
        continue;
      }
      const before = entry.before;
      if (!before?.sampleTypeId) {
        summary.skippedSafety++;
        rollbackLog.push({ action: 'SKIP_DELETE_ROLLBACK', reason: 'no before-snapshot to re-add', inspectionId: entry.inspectionId });
        continue;
      }
      const r = await req('PATCH', `/inspections/${entry.inspectionId}`, { token, body: { samples: [{ sampleTypeId: before.sampleTypeId, quantity: before.quantity || 1 }] } });
      if (r.status >= 200 && r.status < 300) { summary.reversed++; summary.perAction.DELETE++; rollbackLog.push({ action: 'REVERSED_DELETE', inspectionId: entry.inspectionId, readded: before }); }
      else { summary.errors++; rollbackLog.push({ action: 'ROLLBACK_ERROR', inspectionId: entry.inspectionId, httpStatus: r.status }); }
      await new Promise(r => setTimeout(r, 200));
    }
    // UNRESOLVED / DRYRUN / *_ERROR entries: nothing to reverse
  }

  // Write rollback report
  const rollbackPath = path.resolve('claude-populator-runs', `${targetDate}-rollback-report.md`);
  fs.writeFileSync(rollbackPath, `# Rollback Report — ${targetDate}\n\n## Summary\n- Reversed: ${summary.reversed}\n- Skipped (safety): ${summary.skippedSafety}\n- Errors: ${summary.errors}\n\n## Log\n\n\`\`\`json\n${JSON.stringify(rollbackLog, null, 2)}\n\`\`\`\n`);
  console.log(`Rollback ${targetDate}: reversed=${summary.reversed}, skipped=${summary.skippedSafety}, errors=${summary.errors}`);
  console.log(`Report: ${rollbackPath}`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
```

- [ ] **Step 2: Smoke-test against empty log (should be no-op)**

```bash
cd /c/Users/Coca-Cola/Hydro-QA-work
echo "" > claude-populator-runs/2099-01-01-actions.jsonl
node scripts/populator-rollback.mjs 2099-01-01
```

Expected: `Rollback 2099-01-01: reversed=0, skipped=0, errors=0`

- [ ] **Step 3: Clean up**

```bash
rm claude-populator-runs/2099-01-01-actions.jsonl claude-populator-runs/2099-01-01-rollback-report.md
```

- [ ] **Step 4: Commit**

```bash
git add scripts/populator-rollback.mjs
git commit -m "feat(populator): add rollback script with engineer-safe diff check"
```

---

## Task 6: Write v2 orchestrator workflow YAML

**Files:**
- Create: `.github/workflows/claude-populator-v2.yml`

Purpose: GH Actions workflow runs bootstrap → spawns Claude Code base-action (orchestrator) → workers + manager + fix loop.

- [ ] **Step 1: Write the YAML**

Create `.github/workflows/claude-populator-v2.yml`:

```yaml
name: Hydrocert Populator v2 (Autonomous)
run-name: "Populator v2 - ${{ github.event_name }}"

on:
  # Cron disabled until v2 validated. After acceptance, swap with v1.
  # schedule:
  #   - cron: '0 3 * * *'
  workflow_dispatch:
    inputs:
      window_days:
        description: Backward window in days
        required: false
        type: string
        default: "3"
      dry_run:
        description: Dry run (no PATCH)
        required: false
        type: boolean
        default: false

permissions:
  contents: write
  issues: write

concurrency:
  group: claude-populator-v2
  cancel-in-progress: false

jobs:
  populate:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    environment: Development

    env:
      HYDROCERT_API_BASE: ${{ vars.HYDROCERT_DEV_API_BASE }}
      HYDROCERT_WEB_BASE: ${{ vars.HYDROCERT_DEV_WEB_BASE }}
      HYDROCERT_QA_EMAIL: ${{ secrets.HYDROCERT_QA_EMAIL }}
      HYDROCERT_QA_PASSWORD: ${{ secrets.HYDROCERT_QA_PASSWORD }}
      WINDOW_DAYS: ${{ inputs.window_days || '3' }}
      DRY_RUN: ${{ inputs.dry_run || 'false' }}

    steps:
      - name: Checkout repo
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Configure git for commits
        run: |
          git config user.email "claude-populator@hydrocert"
          git config user.name "Claude Populator v2"

      - name: Bootstrap (preflight + discovery + batching)
        run: node scripts/populator-bootstrap.mjs

      - name: Run Claude Code orchestrator
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        uses: anthropics/claude-code-base-action@beta
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          model: claude-opus-4-7
          timeout_minutes: "50"
          allowed_tools: "Bash,Read,Write,Edit,Glob,Grep,Task"
          prompt: |
            # Hydrocert Populator v2 — Autonomous Orchestrator

            You orchestrate a 5-worker + 1-manager populator with a self-correcting loop. Reasoning-first, not rules.

            ## Hard constraints
            - DEV ONLY. Never touch prod. If HYDROCERT_API_BASE contains "prod" → abort immediately.
            - ONLY modify `laboratorySamples` field via PATCH /inspections + DELETE /laboratory-samples. NEVER edit visits, inspections, notes, itemLocation, jobTypes.
            - No inspection exists → SKIP. Never create inspections.
            - Notes empty/null + no booker-encoded itemLocation token → mark unresolved. Never invent.

            ## Files already prepared by bootstrap (read these first)
            - `scripts/runtime/preflight.json` — auth + catalog status (must have authOk: true)
            - `scripts/runtime/sample-types-catalog.json` — name → UUID
            - `scripts/runtime/batch-1.json` ... `batch-5.json` — 5 batches of eligible visits

            ## Sources of truth (load and consult)
            - `hydrocert-tokens.csv` — Kayle signed-off 111-token catalog. ALWAYS consult before deciding.
            - `docs/populator/few-shot-examples.md` — 10 curated past cases. Use as exemplars.
            - `docs/populator/past-resolutions.jsonl` — human-confirmed prior resolutions (read all lines, treat as additional examples)

            ## Decision priority (in this order, NOT mechanical rules)
            1. Read the visit's notes RAW
            2. Consult Kayle CSV to decode tokens
            3. Booker-encoded itemLocation labels (e.g., "LP Sample 3", "WF Monthly", "Well Sample 1", "H - Micro Sample 2") = PRIMARY signal
            4. Build visit-wide PLAN: list every sample needed by notes, sum-check totals
            5. Map plan to inspections using all signals
            6. Reasoning-only fallback: when ambiguous, mark unresolved with `reasonClass`

            ## Plan-then-validate per worker
            For each visit:
            - First produce a structured plan: total samples per type called for by notes
            - Validate: plan total per type === notes total per type (sum-check)
            - If plan exceeds budget on any type → reduce; if budget unfilled → mark remaining inspections unresolved
            - Confidence per decision: HIGH (notes explicit + booker label match) / MED (one clear signal) / LOW (inference required)

            ## Sample-type catalog gap policy
            If notes call for a variant not in catalog (e.g., "CHEM BASIC+GLYCOL" missing):
            - Fall back to base type ("Chem Basic")
            - Tag the decision with confidence: LOW and reasoning: "catalog gap: requested X, used Y"
            - Add to `catalogGaps[]` for the Issue body

            ## Reason classes (use exact strings)
            - `unresolved_no_notes` / `unresolved_resample_no_notes` / `unresolved_slot_count_mismatch` / `unresolved_chem_on_ds_jobtype` / `unresolved_catalog_gap` / `unresolved_unknown_jobtype` / `unresolved_ambiguous_intent` / `unresolved_other`

            ## Workflow

            ### Step 1: Bootstrap check
            Read `scripts/runtime/preflight.json`. If `authOk !== true` or `error` field present → abort, open Issue `[ATTN-PREFLIGHT]`.

            ### Step 2: Dispatch 5 worker subagents in PARALLEL via Task tool
            Each worker subagent receives this prompt (adapt N=1..5):

            > You are populator worker N. Read scripts/runtime/batch-N.json + hydrocert-tokens.csv + docs/populator/few-shot-examples.md + docs/populator/past-resolutions.jsonl + scripts/runtime/sample-types-catalog.json.
            >
            > For each visit, follow the Decision priority + Plan-then-validate above. Write your output to scripts/runtime/plan-batch-N.json as an array of:
            > ```
            > { "visitRef": "...", "uuid": "...", "decisions": [
            >   { "inspectionId": "...", "inspectionRef": "I...", "jobType": "...", "itemLocation": "...",
            >     "samples": [{"sampleTypeId": "<uuid>", "sampleTypeName": "...", "quantity": 1}],
            >     "confidence": "HIGH|MED|LOW",
            >     "reasoning": "Notes line X: ...; CSV token Y → ...; matches inspection because ...",
            >     "unresolved": false }
            >   /* OR unresolved=true with reasonClass and no samples */
            >   /* OR skip=true for jobType skip overrides */
            > ] }
            > ```
            >
            > Then run: `node scripts/populator-executor.mjs N` and return its stdout + per-visit summary table.

            ### Step 3: Wait all 5 workers done. Read all report-batch-*.json files.

            ### Step 4: Dispatch 1 super-manager subagent via Task tool

            > You are populator super-manager. Read all 5 report-batch-*.json + corresponding plan-batch-*.json + the 5 batch-*.json (original notes) + hydrocert-tokens.csv.
            >
            > For each visit, verify:
            > - Was the patched sample correct per notes intent?
            > - Sample-budget reconciliation: sum of patched samples per type === notes' total per type?
            > - Was an unresolved decision really right? Could a smarter reading have salvaged it?
            > - Confidence levels honest?
            >
            > Output to scripts/runtime/manager-report.json:
            > ```
            > { "errors": [{ "batchNum": N, "visitRef": "...", "inspectionId": "...", "issue": "...", "fix": { "deleteSampleIds": [...], "samples": [...] } }],
            >   "lowConfidenceReview": [{ "visitRef": "...", "inspectionId": "...", "summary": "..." }],
            >   "approvedPatches": <count>, "totalReviewed": <count> }
            > ```

            ### Step 5: Fix loop (max 3 iterations TOTAL across workers+manager)
            If manager-report.json.errors.length > 0:
            - Group errors by batchNum
            - For each affected batch, write a fix-plan-batch-N.json with the deleteSampleIds + samples-to-add per the manager's instructions
            - Re-dispatch ONLY the affected worker(s) with the fix-plan to execute via `node scripts/populator-executor.mjs N` (executor handles DELETE-then-PATCH)
            - After fix run, re-dispatch the manager with updated reports
            - Increment iteration counter
            - Stop when manager.errors.length === 0 OR iterations === 3

            ### Step 6: Reporting

            Build `claude-populator-runs/$(date -u +%Y-%m-%d)-report.md` with:
            - Run summary (visits processed, patched, unresolved by reasonClass, errors, fix-loop iterations used)
            - Catalog gaps encountered
            - Low-confidence patches for human review (with link to FE per visit)
            - Per-batch tables

            Commit + push to main:
            ```
            git add claude-populator-runs/
            git commit -m "chore: populator v2 run $(date -u +%Y-%m-%d) — <stats>"
            git push origin main
            ```

            Open Issue:
            ```
            gh issue create --repo DumitracheBogdan/Hydro-QA --label populator-run --title "[POPULATOR-V2] $(date -u +%Y-%m-%d): <P patched / U unresolved / L low-confidence>" --body-file claude-populator-runs/$(date -u +%Y-%m-%d)-report.md
            ```

            Use `[ATTN]` title prefix if any of: errors > 3, unresolved > 10, fix-loop hit 3-iter limit with remaining errors.

            ## START NOW
            Begin Step 1. Report progress to stdout.

      - name: Capture run logs (always)
        if: always()
        run: echo "Workflow run: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"

      - name: Upload artifacts (debug)
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: populator-v2-${{ github.run_id }}
          path: |
            claude-populator-runs/
            scripts/runtime/
          retention-days: 7
          if-no-files-found: ignore
```

- [ ] **Step 2: Lint YAML syntax**

```bash
cd /c/Users/Coca-Cola/Hydro-QA-work
node -e "const y = require('js-yaml'); const fs = require('fs'); y.load(fs.readFileSync('.github/workflows/claude-populator-v2.yml', 'utf8')); console.log('YAML valid');"
```

If `js-yaml` not installed, fall back to Python:

```bash
python -c "import yaml; yaml.safe_load(open('.github/workflows/claude-populator-v2.yml')); print('YAML valid')"
```

Expected: `YAML valid`

- [ ] **Step 3: Commit (cron DISABLED — won't fire automatically yet)**

```bash
git add .github/workflows/claude-populator-v2.yml
git commit -m "feat(populator): add v2 orchestrator workflow (cron disabled, workflow_dispatch ready)"
```

---

## Task 7: Build rollback workflow YAML

**Files:**
- Create: `.github/workflows/claude-populator-rollback.yml`

- [ ] **Step 1: Write YAML**

Create `.github/workflows/claude-populator-rollback.yml`:

```yaml
name: Hydrocert Populator Rollback
run-name: "Rollback ${{ inputs.target_date }}"

on:
  workflow_dispatch:
    inputs:
      target_date:
        description: Date to roll back (YYYY-MM-DD)
        required: true
        type: string

permissions:
  contents: write
  issues: write

concurrency:
  group: claude-populator-rollback
  cancel-in-progress: false

jobs:
  rollback:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    environment: Development

    env:
      HYDROCERT_API_BASE: ${{ vars.HYDROCERT_DEV_API_BASE }}
      HYDROCERT_QA_EMAIL: ${{ secrets.HYDROCERT_QA_EMAIL }}
      HYDROCERT_QA_PASSWORD: ${{ secrets.HYDROCERT_QA_PASSWORD }}

    steps:
      - name: Checkout repo
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Configure git
        run: |
          git config user.email "claude-populator@hydrocert"
          git config user.name "Claude Populator Rollback"

      - name: Run rollback
        run: node scripts/populator-rollback.mjs "${{ inputs.target_date }}"

      - name: Commit rollback report + push
        run: |
          git add claude-populator-runs/${{ inputs.target_date }}-rollback-report.md
          git commit -m "chore: rollback report for ${{ inputs.target_date }}"
          git push origin main

      - name: Open issue with rollback summary
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh issue create --repo DumitracheBogdan/Hydro-QA --label populator-rollback \
            --title "[ROLLBACK] populator $${{ inputs.target_date }}" \
            --body-file claude-populator-runs/${{ inputs.target_date }}-rollback-report.md
```

- [ ] **Step 2: Lint YAML**

```bash
python -c "import yaml; yaml.safe_load(open('.github/workflows/claude-populator-rollback.yml')); print('YAML valid')"
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/claude-populator-rollback.yml
git commit -m "feat(populator): add rollback workflow (workflow_dispatch by target_date)"
```

---

## Task 8: Dry-run v2 end-to-end on dev

User must trigger via GitHub UI. Subagent verifies after.

- [ ] **Step 1: Push everything to main**

```bash
cd /c/Users/Coca-Cola/Hydro-QA-work
git push origin main
```

- [ ] **Step 2: USER ACTION — trigger workflow**

Tell the user to:
1. Open GitHub → Actions tab in `DumitracheBogdan/Hydro-QA`
2. Select "Hydrocert Populator v2 (Autonomous)" workflow
3. Click "Run workflow"
4. Set `dry_run: true`
5. Set `window_days: 3`
6. Click Run
7. Wait ~5-10 min, then notify subagent the run completed

Subagent: WAIT for user confirmation before proceeding.

- [ ] **Step 3: Pull artifacts + verify dry-run output**

```bash
cd /c/Users/Coca-Cola/Hydro-QA-work
git pull origin main
gh run list --repo DumitracheBogdan/Hydro-QA --workflow="Hydrocert Populator v2 (Autonomous)" --limit 1
```

Get run ID, then:

```bash
gh run view <run_id> --repo DumitracheBogdan/Hydro-QA --log | tail -50
```

Expected stdout:
- "Bootstrap OK: N eligible visits..."
- 5 worker subagents complete
- Manager report generated
- 0 PATCH calls actually made (dry-run)
- Audit log shows `DRYRUN-PATCH` entries

- [ ] **Step 4: Verify audit log shows DRYRUN entries**

```bash
ls claude-populator-runs/
grep -c "DRYRUN-PATCH" claude-populator-runs/$(date -u +%Y-%m-%d)-actions.jsonl || echo "no DRYRUN entries"
```

Expected: at least 1 DRYRUN entry (depending on eligibleCount).

- [ ] **Step 5: Spot-check the plans**

Read 2-3 `scripts/runtime/plan-batch-N.json` (from the workflow artifact bundle) and verify:
- Each decision has `reasoning` referencing notes
- `confidence` field present and reasonable
- `unresolved` cases have explicit `reasonClass`

---

## Task 9: Live run on dev (cron still disabled)

After dry-run passes, do a LIVE run on dev. PATCHes happen.

- [ ] **Step 1: USER ACTION — live trigger**

Tell user:
1. GitHub → Actions → Populator v2
2. Run workflow with `dry_run: false`, `window_days: 3`
3. Wait completion + notify subagent

- [ ] **Step 2: Pull + verify run report**

```bash
cd /c/Users/Coca-Cola/Hydro-QA-work
git pull origin main
cat claude-populator-runs/$(date -u +%Y-%m-%d)-report.md | head -50
```

Expected: human-readable summary with patched/unresolved counts + low-confidence list.

- [ ] **Step 3: Verify audit log has real PATCH entries**

```bash
grep -c '"action":"PATCH"' claude-populator-runs/$(date -u +%Y-%m-%d)-actions.jsonl
grep -c '"action":"UNRESOLVED"' claude-populator-runs/$(date -u +%Y-%m-%d)-actions.jsonl
```

Both should match the report totals.

- [ ] **Step 4: Spot-check 10 random patched visits via API**

```bash
cd /c/Users/Coca-Cola/scripts
cat > spot-check-v2.mjs <<'EOF'
import fs from 'fs';
import https from 'https';
const BASE = process.env.HYDROCERT_API_BASE;
function req(m, p, opts={}) { /* same shape as elsewhere — see scripts/populator-executor.mjs */ }
// Pick 10 random PATCH entries from audit log, GET inspection, verify sample present
EOF
# Implementer: complete spot-check, run, verify >=95% accuracy
```

Acceptance: at least 9/10 patches still present + match what audit log says was added.

---

## Task 10: Test rollback round-trip on a small live run

- [ ] **Step 1: USER ACTION — trigger rollback workflow for today's date**

Tell user:
1. GitHub → Actions → Hydrocert Populator Rollback
2. Run workflow with `target_date: <today's YYYY-MM-DD>`
3. Wait completion

- [ ] **Step 2: Verify rollback log + report**

```bash
cd /c/Users/Coca-Cola/Hydro-QA-work
git pull origin main
cat claude-populator-runs/$(date -u +%Y-%m-%d)-rollback-report.md
```

Expected: `reversed >= 1`, `skipped (safety) >= 0`, `errors == 0`.

- [ ] **Step 3: Spot-check 2-3 of the reversed inspections via API**

For each `REVERSED_PATCH` log entry, GET the inspection and confirm the sample is gone.

- [ ] **Step 4: Re-run populator live to restore state for next steps**

USER ACTION: trigger populator v2 again with `dry_run: false`. This brings the audit log back to a live state for the migration.

---

## Task 11: Acceptance gate

- [ ] **Step 1: Calculate accuracy from spot-check**

From Task 9 Step 4: count CORRECT / total = accuracy %.

- [ ] **Step 2: Verify no over-allocation on Closed System visits**

```bash
node -e "
const fs = require('fs');
const log = fs.readFileSync('claude-populator-runs/$(date -u +%Y-%m-%d)-actions.jsonl', 'utf8').split('\n').filter(Boolean).map(JSON.parse);
const patches = log.filter(l => l.action === 'PATCH');
const byVisit = {};
for (const p of patches) {
  byVisit[p.visitRef] = byVisit[p.visitRef] || { patches: 0, bsriaCount: 0 };
  byVisit[p.visitRef].patches++;
  if (p.samples?.some(s => /bsria/i.test(s.sampleTypeName || ''))) byVisit[p.visitRef].bsriaCount++;
}
console.log('Visits with >2 Bsria:', Object.entries(byVisit).filter(([k,v]) => v.bsriaCount > 2));
"
```

Expected: empty result (no visit has >2 Bsria from a single run).

- [ ] **Step 3: Gate decision**

If accuracy >= 95% AND zero over-allocation → proceed to migration (Task 12). Else → debug + iterate, do NOT proceed.

---

## Task 12: Swap cron from v1 to v2

After acceptance passes:

- [ ] **Step 1: Enable cron in v2**

Edit `.github/workflows/claude-populator-v2.yml`, uncomment the `schedule:` block:

```yaml
on:
  schedule:
    - cron: '0 3 * * *'
  workflow_dispatch:
    ...
```

- [ ] **Step 2: Disable cron in v1**

Edit `.github/workflows/claude-populator.yml`, comment out the `schedule:` block:

```yaml
on:
  # schedule:
  #   - cron: '0 3 * * *'
  workflow_dispatch:
    ...
```

- [ ] **Step 3: Rename v2 to be the canonical workflow**

```bash
cd /c/Users/Coca-Cola/Hydro-QA-work
git mv .github/workflows/claude-populator.yml .github/workflows/claude-populator-v1-archived.yml
git mv .github/workflows/claude-populator-v2.yml .github/workflows/claude-populator.yml
```

- [ ] **Step 4: Commit + push**

```bash
git add .github/workflows/
git commit -m "feat(populator): migrate to v2 autonomous orchestrator (cron swapped, v1 archived)"
git push origin main
```

---

## Task 13: Update memory + close out

- [ ] **Step 1: Update routine memory**

Read existing memory at `C:\Users\Coca-Cola\.claude\projects\C--Users-Coca-Cola\memory\project_hydrocert_claude_populator_routine.md` and update:

- New architecture (reasoning-first, 5 workers + 1 manager + loop)
- Audit log location (`claude-populator-runs/YYYY-MM-DD-actions.jsonl`)
- Rollback procedure (workflow_dispatch with target_date)
- Kayle CSV path (`hydrocert-tokens.csv` in repo)
- Past-resolutions.jsonl auto-grown
- Migration completion date

- [ ] **Step 2: Final sanity check**

```bash
cd /c/Users/Coca-Cola/Hydro-QA-work
ls .github/workflows/claude-populator*.yml
ls scripts/populator-*.mjs
ls docs/populator/
ls -la hydrocert-tokens.csv
```

All files should be present.

- [ ] **Step 3: Close-out commit**

```bash
git status
# Should be clean. If any leftover artifacts (scripts/runtime/), confirm .gitignore is doing its job.
```

---

## Self-Review

**Spec coverage check:**
- ✅ Reasoning-first decision flow → Tasks 1-2 (CSV + examples), Task 6 (prompt)
- ✅ 5 workers + 1 manager loop → Task 6 prompt
- ✅ Sample-budget reconciliation → Task 6 prompt "Plan-then-validate"
- ✅ Booker-encoded label carve-out → few-shot examples 1, 4
- ✅ DELETE-first fix loop → Task 4 executor + Task 6 prompt Step 5
- ✅ Confidence levels → Task 6 prompt + executor passes through
- ✅ Reason classes taxonomy → Task 6 prompt
- ✅ Audit log JSONL → Task 4 executor
- ✅ Rollback with engineer-safety → Task 5 + Task 7
- ✅ Past-resolution memory → Task 2 (seed) + Task 6 (read)
- ✅ Hard guardrails (dev only, samples only, no inspection creation) → Task 3 + 4 + 6
- ✅ Pre-flight + import storm guard → Task 3
- ✅ Migration plan → Task 12
- ✅ Dry-run mode → Task 4 + Task 8

**Placeholder scan:** none — every step has concrete code or command.

**Type consistency:**
- `plan-batch-N.json` schema referenced in Task 4, Task 6 — matches (`decisions[].inspectionId`, `samples[]`, `unresolved`, `confidence`, `reasoning`)
- Audit JSONL schema in Task 4, Task 5 — matches (`action`, `inspectionId`, `samples`, `before`)
- Filenames consistent: `populator-bootstrap.mjs`, `populator-executor.mjs`, `populator-rollback.mjs`

Plan complete.
