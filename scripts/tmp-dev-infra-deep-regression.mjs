import fs from 'node:fs';
import path from 'node:path';
import { chromium, request } from 'playwright';

const WEB_BASE = process.env.HYDROCERT_WEB_BASE || 'https://hydrocert-dev-webapp-fzgveghygfc3enbt.ukwest-01.azurewebsites.net';
const API_BASE = process.env.HYDROCERT_API_BASE || 'https://hydrocert-dev-api-exajhpd0brg2bcar.ukwest-01.azurewebsites.net';
const EMAIL = process.env.HYDROCERT_QA_EMAIL || '';
const PASS = process.env.HYDROCERT_QA_PASSWORD || '';
const TEST_FILTER = new Set(
  String(process.env.HYDROCERT_TEST_IDS || '')
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean)
);
const VISIT_DETAILS_TAB_INDEX = { details: 0, inspections: 1, attachments: 2 };

const stamp = new Date().toISOString().replace(/[.:]/g, '-');
const run = `dev-infra-deep-regression-${stamp}`;
const runDir = path.join(process.cwd(), 'qa-artifacts', 'infra-regression', run);
const shotsDir = path.join(runDir, 'screenshots');
fs.mkdirSync(shotsDir, { recursive: true });

const checks = [];
const consoleErrors = [];
const requestFailures = [];
const responses5xx = [];
let shotIndex = 1;
let authToken = '';
let firstEditUrl = '';

function pushCheck({ id, area, test, status, details, evidence = [] }) {
  checks.push({ id, area, test, status, details, evidence });
  console.log(`${id} | ${status} | ${test} | ${details}`);
}

function shouldRun(id) {
  return TEST_FILTER.size === 0 || TEST_FILTER.has(String(id).toUpperCase());
}

function needsApiContext() {
  if (TEST_FILTER.size === 0) return true;
  return [...TEST_FILTER].some((id) => /^(I06|A|P)/.test(id));
}

async function settled(page, ms = 800) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

async function ensureLoggedIn(page) {
  await page.goto(`${WEB_BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await settled(page, 1000);
  if (page.url().includes('/login')) {
    await page.locator('input[name="email"],input[type="email"]').first().fill(EMAIL);
    await page.locator('input[name="password"],input[type="password"]').first().fill(PASS);
    await page.getByRole('button', { name: /sign in/i }).first().click();
    await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 25000 }).catch(() => {});
    await settled(page, 1200);
  }
  return !page.url().includes('/login');
}

async function shot(page, name) {
  const file = path.join(shotsDir, `${String(shotIndex).padStart(2, '0')}-${name}.png`);
  shotIndex += 1;
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

function escapeRegexLiteral(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function clickVisitDetailsTab(page, labelPattern) {
  const primaryTab = page.locator('[data-slot="tabs-trigger"]').filter({ hasText: labelPattern }).first();
  const candidates = [
    primaryTab,
    page.getByRole('tab', { name: labelPattern }).first(),
    page.getByRole('button', { name: labelPattern }).first(),
  ];

  for (const tab of candidates) {
    if (!(await tab.isVisible().catch(() => false))) continue;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await tab.scrollIntoViewIfNeeded().catch(() => {});
      await tab.click().catch(() => {});
      await page.waitForTimeout(250);
      const dataState = await tab.getAttribute('data-state').catch(() => '');
      const ariaSelected = await tab.getAttribute('aria-selected').catch(() => '');
      if (dataState === 'active' || ariaSelected === 'true') return true;
    }
  }

  await page.evaluate((patternSource) => {
    const matcher = new RegExp(patternSource, 'i');
    const trigger = [...document.querySelectorAll('[data-slot="tabs-trigger"]')]
      .find((node) => matcher.test((node.textContent || '').trim()));
    if (trigger instanceof HTMLElement) trigger.click();
  }, labelPattern.source).catch(() => {});
  await page.waitForTimeout(300);
  const dataState = await primaryTab.getAttribute('data-state').catch(() => '');
  const ariaSelected = await primaryTab.getAttribute('aria-selected').catch(() => '');
  return dataState === 'active' || ariaSelected === 'true';
}

function visitDetailsTab(page, labelPattern) {
  return page.locator('[data-slot="tabs-trigger"]').filter({ hasText: labelPattern }).first();
}

function visitDetailsTabByKey(page, key) {
  return page.locator('[data-slot="tabs-trigger"]').nth(VISIT_DETAILS_TAB_INDEX[key]);
}

async function waitForVisitDetailsTabsReady(page, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const loading = await page.getByText(/Loading visit details/i).first().isVisible().catch(() => false);
    const tabsCount = await page.locator('[data-slot="tabs-trigger"]').count().catch(() => 0);
    if (!loading && tabsCount >= 3) return true;
    await page.waitForTimeout(300);
  }
  return false;
}

async function clickVisitDetailsTabByKey(page, key) {
  const tab = visitDetailsTabByKey(page, key);
  if (!(await tab.isVisible().catch(() => false))) return false;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await tab.scrollIntoViewIfNeeded().catch(() => {});
    await tab.click({ force: true }).catch(() => {});
    await page.waitForTimeout(250);
    const dataState = await tab.getAttribute('data-state').catch(() => '');
    const ariaSelected = await tab.getAttribute('aria-selected').catch(() => '');
    if (dataState === 'active' || ariaSelected === 'true') return true;
  }
  await page.evaluate((index) => {
    const trigger = document.querySelectorAll('[data-slot="tabs-trigger"]')[index];
    if (trigger instanceof HTMLElement) trigger.click();
  }, VISIT_DETAILS_TAB_INDEX[key]).catch(() => {});
  await page.waitForTimeout(300);
  const dataState = await tab.getAttribute('data-state').catch(() => '');
  const ariaSelected = await tab.getAttribute('aria-selected').catch(() => '');
  return dataState === 'active' || ariaSelected === 'true';
}

async function tabPanelVisible(page, labelPattern, timeoutMs = 8000) {
  const tab = visitDetailsTab(page, labelPattern);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const panelId = await tab.getAttribute('aria-controls').catch(() => '');
    const active = (await tab.getAttribute('data-state').catch(() => '')) === 'active'
      || (await tab.getAttribute('aria-selected').catch(() => '')) === 'true';
    if (panelId) {
      const panel = page.locator(`#${panelId}`).first();
      const visible = await panel.isVisible().catch(() => false);
      const panelState = await panel.getAttribute('data-state').catch(() => '');
      if (active && visible && panelState === 'active') return true;
    } else if (active) {
      return true;
    }
    await page.waitForTimeout(250);
  }
  return false;
}

