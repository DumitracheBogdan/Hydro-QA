import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5173';
const API_URL = 'http://localhost:3001';
const TIMESTAMP = new Date().toISOString().replace(/[.:]/g, '-');
const RUN_DIR = path.join(process.cwd(), 'qa-artifacts', 'evidence', `auth-chaos-run-${TIMESTAMP}`);
const SCREENSHOT_DIR = path.join(RUN_DIR, 'screenshots');
const VIDEO_DIR = path.join(RUN_DIR, 'videos');
const LOG_DIR = path.join(RUN_DIR, 'logs');

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
fs.mkdirSync(VIDEO_DIR, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });

const findings = [];
const actions = [];
const consoleErrors = new Set();
const authEvents = [];

function logAction(step, status, details = '') {
  actions.push({ step, status, details, at: new Date().toISOString() });
  console.log(`${status.toUpperCase()} | ${step}${details ? ` | ${details}` : ''}`);
}

function addFinding(severity, title, details, evidence = []) {
  findings.push({
    id: `AC-${String(findings.length + 1).padStart(3, '0')}`,
    severity,
    title,
    details,
    evidence,
  });
}

async function takeShot(page, name) {
  const target = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: target, fullPage: true });
  return target;
}

async function gotoLogin(page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(300);
}

function watchAuthTraffic(page) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.add(msg.text());
    }
  });

  page.on('request', (req) => {
    if (req.url().includes('/auth/login') || req.url().includes('/users/profile/me')) {
      authEvents.push(`REQ ${req.method()} ${req.url()}`);
    }
  });

  page.on('response', (res) => {
    if (res.url().includes('/auth/login') || res.url().includes('/users/profile/me')) {
      authEvents.push(`RES ${res.status()} ${res.url()}`);
    }
  });
}

async function scenarioStorageHygiene(page) {
  logAction('storage-hygiene-after-failed-login', 'start');
  await gotoLogin(page);

  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  const email = page.locator('input[type="email"], input[name="email"], input#email').first();
  const pass = page.locator('input[type="password"], input[name="password"], input#password').first();
  const sign = page.getByRole('button', { name: /sign in/i }).first();

  await email.fill('qa-storage@example.com').catch(() => {});
  await pass.fill('wrong-password').catch(() => {});

  const loginRes = page
    .waitForResponse((res) => res.url().includes('/auth/login') && res.request().method() === 'POST', { timeout: 9000 })
    .catch(() => null);

  await sign.click({ timeout: 3000 }).catch(() => {});
  const response = await loginRes;
  await page.waitForTimeout(500);

  const storageState = await page.evaluate(() => ({
    localAccessToken: localStorage.getItem('accessToken'),
    localRefreshToken: localStorage.getItem('refreshToken'),
    localPersistLogin: localStorage.getItem('persistLogin'),
    sessionAccessToken: sessionStorage.getItem('accessToken'),
    sessionRefreshToken: sessionStorage.getItem('refreshToken'),
  }));

  fs.writeFileSync(path.join(LOG_DIR, 'storage-hygiene.json'), JSON.stringify(storageState, null, 2), 'utf-8');
  const shot = await takeShot(page, 'auth-chaos-01-storage-hygiene');

  if (
    storageState.localAccessToken ||
    storageState.localRefreshToken ||
    storageState.sessionAccessToken ||
    storageState.sessionRefreshToken
  ) {
    addFinding(
      'High',
      'Failed login stores auth tokens in browser storage',
      `Unexpected token presence after failed login. status=${response ? response.status() : 'no-response'}`,
      [shot, path.join(LOG_DIR, 'storage-hygiene.json')],
    );
  }

  logAction('storage-hygiene-after-failed-login', 'ok', `status=${response ? response.status() : 'no-response'}`);
}

