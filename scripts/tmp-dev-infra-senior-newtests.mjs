import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns/promises';
import tls from 'node:tls';
import { chromium, request } from 'playwright';

const WEB_BASE = process.env.HYDROCERT_WEB_BASE || 'https://hydrocert-dev-webapp-fzgveghygfc3enbt.ukwest-01.azurewebsites.net';
const API_BASE = process.env.HYDROCERT_API_BASE || 'https://hydrocert-dev-api-exajhpd0brg2bcar.ukwest-01.azurewebsites.net';
const EMAIL = process.env.HYDROCERT_QA_EMAIL || '';
const PASSWORD = process.env.HYDROCERT_QA_PASSWORD || '';

const stamp = new Date().toISOString().replace(/[.:]/g, '-');
const runName = `dev-infra-senior-newtests-${stamp}`;
const runDir = path.join(process.cwd(), 'qa-artifacts', 'infra-regression', runName);
const shotsDir = path.join(runDir, 'screenshots');
fs.mkdirSync(shotsDir, { recursive: true });

const checks = [];
let shotIndex = 1;
const telem = { desktop: { consoleErrors: [], requestFailed: [], resp5xx: [] }, mobile: { consoleErrors: [], requestFailed: [], resp5xx: [] } };

function addCheck({ id, area, test, status, details, evidence = [] }) {
  checks.push({ id, area, test, status, details, evidence });
  console.log(`${id} | ${status} | ${test} | ${details}`);
}

async function shot(page, name) {
  const p = path.join(shotsDir, `${String(shotIndex).padStart(3, '0')}-${name}.png`);
  shotIndex += 1;
  await page.screenshot({ path: p, fullPage: true });
  return p;
}

async function settled(page, ms = 800) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

async function runCheck(page, id, area, test, fn) {
  try {
    const r = await fn();
    addCheck({ id, area, test, status: r?.status || 'PASS', details: r?.details || '', evidence: r?.evidence || [] });
  } catch (e) {
    const ev = page ? await shot(page, `${id.toLowerCase()}-error`).catch(() => null) : null;
    addCheck({
      id,
      area,
      test,
      status: 'FAIL',
      details: String(e).replace(/\s+/g, ' ').slice(0, 280),
      evidence: ev ? [ev] : [],
    });
  }
}

function arr(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function p95(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.max(0, Math.ceil(s.length * 0.95) - 1)];
}

function decodeJwt(token) {
  try {
    const p = String(token || '').split('.')[1];
    if (!p) return null;
    const b64 = p.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(Buffer.from(pad, 'base64').toString('utf-8'));
  } catch {
    return null;
  }
}

async function tlsDays(host) {
  return await new Promise((resolve, reject) => {
    const s = tls.connect(443, host, { servername: host, rejectUnauthorized: false }, () => {
      try {
        const cert = s.getPeerCertificate();
        s.end();
        const d = cert?.valid_to ? new Date(cert.valid_to) : null;
        const days = d ? Math.floor((d.getTime() - Date.now()) / 86400000) : -1;
        resolve({ days, issuer: cert?.issuer?.CN || '', validTo: d?.toISOString() || '' });
      } catch (e) {
        reject(e);
      }
    });
    s.on('error', reject);
  });
}

async function loginUi(page) {
  await page.goto(`${WEB_BASE}/dashboard`);
  await settled(page, 900);
  if (page.url().includes('/login')) {
    await page.locator('input[name="email"],input[type="email"]').first().fill(EMAIL);
    await page.locator('input[name="password"],input[type="password"]').first().fill(PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).first().click();
    await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 25000 }).catch(() => {});
    await settled(page, 1100);
  }
  return !page.url().includes('/login');
}

async function seqPerf(api, endpoint, n) {
  const times = [];
  let fail = 0;
  for (let i = 0; i < n; i += 1) {
    const t0 = Date.now();
    const r = await api.get(endpoint);
    times.push(Date.now() - t0);
    if (r.status() >= 400) fail += 1;
  }
  return { n, fail, p95: p95(times), avg: Math.round(times.reduce((a, b) => a + b, 0) / times.length), min: Math.min(...times), max: Math.max(...times) };
}

