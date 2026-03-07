import fs from 'node:fs';
import path from 'node:path';
import { chromium, request } from 'playwright';

const WEB_BASE = process.env.HYDROCERT_WEB_BASE || 'https://hydrocert-dev-webapp-fzgveghygfc3enbt.ukwest-01.azurewebsites.net';
const API_BASE = process.env.HYDROCERT_API_BASE || 'https://hydrocert-dev-api-exajhpd0brg2bcar.ukwest-01.azurewebsites.net';
const EMAIL = process.env.HYDROCERT_QA_EMAIL || '';
const PASSWORD = process.env.HYDROCERT_QA_PASSWORD || '';

const stamp = new Date().toISOString().replace(/[.:]/g, '-');
const runName = `dev-infra-essential-delta-${stamp}`;
const runDir = path.join(process.cwd(), 'qa-artifacts', 'infra-regression', runName);
const shotsDir = path.join(runDir, 'screenshots');
fs.mkdirSync(shotsDir, { recursive: true });

const checks = [];
const telemetry = { consoleErrors: [], requestFailed: [], resp5xx: [] };
let shotIndex = 1;

function add(id, area, test, status, details = '', evidence = []) {
  checks.push({ id, area, test, status, details, evidence });
  console.log(`${id} | ${status} | ${test} | ${details}`);
}

async function shot(page, name) {
  const p = path.join(shotsDir, `${String(shotIndex).padStart(3, '0')}-${name}.png`);
  shotIndex += 1;
  await page.screenshot({ path: p, fullPage: true });
  return p;
}

async function run(page, id, area, test, fn) {
  try {
    const r = await fn();
    add(id, area, test, r?.status || 'PASS', r?.details || '', r?.evidence || []);
  } catch (e) {
    const ev = page ? await shot(page, `${id.toLowerCase()}-error`).catch(() => null) : null;
    add(id, area, test, 'FAIL', String(e).replace(/\s+/g, ' ').slice(0, 320), ev ? [ev] : []);
  }
}

function arr(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function median(values) {
  if (!values.length) return 0;
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : Math.round((v[mid - 1] + v[mid]) / 2);
}

async function settle(page, ms = 800) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

async function apiJson(ctx, url, opts = {}) {
  const r = await ctx.fetch(url, opts);
  let j = null;
  try { j = await r.json(); } catch {}
  return { r, j };
}

async function loginUi(page) {
  await page.goto(`${WEB_BASE}/dashboard`);
  await settle(page, 1000);
  if (page.url().includes('/login')) {
    await page.locator('input[name="email"], input[type="email"]').first().fill(EMAIL);
    await page.locator('input[name="password"], input[type="password"]').first().fill(PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).first().click();
    await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 25000 }).catch(() => {});
    await settle(page, 1000);
  }
  return !page.url().includes('/login');
}

async function tryLogout(page) {
  // try direct menu option first
  const logoutDirect = page.getByRole('menuitem', { name: /logout|sign out/i }).first();
  if (await logoutDirect.isVisible().catch(() => false)) {
    await logoutDirect.click().catch(() => {});
    await settle(page, 700);
    return;
  }

  // open account menu with likely triggers
  const triggers = [
    page.getByRole('button', { name: /tech quarter/i }).first(),
    page.getByRole('button', { name: /tq/i }).first(),
    page.locator('header button').last(),
    page.locator('button:has-text("Tech Quarter")').first(),
  ];

  for (const t of triggers) {
    if (await t.isVisible().catch(() => false)) {
      await t.click().catch(() => {});
      await page.waitForTimeout(300);
      const logout = page.getByRole('menuitem', { name: /logout|sign out/i }).first();
      if (await logout.isVisible().catch(() => false)) {
        await logout.click().catch(() => {});
        await settle(page, 700);
        return;
      }
      const logoutAlt = page.getByRole('button', { name: /logout|sign out/i }).first();
      if (await logoutAlt.isVisible().catch(() => false)) {
        await logoutAlt.click().catch(() => {});
        await settle(page, 700);
        return;
      }
    }
  }

  throw new Error('Could not find logout control');
}

const browser = await chromium.launch({ headless: true });
const pageCtx = await browser.newContext({ viewport: { width: 1536, height: 864 } });
const page = await pageCtx.newPage();