async function tabPanelVisibleByKey(page, key, timeoutMs = 8000) {
  const tab = visitDetailsTabByKey(page, key);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const panelId = await tab.getAttribute('aria-controls').catch(() => '');
    const active = (await tab.getAttribute('data-state').catch(() => '')) === 'active'
      || (await tab.getAttribute('aria-selected').catch(() => '')) === 'true';
    if (panelId) {
      const panel = page.locator(`#${panelId}`).first();
      const visible = await panel.isVisible().catch(() => false);
      const panelState = await panel.getAttribute('data-state').catch(() => '');
      if (active && visible && panelState === 'active') return true;
    } else if (active) {
      return true;
    }
    await page.waitForTimeout(250);
  }
  return false;
}

async function attachmentsSectionVisible(page, timeoutMs = 10000) {
  const candidates = [
    page.getByText(/^Visit \(\d+\)$/i).first(),
    page.getByText(/^Inspection \(\d+\)$/i).first(),
    page.getByText(/^Inspection \(0\)$/i).first(),
    page.locator('button').filter({ hasText: /Visit \(\d+\)|Inspection \(\d+\)|Inspection \(0\)/i }).first(),
  ];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const candidate of candidates) {
      if (await candidate.isVisible().catch(() => false)) return true;
    }
    await page.waitForTimeout(300);
  }
  return false;
}

async function waitForVisitsListRows(page, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const loading = await page.getByText(/Loading visits/i).first().isVisible().catch(() => false);
    const rows = await page.locator('table tbody tr').count().catch(() => 0);
    if (!loading && rows > 0) return rows;
    await page.waitForTimeout(400);
  }
  return 0;
}

async function waitForVisitReferenceResponse(page, reference, timeoutMs = 15000) {
  return await page.waitForResponse((response) => {
    if (!/\/visits\/calendar-filter/i.test(response.url())) return false;
    try {
      const url = new URL(response.url());
      return response.ok() && url.searchParams.get('visitReference') === reference;
    } catch {
      return false;
    }
  }, { timeout: timeoutMs }).then(() => true).catch(() => false);
}

async function waitForVisitReferenceRow(page, reference, timeoutMs = 15000) {
  const matcher = new RegExp(`^${escapeRegexLiteral(reference)}$`, 'i');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const loading = await page.getByText(/Loading visits/i).first().isVisible().catch(() => false);
    const matches = await page.locator('table tbody tr td:first-child').filter({ hasText: matcher }).count().catch(() => 0);
    if (!loading && matches > 0) return matches;
    await page.waitForTimeout(400);
  }
  return 0;
}

function visitAttachmentBucket(page) {
  return page.locator('span').filter({ hasText: /^Visit \(\d+\)$/i }).first();
}

