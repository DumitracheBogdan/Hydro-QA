import fs from 'node:fs';
import path from 'node:path';
import { request } from 'playwright';

const API_BASE = process.env.HYDROCERT_API_BASE || 'https://hydrocert-dev-api-exajhpd0brg2bcar.ukwest-01.azurewebsites.net';
const EMAIL = process.env.HYDROCERT_QA_EMAIL || '';
const PASSWORD = process.env.HYDROCERT_QA_PASSWORD || '';

const stamp = new Date().toISOString().replace(/[.:]/g, '-');
const runName = `dev-infra-soak-10m-${stamp}`;
const runDir = path.join(process.cwd(), 'qa-artifacts', 'infra-regression', runName);
fs.mkdirSync(runDir, { recursive: true });

const checks = [];

function addCheck({ id, area, test, status, details }) {
  checks.push({ id, area, test, status, details });
  console.log(`${id} | ${status} | ${test} | ${details}`);
}

function p95(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.max(0, Math.ceil(s.length * 0.95) - 1)];
}

const anon = await request.newContext({ baseURL: API_BASE });
let token = '';

try {
  const login = await anon.post('/auth/login', { data: { email: EMAIL, password: PASSWORD } });
  let body = {};
  try { body = await login.json(); } catch {}
  token = body?.tokens?.accessToken || body?.accessToken || body?.token || '';
  addCheck({
    id: 'SOAK-00',
    area: 'Soak/API',
    test: 'Auth for soak test',
    status: token ? 'PASS' : 'FAIL',
    details: token ? `loginStatus=${login.status()}` : `loginStatus=${login.status()}, tokenMissing=true`,
  });

  if (!token) {
    throw new Error('Cannot run soak without token');
  }
} finally {
  await anon.dispose();
}

const api = await request.newContext({
  baseURL: API_BASE,
  extraHTTPHeaders: { Authorization: `Bearer ${token}` },
});

try {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()).toISOString();
  const visitsEp = `/visits/calendar-filter?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}&page=1&limit=20`;

  const endpoints = [
    '/health',
    '/users/profile/me',
    '/customers/filtered?page=1&limit=20',
    visitsEp,
    '/products',
  ];

  const durationMs = 10 * 60 * 1000;
  const checkpointMs = 60 * 1000;
  const startTs = Date.now();
  let nextCheckpoint = startTs + checkpointMs;

  let totalReq = 0;
  let totalFail = 0;
  const allLat = [];

  let minuteReq = 0;
  let minuteFail = 0;
  let minuteLat = [];
  let minuteIndex = 0;

  while (Date.now() - startTs < durationMs) {
    const burst = await Promise.all(
      endpoints.map(async (ep) => {
        const t0 = Date.now();
        const r = await api.get(ep);
        const ms = Date.now() - t0;
        return { status: r.status(), ms };
      }),
    );

    for (const item of burst) {
      totalReq += 1;
      minuteReq += 1;
      allLat.push(item.ms);
      minuteLat.push(item.ms);
      if (item.status >= 400) {
        totalFail += 1;
        minuteFail += 1;
      }
    }

    if (Date.now() >= nextCheckpoint) {
      minuteIndex += 1;
      const details = {
        req: minuteReq,
        fail: minuteFail,
        p95: p95(minuteLat),
        avg: minuteLat.length ? Math.round(minuteLat.reduce((a, b) => a + b, 0) / minuteLat.length) : 0,
      };
      addCheck({
        id: `SOAK-${String(minuteIndex).padStart(2, '0')}`,
        area: 'Soak/API',
        test: `Minute checkpoint ${minuteIndex}`,
        status: minuteFail === 0 ? 'PASS' : 'FAIL',
        details: `req=${details.req}, fail=${details.fail}, p95=${details.p95}ms, avg=${details.avg}ms`,
      });

      minuteReq = 0;
      minuteFail = 0;
      minuteLat = [];
      nextCheckpoint += checkpointMs;
    }

    await new Promise((res) => setTimeout(res, 5000));
  }

  const summary = {
    totalReq,
    totalFail,
    errorRate: totalReq ? Number((totalFail / totalReq).toFixed(4)) : 0,
    p95: p95(allLat),
    avg: allLat.length ? Math.round(allLat.reduce((a, b) => a + b, 0) / allLat.length) : 0,
    min: allLat.length ? Math.min(...allLat) : 0,
    max: allLat.length ? Math.max(...allLat) : 0,
  };

  addCheck({
    id: 'SOAK-11',
    area: 'Soak/API',
    test: 'Final 10-minute soak summary',
    status: summary.totalFail === 0 && summary.p95 <= 2500 ? 'PASS' : 'FAIL',
    details: JSON.stringify(summary),
  });
} finally {
  await api.dispose();
}

const totals = {
  total: checks.length,
  pass: checks.filter((c) => c.status === 'PASS').length,
  fail: checks.filter((c) => c.status === 'FAIL').length,
  skip: checks.filter((c) => c.status === 'SKIP').length,
};

const output = {
  generatedAt: new Date().toISOString(),
  runName,
  environment: { apiBase: API_BASE },
  totals,
  checks,
};

const summaryPath = path.join(runDir, 'summary.json');
fs.writeFileSync(summaryPath, JSON.stringify(output, null, 2));

console.log(`SUMMARY_JSON=${summaryPath}`);
console.log(`TOTAL=${totals.total} PASS=${totals.pass} FAIL=${totals.fail} SKIP=${totals.skip}`);

