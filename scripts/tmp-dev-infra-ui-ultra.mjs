import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const WEB_BASE = process.env.HYDROCERT_WEB_BASE || 'https://hydrocert-dev-webapp-fzgveghygfc3enbt.ukwest-01.azurewebsites.net';
const EMAIL = process.env.HYDROCERT_QA_EMAIL || '';
const PASSWORD = process.env.HYDROCERT_QA_PASSWORD || '';

const stamp = new Date().toISOString().replace(/[.:]/g, '-');
const runName = `dev-infra-ui-ultra-${stamp}`;
const runDir = path.join(process.cwd(), 'qa-artifacts', 'infra-regression', runName);
const shotsDir = path.join(runDir, 'screenshots');
fs.mkdirSync(shotsDir, { recursive: true });

const checks = [];
let shotIndex = 1;
const desktopT = { consoleErrors: [], requestFailures: [], responses5xx: [] };
const mobileT = { consoleErrors: [], requestFailures: [], responses5xx: [] };

function add({ id, area, test, status, details, evidence = [] }) {
  checks.push({ id, area, test, status, details, evidence });
  console.log(`${id} | ${status} | ${test} | ${details}`);
}

async function check(page, id, area, test, fn) {
  try {
    const r = await fn();
    add({ id, area, test, status: r?.status || 'PASS', details: r?.details || '', evidence: r?.evidence || [] });
  } catch (e) {
    const ev = page ? await shot(page, `${id.toLowerCase()}-error`).catch(() => null) : null;
    add({
      id,
      area,
      test,
      status: 'FAIL',
      details: String(e).replace(/\s+/g, ' ').slice(0, 260),
      evidence: ev ? [ev] : [],
    });
  }
}

async function settled(page, ms = 800) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

async function shot(page, name) {
  const p = path.join(shotsDir, `${String(shotIndex).padStart(3, '0')}-${name}.png`);
  shotIndex += 1;
  await page.screenshot({ path: p, fullPage: true });
  return p;
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

function visitDetailsTab(page, labelPattern) {
  return page.locator('[data-slot="tabs-trigger"]').filter({ hasText: labelPattern }).first();
}

async function visitDetailsTabActive(page, labelPattern, timeoutMs = 5000) {
  const tab = visitDetailsTab(page, labelPattern);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const dataState = await tab.getAttribute('data-state').catch(() => '');
    const ariaSelected = await tab.getAttribute('aria-selected').catch(() => '');
    if (dataState === 'active' || ariaSelected === 'true') return true;
    await page.waitForTimeout(200);
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
    await clickVisitDetailsTab(page, /^Attachments$/i);
    if (await attachmentTriggerVisible(page, 1800)) return true;
    await page.waitForTimeout(500);
  }
  return false;
}

async function visitDetailsPanelVisible(page, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hasDescription = await page.getByText(/^Description$/i).first().isVisible().catch(() => false);
    const hasSignature = await page.getByText(/^Client Signature$/i).first().isVisible().catch(() => false);
    if (hasDescription || hasSignature) return true;
    await page.waitForTimeout(300);
  }
  return false;
}

async function visibleUploadButtonCount(page) {
  return await page.locator('button:visible').filter({ hasText: /Upload/i }).count().catch(() => 0);
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

async function waitForMapVisible(page, timeoutMs = 15000) {
  const map = page.locator('.gm-style, [aria-label="Map"]').first();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await map.isVisible().catch(() => false)) return true;
    await page.waitForTimeout(400);
  }
  return false;
}

