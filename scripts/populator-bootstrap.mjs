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