async function parPerf(api, endpoints, total, conc) {
  const times = [];
  let fail = 0;
  let idx = 0;
  const worker = async () => {
    while (idx < total) {
      const n = idx;
      idx += 1;
      const ep = endpoints[n % endpoints.length];
      const t0 = Date.now();
      const r = await api.get(ep);
      times.push(Date.now() - t0);
      if (r.status() >= 400) fail += 1;
    }
  };
  const start = Date.now();
  await Promise.all(Array.from({ length: conc }, () => worker()));
  return { total, conc, fail, durationMs: Date.now() - start, p95: p95(times), avg: Math.round(times.reduce((a, b) => a + b, 0) / times.length), min: Math.min(...times), max: Math.max(...times) };
}

function attachTelemetry(page, sink) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') sink.consoleErrors.push({ url: page.url(), text: msg.text() });
  });
  page.on('requestfailed', (req) => {
    sink.requestFailed.push({ method: req.method(), url: req.url(), error: req.failure()?.errorText || 'requestfailed' });
  });
  page.on('response', (res) => {
    if (res.status() >= 500) sink.resp5xx.push({ status: res.status(), url: res.url(), method: res.request().method() });
  });
}

const webHost = new URL(WEB_BASE).host;
const apiHost = new URL(API_BASE).host;

const webReq = await request.newContext({ baseURL: WEB_BASE });
const anonApi = await request.newContext({ baseURL: API_BASE });

const browser = await chromium.launch({ headless: true });
const dctx = await browser.newContext({ viewport: { width: 1536, height: 864 } });
const dpage = await dctx.newPage();
attachTelemetry(dpage, telem.desktop);

let token = '';
let refreshToken = '';
let users = [];
let customers = [];
let visits = [];
let detailsUrl = '';
let editUrl = '';

