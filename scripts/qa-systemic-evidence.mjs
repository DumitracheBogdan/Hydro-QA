import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5173';
const TIMESTAMP = new Date().toISOString().replace(/[.:]/g, '-');
const RUN_DIR = path.join(process.cwd(), 'qa-artifacts', 'evidence', `systemic-run-${TIMESTAMP}`);
const SCREENSHOT_DIR = path.join(RUN_DIR, 'screenshots');
const VIDEO_DIR = path.join(RUN_DIR, 'videos');
const LOG_DIR = path.join(RUN_DIR, 'logs');

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
fs.mkdirSync(VIDEO_DIR, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });

const findings = [];
const actions = [];
const consoleErrors = new Set();
const apiEvents = [];

function logAction(step, status, details = '') {
  actions.push({ step, status, details, at: new Date().toISOString() });
  console.log(`${status.toUpperCase()} | ${step}${details ? ` | ${details}` : ''}`);
}

function addFinding(severity, title, details, evidence) {
  findings.push({
    id: `SYS-${String(findings.length + 1).padStart(3, '0')}`,
    severity,
    title,
    details,
    evidence,
  });
}

async function screenshot(page, name) {
  const p = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true });
  return p;
}

async function attachObservers(page) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.add(msg.text());
    }
  });
  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('/auth') || url.includes('/users') || url.includes('/visits') || url.includes('/planner')) {
      apiEvents.push(`${res.status()} ${url}`);
    }
  });
}

async function routeMatrix(page) {
  logAction('route-matrix', 'start');
  const routes = [
    '/',
    '/login',
    '/dashboard',
    '/customers',
    '/planner',
    '/visits',
    '/visits-list',
    '/settings',
    '/team-management',
    '/schedule',
    '/non-existing-route-qa',
  ];
  const results = [];

  for (const route of routes) {
    await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(500);
    const finalUrl = page.url();
    const h1 = ((await page.locator('h1').first().textContent().catch(() => '')) || '').trim();
    const body = ((await page.locator('body').innerText().catch(() => '')) || '').replace(/\s+/g, ' ');
    const loginVisible = /login to your account/i.test(body);
    const snap = await screenshot(page, `systemic-route-${route.replace(/[^\w-]/g, '_') || 'root'}`);
    results.push({ route, finalUrl, h1, loginVisible, screenshot: snap });
  }

  const redirectedProtected = results.filter(
    (x) =>
      ['/dashboard', '/customers', '/planner', '/visits', '/visits-list', '/settings', '/team-management', '/schedule'].includes(
        x.route,
      ) && x.finalUrl.endsWith('/login'),
  );
  if (redirectedProtected.length >= 4) {
    addFinding(
      'High',
      'Most protected routes are inaccessible (redirect to login)',
      redirectedProtected.map((x) => `${x.route} -> ${x.finalUrl}`).join(' | '),
      redirectedProtected.map((x) => x.screenshot),
    );
  }

  const notFoundRoute = results.find((x) => x.route === '/non-existing-route-qa');
  if (notFoundRoute && /login/.test(notFoundRoute.finalUrl)) {
    addFinding(
      'Low',
      'Unknown route redirects to login instead of explicit 404 state',
      `Route /non-existing-route-qa ended at ${notFoundRoute.finalUrl}`,
      [notFoundRoute.screenshot],
    );
  }

  fs.writeFileSync(path.join(LOG_DIR, 'route-matrix.json'), JSON.stringify(results, null, 2), 'utf-8');
  logAction('route-matrix', 'ok');
}

async function inputRobustness(page) {
  logAction('input-robustness', 'start');
  await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 9000 }).catch(() => {});
  await page.waitForTimeout(300);

  const email = page.locator('input[type="email"], input[name="email"], input#email').first();
  const pass = page.locator('input[type="password"], input[name="password"], input#password').first();
  const signIn = page.getByRole('button', { name: /sign in/i }).first();

  const payloads = [
    { name: 'xss', email: '<script>alert(1)</script>@a.com', pass: '<img src=x onerror=alert(1)>' },
    { name: 'sqli', email: "admin' OR '1'='1@example.com", pass: "' OR 1=1 --" },
    { name: 'unicode', email: 'тест@example.com', pass: 'пароль🙂' },
    { name: 'long', email: `${'a'.repeat(2048)}@example.com`, pass: 'p'.repeat(4096) },
  ];

  const payloadResults = [];
  for (const payload of payloads) {
    await email.fill(payload.email).catch(() => {});
    await pass.fill(payload.pass).catch(() => {});
    const beforeEvents = apiEvents.length;
    await signIn.click({ timeout: 3500 }).catch(() => {});
    await page.waitForTimeout(900);
    const afterEvents = apiEvents.length;
    const currentUrl = page.url();
    const body = ((await page.locator('body').innerText().catch(() => '')) || '').replace(/\s+/g, ' ');
    const hasAlertText = /alert\(/i.test(body);
    const snap = await screenshot(page, `systemic-input-${payload.name}`);
    payloadResults.push({
      payload: payload.name,
      currentUrl,
      authEventDelta: afterEvents - beforeEvents,
      hasAlertText,
      screenshot: snap,
    });
  }

  const suspicious = payloadResults.filter((x) => x.hasAlertText);
  if (suspicious.length > 0) {
    addFinding(
      'High',
      'Potential script content reflected in UI after malicious payload',
      suspicious.map((x) => x.payload).join(', '),
      suspicious.map((x) => x.screenshot),
    );
  }

  fs.writeFileSync(path.join(LOG_DIR, 'input-robustness.json'), JSON.stringify(payloadResults, null, 2), 'utf-8');
  logAction('input-robustness', 'ok');
}