function visitAttachmentTrigger(page) {
  return page.locator('button').filter({ has: visitAttachmentBucket(page) }).first();
}

async function attachmentTriggerVisible(page, timeoutMs = 10000) {
  const trigger = visitAttachmentTrigger(page);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await trigger.isVisible().catch(() => false)) return true;
    await page.waitForTimeout(300);
  }
  return false;
}

async function openAttachmentsPanel(page, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const switched = await clickVisitDetailsTabByKey(page, 'attachments');
    if (switched && await tabPanelVisibleByKey(page, 'attachments', 2500)) return true;
    await page.waitForTimeout(500);
  }
  return false;
}

async function visitDetailsPanelVisible(page, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tabActive = await tabPanelVisibleByKey(page, 'details', 1200);
    const hasDescription = await page.getByText(/^Description$/i).first().isVisible().catch(() => false);
    const hasSignature = await page.getByText(/^Client Signature$/i).first().isVisible().catch(() => false);
    if (tabActive && (hasDescription || hasSignature)) return true;
    await page.waitForTimeout(300);
  }
  return false;
}

async function ensureFirstVisitDetailsUrl(page, currentUrl = '') {
  if (/\/visits\/details\//i.test(currentUrl)) return currentUrl;
  const loggedIn = await ensureLoggedIn(page);
  if (!loggedIn) return '';
  await page.goto(`${WEB_BASE}/visits-list`);
  const rows = await waitForVisitsListRows(page, 15000);
  if (rows < 1) return '';
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const row = page.locator('table tbody tr').first();
    await row.scrollIntoViewIfNeeded().catch(() => {});
    const clickNav = page.waitForURL(/\/visits\/details\//i, { timeout: 5000 }).then(() => true).catch(() => false);
    await row.click({ position: { x: 20, y: 20 } }).catch(() => {});
    const navigated = await clickNav;
    if (navigated) return page.url();
    const enterNav = page.waitForURL(/\/visits\/details\//i, { timeout: 3000 }).then(() => true).catch(() => false);
    await row.press('Enter').catch(() => {});
    const entered = await enterNav;
    if (entered) return page.url();
    await page.waitForTimeout(600);
  }
  return '';
}

async function userMenuVisible(page) {
  const candidates = [
    page.locator('header button[aria-haspopup="menu"]').first(),
    page.getByRole('button', { name: /tech quarter/i }).first(),
    page.getByRole('button', { name: /admin/i }).first(),
  ];
  for (const locator of candidates) {
    if (await locator.isVisible().catch(() => false)) return true;
  }
  return false;
}

async function waitForPlannerEventRows(page, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await page.locator('table tbody tr').count().catch(() => 0);
    const loading = await page.getByText(/Loading visits/i).first().isVisible().catch(() => false);
    if (!loading && rows > 0) return rows;
    await page.waitForTimeout(400);
  }
  return 0;
}

async function waitForPlannerMonthSignal(page, timeoutMs = 10000) {
  const monthLabel = page
    .getByText(/March|April|May|June|July|August|September|October|November|December|January|February/i)
    .first();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await monthLabel.isVisible().catch(() => false)) return true;
    await page.waitForTimeout(300);
  }
  return false;
}

async function runCheck(page, def, fn) {
  const { id, area, test } = def;
  if (!shouldRun(id)) return;
  try {
    const out = await fn();
    pushCheck({
      id,
      area,
      test,
      status: out?.status || 'PASS',
      details: out?.details || '',
      evidence: out?.evidence || [],
    });
  } catch (error) {
    const ev = await shot(page, `${id.toLowerCase()}-error`).catch(() => null);
    pushCheck({
      id,
      area,
      test,
      status: 'FAIL',
      details: String(error).replace(/\s+/g, ' ').slice(0, 260),
      evidence: ev ? [ev] : [],
    });
  }
}

function extractArrayLike(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.items)) return json.items;
  if (Array.isArray(json?.results)) return json.results;
  return [];
}

function p95(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[idx];
}

function isBenignRequestFailure(entry) {
  const url = String(entry?.url || '').toLowerCase();
  const failure = String(entry?.failure || '').toLowerCase();
  if (failure.includes('net::err_aborted')) return true;
  if (url.includes('maps.googleapis.com')) return true;
  if (url.includes('google.internal.maps')) return true;
  return false;
}

function actionableRequestFailures(entries) {
  return entries.filter((entry) => !isBenignRequestFailure(entry));
}