try {
  // R01-R10: Infra/Security
  await runCheck(dpage, 'R01', 'Infra', 'Web root HTTP success', async () => {
    const r = await webReq.get('/');
    return r.ok() ? { status: 'PASS', details: `status=${r.status()}` } : { status: 'FAIL', details: `status=${r.status()}` };
  });

  await runCheck(dpage, 'R02', 'Infra', 'API health HTTP success', async () => {
    const r = await anonApi.get('/health');
    return r.ok() ? { status: 'PASS', details: `status=${r.status()}` } : { status: 'FAIL', details: `status=${r.status()}` };
  });

  await runCheck(dpage, 'R03', 'Infra', 'Web host DNS resolves', async () => {
    const ips = await dns.lookup(webHost, { all: true });
    return ips.length ? { status: 'PASS', details: ips.map((x) => x.address).join(',') } : { status: 'FAIL', details: 'no ips' };
  });

  await runCheck(dpage, 'R04', 'Infra', 'API host DNS resolves', async () => {
    const ips = await dns.lookup(apiHost, { all: true });
    return ips.length ? { status: 'PASS', details: ips.map((x) => x.address).join(',') } : { status: 'FAIL', details: 'no ips' };
  });

  await runCheck(dpage, 'R05', 'Infra', 'Web TLS >= 30 days remaining', async () => {
    const t = await tlsDays(webHost);
    return t.days >= 30 ? { status: 'PASS', details: `days=${t.days}` } : { status: 'FAIL', details: `days=${t.days}, validTo=${t.validTo}` };
  });

  await runCheck(dpage, 'R06', 'Infra', 'API TLS >= 30 days remaining', async () => {
    const t = await tlsDays(apiHost);
    return t.days >= 30 ? { status: 'PASS', details: `days=${t.days}` } : { status: 'FAIL', details: `days=${t.days}, validTo=${t.validTo}` };
  });

  await runCheck(dpage, 'R07', 'Security', 'Web root has HSTS header', async () => {
    const r = await webReq.get('/');
    const v = r.headers()['strict-transport-security'] || '';
    return v ? { status: 'PASS', details: v } : { status: 'FAIL', details: 'missing strict-transport-security' };
  });

  await runCheck(dpage, 'R08', 'Security', 'Web root has X-Content-Type-Options nosniff', async () => {
    const r = await webReq.get('/');
    const v = (r.headers()['x-content-type-options'] || '').toLowerCase();
    return v.includes('nosniff') ? { status: 'PASS', details: v } : { status: 'FAIL', details: v || 'missing header' };
  });

  await runCheck(dpage, 'R09', 'Security', 'Web root has anti-frame policy (XFO/CSP)', async () => {
    const r = await webReq.get('/');
    const xfo = r.headers()['x-frame-options'] || '';
    const csp = r.headers()['content-security-policy'] || '';
    const ok = Boolean(xfo) || /frame-ancestors/i.test(csp);
    return ok ? { status: 'PASS', details: xfo || 'csp frame-ancestors present' } : { status: 'FAIL', details: 'missing anti-frame policy' };
  });

  await runCheck(dpage, 'R10', 'Security', 'TRACE method disabled on Web and API', async () => {
    const rw = await webReq.fetch('/', { method: 'TRACE' });
    const ra = await anonApi.fetch('/health', { method: 'TRACE' });
    const ok = rw.status() !== 200 && ra.status() !== 200;
    return ok ? { status: 'PASS', details: `web=${rw.status()}, api=${ra.status()}` } : { status: 'FAIL', details: `web=${rw.status()}, api=${ra.status()}` };
  });

  // R11-R20: Auth hardening
  await runCheck(dpage, 'R11', 'Auth/API', 'Valid login returns token pair', async () => {
    const t0 = Date.now();
    const r = await anonApi.post('/auth/login', { data: { email: EMAIL, password: PASSWORD } });
    const ms = Date.now() - t0;
    let j = {};
    try { j = await r.json(); } catch {}
    token = j?.tokens?.accessToken || j?.accessToken || j?.token || '';
    refreshToken = j?.tokens?.refreshToken || j?.refreshToken || '';
    if (r.status() >= 400 || !token) return { status: 'FAIL', details: `status=${r.status()}, tokenMissing=true` };
    return { status: 'PASS', details: `status=${r.status()}, latency=${ms}ms` };
  });

  await runCheck(dpage, 'R12', 'Auth/API', 'Refresh token exists in login payload', async () => {
    return refreshToken ? { status: 'PASS', details: `length=${refreshToken.length}` } : { status: 'FAIL', details: 'refresh token missing' };
  });

  await runCheck(dpage, 'R13', 'Auth/API', 'JWT format is valid', async () => {
    const ok = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(token);
    return ok ? { status: 'PASS', details: 'jwt pattern valid' } : { status: 'FAIL', details: 'invalid jwt format' };
  });

  await runCheck(dpage, 'R14', 'Auth/API', 'JWT expiry claim is in future', async () => {
    const p = decodeJwt(token);
    const expMs = Number(p?.exp || 0) * 1000;
    const mins = Math.floor((expMs - Date.now()) / 60000);
    return mins > 10 ? { status: 'PASS', details: `minsLeft=${mins}` } : { status: 'FAIL', details: `minsLeft=${mins}` };
  });

  await runCheck(dpage, 'R15', 'Auth/API', 'JWT includes sub and email claims', async () => {
    const p = decodeJwt(token);
    return p?.sub && p?.email ? { status: 'PASS', details: `email=${p.email}` } : { status: 'FAIL', details: 'missing sub/email claim' };
  });

  await runCheck(dpage, 'R16', 'Auth/API', 'Invalid password rejected', async () => {
    const r = await anonApi.post('/auth/login', { data: { email: EMAIL, password: 'Wrong#Password123' } });
    return [400, 401, 403].includes(r.status()) ? { status: 'PASS', details: `status=${r.status()}` } : { status: 'FAIL', details: `status=${r.status()}` };
  });

  await runCheck(dpage, 'R17', 'Auth/API', 'SQL-like login payload does not cause 5xx', async () => {
    const r = await anonApi.post('/auth/login', { data: { email: "' OR 1=1 --", password: "' OR 1=1 --" } });
    return r.status() < 500 ? { status: 'PASS', details: `status=${r.status()}` } : { status: 'FAIL', details: `status=${r.status()}` };
  });

  await runCheck(dpage, 'R18', 'Auth/API', 'Malformed login JSON does not cause 5xx', async () => {
    const r = await anonApi.fetch('/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, data: '{\"email\":' });
    return r.status() < 500 ? { status: 'PASS', details: `status=${r.status()}` } : { status: 'FAIL', details: `status=${r.status()}` };
  });

  await runCheck(dpage, 'R19', 'Auth/API', 'Profile without token rejected', async () => {
    const r = await anonApi.get('/users/profile/me');
    return [401, 403].includes(r.status()) ? { status: 'PASS', details: `status=${r.status()}` } : { status: 'FAIL', details: `status=${r.status()}` };
  });

  await runCheck(dpage, 'R20', 'Auth/API', 'Profile with tampered token rejected', async () => {
    const tampered = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
    const bad = await request.newContext({ baseURL: API_BASE, extraHTTPHeaders: { Authorization: `Bearer ${tampered}` } });
    const r = await bad.get('/users/profile/me');
    await bad.dispose();
    return [401, 403].includes(r.status()) ? { status: 'PASS', details: `status=${r.status()}` } : { status: 'FAIL', details: `status=${r.status()}` };
  });

  const api = await request.newContext({ baseURL: API_BASE, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
  try {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).toISOString();
    const end = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()).toISOString();
    const absStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const absEnd = new Date(now.getFullYear(), now.getMonth() + 2, 1).toISOString().slice(0, 10);
    const visits50 = `/visits/calendar-filter?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}&page=1&limit=50`;
    const visits10 = `/visits/calendar-filter?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}&page=1&limit=10`;

    // R21-R35: API boundary/negative
    await runCheck(dpage, 'R21', 'API', 'Users endpoint returns array', async () => {
      const r = await api.get('/users'); let j = {}; try { j = await r.json(); } catch {}
      users = arr(j);
      return r.status() >= 400 || !Array.isArray(users) ? { status: 'FAIL', details: `status=${r.status()}` } : { status: 'PASS', details: `count=${users.length}` };
    });

    await runCheck(dpage, 'R22', 'API', 'Users IDs unique in first 50', async () => {
      const ids = users.slice(0, 50).map((u) => String(u.id || u.userId || '')).filter(Boolean);
      if (!ids.length) return { status: 'FAIL', details: 'no ids' };
      const uniq = new Set(ids);
      return uniq.size === ids.length ? { status: 'PASS', details: `sample=${ids.length}` } : { status: 'FAIL', details: `dupes=${ids.length - uniq.size}` };
    });

    await runCheck(dpage, 'R23', 'API', 'Users with unknown query does not 5xx', async () => {
      const r = await api.get('/users?unknownParam=1');
      return r.status() < 500 ? { status: 'PASS', details: `status=${r.status()}` } : { status: 'FAIL', details: `status=${r.status()}` };
    });

    await runCheck(dpage, 'R24', 'API', 'Customers page=-1 does not 5xx', async () => {
      const r = await api.get('/customers/filtered?page=-1&limit=20');
      return r.status() < 500 ? { status: 'PASS', details: `status=${r.status()}` } : { status: 'FAIL', details: `status=${r.status()}` };
    });

    await runCheck(dpage, 'R25', 'API', 'Customers limit=0 does not 5xx', async () => {
      const r = await api.get('/customers/filtered?page=1&limit=0');
      return r.status() < 500 ? { status: 'PASS', details: `status=${r.status()}` } : { status: 'FAIL', details: `status=${r.status()}` };
    });

    await runCheck(dpage, 'R26', 'API', 'Customers limit=5000 does not 5xx', async () => {
      const r = await api.get('/customers/filtered?page=1&limit=5000');
      let j = {}; try { j = await r.json(); } catch {}
      const a = arr(j);
      return r.status() < 500 && a.length <= 5000 ? { status: 'PASS', details: `status=${r.status()}, count=${a.length}` } : { status: 'FAIL', details: `status=${r.status()}, count=${a.length}` };
    });

    await runCheck(dpage, 'R27', 'API', 'Customers XSS search does not 5xx', async () => {
      const r = await api.get('/customers/filtered?page=1&limit=20&search=%3Cscript%3Ealert(1)%3C/script%3E');
      return r.status() < 500 ? { status: 'PASS', details: `status=${r.status()}` } : { status: 'FAIL', details: `status=${r.status()}` };
    });

    await runCheck(dpage, 'R28', 'API', 'Customers SQL-like search does not 5xx', async () => {
      const r = await api.get('/customers/filtered?page=1&limit=20&search=%27%20OR%201%3D1%20--');
      return r.status() < 500 ? { status: 'PASS', details: `status=${r.status()}` } : { status: 'FAIL', details: `status=${r.status()}` };
    });

    await runCheck(dpage, 'R29', 'API', 'Visits filter with invalid start date does not 5xx', async () => {
      const r = await api.get('/visits/calendar-filter?startDate=invalid&endDate=invalid&page=1&limit=20');
      return r.status() < 500 ? { status: 'PASS', details: `status=${r.status()}` } : { status: 'FAIL', details: `status=${r.status()}` };
    });

    await runCheck(dpage, 'R30', 'API', 'Visits filter start>end does not 5xx', async () => {
      const r = await api.get('/visits/calendar-filter?startDate=2030-01-01T00:00:00.000Z&endDate=2020-01-01T00:00:00.000Z&page=1&limit=20');
      return r.status() < 500 ? { status: 'PASS', details: `status=${r.status()}` } : { status: 'FAIL', details: `status=${r.status()}` };
    });

    await runCheck(dpage, 'R31', 'API', 'Visits limit=10 respected', async () => {
      const r = await api.get(visits10); let j = {}; try { j = await r.json(); } catch {}
      visits = arr(j);
      return r.status() >= 400 || visits.length > 10 ? { status: 'FAIL', details: `status=${r.status()}, count=${visits.length}` } : { status: 'PASS', details: `count=${visits.length}` };
    });

    await runCheck(dpage, 'R32', 'API', 'Absences invalid date format does not 5xx', async () => {
      const r = await api.get('/users/absences?startDate=invalid&endDate=invalid');
      return r.status() < 500 ? { status: 'PASS', details: `status=${r.status()}` } : { status: 'FAIL', details: `status=${r.status()}` };
    });

    await runCheck(dpage, 'R33', 'API', 'Absences start>end does not 5xx', async () => {
      const r = await api.get('/users/absences?startDate=2030-01-01&endDate=2020-01-01');
      return r.status() < 500 ? { status: 'PASS', details: `status=${r.status()}` } : { status: 'FAIL', details: `status=${r.status()}` };
    });

    await runCheck(dpage, 'R34', 'API', 'Products unknown query does not 5xx', async () => {
      const r = await api.get('/products?foo=bar&baz=1');
      return r.status() < 500 ? { status: 'PASS', details: `status=${r.status()}` } : { status: 'FAIL', details: `status=${r.status()}` };
    });

    await runCheck(dpage, 'R35', 'API', 'Nonexistent endpoint returns non-5xx', async () => {
      const r = await api.get('/definitely-not-existing-endpoint-xyz');
      return r.status() < 500 ? { status: 'PASS', details: `status=${r.status()}` } : { status: 'FAIL', details: `status=${r.status()}` };
    });

    // R36-R45: performance/load
    await runCheck(dpage, 'R36', 'Performance', 'Health p95 <= 250ms (30 seq)', async () => {
      const p = await seqPerf(api, '/health', 30);
      return p.fail === 0 && p.p95 <= 250 ? { status: 'PASS', details: JSON.stringify(p) } : { status: 'FAIL', details: JSON.stringify(p) };
    });

    await runCheck(dpage, 'R37', 'Performance', 'Profile p95 <= 350ms (30 seq)', async () => {
      const p = await seqPerf(api, '/users/profile/me', 30);
      return p.fail === 0 && p.p95 <= 350 ? { status: 'PASS', details: JSON.stringify(p) } : { status: 'FAIL', details: JSON.stringify(p) };
    });

    await runCheck(dpage, 'R38', 'Performance', 'Customers p95 <= 700ms (25 seq)', async () => {
      const p = await seqPerf(api, '/customers/filtered?page=1&limit=20', 25);
      return p.fail === 0 && p.p95 <= 700 ? { status: 'PASS', details: JSON.stringify(p) } : { status: 'FAIL', details: JSON.stringify(p) };
    });

    await runCheck(dpage, 'R39', 'Performance', 'Visits p95 <= 1200ms (20 seq)', async () => {
      const p = await seqPerf(api, visits50, 20);
      return p.fail === 0 && p.p95 <= 1200 ? { status: 'PASS', details: JSON.stringify(p) } : { status: 'FAIL', details: JSON.stringify(p) };
    });

    await runCheck(dpage, 'R40', 'Load/Perf', 'Mixed burst 60 req conc12 no failures', async () => {
      const p = await parPerf(api, ['/health', '/users/profile/me', '/customers/filtered?page=1&limit=20', visits50], 60, 12);
      return p.fail === 0 ? { status: 'PASS', details: JSON.stringify(p) } : { status: 'FAIL', details: JSON.stringify(p) };
    });

    await runCheck(dpage, 'R41', 'Load/Perf', 'Customers burst 40 req conc10 no failures', async () => {
      const p = await parPerf(api, ['/customers/filtered?page=1&limit=20'], 40, 10);
      return p.fail === 0 ? { status: 'PASS', details: JSON.stringify(p) } : { status: 'FAIL', details: JSON.stringify(p) };
    });

    await runCheck(dpage, 'R42', 'Load/Perf', 'Users burst 40 req conc10 no failures', async () => {
      const p = await parPerf(api, ['/users'], 40, 10);
      return p.fail === 0 ? { status: 'PASS', details: JSON.stringify(p) } : { status: 'FAIL', details: JSON.stringify(p) };
    });

    await runCheck(dpage, 'R43', 'Load/Perf', 'Mixed burst average <= 800ms (80 req conc16)', async () => {
      const p = await parPerf(api, ['/health', '/users/profile/me', '/customers/filtered?page=1&limit=20', visits50], 80, 16);
      return p.fail === 0 && p.avg <= 800 ? { status: 'PASS', details: JSON.stringify(p) } : { status: 'FAIL', details: JSON.stringify(p) };
    });

    await runCheck(dpage, 'R44', 'Load/Perf', 'Sustained key endpoints no failures (20 calls)', async () => {
      const eps = ['/health', '/users/profile/me', '/customers/filtered?page=1&limit=20', visits50];
      let fail = 0;
      const times = [];
      for (let i = 0; i < 20; i += 1) {
        const ep = eps[i % eps.length];
        const t0 = Date.now();
        const r = await api.get(ep);
        times.push(Date.now() - t0);
        if (r.status() >= 400) fail += 1;
      }
      const s = { fail, p95: p95(times), avg: Math.round(times.reduce((a, b) => a + b, 0) / times.length) };
      return fail === 0 ? { status: 'PASS', details: JSON.stringify(s) } : { status: 'FAIL', details: JSON.stringify(s) };
    });

    await runCheck(dpage, 'R45', 'Load/Perf', 'API health consistency over 20 calls', async () => {
      const statuses = [];
      for (let i = 0; i < 20; i += 1) {
        const r = await api.get('/health');
        statuses.push(r.status());
      }
      const all200 = statuses.every((s) => s === 200);
      return all200 ? { status: 'PASS', details: 'all statuses 200' } : { status: 'FAIL', details: `statuses=${[...new Set(statuses)].join(',')}` };
    });

    // R46-R55: UI/session robustness
    await runCheck(dpage, 'R46', 'UI Desktop', 'UI login works and lands out of /login', async () => {
      const ok = await loginUi(dpage);
      return ok ? { status: 'PASS', details: `url=${dpage.url()}` } : { status: 'FAIL', details: 'still on login' };
    });

    await runCheck(dpage, 'R47', 'UI Desktop', 'Session survives hard refresh on planner route', async () => {
      await dpage.goto(`${WEB_BASE}/planner`);
      await settled(dpage, 800);
      await dpage.reload({ waitUntil: 'domcontentloaded' });
      await settled(dpage, 1000);
      return dpage.url().includes('/login') ? { status: 'FAIL', details: 'redirected to login' } : { status: 'PASS', details: 'still authenticated' };
    });

    await runCheck(dpage, 'R48', 'UI Desktop', 'Unknown route does not show blank page', async () => {
      await dpage.goto(`${WEB_BASE}/this-route-should-not-exist-senior-check`);
      await settled(dpage, 800);
      const text = ((await dpage.locator('body').innerText().catch(() => '')) || '').trim();
      return text.length > 30 ? { status: 'PASS', details: `bodyTextLength=${text.length}` } : { status: 'FAIL', details: `bodyTextLength=${text.length}` };
    });

    await runCheck(dpage, 'R49', 'UI Desktop', 'Back/forward route navigation keeps session', async () => {
      await dpage.goto(`${WEB_BASE}/dashboard`); await settled(dpage, 400);
      await dpage.goto(`${WEB_BASE}/customers`); await settled(dpage, 400);
      await dpage.goto(`${WEB_BASE}/planner`); await settled(dpage, 400);
      await dpage.goBack(); await settled(dpage, 400);
      await dpage.goBack(); await settled(dpage, 400);
      await dpage.goForward(); await settled(dpage, 400);
      return dpage.url().includes('/login') ? { status: 'FAIL', details: 'redirected to login during history nav' } : { status: 'PASS', details: `finalUrl=${dpage.url()}` };
    });

    await runCheck(dpage, 'R50', 'UI Desktop', 'Visits details route opens directly from first row id', async () => {
      await dpage.goto(`${WEB_BASE}/visits-list`); await settled(dpage, 700);
      const row = dpage.locator('table tbody tr').first();
      await row.click().catch(() => {});
      await settled(dpage, 800);
      if (!dpage.url().includes('/visits/details/')) return { status: 'FAIL', details: `url=${dpage.url()}` };
      detailsUrl = dpage.url();
      return { status: 'PASS', details: `url=${detailsUrl}` };
    });

    await runCheck(dpage, 'R51', 'UI Desktop', 'Edit visit route opens from planner eye action', async () => {
      await dpage.goto(`${WEB_BASE}/planner`); await settled(dpage, 800);
      await dpage.getByRole('button', { name: /Events View/i }).first().click().catch(() => {});
      await settled(dpage, 600);
      const eye = dpage.locator('table tbody tr td:last-child button:has(svg.lucide-eye), table tbody tr td:last-child button').first();
      if (!(await eye.isVisible().catch(() => false))) return { status: 'FAIL', details: 'eye hidden' };
      await eye.click().catch(() => {});
      await settled(dpage, 800);
      if (!dpage.url().includes('/visits/edit/')) return { status: 'FAIL', details: `url=${dpage.url()}` };
      editUrl = dpage.url();
      return { status: 'PASS', details: `url=${editUrl}` };
    });

    await runCheck(dpage, 'R52', 'UI Desktop', 'Map visible before and after refresh in edit route', async () => {
      if (!editUrl) return { status: 'FAIL', details: 'no editUrl' };
      await dpage.goto(editUrl); await settled(dpage, 1300);
      const before = await dpage.locator('.gm-style, [aria-label=\"Map\"]').first().isVisible().catch(() => false);
      await dpage.reload({ waitUntil: 'domcontentloaded' }); await settled(dpage, 1500);
      const after = await dpage.locator('.gm-style, [aria-label=\"Map\"]').first().isVisible().catch(() => false);
      return before && after ? { status: 'PASS', details: `before=${before}, after=${after}` } : { status: 'FAIL', details: `before=${before}, after=${after}` };
    });

    await runCheck(dpage, 'R53', 'Session', 'Access token stored in sessionStorage after UI login', async () => {
      const tokenInSession = await dpage.evaluate(() => sessionStorage.getItem('accessToken') || '');
      return tokenInSession ? { status: 'PASS', details: `tokenLength=${tokenInSession.length}` } : { status: 'FAIL', details: 'accessToken missing in sessionStorage' };
    });

    await runCheck(dpage, 'R54', 'Session', 'Access token not stored in localStorage', async () => {
      const tokenInLocal = await dpage.evaluate(() => localStorage.getItem('accessToken') || '');
      return !tokenInLocal ? { status: 'PASS', details: 'no accessToken in localStorage' } : { status: 'FAIL', details: 'accessToken found in localStorage' };
    });

    await runCheck(dpage, 'R55', 'Session', 'New context without login cannot access dashboard', async () => {
      const c = await browser.newContext({ viewport: { width: 1200, height: 700 } });
      const p = await c.newPage();
      await p.goto(`${WEB_BASE}/dashboard`);
      await settled(p, 800);
      const redirected = p.url().includes('/login');
      await c.close();
      return redirected ? { status: 'PASS', details: 'redirected to /login as expected' } : { status: 'FAIL', details: `unexpectedUrl=${p.url()}` };
    });

    // R56-R60: mobile and telemetry
    const mctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mpage = await mctx.newPage();
    attachTelemetry(mpage, telem.mobile);
    try {
      await runCheck(mpage, 'R56', 'UI Mobile', 'Mobile login works', async () => {
        const ok = await loginUi(mpage);
        return ok ? { status: 'PASS', details: `url=${mpage.url()}` } : { status: 'FAIL', details: 'mobile login failed' };
      });

      await runCheck(mpage, 'R57', 'UI Mobile', 'Mobile dashboard route loads', async () => {
        await mpage.goto(`${WEB_BASE}/dashboard`); await settled(mpage, 900);
        const vis = await mpage.getByText(/Dashboard/i).first().isVisible().catch(() => false);
        return vis ? { status: 'PASS', details: 'dashboard visible' } : { status: 'FAIL', details: 'dashboard missing' };
      });

      await runCheck(mpage, 'R58', 'UI Mobile', 'Mobile customers route loads', async () => {
        await mpage.goto(`${WEB_BASE}/customers`); await settled(mpage, 900);
        const vis = await mpage.getByText(/Customers/i).first().isVisible().catch(() => false);
        return vis ? { status: 'PASS', details: 'customers visible' } : { status: 'FAIL', details: 'customers missing' };
      });

      await runCheck(mpage, 'R59', 'UI Mobile', 'Mobile visits list route loads', async () => {
        await mpage.goto(`${WEB_BASE}/visits-list`); await settled(mpage, 900);
        const vis = await mpage.getByText(/Visits/i).first().isVisible().catch(() => false);
        return vis ? { status: 'PASS', details: 'visits visible' } : { status: 'FAIL', details: 'visits missing' };
      });

      await runCheck(mpage, 'R60', 'Telemetry', 'No console/requestfailed/5xx errors in mobile run', async () => {
        const c = telem.mobile.consoleErrors.length;
        const r = telem.mobile.requestFailed.length;
        const s = telem.mobile.resp5xx.length;
        return c + r + s === 0
          ? { status: 'PASS', details: 'mobile telemetry clean' }
          : { status: 'FAIL', details: `console=${c},requestfailed=${r},5xx=${s}` };
      });
    } finally {
      await mctx.close().catch(() => {});
    }
  } finally {
    await api.dispose();
  }
} finally {
  await dctx.close().catch(() => {});
  await browser.close().catch(() => {});
  await webReq.dispose().catch(() => {});
  await anonApi.dispose().catch(() => {});
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
  environment: { webBase: WEB_BASE, apiBase: API_BASE },
  totals,
  checks,
  telemetry: telem,
};

const summaryPath = path.join(runDir, 'summary.json');
fs.writeFileSync(summaryPath, JSON.stringify(output, null, 2));
console.log(`SUMMARY_JSON=${summaryPath}`);
console.log(`TOTAL=${totals.total} PASS=${totals.pass} FAIL=${totals.fail} SKIP=${totals.skip}`);