async function multiTabSession(browser) {
  logAction('multi-tab-session', 'start');
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 1536, height: 864 },
    recordVideo: { dir: VIDEO_DIR, size: { width: 1536, height: 864 } },
  });

  const p1 = await context.newPage();
  const p2 = await context.newPage();
  await attachObservers(p1);
  await attachObservers(p2);

  await p1.goto('/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p1.waitForLoadState('networkidle', { timeout: 9000 }).catch(() => {});
  await p2.goto('/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p2.waitForLoadState('networkidle', { timeout: 9000 }).catch(() => {});

  const cb1 = p1.locator('input[type="checkbox"]').first();
  const cb2 = p2.locator('input[type="checkbox"]').first();
  const before1 = await cb1.isChecked().catch(() => false);
  const before2 = await cb2.isChecked().catch(() => false);
  await cb1.click({ timeout: 3000 }).catch(() => {});
  await p1.waitForTimeout(300);
  await p2.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  await p2.waitForLoadState('networkidle', { timeout: 9000 }).catch(() => {});
  const after2 = await cb2.isChecked().catch(() => false);
  const sessionShot = await screenshot(p2, 'systemic-multitab-persistence');

  if (before1 === before2 && after2 === before2) {
    addFinding(
      'Low',
      '"Keep me signed in" state is not reflected across tabs after reload',
      `tab1_before=${before1}, tab2_before=${before2}, tab2_after_reload=${after2}`,
      [sessionShot],
    );
  }

  await context.close();
  logAction('multi-tab-session', 'ok');
}

async function headersAndPerf(page) {
  logAction('headers-and-performance', 'start');

  const resLogin = await page.request.get(`${BASE_URL}/login`);
  const headers = resLogin.headers();
  const securityHeaders = {
    csp: headers['content-security-policy'] || '',
    xfo: headers['x-frame-options'] || '',
    referrerPolicy: headers['referrer-policy'] || '',
    xContentType: headers['x-content-type-options'] || '',
    permissionsPolicy: headers['permissions-policy'] || '',
  };

  if (!securityHeaders.csp || !securityHeaders.xfo || !securityHeaders.xContentType) {
    addFinding(
      'Low',
      'Missing baseline security headers on login response (environment risk)',
      `csp=${!!securityHeaders.csp}, x-frame-options=${!!securityHeaders.xfo}, x-content-type-options=${!!securityHeaders.xContentType}`,
      [],
    );
  }

  await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(350);

  const perf = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    if (!nav) return null;
    return {
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
      loadEventEnd: Math.round(nav.loadEventEnd),
      responseEnd: Math.round(nav.responseEnd),
      transferSize: nav.transferSize,
    };
  });

  const perfShot = await screenshot(page, 'systemic-performance-login');

  if (perf && perf.domContentLoaded > 6000) {
    addFinding(
      'Low',
      'Slow login page DOMContentLoaded in local run',
      `domContentLoaded=${perf.domContentLoaded}ms`,
      [perfShot],
    );
  }

  fs.writeFileSync(
    path.join(LOG_DIR, 'headers-and-performance.json'),
    JSON.stringify({ securityHeaders, perf }, null, 2),
    'utf-8',
  );
  logAction('headers-and-performance', 'ok');
}

async function run() {
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: false,
    args: ['--start-maximized'],
  });

  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 1536, height: 864 },
    recordVideo: { dir: VIDEO_DIR, size: { width: 1536, height: 864 } },
  });
  const page = await context.newPage();
  await attachObservers(page);

  try {
    await routeMatrix(page);
    await inputRobustness(page);
    await headersAndPerf(page);
    await multiTabSession(browser);
  } finally {
    await context.close();
    await browser.close();
  }

  const summary = {
    runDir: RUN_DIR,
    createdAt: new Date().toISOString(),
    findings,
    findingsCount: findings.length,
    actions,
    consoleErrorCount: consoleErrors.size,
    consoleErrors: [...consoleErrors],
    apiEventCount: apiEvents.length,
    apiEvents,
  };

  fs.writeFileSync(path.join(RUN_DIR, 'summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
  fs.writeFileSync(path.join(LOG_DIR, 'console-errors.log'), [...consoleErrors].join('\n\n'), 'utf-8');
  fs.writeFileSync(path.join(LOG_DIR, 'api-events.log'), apiEvents.join('\n'), 'utf-8');
  fs.writeFileSync(
    path.join(RUN_DIR, 'finding-summary.txt'),
    [
      `Run directory: ${RUN_DIR}`,
      `Findings: ${findings.length}`,
      '',
      ...findings.map((f) => `${f.id} [${f.severity}] ${f.title} :: ${f.details}`),
    ].join('\n'),
    'utf-8',
  );

  console.log(`QA_SYSTEMIC_EVIDENCE_DIR=${RUN_DIR}`);
  console.log(`QA_SYSTEMIC_FINDINGS=${findings.length}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