async function probeApi(apiCtx, method, endpoint, body) {
  const started = Date.now();
  let response;
  if (method === 'GET') response = await apiCtx.get(endpoint);
  else if (method === 'POST') response = await apiCtx.post(endpoint, { data: body });
  else if (method === 'PATCH') response = await apiCtx.patch(endpoint, { data: body });
  else throw new Error(`Unsupported method: ${method}`);
  const latencyMs = Date.now() - started;
  let json = null;
  try {
    json = await response.json();
  } catch {}
  return { status: response.status(), latencyMs, json };
}

async function perfProbe(apiCtx, endpoint, expectedMaxP95, iterations = 18) {
  const times = [];
  let fails = 0;
  for (let i = 0; i < iterations; i += 1) {
    const started = Date.now();
    const resp = await apiCtx.get(endpoint);
    const ms = Date.now() - started;
    times.push(ms);
    if (resp.status() >= 400) fails += 1;
  }
  const p95v = p95(times);
  return {
    ok: fails === 0 && p95v <= expectedMaxP95,
    p95: p95v,
    avg: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
    min: Math.min(...times),
    max: Math.max(...times),
    fails,
    expectedMaxP95,
  };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1536, height: 864 } });
const page = await context.newPage();

page.on('console', (msg) => {
  if (msg.type() === 'error') {
    consoleErrors.push({ url: page.url(), text: msg.text() });
  }
});

page.on('requestfailed', (req) => {
  requestFailures.push({
    url: req.url(),
    method: req.method(),
    failure: req.failure()?.errorText || 'requestfailed',
  });
});

page.on('response', async (res) => {
  const url = res.url();
  const status = res.status();
  if (status >= 500) {
    responses5xx.push({ status, url, method: res.request().method() });
  }
  if (!authToken && /\/auth\/login/i.test(url) && res.request().method() === 'POST') {
    try {
      const data = await res.json();
      authToken = data?.accessToken || data?.token || '';
    } catch {}
  }
});

let apiCtx;
let firstVisitRef = '';
let firstVisitDetailsUrl = '';

