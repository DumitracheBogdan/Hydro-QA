import fs from 'node:fs';
import path from 'node:path';
import tls from 'node:tls';
import dns from 'node:dns/promises';
import { request } from 'playwright';

const WEB_BASE = process.env.HYDROCERT_WEB_BASE || 'https://hydrocert-dev-webapp-fzgveghygfc3enbt.ukwest-01.azurewebsites.net';
const API_BASE = process.env.HYDROCERT_API_BASE || 'https://hydrocert-dev-api-exajhpd0brg2bcar.ukwest-01.azurewebsites.net';
const EMAIL = process.env.HYDROCERT_QA_EMAIL || '';
const PASSWORD = process.env.HYDROCERT_QA_PASSWORD || '';
const REGRESSION_MODE = (process.env.HYDROCERT_REGRESSION_MODE || 'standard').toLowerCase();

const stamp = new Date().toISOString().replace(/[.:]/g, '-');
const runName = `dev-infra-api-ultra-${stamp}`;
const runDir = path.join(process.cwd(), 'qa-artifacts', 'infra-regression', runName);
fs.mkdirSync(runDir, { recursive: true });

const checks = [];

function add({ id, area, test, status, details }) {
  checks.push({ id, area, test, status, details });
  console.log(`${id} | ${status} | ${test} | ${details}`);
}

async function check(id, area, test, fn) {
  try {
    const r = await fn();
    add({ id, area, test, status: r?.status || 'PASS', details: r?.details || '' });
  } catch (e) {
    add({ id, area, test, status: 'FAIL', details: String(e).replace(/\s+/g, ' ').slice(0, 260) });
  }
}

function arr(x) {
  if (Array.isArray(x)) return x;
  if (Array.isArray(x?.data)) return x.data;
  if (Array.isArray(x?.items)) return x.items;
  if (Array.isArray(x?.results)) return x.results;
  return [];
}

function p95(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.max(0, Math.ceil(s.length * 0.95) - 1)];
}

function decodeJwt(token) {
  try {
    const payloadPart = String(token || '').split('.')[1];
    if (!payloadPart) return null;
    const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));
  } catch {
    return null;
  }
}

async function certDays(host) {
  return await new Promise((resolve, reject) => {
    const socket = tls.connect(443, host, { servername: host, rejectUnauthorized: false }, () => {
      try {
        const cert = socket.getPeerCertificate();
        socket.end();
        const validTo = cert?.valid_to ? new Date(cert.valid_to) : null;
        const days = validTo ? Math.floor((validTo.getTime() - Date.now()) / 86400000) : -1;
        resolve({ days, issuer: cert?.issuer?.CN || '', validTo: validTo?.toISOString() || '' });
      } catch (e) {
        reject(e);
      }
    });
    socket.on('error', reject);
  });
}

async function perfSeq(api, endpoint, n) {
  const times = [];
  let fails = 0;
  for (let i = 0; i < n; i += 1) {
    const t0 = Date.now();
    const r = await api.get(endpoint);
    times.push(Date.now() - t0);
    if (r.status() >= 400) fails += 1;
  }
  return { n, fails, p95: p95(times), avg: Math.round(times.reduce((a, b) => a + b, 0) / times.length), min: Math.min(...times), max: Math.max(...times) };
}

async function perfParallel(api, endpoints, total, concurrency) {
  const times = [];
  let fails = 0;
  let idx = 0;
  const worker = async () => {
    while (idx < total) {
      const n = idx;
      idx += 1;
      const ep = endpoints[n % endpoints.length];
      const t0 = Date.now();
      const r = await api.get(ep);
      times.push(Date.now() - t0);
      if (r.status() >= 400) fails += 1;
    }
  };
  const tAll = Date.now();
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return {
    total,
    concurrency,
    fails,
    durationMs: Date.now() - tAll,
    p95: p95(times),
    avg: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
    min: Math.min(...times),
    max: Math.max(...times),
  };
}

const webHost = new URL(WEB_BASE).host;
const apiHost = new URL(API_BASE).host;

const anon = await request.newContext({ baseURL: API_BASE });
const webReq = await request.newContext({ baseURL: WEB_BASE });

let token = '';
let users = [];
let customers1 = [];
let visits = [];

