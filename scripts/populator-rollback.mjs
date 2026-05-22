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
      // We added samples to inspectionId; need to find + DELETE them.
      // Safety: only delete samples whose sampleTypeId matches what we wrote.
      const insp = (await req('GET', `/inspections/${entry.inspectionId}`, { token })).body;
      const current = (insp?.laboratorySamples || []);
      const expectedTypes = (entry.samples || []).map(s => s.sampleTypeId);
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
