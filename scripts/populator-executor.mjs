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
      // Schema validator: reject legacy singular-field schema before silent drop.
      // Legacy worker output sometimes uses sampleType / sampleUuid (singular) instead of samples[] array.
      if ((d.sampleType || d.sampleUuid) && !Array.isArray(d.samples)) {
        vr.decisions.push({ ...d, status: 'schema-error' });
        report.totals.errors++;
        appendAudit({ action: 'SCHEMA_ERROR', batchNum, visitRef: v.visitRef, inspectionId: d.inspectionId, reason: 'legacy singular sampleType/sampleUuid — expected samples[] array', raw: { sampleType: d.sampleType, sampleUuid: d.sampleUuid } });
        continue;
      }
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