page.on('console', (m) => {
  if (m.type() === 'error') telemetry.consoleErrors.push({ url: page.url(), text: m.text() });
});
page.on('requestfailed', (req) => {
  telemetry.requestFailed.push({ method: req.method(), url: req.url(), error: req.failure()?.errorText || 'requestfailed' });
});
page.on('response', (res) => {
  if (res.status() >= 500) telemetry.resp5xx.push({ status: res.status(), url: res.url(), method: res.request().method() });
});

const webCtx = await request.newContext({ baseURL: WEB_BASE });
const anonApi = await request.newContext({ baseURL: API_BASE });

let token = '';
let refreshToken = '';
let users = [];
let customers1 = [];
let customers2 = [];
let visits = [];

try {
  // E01-E06: HTTP behavior and protocol essentials
  await run(page, 'E01', 'Infra', 'Web HTTP endpoint redirects to HTTPS or blocks plain HTTP', async () => {
    const httpUrl = WEB_BASE.replace(/^https:/, 'http:');
    let status = -1;
    try {
      const r = await fetch(httpUrl, { redirect: 'manual' });
      status = r.status;
    } catch (e) {
      return { status: 'PASS', details: `http blocked as expected (${String(e).slice(0, 80)})` };
    }
    const ok = [301, 302, 307, 308, 403].includes(status);
    return ok ? { status: 'PASS', details: `status=${status}` } : { status: 'FAIL', details: `status=${status}` };
  });

  await run(page, 'E02', 'Infra', 'API HTTP endpoint redirects to HTTPS or blocks plain HTTP', async () => {
    const httpUrl = API_BASE.replace(/^https:/, 'http:');
    let status = -1;
    try {
      const r = await fetch(httpUrl, { redirect: 'manual' });
      status = r.status;
    } catch (e) {
      return { status: 'PASS', details: `http blocked as expected (${String(e).slice(0, 80)})` };
    }
    const ok = [301, 302, 307, 308, 403].includes(status);
    return ok ? { status: 'PASS', details: `status=${status}` } : { status: 'FAIL', details: `status=${status}` };
  });

  await run(page, 'E03', 'Web', 'Web root returns HTML content type', async () => {
    const r = await webCtx.get('/');
    const ct = (r.headers()['content-type'] || '').toLowerCase();
    return ct.includes('text/html') ? { status: 'PASS', details: ct } : { status: 'FAIL', details: ct || 'missing content-type' };
  });

  await run(page, 'E04', 'Web', 'Main JS bundle is cacheable (has Cache-Control)', async () => {
    const r = await webCtx.get('/');
    const html = await r.text();
    const m = html.match(/<script[^>]+src="([^"]+)"/i);
    if (!m?.[1]) return { status: 'FAIL', details: 'no script src found in root html' };
    const jsPath = m[1].startsWith('http') ? m[1] : m[1].startsWith('/') ? m[1] : `/${m[1]}`;
    const jr = await webCtx.get(jsPath);
    const cc = jr.headers()['cache-control'] || '';
    return cc ? { status: 'PASS', details: `script=${jsPath}, cache-control=${cc}` } : { status: 'FAIL', details: `script=${jsPath}, missing cache-control` };
  });

  await run(page, 'E05', 'API', 'API health returns JSON content type', async () => {
    const r = await anonApi.get('/health');
    const ct = (r.headers()['content-type'] || '').toLowerCase();
    return ct.includes('application/json') ? { status: 'PASS', details: ct } : { status: 'FAIL', details: ct || 'missing content-type' };
  });

  await run(page, 'E06', 'API', 'API health payload has recognizable status/value', async () => {
    const { r, j } = await apiJson(anonApi, '/health');
    if (r.status() >= 400 || !j || typeof j !== 'object') return { status: 'FAIL', details: `status=${r.status()}, payload_invalid` };
    const keys = Object.keys(j).map((k) => k.toLowerCase());
    const ok = keys.some((k) => ['status', 'ok', 'uptime', 'message'].includes(k));
    return ok ? { status: 'PASS', details: `keys=${keys.slice(0, 6).join(',')}` } : { status: 'FAIL', details: `keys=${keys.slice(0, 6).join(',')}` };
  });

  // E07-E11: auth/session essentials (new angle)
  await run(page, 'E07', 'Auth', 'Three consecutive logins succeed and return non-empty access tokens', async () => {
    const tokens = [];
    for (let i = 0; i < 3; i += 1) {
      const { r, j } = await apiJson(anonApi, '/auth/login', { method: 'POST', data: { email: EMAIL, password: PASSWORD } });
      const t = j?.tokens?.accessToken || j?.accessToken || j?.token || '';
      if (r.status() >= 400 || !t) return { status: 'FAIL', details: `attempt=${i + 1}, status=${r.status()}, tokenMissing=true` };
      if (!token) token = t;
      if (!refreshToken) refreshToken = j?.tokens?.refreshToken || j?.refreshToken || '';
      tokens.push(t);
    }
    const unique = new Set(tokens).size;
    return unique >= 1 ? { status: 'PASS', details: `tokens=${tokens.length}, unique=${unique}` } : { status: 'FAIL', details: 'no tokens collected' };
  });

  await run(page, 'E08', 'Auth', 'Authenticated profile remains stable across repeated calls', async () => {
    const api = await request.newContext({ baseURL: API_BASE, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
    try {
      const responses = [];
      for (let i = 0; i < 3; i += 1) {
        const { r, j } = await apiJson(api, '/users/profile/me');
        responses.push({ s: r.status(), email: j?.email || '' });
      }
      const ok = responses.every((x) => x.s < 400) && new Set(responses.map((x) => x.email).filter(Boolean)).size <= 1;
      return ok ? { status: 'PASS', details: JSON.stringify(responses) } : { status: 'FAIL', details: JSON.stringify(responses) };
    } finally {
      await api.dispose();
    }
  });

  await run(page, 'E09', 'Auth', 'Refresh endpoint with invalid token does not return 5xx', async () => {
    const candidates = ['/auth/refresh', '/auth/refresh-token', '/auth/refreshToken'];
    const statuses = [];
    for (const ep of candidates) {
      const { r } = await apiJson(anonApi, ep, {
        method: 'POST',
        data: { refreshToken: 'invalid-refresh-token-123' },
        headers: { 'content-type': 'application/json' },
      });
      statuses.push({ ep, status: r.status() });
    }
    const any5xx = statuses.some((x) => x.status >= 500);
    return !any5xx ? { status: 'PASS', details: JSON.stringify(statuses) } : { status: 'FAIL', details: JSON.stringify(statuses) };
  });

  await run(page, 'E10', 'Auth', 'Login request without content-type does not return 5xx', async () => {
    const r = await anonApi.fetch('/auth/login', {
      method: 'POST',
      headers: {},
      data: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    return r.status() < 500 ? { status: 'PASS', details: `status=${r.status()}` } : { status: 'FAIL', details: `status=${r.status()}` };
  });

  await run(page, 'E11', 'Auth', 'Access token lifetime appears bounded (30-180 minutes)', async () => {
    const payloadPart = String(token || '').split('.')[1] || '';
    if (!payloadPart) return { status: 'FAIL', details: 'missing jwt payload' };
    const b64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));
    const iat = Number(payload?.iat || 0);
    const exp = Number(payload?.exp || 0);
    if (!iat || !exp || exp <= iat) return { status: 'FAIL', details: 'invalid iat/exp' };
    const mins = Math.round((exp - iat) / 60);
    const ok = mins >= 30 && mins <= 180;
    return ok ? { status: 'PASS', details: `ttlMins=${mins}` } : { status: 'FAIL', details: `ttlMins=${mins}` };
  });

  // E12-E19: data contract and consistency essentials
  const api = await request.newContext({ baseURL: API_BASE, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
  try {
    await run(page, 'E12', 'Data', 'Users payload has required keys coverage (id + email)', async () => {
      const { r, j } = await apiJson(api, '/users');
      users = arr(j);
      if (r.status() >= 400 || !users.length) return { status: 'FAIL', details: `status=${r.status()}, count=${users.length}` };
      const sample = users.slice(0, 50);
      const good = sample.filter((u) => (u?.id || u?.userId) && String(u?.email || '').includes('@')).length;
      const pct = Math.round((good / sample.length) * 100);
      return pct >= 90 ? { status: 'PASS', details: `coverage=${pct}% (sample=${sample.length})` } : { status: 'FAIL', details: `coverage=${pct}% (sample=${sample.length})` };
    });

    await run(page, 'E13', 'Data', 'Customers payload has required keys coverage (id + name)', async () => {
      const { r, j } = await apiJson(api, '/customers/filtered?page=1&limit=50');
      customers1 = arr(j);
      if (r.status() >= 400 || !customers1.length) return { status: 'FAIL', details: `status=${r.status()}, count=${customers1.length}` };
      const good = customers1.filter((c) => (c?.id || c?.customerId) && String(c?.name || c?.customerName || '').trim().length > 0).length;
      const pct = Math.round((good / customers1.length) * 100);
      return pct >= 90 ? { status: 'PASS', details: `coverage=${pct}%` } : { status: 'FAIL', details: `coverage=${pct}%` };
    });

    await run(page, 'E14', 'Data', 'Visits payload has id + reference/title in majority', async () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).toISOString();
      const end = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()).toISOString();
      const { r, j } = await apiJson(api, `/visits/calendar-filter?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}&page=1&limit=50`);
      visits = arr(j);
      if (r.status() >= 400 || !visits.length) return { status: 'FAIL', details: `status=${r.status()}, count=${visits.length}` };
      const good = visits.filter((v) => (v?.id || v?.visitId) && (v?.visitReference || v?.title || v?.name)).length;
      const pct = Math.round((good / visits.length) * 100);
      return pct >= 85 ? { status: 'PASS', details: `coverage=${pct}%` } : { status: 'FAIL', details: `coverage=${pct}%` };
    });

    await run(page, 'E15', 'Data', 'Visits date fields are parseable in sample', async () => {
      const sample = visits.slice(0, 30);
      if (!sample.length) return { status: 'FAIL', details: 'no visits sample' };
      const parseable = sample.filter((v) => {
        const d = v?.visitDate || v?.date || v?.startDate || v?.fromDate;
        return d ? !Number.isNaN(new Date(d).getTime()) : false;
      }).length;
      const pct = Math.round((parseable / sample.length) * 100);
      return pct >= 80 ? { status: 'PASS', details: `parseable=${pct}%` } : { status: 'FAIL', details: `parseable=${pct}%` };
    });

    await run(page, 'E16', 'Data', 'Visit booking person IDs map to known users when present', async () => {
      const userIds = new Set(users.map((u) => String(u?.id || u?.userId || '')).filter(Boolean));
      const sample = visits.slice(0, 30).map((v) => String(v?.bookingPersonId || v?.bookedById || '')).filter(Boolean);
      if (!sample.length) return { status: 'PASS', details: 'no bookingPersonId fields present in sample' };
      const matched = sample.filter((id) => userIds.has(id)).length;
      const pct = Math.round((matched / sample.length) * 100);
      return pct >= 70 ? { status: 'PASS', details: `matched=${pct}%` } : { status: 'FAIL', details: `matched=${pct}%` };
    });

    await run(page, 'E17', 'Data', 'Visit assigned engineer IDs map to known users when present', async () => {
      const userIds = new Set(users.map((u) => String(u?.id || u?.userId || '')).filter(Boolean));
      const sample = visits.slice(0, 30).map((v) => String(v?.assignedEngineerId || v?.engineerId || '')).filter(Boolean);
      if (!sample.length) return { status: 'PASS', details: 'no assignedEngineerId fields present in sample' };
      const matched = sample.filter((id) => userIds.has(id)).length;
      const pct = Math.round((matched / sample.length) * 100);
      return pct >= 70 ? { status: 'PASS', details: `matched=${pct}%` } : { status: 'FAIL', details: `matched=${pct}%` };
    });

    await run(page, 'E18', 'Data', 'Customers page1 vs page2 have low overlap', async () => {
      const { r, j } = await apiJson(api, '/customers/filtered?page=2&limit=50');
      customers2 = arr(j);
      if (r.status() >= 400) return { status: 'FAIL', details: `status=${r.status()}` };
      const ids1 = new Set(customers1.map((c) => String(c?.id || c?.customerId || '')).filter(Boolean));
      const ids2 = new Set(customers2.map((c) => String(c?.id || c?.customerId || '')).filter(Boolean));
      if (!ids1.size || !ids2.size) return { status: 'PASS', details: `insufficient data p1=${ids1.size}, p2=${ids2.size}` };
      let overlap = 0;
      for (const id of ids2) if (ids1.has(id)) overlap += 1;
      const ratio = Math.round((overlap / Math.max(1, ids2.size)) * 100);
      return ratio <= 20 ? { status: 'PASS', details: `overlap=${ratio}%` } : { status: 'FAIL', details: `overlap=${ratio}%` };
    });

    await run(page, 'E19', 'Data', 'Repeated same customers query returns same first item (stability)', async () => {
      const { j: j1 } = await apiJson(api, '/customers/filtered?page=1&limit=20');
      const { j: j2 } = await apiJson(api, '/customers/filtered?page=1&limit=20');
      const a1 = arr(j1);
      const a2 = arr(j2);
      const first1 = String(a1?.[0]?.id || a1?.[0]?.customerId || '');
      const first2 = String(a2?.[0]?.id || a2?.[0]?.customerId || '');
      if (!first1 || !first2) return { status: 'PASS', details: 'no first id to compare' };
      return first1 === first2 ? { status: 'PASS', details: `firstId=${first1}` } : { status: 'FAIL', details: `first1=${first1}, first2=${first2}` };
    });

    // E20-E24: performance + UI critical flows different from previous suites
    await run(page, 'E20', 'Performance', 'Core API median latency under 2500ms (sampled)', async () => {
      const endpoints = ['/health', '/users/profile/me', '/customers/filtered?page=1&limit=20'];
      const times = [];
      for (let i = 0; i < 15; i += 1) {
        const ep = endpoints[i % endpoints.length];
        const t0 = Date.now();
        const r = await api.get(ep);
        const ms = Date.now() - t0;
        if (r.status() >= 500) return { status: 'FAIL', details: `5xx on ${ep}, status=${r.status()}` };
        times.push(ms);
      }
      const med = median(times);
      return med <= 2500 ? { status: 'PASS', details: `median=${med}ms, max=${Math.max(...times)}ms` } : { status: 'FAIL', details: `median=${med}ms, max=${Math.max(...times)}ms` };
    });

    await run(page, 'E21', 'Performance', 'Parallel profile calls (20) complete without 5xx', async () => {
      const tasks = Array.from({ length: 20 }, () => api.get('/users/profile/me'));
      const res = await Promise.all(tasks);
      const bad = res.filter((r) => r.status() >= 500).length;
      return bad === 0 ? { status: 'PASS', details: 'no 5xx in 20 parallel calls' } : { status: 'FAIL', details: `5xx_count=${bad}` };
    });

    await run(page, 'E22', 'UI', 'Desktop route hop does not produce blank screen', async () => {
      const okLogin = await loginUi(page);
      if (!okLogin) return { status: 'FAIL', details: 'login failed' };
      const routes = ['/dashboard', '/customers', '/visits-list', '/planner'];
      for (const route of routes) {
        await page.goto(`${WEB_BASE}${route}`);
        await settle(page, 700);
        const textLen = ((await page.locator('body').innerText().catch(() => '')) || '').trim().length;
        if (textLen < 60) return { status: 'FAIL', details: `possible blank body on ${route} (len=${textLen})` };
      }
      return { status: 'PASS', details: 'all route bodies rendered' };
    });

    await run(page, 'E23', 'UI', 'Logout flow redirects to login', async () => {
      const okLogin = await loginUi(page);
      if (!okLogin) return { status: 'FAIL', details: 'login failed before logout check' };
      await tryLogout(page);
      const atLogin = page.url().includes('/login');
      return atLogin ? { status: 'PASS', details: `url=${page.url()}` } : { status: 'FAIL', details: `url=${page.url()}` };
    });

    await run(page, 'E24', 'UI/Security', 'After logout, protected route redirects back to login', async () => {
      await page.goto(`${WEB_BASE}/dashboard`);
      await settle(page, 800);
      const blocked = page.url().includes('/login');
      return blocked ? { status: 'PASS', details: `url=${page.url()}` } : { status: 'FAIL', details: `url=${page.url()}` };
    });
  } finally {
    await api.dispose();
  }
} finally {
  await webCtx.dispose().catch(() => {});
  await anonApi.dispose().catch(() => {});
  await pageCtx.close().catch(() => {});
  await browser.close().catch(() => {});
}

await run(null, 'E25', 'Telemetry', 'Desktop run has no console error/requestfailed/5xx events', async () => {
  const c = telemetry.consoleErrors.length;
  const r = telemetry.requestFailed.length;
  const s = telemetry.resp5xx.length;
  const ok = c + r + s === 0;
  return ok ? { status: 'PASS', details: 'clean telemetry' } : { status: 'FAIL', details: `console=${c},requestfailed=${r},5xx=${s}` };
});

const totals = {
  total: checks.length,
  pass: checks.filter((c) => c.status === 'PASS').length,
  fail: checks.filter((c) => c.status === 'FAIL').length,
  skip: checks.filter((c) => c.status === 'SKIP').length,
};

const summary = {
  generatedAt: new Date().toISOString(),
  runName,
  environment: { webBase: WEB_BASE, apiBase: API_BASE },
  totals,
  checks,
  telemetry,
};

const summaryPath = path.join(runDir, 'summary.json');
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
console.log(`SUMMARY_JSON=${summaryPath}`);
console.log(`TOTAL=${totals.total} PASS=${totals.pass} FAIL=${totals.fail} SKIP=${totals.skip}`);