async function scenarioEmailTrim(page) {
  logAction('email-trim-contract', 'start');
  await gotoLogin(page);

  const email = page.locator('input[type="email"], input[name="email"], input#email').first();
  const pass = page.locator('input[type="password"], input[name="password"], input#password').first();
  const sign = page.getByRole('button', { name: /sign in/i }).first();

  let capturedPayload = null;
  const handler = async (route) => {
    try {
      capturedPayload = route.request().postDataJSON();
    } catch {
      capturedPayload = { raw: route.request().postData() || '' };
    }
    await route.fulfill({
      status: 401,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Invalid credentials' }),
    });
  };

  await page.route('**/auth/login', handler);

  await email.fill('  qa.trim@example.com  ').catch(() => {});
  await pass.fill('wrong-password').catch(() => {});
  await sign.click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(450);
  await page.unroute('**/auth/login', handler).catch(() => {});

  fs.writeFileSync(path.join(LOG_DIR, 'email-trim-contract.json'), JSON.stringify({ capturedPayload }, null, 2), 'utf-8');
  const shot = await takeShot(page, 'auth-chaos-02-email-trim');

  const sentEmail = String(capturedPayload?.email || '');
  const hasLeadingTrailingSpaces = sentEmail !== sentEmail.trim();
  if (hasLeadingTrailingSpaces) {
    addFinding(
      'Medium',
      'Login payload sends email without trimming leading/trailing whitespace',
      `Captured email payload="${sentEmail}"`,
      [shot, path.join(LOG_DIR, 'email-trim-contract.json')],
    );
  }

  logAction('email-trim-contract', 'ok', `capturedEmail="${sentEmail}"`);
}

async function scenarioSubmitRace(page) {
  logAction('submit-race-enter-click', 'start');
  await gotoLogin(page);

  const email = page.locator('input[type="email"], input[name="email"], input#email').first();
  const pass = page.locator('input[type="password"], input[name="password"], input#password').first();
  const sign = page.getByRole('button', { name: /sign in/i }).first();

  await email.fill('qa-race@example.com').catch(() => {});
  await pass.fill('wrong-password').catch(() => {});

  const requestTimestamps = [];
  const handler = async (route) => {
    requestTimestamps.push(Date.now());
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.fulfill({
      status: 401,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Invalid credentials' }),
    });
  };
  await page.route('**/auth/login', handler);

  await Promise.allSettled([
    pass.press('Enter'),
    sign.click({ timeout: 2200 }),
    sign.click({ timeout: 2200 }),
  ]);
  await page.waitForTimeout(1200);
  await page.unroute('**/auth/login', handler).catch(() => {});

  const shot = await takeShot(page, 'auth-chaos-03-submit-race');
  fs.writeFileSync(
    path.join(LOG_DIR, 'submit-race.json'),
    JSON.stringify({ requestCount: requestTimestamps.length, requestTimestamps }, null, 2),
    'utf-8',
  );

  if (requestTimestamps.length > 1) {
    addFinding(
      'Medium',
      'Enter+click race condition triggers multiple concurrent login requests',
      `Captured ${requestTimestamps.length} /auth/login requests in one submit burst.`,
      [shot, path.join(LOG_DIR, 'submit-race.json')],
    );
  }

  logAction('submit-race-enter-click', 'ok', `requestCount=${requestTimestamps.length}`);
}

async function scenarioRecoveryFlow(page) {
  logAction('password-recovery-flow-availability', 'start');
  await gotoLogin(page);

  const forgotLink = page.getByRole('link', { name: /forgot password/i }).first();
  const isVisible = await forgotLink.isVisible().catch(() => false);
  const href = isVisible ? (await forgotLink.getAttribute('href').catch(() => '')) || '' : '';

  await page.goto('/forgot-password', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);
  const finalUrl = page.url();
  const bodyText = ((await page.locator('body').innerText().catch(() => '')) || '').replace(/\s+/g, ' ').toLowerCase();
  const hasRecoveryUi = /forgot|reset password|recover|reset your password/i.test(bodyText);
  const shot = await takeShot(page, 'auth-chaos-04-recovery-flow');

  const noFlow = !isVisible && !hasRecoveryUi;
  if (noFlow) {
    addFinding(
      'Medium',
      'Password recovery flow is not discoverable from login',
      `Link visible=${isVisible}, href="${href}", /forgot-password final="${finalUrl}", recoveryUi=${hasRecoveryUi}.`,
      [shot],
    );
  }

  logAction(
    'password-recovery-flow-availability',
    'ok',
    `linkVisible=${isVisible} href="${href}" finalUrl="${finalUrl}" recoveryUi=${hasRecoveryUi}`,
  );
}