try {
  await runCheck(page, { id: 'I01', area: 'WebApp', test: 'Web root is reachable' }, async () => {
    const resp = await page.request.get(`${WEB_BASE}/`);
    if (!resp.ok()) return { status: 'FAIL', details: `status=${resp.status()}` };
    return { status: 'PASS', details: `status=${resp.status()}` };
  });

  await runCheck(page, { id: 'I02', area: 'WebApp', test: 'Main routes return HTTP success' }, async () => {
    const routes = ['/dashboard', '/customers', '/visits-list', '/planner', '/visits/addnewvisit', '/visits'];
    const bad = [];
    for (const r of routes) {
      const resp = await page.request.get(`${WEB_BASE}${r}`);
      if (!resp.ok()) bad.push(`${r}:${resp.status()}`);
    }
    if (bad.length) return { status: 'FAIL', details: bad.join(' | ') };
    return { status: 'PASS', details: `routes=${routes.length}` };
  });

  await runCheck(page, { id: 'I03', area: 'Auth', test: 'Login to WebApp succeeds' }, async () => {
    await page.goto(`${WEB_BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
    await settled(page, 1000);
    if (page.url().includes('/login')) {
      await page.locator('input[name="email"],input[type="email"]').first().fill(EMAIL);
      await page.locator('input[name="password"],input[type="password"]').first().fill(PASS);
      await page.getByRole('button', { name: /sign in/i }).first().click();
      await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 25000 }).catch(() => {});
      await settled(page, 1200);
    }
    if (page.url().includes('/login')) {
      const ev = await shot(page, 'i03-login-failed');
      return { status: 'FAIL', details: 'Still on /login', evidence: [ev] };
    }
    const hasSessionUser = await userMenuVisible(page);
    if (!hasSessionUser) {
      const ev = await shot(page, 'i03-login-no-user-header');
      return { status: 'FAIL', details: 'Logged in but user header not visible', evidence: [ev] };
    }
    return { status: 'PASS', details: `url=${page.url()}` };
  });

  await runCheck(page, { id: 'I04', area: 'Auth', test: 'Session persists after page refresh' }, async () => {
    await page.goto(`${WEB_BASE}/dashboard`);
    await settled(page, 900);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await settled(page, 1000);
    if (page.url().includes('/login')) {
      const ev = await shot(page, 'i04-refresh-logged-out');
      return { status: 'FAIL', details: 'Redirected to login after refresh', evidence: [ev] };
    }
    return { status: 'PASS', details: 'Session persisted' };
  });

  await runCheck(page, { id: 'I05', area: 'Auth/API', test: 'Invalid login is rejected by API' }, async () => {
    const anon = await request.newContext({ baseURL: API_BASE });
    const resp = await anon.post('/auth/login', {
      data: { email: EMAIL, password: 'WrongPassword!123' },
    });
    await anon.dispose();
    if (![400, 401, 403].includes(resp.status())) {
      return { status: 'FAIL', details: `unexpected status=${resp.status()}` };
    }
    return { status: 'PASS', details: `status=${resp.status()}` };
  });

  if (!authToken) {
    const storageToken = await page
      .evaluate(() => {
        const directSession = sessionStorage.getItem('accessToken') || '';
        if (directSession) return directSession;

        const values = [
          ...Object.values(localStorage),
          ...Object.values(sessionStorage),
        ].map((v) => String(v || ''));

        for (const raw of values) {
          if (/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(raw)) return raw;
          try {
            const parsed = JSON.parse(raw);
            if (parsed?.accessToken) return parsed.accessToken;
            if (parsed?.token) return parsed.token;
          } catch {}
        }
        return '';
      })
      .catch(() => '');
    if (storageToken) authToken = storageToken;
  }

  if (!authToken) {
    const state = await context.storageState();
    const statePath = path.join(runDir, 'storage-state.json');
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  }
  if (!authToken) {
    const ev = await shot(page, 'auth-token-missing');
    if (shouldRun('I06')) {
      pushCheck({
        id: 'I06',
        area: 'Auth/API',
        test: 'Auth token captured from login',
        status: 'FAIL',
        details: 'No access token found in /auth/login response',
        evidence: [ev],
      });
    }
    if (needsApiContext()) {
      throw new Error('Cannot continue deep API regression without token');
    }
  } else {
    if (shouldRun('I06')) {
      pushCheck({
        id: 'I06',
        area: 'Auth/API',
        test: 'Auth token captured from login',
        status: 'PASS',
        details: 'Token captured successfully',
      });
    }
  }

  if (needsApiContext()) {
    apiCtx = await request.newContext({
      baseURL: API_BASE,
      extraHTTPHeaders: { Authorization: `Bearer ${authToken}` },
    });
  }

  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).toISOString();
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()).toISOString();
  const absStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const absEnd = new Date(now.getFullYear(), now.getMonth() + 2, 1).toISOString().slice(0, 10);

  const apiChecks = [
    { id: 'A01', endpoint: '/health', test: 'API health endpoint' },
    { id: 'A02', endpoint: '/users/profile/me', test: 'Profile endpoint with auth' },
    { id: 'A03', endpoint: '/users', test: 'Users list endpoint' },
    { id: 'A04', endpoint: '/customers/filtered?page=1&limit=20', test: 'Customers filtered endpoint' },
    { id: 'A05', endpoint: `/visits/calendar-filter?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&page=1&limit=50`, test: 'Visits calendar filter endpoint' },
    { id: 'A06', endpoint: '/job-types', test: 'Job types endpoint' },
    { id: 'A07', endpoint: '/products', test: 'Products endpoint' },
    { id: 'A08', endpoint: '/sample-types', test: 'Sample types endpoint' },
    { id: 'A09', endpoint: '/labs', test: 'Labs endpoint' },
    { id: 'A10', endpoint: `/users/absences?startDate=${absStart}&endDate=${absEnd}`, test: 'Users absences endpoint' },
  ];

  for (const item of apiChecks) {
    await runCheck(page, { id: item.id, area: 'API', test: item.test }, async () => {
      const p = await probeApi(apiCtx, 'GET', item.endpoint);
      if (p.status >= 400) return { status: 'FAIL', details: `status=${p.status}, ${item.endpoint}` };
      const arr = extractArrayLike(p.json);
      const hasDataHint =
        Array.isArray(arr) ||
        p.json?.status ||
        p.json?.message ||
        p.json?.email ||
        p.json?.id;
      if (!hasDataHint) return { status: 'FAIL', details: `status=${p.status}, unexpected payload shape` };
      return {
        status: 'PASS',
        details: `status=${p.status}, latency=${p.latencyMs}ms, items=${arr.length || 'n/a'}`,
      };
    });
  }

  await runCheck(page, { id: 'U01', area: 'WebApp', test: 'Customers page loads data table' }, async () => {
    await page.goto(`${WEB_BASE}/customers`);
    await settled(page, 1100);
    const rows = await page.locator('table tbody tr').count().catch(() => 0);
    if (rows < 1) {
      const ev = await shot(page, 'u01-customers-no-rows');
      return { status: 'FAIL', details: 'No rows in customers table', evidence: [ev] };
    }
    return { status: 'PASS', details: `rows=${rows}` };
  });

  await runCheck(page, { id: 'U02', area: 'WebApp', test: 'Customers search + clear filter flow works' }, async () => {
    const search = page.getByPlaceholder(/search customers/i).first();
    if (!(await search.isVisible().catch(() => false))) return { status: 'FAIL', details: 'Search input not visible' };
    await search.fill('maida');
    await settled(page, 700);
    const filtered = await page.locator('table tbody tr').count().catch(() => 0);
    await page.getByRole('button', { name: /clear filters/i }).first().click().catch(() => {});
    await settled(page, 700);
    const restored = await page.locator('table tbody tr').count().catch(() => 0);
    if (restored < filtered) return { status: 'FAIL', details: `filtered=${filtered}, restored=${restored}` };
    return { status: 'PASS', details: `filtered=${filtered}, restored=${restored}` };
  });

  await runCheck(page, { id: 'U03', area: 'WebApp', test: 'Visits List loads and reference search works' }, async () => {
    await page.goto(`${WEB_BASE}/visits-list`);
    const initialRows = await waitForVisitsListRows(page, 15000);
    if (initialRows < 1) {
      const ev = await shot(page, 'u03-visits-empty');
      return { status: 'FAIL', details: `rows=${initialRows}`, evidence: [ev] };
    }
    await settled(page, 400);
    const firstRef = ((await page.locator('table tbody tr td').first().innerText().catch(() => '')) || '').trim();
    if (!firstRef) {
      const ev = await shot(page, 'u03-visits-no-first-ref');
      return { status: 'FAIL', details: 'No first visit reference in table', evidence: [ev] };
    }
    firstVisitRef = firstRef;
    const refInput = page.getByPlaceholder(/Visit reference/i).first();
    if (!(await refInput.isVisible().catch(() => false))) return { status: 'FAIL', details: 'Visit reference input missing' };
    const responsePromise = waitForVisitReferenceResponse(page, firstRef, 15000);
    await refInput.fill(firstRef);
    const responseSeen = await responsePromise;
    const rows = await waitForVisitReferenceRow(page, firstRef, 15000);
    if (!responseSeen || rows < 1) {
      const ev = await shot(page, 'u03-ref-not-found-after-search');
      return {
        status: 'FAIL',
        details: `reference=${firstRef}, responseSeen=${responseSeen}, rows=${rows}`,
        evidence: [ev],
      };
    }
    return { status: 'PASS', details: `reference=${firstRef}, responseSeen=${responseSeen}, rows=${rows}` };
  });

  await runCheck(page, { id: 'U04', area: 'WebApp', test: 'Visit details page opens from visits list row' }, async () => {
    await page.goto(`${WEB_BASE}/visits-list`);
    await settled(page, 900);
    const row = page.locator('table tbody tr').first();
    if (!(await row.isVisible().catch(() => false))) return { status: 'FAIL', details: 'No visible row in visits list' };
    await row.click().catch(() => {});
    await settled(page, 1100);
    const url = page.url();
    if (!/\/visits\/details\//i.test(url)) {
      const ev = await shot(page, 'u04-details-not-opened');
      return { status: 'FAIL', details: `URL=${url}`, evidence: [ev] };
    }
    firstVisitDetailsUrl = url;
    return { status: 'PASS', details: `url=${url}` };
  });

  await runCheck(page, { id: 'U05', area: 'WebApp', test: 'Visit details tabs switch without errors' }, async () => {
    firstVisitDetailsUrl = await ensureFirstVisitDetailsUrl(page, firstVisitDetailsUrl);
    if (!firstVisitDetailsUrl) return { status: 'FAIL', details: 'No details URL available' };
    await page.goto(firstVisitDetailsUrl);
    await waitForVisitDetailsTabsReady(page, 15000);
    await settled(page, 600);
    const attachPanel = await openAttachmentsPanel(page, 15000);
    const openedDetails = await clickVisitDetailsTabByKey(page, 'details');
    const detailsPanel = openedDetails ? await visitDetailsPanelVisible(page, 6000) : false;
    if (!attachPanel || !detailsPanel) {
      const ev = await shot(page, 'u05-tab-switch-fail');
      return { status: 'FAIL', details: `attachPanel=${attachPanel}, detailsPanel=${detailsPanel}`, evidence: [ev] };
    }
    return { status: 'PASS', details: 'Attachments and Visit Details tabs both render' };
  });

  await runCheck(page, { id: 'U06', area: 'WebApp', test: 'Planner Month/Event toggle works' }, async () => {
    await page.goto(`${WEB_BASE}/planner`);
    await settled(page, 900);
    await page.getByRole('button', { name: /Events View/i }).first().click().catch(() => {});
    const eventRows = await waitForPlannerEventRows(page, 15000);
    await page.getByRole('button', { name: /Month View/i }).first().click().catch(() => {});
    const monthSignal = await waitForPlannerMonthSignal(page, 10000);
    if (eventRows < 1 || !monthSignal) {
      const ev = await shot(page, 'u06-planner-toggle-fail');
      return { status: 'FAIL', details: `eventRows=${eventRows}, monthSignal=${monthSignal}`, evidence: [ev] };
    }
    return { status: 'PASS', details: `eventRows=${eventRows}, monthSignal=${monthSignal}` };
  });

  await runCheck(page, { id: 'U07', area: 'WebApp', test: 'Planner eye action opens Edit Visit page' }, async () => {
    await page.goto(`${WEB_BASE}/planner`);
    await settled(page, 900);
    await page.getByRole('button', { name: /Events View/i }).first().click().catch(() => {});
    await page.locator('table tbody tr').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    await settled(page, 700);

    const candidates = page.locator('table tbody tr td:last-child button').filter({ has: page.locator('svg.lucide-eye') });
    const count = await candidates.count().catch(() => 0);
    if (count < 1) {
      const ev = await shot(page, 'u07-eye-not-visible');
      return { status: 'FAIL', details: 'No eye action button found in planner table', evidence: [ev] };
    }

    for (let i = 0; i < Math.min(count, 5); i += 1) {
      const eye = candidates.nth(i);
      await eye.scrollIntoViewIfNeeded().catch(() => {});
      const beforeUrl = page.url();
      await eye.click().catch(() => {});
      await page.waitForURL(/\/visits\/edit\//i, { timeout: 4000 }).catch(() => {});
      await settled(page, 800);
      const url = page.url();
      if (/\/visits\/edit\//i.test(url)) {
        firstEditUrl = url;
        return { status: 'PASS', details: `url=${url}` };
      }
      if (page.url() !== beforeUrl) {
        await page.goto(`${WEB_BASE}/planner`).catch(() => {});
        await settled(page, 900);
        await page.getByRole('button', { name: /Events View/i }).first().click().catch(() => {});
        await page.locator('table tbody tr').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
        await settled(page, 600);
      }
    }

    const ev = await shot(page, 'u07-edit-not-opened');
    return { status: 'FAIL', details: `URL=${page.url()}`, evidence: [ev] };
  });

  await runCheck(page, { id: 'U08', area: 'WebApp', test: 'Google Map renders on Edit Visit and after refresh' }, async () => {
    if (!firstEditUrl) return { status: 'SKIP', details: 'Skipped because U07 did not open edit page' };
    await page.goto(firstEditUrl);
    await settled(page, 1600);
    const before = await page.locator('.gm-style, [aria-label="Map"]').first().isVisible().catch(() => false);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await settled(page, 1800);
    const after = await page.locator('.gm-style, [aria-label="Map"]').first().isVisible().catch(() => false);
    if (!before || !after) {
      const ev = await shot(page, 'u08-map-refresh-fail');
      return { status: 'FAIL', details: `before=${before}, after=${after}`, evidence: [ev] };
    }
    return { status: 'PASS', details: `before=${before}, after=${after}` };
  });

  await runCheck(page, { id: 'U09', area: 'WebApp', test: 'Add New Visit page loads required controls' }, async () => {
    await page.goto(`${WEB_BASE}/visits/addnewvisit`);
    await settled(page, 1100);
    const titleInput = page.locator('input[placeholder*="Enter title"], input[name="title"], input#title').first();
    const hasTitle = await titleInput.isVisible().catch(() => false);
    const hasSite = await page.getByPlaceholder(/search site/i).first().isVisible().catch(() => false);
    const hasFrom = await page.locator('button#from').first().isVisible().catch(() => false);
    const hasTo = await page.locator('button#to').first().isVisible().catch(() => false);
    if (!hasTitle || !hasSite || !hasFrom || !hasTo) {
      const ev = await shot(page, 'u09-addnew-controls-missing');
      return { status: 'FAIL', details: `title=${hasTitle}, site=${hasSite}, from=${hasFrom}, to=${hasTo}`, evidence: [ev] };
    }
    return { status: 'PASS', details: 'Core controls visible' };
  });

  await runCheck(page, { id: 'U10', area: 'WebApp', test: 'No requestfailed events during deep route traversal' }, async () => {
    const actionable = actionableRequestFailures(requestFailures);
    const ignored = requestFailures.length - actionable.length;
    if (actionable.length > 0) {
      const ev = await shot(page, 'u10-requestfailed-events');
      return { status: 'FAIL', details: `requestfailed=${actionable.length}, ignored=${ignored}`, evidence: [ev] };
    }
    return { status: 'PASS', details: `requestfailed=0, ignored=${ignored}` };
  });

  await runCheck(page, { id: 'U11', area: 'WebApp/API', test: 'No 5xx responses during traversal' }, async () => {
    if (responses5xx.length > 0) {
      const ev = await shot(page, 'u11-5xx-seen');
      return { status: 'FAIL', details: `5xx=${responses5xx.length}`, evidence: [ev] };
    }
    return { status: 'PASS', details: 'No 5xx seen' };
  });

  await runCheck(page, { id: 'U12', area: 'WebApp', test: 'No console error events during traversal' }, async () => {
    if (consoleErrors.length > 0) {
      const ev = await shot(page, 'u12-console-errors');
      return { status: 'FAIL', details: `consoleErrors=${consoleErrors.length}`, evidence: [ev] };
    }
    return { status: 'PASS', details: 'No console errors' };
  });

  await runCheck(page, { id: 'P01', area: 'Performance', test: 'API /health latency stability (p95 <= 700ms)' }, async () => {
    const perf = await perfProbe(apiCtx, '/health', 700, 20);
    if (!perf.ok) return { status: 'FAIL', details: JSON.stringify(perf) };
    return { status: 'PASS', details: JSON.stringify(perf) };
  });

  await runCheck(page, { id: 'P02', area: 'Performance', test: 'API /users/profile/me latency stability (p95 <= 900ms)' }, async () => {
    const perf = await perfProbe(apiCtx, '/users/profile/me', 900, 20);
    if (!perf.ok) return { status: 'FAIL', details: JSON.stringify(perf) };
    return { status: 'PASS', details: JSON.stringify(perf) };
  });

  await runCheck(page, { id: 'P03', area: 'Performance', test: 'API /customers/filtered latency stability (p95 <= 1500ms)' }, async () => {
    const perf = await perfProbe(apiCtx, '/customers/filtered?page=1&limit=20', 1500, 16);
    if (!perf.ok) return { status: 'FAIL', details: JSON.stringify(perf) };
    return { status: 'PASS', details: JSON.stringify(perf) };
  });

  await runCheck(page, { id: 'P04', area: 'Performance', test: 'API /visits/calendar-filter latency stability (p95 <= 1900ms)' }, async () => {
    const perf = await perfProbe(apiCtx, `/visits/calendar-filter?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&page=1&limit=50`, 1900, 14);
    if (!perf.ok) return { status: 'FAIL', details: JSON.stringify(perf) };
    return { status: 'PASS', details: JSON.stringify(perf) };
  });
} finally {
  await apiCtx?.dispose().catch(() => {});
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}

const totals = {
  total: checks.length,
  pass: checks.filter((c) => c.status === 'PASS').length,
  fail: checks.filter((c) => c.status === 'FAIL').length,
  skip: checks.filter((c) => c.status === 'SKIP').length,
};

const summary = {
  generatedAt: new Date().toISOString(),
  environment: { webBase: WEB_BASE, apiBase: API_BASE },
  totals,
  checks,
  telemetry: {
    consoleErrors,
    requestFailures,
    responses5xx,
  },
};

const summaryPath = path.join(runDir, 'summary.json');
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

const mdLines = [];
mdLines.push('# DEV Azure Infra Deep Regression Report');
mdLines.push(`Date: ${new Date().toISOString()}`);
mdLines.push(`WebApp: ${WEB_BASE}`);
mdLines.push(`API: ${API_BASE}`);
mdLines.push('');
mdLines.push('## Summary');
mdLines.push(`- Total checks: ${totals.total}`);
mdLines.push(`- Passed: ${totals.pass}`);
mdLines.push(`- Failed: ${totals.fail}`);
mdLines.push(`- Skipped: ${totals.skip}`);
mdLines.push('');
mdLines.push('## Checks');
mdLines.push('| ID | Area | Test | Status | Details |');
mdLines.push('|---|---|---|---|---|');
for (const c of checks) {
  mdLines.push(`| ${c.id} | ${c.area} | ${String(c.test).replace(/\|/g, '/')} | ${c.status} | ${String(c.details).replace(/\|/g, '/')} |`);
}
if (checks.some((c) => c.status === 'FAIL')) {
  mdLines.push('');
  mdLines.push('## Fail Evidence');
  for (const c of checks.filter((x) => x.status === 'FAIL')) {
    if (!c.evidence?.length) continue;
    mdLines.push(`- ${c.id}: ${c.evidence.join(', ')}`);
  }
}
const reportPath = path.join(runDir, 'report.md');
fs.writeFileSync(reportPath, mdLines.join('\n'), 'utf-8');

console.log(`SUMMARY_JSON=${summaryPath}`);
console.log(`REPORT_MD=${reportPath}`);
console.log(`TOTAL=${totals.total} PASS=${totals.pass} FAIL=${totals.fail} SKIP=${totals.skip}`);