try {
  await check('I01', 'Infra', 'Web root responds 200', async () => {
    const r = await webReq.get('/');
    return r.ok() ? { status: 'PASS', details: `status=${r.status()}` } : { status: 'FAIL', details: `status=${r.status()}` };
  });

  await check('I02', 'Infra', 'API health responds 200', async () => {
    const r = await anon.get('/health');
    return r.ok() ? { status: 'PASS', details: `status=${r.status()}` } : { status: 'FAIL', details: `status=${r.status()}` };
  });

  await check('I03', 'Infra', 'Critical web routes reachable', async () => {
    const routes = ['/dashboard', '/customers', '/visits-list', '/planner', '/visits', '/visits/addnewvisit'];
    const bad = [];
    for (const rt of routes) {
      const r = await webReq.get(rt);
      if (!r.ok()) bad.push(`${rt}:${r.status()}`);
    }
    return bad.length ? { status: 'FAIL', details: bad.join(' | ') } : { status: 'PASS', details: `routes=${routes.length}` };
  });

  await check('I04', 'Infra', 'Web host DNS resolves', async () => {
    const ips = await dns.lookup(webHost, { all: true });
    return ips.length ? { status: 'PASS', details: ips.map((x) => x.address).join(', ') } : { status: 'FAIL', details: 'no ips' };
  });

  await check('I05', 'Infra', 'API host DNS resolves', async () => {
    const ips = await dns.lookup(apiHost, { all: true });
    return ips.length ? { status: 'PASS', details: ips.map((x) => x.address).join(', ') } : { status: 'FAIL', details: 'no ips' };
  });

  await check('I06', 'Infra', 'Web TLS cert has >= 15 days left', async () => {
    const c = await certDays(webHost);
    return c.days >= 15 ? { status: 'PASS', details: `days=${c.days}` } : { status: 'FAIL', details: `days=${c.days}, validTo=${c.validTo}` };
  });

  await check('I07', 'Infra', 'API TLS cert has >= 15 days left', async () => {
    const c = await certDays(apiHost);
    return c.days >= 15 ? { status: 'PASS', details: `days=${c.days}` } : { status: 'FAIL', details: `days=${c.days}, validTo=${c.validTo}` };
  });

  await check('A01', 'Auth/API', 'Valid login returns token', async () => {
    const r = await anon.post('/auth/login', { data: { email: EMAIL, password: PASSWORD } });
    let j = {};
    try { j = await r.json(); } catch {}
    token = j?.tokens?.accessToken || j?.accessToken || j?.token || '';
    if (r.status() >= 400 || !token) return { status: 'FAIL', details: `status=${r.status()}, token=${Boolean(token)}` };
    return { status: 'PASS', details: `status=${r.status()}, tokenLength=${token.length}` };
  });

  await check('A02', 'Auth/API', 'Invalid login rejected', async () => {
    const r = await anon.post('/auth/login', { data: { email: EMAIL, password: 'Wrong#Password!123' } });
    return [400, 401, 403].includes(r.status()) ? { status: 'PASS', details: `status=${r.status()}` } : { status: 'FAIL', details: `status=${r.status()}` };
  });

  await check('A03', 'Auth/API', 'Profile without token rejected', async () => {
    const r = await anon.get('/users/profile/me');
    return [401, 403].includes(r.status()) ? { status: 'PASS', details: `status=${r.status()}` } : { status: 'FAIL', details: `status=${r.status()}` };
  });

  await check('A04', 'Auth/API', 'Profile with invalid token rejected', async () => {
    const bad = await request.newContext({ baseURL: API_BASE, extraHTTPHeaders: { Authorization: 'Bearer invalid.token.value' } });
    const r = await bad.get('/users/profile/me');
    await bad.dispose();
    return [401, 403].includes(r.status()) ? { status: 'PASS', details: `status=${r.status()}` } : { status: 'FAIL', details: `status=${r.status()}` };
  });

  if (!token) throw new Error('No token from valid login; cannot run deep API checks');

  const api = await request.newContext({ baseURL: API_BASE, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()).toISOString();
  const absStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const absEnd = new Date(now.getFullYear(), now.getMonth() + 2, 1).toISOString().slice(0, 10);
  const visitsEP50 = `/visits/calendar-filter?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}&page=1&limit=50`;

  try {
    await check('A05', 'API', 'Profile with token returns authenticated account', async () => {
      const r = await api.get('/users/profile/me');
      let j = {};
      try { j = await r.json(); } catch {}
      const claims = decodeJwt(token) || {};
      const mail = String(j?.email || '').toLowerCase();
      const expectedEmails = new Set(
        [String(EMAIL || '').trim().toLowerCase(), String(claims?.email || '').trim().toLowerCase()].filter(Boolean)
      );
      const hasIdentity = Boolean(String(j?.id || j?.userId || j?.email || '').trim());
      const emailMatches = !expectedEmails.size || expectedEmails.has(mail);
      if (r.status() >= 400 || !hasIdentity || !mail.includes('@') || !emailMatches) {
        return {
          status: 'FAIL',
          details: `status=${r.status()}, email=${mail}, expected=${[...expectedEmails].join('|') || 'n/a'}`,
        };
      }
      return { status: 'PASS', details: `email=${mail}, role=${String(j?.role || claims?.role || 'n/a')}` };
    });

    await check('A06', 'API', 'Users endpoint returns non-empty array', async () => {
      const r = await api.get('/users');
      let j = {};
      try { j = await r.json(); } catch {}
      users = arr(j);
      if (r.status() >= 400 || !users.length) return { status: 'FAIL', details: `status=${r.status()}, count=${users.length}` };
      return { status: 'PASS', details: `count=${users.length}` };
    });

    await check('A07', 'API', 'Users IDs unique in sample', async () => {
      const ids = users.slice(0, 60).map((u) => String(u.id || u.userId || '')).filter(Boolean);
      if (!ids.length) return { status: 'FAIL', details: 'no ids found' };
      const uniq = new Set(ids);
      return uniq.size === ids.length ? { status: 'PASS', details: `sample=${ids.length}` } : { status: 'FAIL', details: `dupes=${ids.length - uniq.size}` };
    });

    await check('A08', 'API', 'Customers filtered page1 limit20 returns <=20', async () => {
      const r = await api.get('/customers/filtered?page=1&limit=20');
      let j = {};
      try { j = await r.json(); } catch {}
      customers1 = arr(j);
      if (r.status() >= 400 || customers1.length > 20) return { status: 'FAIL', details: `status=${r.status()}, count=${customers1.length}` };
      return { status: 'PASS', details: `count=${customers1.length}` };
    });

    await check('A09', 'API', 'Customers limit1 returns <=1', async () => {
      const r = await api.get('/customers/filtered?page=1&limit=1');
      let j = {};
      try { j = await r.json(); } catch {}
      const a = arr(j);
      return r.status() >= 400 || a.length > 1 ? { status: 'FAIL', details: `status=${r.status()}, count=${a.length}` } : { status: 'PASS', details: `count=${a.length}` };
    });

    await check('A10', 'API', 'Customers limit5 returns <=5', async () => {
      const r = await api.get('/customers/filtered?page=1&limit=5');
      let j = {};
      try { j = await r.json(); } catch {}
      const a = arr(j);
      return r.status() >= 400 || a.length > 5 ? { status: 'FAIL', details: `status=${r.status()}, count=${a.length}` } : { status: 'PASS', details: `count=${a.length}` };
    });

    await check('A11', 'API', 'Customers page2 differs from page1 when available', async () => {
      const r = await api.get('/customers/filtered?page=2&limit=20');
      let j = {};
      try { j = await r.json(); } catch {}
      const c2 = arr(j);
      if (r.status() >= 400) return { status: 'FAIL', details: `status=${r.status()}` };
      if (!c2.length) return { status: 'SKIP', details: 'page2 empty' };
      const s1 = new Set(customers1.map((x) => String(x.id || x.customerId || x.siteId || '')).filter(Boolean));
      const s2 = new Set(c2.map((x) => String(x.id || x.customerId || x.siteId || '')).filter(Boolean));
      const overlap = [...s2].filter((id) => s1.has(id)).length;
      if (overlap === s2.size && s2.size > 0) return { status: 'FAIL', details: 'page2 fully identical to page1' };
      return { status: 'PASS', details: `page2=${c2.length}, overlap=${overlap}` };
    });

    await check('A12', 'API', 'Visits filter endpoint returns array', async () => {
      const r = await api.get(visitsEP50);
      let j = {};
      try { j = await r.json(); } catch {}
      visits = arr(j);
      if (r.status() >= 400 || !Array.isArray(visits)) return { status: 'FAIL', details: `status=${r.status()}` };
      return { status: 'PASS', details: `count=${visits.length}` };
    });

    await check('A13', 'API', 'Visits limit10 returns <=10', async () => {
      const ep = `/visits/calendar-filter?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}&page=1&limit=10`;
      const r = await api.get(ep);
      let j = {};
      try { j = await r.json(); } catch {}
      const a = arr(j);
      return r.status() >= 400 || a.length > 10 ? { status: 'FAIL', details: `status=${r.status()}, count=${a.length}` } : { status: 'PASS', details: `count=${a.length}` };
    });

    await check('A14', 'API', 'Visits sample has identifiers', async () => {
      const s = visits.slice(0, 30);
      if (!s.length) return { status: 'SKIP', details: 'no visits in range' };
      const good = s.filter((v) => v.id || v.visitReference || v.reference).length;
      return good >= Math.max(1, Math.floor(s.length * 0.7))
        ? { status: 'PASS', details: `good=${good}/${s.length}` }
        : { status: 'FAIL', details: `good=${good}/${s.length}` };
    });

    await check('A15', 'API', 'Products endpoint non-empty', async () => {
      const r = await api.get('/products'); let j = {}; try { j = await r.json(); } catch {}
      const a = arr(j);
      return r.status() >= 400 || !a.length ? { status: 'FAIL', details: `status=${r.status()}, count=${a.length}` } : { status: 'PASS', details: `count=${a.length}` };
    });

    await check('A16', 'API', 'Sample types endpoint non-empty', async () => {
      const r = await api.get('/sample-types'); let j = {}; try { j = await r.json(); } catch {}
      const a = arr(j);
      return r.status() >= 400 || !a.length ? { status: 'FAIL', details: `status=${r.status()}, count=${a.length}` } : { status: 'PASS', details: `count=${a.length}` };
    });

    await check('A17', 'API', 'Labs endpoint non-empty', async () => {
      const r = await api.get('/labs'); let j = {}; try { j = await r.json(); } catch {}
      const a = arr(j);
      return r.status() >= 400 || !a.length ? { status: 'FAIL', details: `status=${r.status()}, count=${a.length}` } : { status: 'PASS', details: `count=${a.length}` };
    });

    await check('A18', 'API', 'Job types endpoint non-empty', async () => {
      const r = await api.get('/job-types'); let j = {}; try { j = await r.json(); } catch {}
      const a = arr(j);
      return r.status() >= 400 || !a.length ? { status: 'FAIL', details: `status=${r.status()}, count=${a.length}` } : { status: 'PASS', details: `count=${a.length}` };
    });

    await check('A19', 'API', 'Absences endpoint returns array-like payload', async () => {
      const ep = `/users/absences?startDate=${absStart}&endDate=${absEnd}`;
      const r = await api.get(ep); let j = {}; try { j = await r.json(); } catch {}
      const a = arr(j);
      return r.status() >= 400 ? { status: 'FAIL', details: `status=${r.status()}` } : { status: 'PASS', details: `count=${a.length}` };
    });

    await check('L01', 'Load/Perf', 'Health p95 <= 300ms (30 seq)', async () => {
      const p = await perfSeq(api, '/health', 30);
      return p.fails === 0 && p.p95 <= 300 ? { status: 'PASS', details: JSON.stringify(p) } : { status: 'FAIL', details: JSON.stringify(p) };
    });

    await check('L02', 'Load/Perf', 'Profile p95 <= 350ms (30 seq)', async () => {
      const p = await perfSeq(api, '/users/profile/me', 30);
      return p.fails === 0 && p.p95 <= 350 ? { status: 'PASS', details: JSON.stringify(p) } : { status: 'FAIL', details: JSON.stringify(p) };
    });

    await check('L03', 'Load/Perf', 'Customers p95 <= 700ms (25 seq)', async () => {
      const p = await perfSeq(api, '/customers/filtered?page=1&limit=20', 25);
      return p.fails === 0 && p.p95 <= 700 ? { status: 'PASS', details: JSON.stringify(p) } : { status: 'FAIL', details: JSON.stringify(p) };
    });

    await check('L04', 'Load/Perf', 'Visits filter p95 <= 1200ms (20 seq)', async () => {
      const p = await perfSeq(api, visitsEP50, 20);
      return p.fails === 0 && p.p95 <= 1200 ? { status: 'PASS', details: JSON.stringify(p) } : { status: 'FAIL', details: JSON.stringify(p) };
    });

    await check('L05', 'Load/Perf', 'Mixed burst 60 req, conc12, 0 failures', async () => {
      const p = await perfParallel(api, ['/health', '/users/profile/me', '/customers/filtered?page=1&limit=20', visitsEP50], 60, 12);
      return p.fails === 0 ? { status: 'PASS', details: JSON.stringify(p) } : { status: 'FAIL', details: JSON.stringify(p) };
    });

    await check('L06', 'Load/Perf', 'Customers burst 40 req, conc10, 0 failures', async () => {
      const p = await perfParallel(api, ['/customers/filtered?page=1&limit=20'], 40, 10);
      return p.fails === 0 ? { status: 'PASS', details: JSON.stringify(p) } : { status: 'FAIL', details: JSON.stringify(p) };
    });

    await check('L07', 'Load/Perf', 'Sustained key endpoints (20 req) 0 failures', async () => {
      const eps = ['/health', '/users/profile/me', '/customers/filtered?page=1&limit=20', visitsEP50];
      const times = []; let fails = 0;
      for (let round = 0; round < 5; round += 1) {
        for (const ep of eps) {
          const t0 = Date.now(); const r = await api.get(ep); times.push(Date.now() - t0); if (r.status() >= 400) fails += 1;
        }
      }
      const s = { total: times.length, fails, p95: p95(times), avg: Math.round(times.reduce((a, b) => a + b, 0) / times.length) };
      return fails === 0 ? { status: 'PASS', details: JSON.stringify(s) } : { status: 'FAIL', details: JSON.stringify(s) };
    });

    await check('L08', 'Load/Perf', 'Mixed burst avg <= 600ms', async () => {
      if (REGRESSION_MODE !== 'full') {
        return { status: 'SKIP', details: 'full regression only' };
      }
      const p = await perfParallel(api, ['/health', '/users/profile/me', '/customers/filtered?page=1&limit=20', visitsEP50], 80, 16);
      return p.fails === 0 && p.avg <= 600 ? { status: 'PASS', details: JSON.stringify(p) } : { status: 'FAIL', details: JSON.stringify(p) };
    });
  } finally {
    await api.dispose();
  }
} finally {
  await webReq.dispose();
  await anon.dispose();
}

const totals = {
  total: checks.length,
  pass: checks.filter((x) => x.status === 'PASS').length,
  fail: checks.filter((x) => x.status === 'FAIL').length,
  skip: checks.filter((x) => x.status === 'SKIP').length,
};

const summary = {
  generatedAt: new Date().toISOString(),
  environment: { webBase: WEB_BASE, apiBase: API_BASE },
  runName,
  totals,
  checks,
};
const summaryPath = path.join(runDir, 'summary.json');
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

const lines = [];
lines.push('# DEV Infra API Ultra Regression Report');
lines.push(`Date: ${new Date().toISOString()}`);
lines.push(`WebApp: ${WEB_BASE}`);
lines.push(`API: ${API_BASE}`);
lines.push('');
lines.push('## Summary');
lines.push(`- Total checks: ${totals.total}`);
lines.push(`- Passed: ${totals.pass}`);
lines.push(`- Failed: ${totals.fail}`);
lines.push(`- Skipped: ${totals.skip}`);
lines.push('');
lines.push('## Checks');
lines.push('| ID | Area | Test | Status | Details |');
lines.push('|---|---|---|---|---|');
for (const c of checks) {
  lines.push(`| ${c.id} | ${c.area} | ${String(c.test).replace(/\|/g, '/')} | ${c.status} | ${String(c.details).replace(/\|/g, '/')} |`);
}
const reportPath = path.join(runDir, 'report.md');
fs.writeFileSync(reportPath, lines.join('\n'), 'utf-8');

console.log(`SUMMARY_JSON=${summaryPath}`);
console.log(`REPORT_MD=${reportPath}`);
console.log(`TOTAL=${totals.total} PASS=${totals.pass} FAIL=${totals.fail} SKIP=${totals.skip}`);