async function openPlannerEditVisit(page) {
  await page.goto(`${WEB_BASE}/planner`);
  await settled(page, 900);
  await page.getByRole('button', { name: /Events View/i }).first().click().catch(() => {});
  const rows = await waitForPlannerEventRows(page, 15000);
  if (rows < 1) return { ok: false, details: `planner eventRows=${rows}` };

  const eye = page.locator('table tbody tr td:last-child button:has(svg.lucide-eye), table tbody tr td:last-child button').first();
  if (!(await eye.isVisible().catch(() => false))) {
    return { ok: false, details: 'eye button hidden' };
  }

  await eye.click().catch(() => {});
  await page.waitForURL(/\/visits\/edit\//i, { timeout: 25000 }).catch(() => {});
  await settled(page, 900);
  if (!/\/visits\/edit\//i.test(page.url())) return { ok: false, details: `url=${page.url()}` };
  return { ok: true, url: page.url(), details: `eventRows=${rows}` };
}

async function login(page) {
  await page.goto(`${WEB_BASE}/dashboard`);
  await settled(page, 900);
  if (page.url().includes('/login')) {
    await page.locator('input[name="email"],input[type="email"]').first().fill(EMAIL);
    await page.locator('input[name="password"],input[type="password"]').first().fill(PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).first().click();
    await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 25000 }).catch(() => {});
    await settled(page, 1200);
  }
  return !page.url().includes('/login');
}

function isBenignRequestFailure(entry) {
  const url = String(entry?.url || '').toLowerCase();
  const error = String(entry?.error || '').toLowerCase();
  if (error.includes('net::err_aborted')) return true;
  if (url.includes('maps.googleapis.com')) return true;
  if (url.includes('google.internal.maps')) return true;
  return false;
}

function actionableRequestFailures(entries) {
  return entries.filter((entry) => !isBenignRequestFailure(entry));
}

function attachTelemetry(page, sink) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') sink.consoleErrors.push({ url: page.url(), text: msg.text() });
  });
  page.on('requestfailed', (req) => {
    sink.requestFailures.push({ method: req.method(), url: req.url(), error: req.failure()?.errorText || 'requestfailed' });
  });
  page.on('response', (res) => {
    if (res.status() >= 500) sink.responses5xx.push({ status: res.status(), method: res.request().method(), url: res.url() });
  });
}

const browser = await chromium.launch({ headless: true });
const dctx = await browser.newContext({ viewport: { width: 1536, height: 864 } });
const dpage = await dctx.newPage();
attachTelemetry(dpage, desktopT);

let firstDetailsUrl = '';
let firstEditUrl = '';