async function scenarioApiContract(page) {
  logAction('api-login-contract-negative-cases', 'start');

  const cases = [
    {
      name: 'valid-shape-invalid-credentials',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: { email: 'qa-api@example.com', password: 'wrong-password' },
    },
    {
      name: 'missing-password',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: { email: 'qa-api@example.com' },
    },
    {
      name: 'missing-email',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: { password: 'wrong-password' },
    },
    {
      name: 'text-plain-body',
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      data: 'not-json-body',
    },
    {
      name: 'malformed-json',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: '{"email":"bad-json"',
    },
  ];

  const results = [];
  for (const c of cases) {
    const startedAt = Date.now();
    let status = 0;
    let body = '';
    try {
      const res = await page.request.fetch(`${API_URL}/auth/login`, {
        method: c.method,
        headers: c.headers,
        data: c.data,
        timeout: 12000,
      });
      status = res.status();
      body = (await res.text()).slice(0, 300);
    } catch (err) {
      status = -1;
      body = String(err);
    }

    results.push({
      case: c.name,
      status,
      durationMs: Date.now() - startedAt,
      bodyPreview: body,
    });
  }

  fs.writeFileSync(path.join(LOG_DIR, 'api-login-contract.json'), JSON.stringify(results, null, 2), 'utf-8');
  await gotoLogin(page);
  const shot = await takeShot(page, 'auth-chaos-05-api-contract');

  const hasServerError = results.some((r) => r.status >= 500);
  if (hasServerError) {
    addFinding(
      'Medium',
      'Login API negative cases trigger server-side errors (5xx)',
      `Cases with 5xx: ${results.filter((r) => r.status >= 500).map((r) => `${r.case}:${r.status}`).join(', ')}`,
      [shot, path.join(LOG_DIR, 'api-login-contract.json')],
    );
  }

  const malformedCase = results.find((r) => r.case === 'malformed-json');
  if (malformedCase && malformedCase.status === 401) {
    addFinding(
      'Low',
      'Malformed JSON receives same auth error as wrong credentials',
      'Malformed JSON returned 401 instead of explicit 4xx validation/parsing response, reducing API contract clarity.',
      [shot, path.join(LOG_DIR, 'api-login-contract.json')],
    );
  }

  logAction('api-login-contract-negative-cases', 'ok', JSON.stringify(results.map((r) => `${r.case}:${r.status}`)));
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

  watchAuthTraffic(page);

  try {
    await scenarioStorageHygiene(page);
    await scenarioEmailTrim(page);
    await scenarioSubmitRace(page);
    await scenarioRecoveryFlow(page);
    await scenarioApiContract(page);
  } finally {
    await context.close();
    await browser.close();
  }

  const summary = {
    runDir: RUN_DIR,
    createdAt: new Date().toISOString(),
    findingsCount: findings.length,
    findings,
    actions,
    authEventCount: authEvents.length,
    authEvents,
    consoleErrorCount: consoleErrors.size,
    consoleErrors: [...consoleErrors],
  };

  fs.writeFileSync(path.join(RUN_DIR, 'summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
  fs.writeFileSync(path.join(LOG_DIR, 'auth-events.log'), authEvents.join('\n'), 'utf-8');
  fs.writeFileSync(path.join(LOG_DIR, 'console-errors.log'), [...consoleErrors].join('\n\n'), 'utf-8');
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

  console.log(`QA_AUTH_CHAOS_EVIDENCE_DIR=${RUN_DIR}`);
  console.log(`QA_AUTH_CHAOS_FINDINGS=${findings.length}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