try {
  await check(dpage, 'U01', 'UI Desktop', 'Desktop login succeeds', async () => {
    const ok = await login(dpage);
    if (!ok) {
      const ev = await shot(dpage, 'u01-login-fail');
      return { status: 'FAIL', details: 'desktop login failed', evidence: [ev] };
    }
    return { status: 'PASS', details: `url=${dpage.url()}` };
  });

  await check(dpage, 'U02', 'UI Desktop', 'Dashboard shell and user info visible', async () => {
    await dpage.goto(`${WEB_BASE}/dashboard`);
    await settled(dpage, 800);
    const hasUser = await dpage.getByText(/Tech Quarter|Admin/i).first().isVisible().catch(() => false);
    const hasSidebar = await dpage.getByText(/Dashboard|Customers|Schedule/i).first().isVisible().catch(() => false);
    if (!hasUser || !hasSidebar) {
      const ev = await shot(dpage, 'u02-dashboard-shell-missing');
      return { status: 'FAIL', details: `hasUser=${hasUser}, hasSidebar=${hasSidebar}`, evidence: [ev] };
    }
    return { status: 'PASS', details: 'dashboard shell loaded' };
  });

  await check(dpage, 'U03', 'UI Desktop', 'Customers table loads rows', async () => {
    await dpage.goto(`${WEB_BASE}/customers`);
    await settled(dpage, 800);
    const rows = await dpage.locator('table tbody tr').count().catch(() => 0);
    if (rows < 1) {
      const ev = await shot(dpage, 'u03-customers-empty');
      return { status: 'FAIL', details: `rows=${rows}`, evidence: [ev] };
    }
    return { status: 'PASS', details: `rows=${rows}` };
  });

  await check(dpage, 'U04', 'UI Desktop', 'Customers search + clear flow works', async () => {
    const s = dpage.getByPlaceholder(/Search customers/i).first();
    if (!(await s.isVisible().catch(() => false))) return { status: 'FAIL', details: 'search input missing' };
    await s.fill('maida');
    await settled(dpage, 600);
    const filtered = await dpage.locator('table tbody tr').count().catch(() => 0);
    await dpage.getByRole('button', { name: /clear filters/i }).first().click().catch(() => {});
    await settled(dpage, 600);
    const restored = await dpage.locator('table tbody tr').count().catch(() => 0);
    if (restored < filtered) return { status: 'FAIL', details: `filtered=${filtered}, restored=${restored}` };
    return { status: 'PASS', details: `filtered=${filtered}, restored=${restored}` };
  });

  await check(dpage, 'U05', 'UI Desktop', 'Visits List loads rows', async () => {
    await dpage.goto(`${WEB_BASE}/visits-list`);
    await settled(dpage, 900);
    const rows = await dpage.locator('table tbody tr').count().catch(() => 0);
    if (rows < 1) {
      const ev = await shot(dpage, 'u05-visits-empty');
      return { status: 'FAIL', details: `rows=${rows}`, evidence: [ev] };
    }
    return { status: 'PASS', details: `rows=${rows}` };
  });

  await check(dpage, 'U06', 'UI Desktop', 'Visit reference filter returns a result row', async () => {
    const initialRows = await waitForVisitsListRows(dpage, 15000);
    if (initialRows < 1) return { status: 'FAIL', details: `rows=${initialRows}` };
    const ref = ((await dpage.locator('table tbody tr td').first().innerText().catch(() => '')) || '').trim();
    if (!ref) return { status: 'FAIL', details: 'no first reference' };
    const input = dpage.getByPlaceholder(/Visit reference/i).first();
    const responsePromise = waitForVisitReferenceResponse(dpage, ref, 15000);
    await input.fill(ref);
    const responseSeen = await responsePromise;
    const rows = await waitForVisitReferenceRow(dpage, ref, 15000);
    if (responseSeen && rows > 0) return { status: 'PASS', details: `reference=${ref}, responseSeen=${responseSeen}, rows=${rows}` };
    const ev = await shot(dpage, 'u06-ref-no-results');
    return { status: 'FAIL', details: `reference=${ref}, responseSeen=${responseSeen}, rows=${rows}`, evidence: [ev] };
  });

  await check(dpage, 'U07', 'UI Desktop', 'Visit details page opens from first row', async () => {
    await dpage.goto(`${WEB_BASE}/visits-list`);
    await settled(dpage, 700);
    await dpage.locator('table tbody tr').first().click().catch(() => {});
    await settled(dpage, 900);
    if (!/\/visits\/details\//i.test(dpage.url())) {
      const ev = await shot(dpage, 'u07-detail-not-open');
      return { status: 'FAIL', details: `url=${dpage.url()}`, evidence: [ev] };
    }
    firstDetailsUrl = dpage.url();
    return { status: 'PASS', details: `url=${firstDetailsUrl}` };
  });

  await check(dpage, 'U08', 'UI Desktop', 'Visit details tabs switch active state', async () => {
    if (!firstDetailsUrl) return { status: 'FAIL', details: 'no details URL from U07' };
    await dpage.goto(firstDetailsUrl);
    await waitForVisitDetailsTabsReady(dpage, 15000);
    await settled(dpage, 600);
    const attach = await openAttachmentsPanel(dpage, 15000);
    const openedDetails = await clickVisitDetailsTab(dpage, /^Visit Details$/i);
    const details = openedDetails ? await visitDetailsPanelVisible(dpage, 6000) : false;
    if (!attach || !details) {
      const ev = await shot(dpage, 'u08-tabs-fail');
      return { status: 'FAIL', details: `attach=${attach}, details=${details}`, evidence: [ev] };
    }
    return { status: 'PASS', details: 'attachments trigger visible and visit-details content restored' };
  });

  await check(dpage, 'U09', 'UI Desktop', 'Attachments tab shows Upload button on hovered section', async () => {
    await openAttachmentsPanel(dpage, 15000);
    await settled(dpage, 400);
    const trigger = visitAttachmentTrigger(dpage);
    const triggerVisible = await trigger.isVisible().catch(() => false);
    if (!triggerVisible) {
      const ev = await shot(dpage, 'u09-upload-target-missing');
      return { status: 'FAIL', details: 'visit attachment section missing', evidence: [ev] };
    }
    await trigger.hover().catch(() => {});
    await settled(dpage, 250);
    const visibleUploads = await visibleUploadButtonCount(dpage);
    if (visibleUploads < 1) {
      const ev = await shot(dpage, 'u09-upload-missing');
      return { status: 'FAIL', details: `visibleUploadButtons=${visibleUploads}`, evidence: [ev] };
    }
    return { status: 'PASS', details: `visibleUploadButtons=${visibleUploads}` };
  });

  await check(dpage, 'U10', 'UI Desktop', 'Planner Month <-> Events toggles work', async () => {
    await dpage.goto(`${WEB_BASE}/planner`);
    await settled(dpage, 800);
    await dpage.getByRole('button', { name: /Events View/i }).first().click().catch(() => {});
    const rows = await waitForPlannerEventRows(dpage, 15000);
    await dpage.getByRole('button', { name: /Month View/i }).first().click().catch(() => {});
    const month = await waitForPlannerMonthSignal(dpage, 10000);
    if (rows < 1 || !month) {
      const ev = await shot(dpage, 'u10-planner-toggle-fail');
      return { status: 'FAIL', details: `rows=${rows}, month=${month}`, evidence: [ev] };
    }
    return { status: 'PASS', details: `eventRows=${rows}` };
  });

  await check(dpage, 'U11', 'UI Desktop', 'Planner eye opens Edit Visit', async () => {
    const opened = await openPlannerEditVisit(dpage);
    if (!opened.ok) {
      const ev = await shot(dpage, 'u11-edit-not-open');
      return { status: 'FAIL', details: opened.details, evidence: [ev] };
    }
    firstEditUrl = opened.url;
    return { status: 'PASS', details: `url=${firstEditUrl}` };
  });

  await check(dpage, 'U12', 'UI Desktop', 'Edit Visit map visible before and after refresh', async () => {
    if (!firstEditUrl) {
      const opened = await openPlannerEditVisit(dpage);
      if (!opened.ok) return { status: 'FAIL', details: `no edit URL from U11; ${opened.details}` };
      firstEditUrl = opened.url;
    }
    await dpage.goto(firstEditUrl);
    await settled(dpage, 1000);
    const before = await waitForMapVisible(dpage, 15000);
    await dpage.reload({ waitUntil: 'domcontentloaded' });
    await settled(dpage, 1000);
    const after = await waitForMapVisible(dpage, 15000);
    if (!before || !after) {
      const ev = await shot(dpage, 'u12-map-missing');
      return { status: 'FAIL', details: `before=${before}, after=${after}`, evidence: [ev] };
    }
    return { status: 'PASS', details: `before=${before}, after=${after}` };
  });

  await check(dpage, 'U13', 'UI Desktop', 'Add New Visit core controls visible', async () => {
    await dpage.goto(`${WEB_BASE}/visits/addnewvisit`);
    await settled(dpage, 900);
    const title = await dpage.locator('input[placeholder*="title"], input[name="title"], input#title').first().isVisible().catch(() => false);
    const site = await dpage.getByPlaceholder(/search site/i).first().isVisible().catch(() => false);
    const from = await dpage.locator('button#from').first().isVisible().catch(() => false);
    const to = await dpage.locator('button#to').first().isVisible().catch(() => false);
    if (!title || !site || !from || !to) {
      const ev = await shot(dpage, 'u13-addnew-controls-missing');
      return { status: 'FAIL', details: `title=${title}, site=${site}, from=${from}, to=${to}`, evidence: [ev] };
    }
    return { status: 'PASS', details: 'core controls visible' };
  });

  await check(dpage, 'U14', 'UI Desktop', 'Add New Visit empty submit shows validation', async () => {
    await dpage.getByRole('button', { name: /create visit/i }).first().click().catch(() => {});
    await settled(dpage, 600);
    const errCount = await dpage.getByText(/required/i).count().catch(() => 0);
    if (errCount < 3) {
      const ev = await shot(dpage, 'u14-validation-weak');
      return { status: 'FAIL', details: `requiredCount=${errCount}`, evidence: [ev] };
    }
    return { status: 'PASS', details: `requiredCount=${errCount}` };
  });

  await check(dpage, 'U15', 'UI Desktop', 'No desktop console error events', async () => {
    return desktopT.consoleErrors.length === 0
      ? { status: 'PASS', details: 'consoleErrors=0' }
      : { status: 'FAIL', details: `consoleErrors=${desktopT.consoleErrors.length}` };
  });

  await check(dpage, 'U16', 'UI Desktop', 'No desktop requestfailed events', async () => {
    const actionable = actionableRequestFailures(desktopT.requestFailures);
    const ignored = desktopT.requestFailures.length - actionable.length;
    return actionable.length === 0
      ? { status: 'PASS', details: `requestfailed=0, ignored=${ignored}` }
      : { status: 'FAIL', details: `requestfailed=${actionable.length}, ignored=${ignored}` };
  });

  await check(dpage, 'U17', 'UI Desktop', 'No desktop 5xx response events', async () => {
    return desktopT.responses5xx.length === 0
      ? { status: 'PASS', details: '5xx=0' }
      : { status: 'FAIL', details: `5xx=${desktopT.responses5xx.length}` };
  });

  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mpage = await mctx.newPage();
  attachTelemetry(mpage, mobileT);

  try {
    await check(mpage, 'U18', 'UI Mobile', 'Mobile login succeeds', async () => {
      const ok = await login(mpage);
      if (!ok) {
        const ev = await shot(mpage, 'u18-mobile-login-fail');
        return { status: 'FAIL', details: 'mobile login failed', evidence: [ev] };
      }
      return { status: 'PASS', details: `url=${mpage.url()}` };
    });

    await check(mpage, 'U19', 'UI Mobile', 'Mobile dashboard route loads', async () => {
      await mpage.goto(`${WEB_BASE}/dashboard`);
      await settled(mpage, 900);
      const vis = await mpage.getByText(/Dashboard/i).first().isVisible().catch(() => false);
      return vis ? { status: 'PASS', details: 'dashboard visible' } : { status: 'FAIL', details: 'dashboard title missing' };
    });

    await check(mpage, 'U20', 'UI Mobile', 'Mobile customers route loads', async () => {
      await mpage.goto(`${WEB_BASE}/customers`);
      await settled(mpage, 900);
      const vis = await mpage.getByText(/Customers/i).first().isVisible().catch(() => false);
      return vis ? { status: 'PASS', details: 'customers visible' } : { status: 'FAIL', details: 'customers title missing' };
    });

    await check(mpage, 'U21', 'UI Mobile', 'Mobile visits list route loads', async () => {
      await mpage.goto(`${WEB_BASE}/visits-list`);
      await settled(mpage, 900);
      const vis = await mpage.getByText(/Visits/i).first().isVisible().catch(() => false);
      return vis ? { status: 'PASS', details: 'visits title visible' } : { status: 'FAIL', details: 'visits title missing' };
    });

    await check(mpage, 'U22', 'UI Mobile', 'Mobile telemetry clean (console/request/5xx)', async () => {
      const c = mobileT.consoleErrors.length;
      const actionable = actionableRequestFailures(mobileT.requestFailures);
      const r = actionable.length;
      const s = mobileT.responses5xx.length;
      if (c + r + s > 0) return { status: 'FAIL', details: `console=${c}, requestfailed=${r}, 5xx=${s}` };
      return { status: 'PASS', details: `mobile telemetry clean, ignored=${mobileT.requestFailures.length - r}` };
    });
  } finally {
    await mctx.close().catch(() => {});
  }
} finally {
  await dctx.close().catch(() => {});
  await browser.close().catch(() => {});
}

const totals = {
  total: checks.length,
  pass: checks.filter((x) => x.status === 'PASS').length,
  fail: checks.filter((x) => x.status === 'FAIL').length,
  skip: checks.filter((x) => x.status === 'SKIP').length,
};

const summary = {
  generatedAt: new Date().toISOString(),
  environment: { webBase: WEB_BASE },
  runName,
  totals,
  checks,
  telemetry: { desktop: desktopT, mobile: mobileT },
};
const summaryPath = path.join(runDir, 'summary.json');
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

const lines = [];
lines.push('# DEV Infra UI Ultra Regression Report');
lines.push(`Date: ${new Date().toISOString()}`);
lines.push(`WebApp: ${WEB_BASE}`);
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

