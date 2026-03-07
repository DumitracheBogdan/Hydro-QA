import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5173';
const API_URL = 'http://localhost:3001';
const TIMESTAMP = new Date().toISOString().replace(/[.:]/g, '-');
const RUN_DIR = path.join(process.cwd(), 'qa-artifacts', 'evidence', `auth-hardening-run-${TIMESTAMP}`);
const SCREENSHOT_DIR = path.join(RUN_DIR, 'screenshots');
const VIDEO_DIR = path.join(RUN_DIR, 'videos');
const LOG_DIR = path.join(RUN_DIR, 'logs');

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
fs.mkdirSync(VIDEO_DIR, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });

const findings = [];
const actions = [];
const authEvents = [];
const consoleErrors = new Set();

function logAction(step, status, details = '') {
  const entry = { step, status, details, at: new Date().toISOString() };
  actions.push(entry);
  console.log(`${status.toUpperCase()} | ${step}${details ? ` | ${details}` : ''}`);
}

function addFinding(severity, title, details, evidence) {
  findings.push({
    id: `AH-${String(findings.length + 1).padStart(3, '0')}`,
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
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(350);
}

async function testErrorFeedback(page) {
  logAction('error-feedback-on-401', 'start');
  await gotoLogin(page);

  const email = page.locator('input[type="email"], input[name="email"], input#email').first();
  const password = page.locator('input[type="password"], input[name="password"], input#password').first();
  const signIn = page.getByRole('button', { name: /sign in/i }).first();

  await email.fill('qa-invalid@example.com').catch(() => {});
  await password.fill('wrong-password-qa').catch(() => {});

  const responsePromise = page
    .waitForResponse(
      (res) => res.url().includes('/auth/login') && res.request().method() === 'POST',
      { timeout: 8000 },
    )
    .catch(() => null);

  await signIn.click({ timeout: 3000 }).catch(() => {});
  const loginRes = await responsePromise;
  await page.waitForTimeout(700);

  const bodyText = ((await page.locator('body').innerText().catch(() => '')) || '').replace(/\s+/g, ' ').toLowerCase();
  const hasInlineErrorText =
    /invalid credentials|incorrect|login failed|unauthorized|wrong email|wrong password/.test(bodyText);
  const alertLikeCount = await page
    .locator('[role="alert"], [aria-live="assertive"], [data-testid*="error"], .error')
    .count()
    .catch(() => 0);

  const shot = await takeShot(page, 'auth-hardening-01-401-feedback');

  if (loginRes && loginRes.status() === 401 && !hasInlineErrorText && alertLikeCount === 0) {
    addFinding(
      'Medium',
      'Failed login has no visible user-facing error feedback',
      'API returned 401 but no inline error/alert text was detected on the login form.',
      [shot],
    );
  }

  logAction('error-feedback-on-401', 'ok', `status=${loginRes ? loginRes.status() : 'none'}`);
}

async function testPendingState(page) {
  logAction('pending-submit-state', 'start');
  await gotoLogin(page);

  const email = page.locator('input[type="email"], input[name="email"], input#email').first();
  const password = page.locator('input[type="password"], input[name="password"], input#password').first();
  const signIn = page.getByRole('button', { name: /sign in/i }).first();

  await email.fill('qa-pending@example.com').catch(() => {});
  await password.fill('wrong-password-qa').catch(() => {});

  let intercepted = false;
  const handler = async (route) => {
    intercepted = true;
    await new Promise((resolve) => setTimeout(resolve, 2200));
    await route.fulfill({
      status: 401,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Invalid credentials' }),
    });
    await page.unroute('**/auth/login', handler).catch(() => {});
  };

  await page.route('**/auth/login', handler);

  await signIn.click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(200);

  const disabledDuring = await signIn.isDisabled().catch(() => false);
  const labelDuring = ((await signIn.innerText().catch(() => '')) || '').trim();
  const shot = await takeShot(page, 'auth-hardening-02-pending-submit');

  await page.waitForTimeout(2500);
  await page.unroute('**/auth/login', handler).catch(() => {});

  if (intercepted && !disabledDuring && !/signing|loading|please wait/i.test(labelDuring)) {
    addFinding(
      'Medium',
      'Sign in button lacks clear pending state during in-flight auth request',
      `During delayed /auth/login request the button stayed enabled with label "${labelDuring || 'Sign in'}".`,
      [shot],
    );
  }

  logAction(
    'pending-submit-state',
    'ok',
    `intercepted=${intercepted} disabledDuring=${disabledDuring} label="${labelDuring}"`,
  );
}

async function testCheckboxLabelA11y(page) {
  logAction('checkbox-label-click', 'start');
  await gotoLogin(page);

  const checkbox = page.locator('input[type="checkbox"]').first();
  const labelText = page.getByText(/keep me signed in/i).first();

  const before = await checkbox.isChecked().catch(() => false);
  await labelText.click({ timeout: 2500 }).catch(() => {});
  await page.waitForTimeout(250);
  const after = await checkbox.isChecked().catch(() => false);
  const shot = await takeShot(page, 'auth-hardening-03-checkbox-label');

  if (before === after) {
    addFinding(
      'Low',
      '"Keep me signed in" text click does not toggle checkbox',
      `Checkbox state stayed ${after} after clicking the visible label text, which suggests weak label association/accessibility.`,
      [shot],
    );
  }

  logAction('checkbox-label-click', 'ok', `before=${before} after=${after}`);
}

async function testForgotPasswordLink(page) {
  logAction('forgot-password-link', 'start');
  await gotoLogin(page);

  const forgot = page.getByRole('link', { name: /forgot password/i }).first();
  const visible = await forgot.isVisible().catch(() => false);
  let href = '';
  let finalUrl = page.url();

  if (visible) {
    href = (await forgot.getAttribute('href').catch(() => '')) || '';
    const popupPromise = page.waitForEvent('popup', { timeout: 2500 }).catch(() => null);
    await forgot.click({ timeout: 2500 }).catch(() => {});
    const popup = await popupPromise;
    if (popup) {
      await popup.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
      finalUrl = popup.url();
      await popup.close().catch(() => {});
    } else {
      finalUrl = page.url();
    }
  }

  const shot = await takeShot(page, 'auth-hardening-04-forgot-password');
  if (visible && (!href || href === '#' || /^javascript:/i.test(href) || /\/login$/i.test(finalUrl))) {
    addFinding(
      'Medium',
      'Forgot password link does not lead to a recoverable flow',
      `href="${href || 'empty'}", destination="${finalUrl}"`,
      [shot],
    );
  }

  logAction('forgot-password-link', 'ok', `visible=${visible} href=${href || 'empty'} final=${finalUrl}`);
}

async function testTokenTampering(page) {
  logAction('token-tampering', 'start');
  await gotoLogin(page);

  await page.evaluate(() => {
    localStorage.setItem('accessToken', 'qa.fake.access.token');
    localStorage.setItem('refreshToken', 'qa.fake.refresh.token');
    localStorage.setItem('persistLogin', '1');
  });

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(500);
  const finalUrl = page.url();
  const shot = await takeShot(page, 'auth-hardening-05-token-tampering');

  if (!/\/login$/i.test(finalUrl)) {
    addFinding(
      'High',
      'Protected area accepted manually injected token (possible auth bypass)',
      `After injecting fake tokens in storage, /dashboard ended at "${finalUrl}" instead of /login.`,
      [shot],
    );
  }

  logAction('token-tampering', 'ok', `final=${finalUrl}`);
}

async function testRateLimit(page) {
  logAction('rate-limit-probe', 'start');
  const statuses = [];
  const attempts = 20;

  for (let i = 0; i < attempts; i += 1) {
    const res = await page.request.post(`${API_URL}/auth/login`, {
      data: {
        email: `qa-rate-${i}@example.com`,
        password: 'wrong-password-qa',
      },
      timeout: 12000,
    });
    statuses.push(res.status());
  }

  const codeCount = statuses.reduce((acc, status) => {
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  fs.writeFileSync(path.join(LOG_DIR, 'rate-limit-probe.json'), JSON.stringify({ attempts, statuses, codeCount }, null, 2));

  await gotoLogin(page);
  const shot = await takeShot(page, 'auth-hardening-06-rate-limit-probe');

  if (!statuses.includes(429)) {
    addFinding(
      'Medium',
      'No observable login throttling/lockout under repeated failed attempts',
      `20 rapid failed attempts returned statuses: ${JSON.stringify(codeCount)} (no 429).`,
      [shot, path.join(LOG_DIR, 'rate-limit-probe.json')],
    );
  }

  logAction('rate-limit-probe', 'ok', JSON.stringify(codeCount));
}

async function testAutocompleteMetadata(page) {
  logAction('autocomplete-metadata', 'start');
  await gotoLogin(page);

  const metadata = await page.evaluate(() => {
    const email = document.querySelector('input[type="email"], input[name="email"], input#email');
    const password = document.querySelector('input[type="password"], input[name="password"], input#password');
    return {
      emailAutoComplete: email?.getAttribute('autocomplete') || '',
      emailName: email?.getAttribute('name') || '',
      passwordAutoComplete: password?.getAttribute('autocomplete') || '',
      passwordName: password?.getAttribute('name') || '',
    };
  });

  fs.writeFileSync(path.join(LOG_DIR, 'autocomplete-metadata.json'), JSON.stringify(metadata, null, 2));
  const shot = await takeShot(page, 'auth-hardening-07-autocomplete');

  const emailOk = /(email|username)/i.test(metadata.emailAutoComplete);
  const passOk = /(current-password|password)/i.test(metadata.passwordAutoComplete);
  if (!emailOk || !passOk) {
    addFinding(
      'Low',
      'Form autocomplete metadata is incomplete',
      `email.autocomplete="${metadata.emailAutoComplete || 'empty'}", password.autocomplete="${metadata.passwordAutoComplete || 'empty'}"`,
      [shot, path.join(LOG_DIR, 'autocomplete-metadata.json')],
    );
  }

  logAction(
    'autocomplete-metadata',
    'ok',
    `emailAutoComplete=${metadata.emailAutoComplete || 'empty'} passwordAutoComplete=${metadata.passwordAutoComplete || 'empty'}`,
  );
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

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.add(msg.text());
    }
  });

  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('/auth/login') || url.includes('/users/profile/me')) {
      authEvents.push(`REQ ${req.method()} ${url}`);
    }
  });

  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('/auth/login') || url.includes('/users/profile/me')) {
      authEvents.push(`RES ${res.status()} ${url}`);
    }
  });

  try {
    await testErrorFeedback(page);
    await testPendingState(page);
    await testCheckboxLabelA11y(page);
    await testForgotPasswordLink(page);
    await testTokenTampering(page);
    await testRateLimit(page);
    await testAutocompleteMetadata(page);
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

  fs.writeFileSync(path.join(RUN_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(LOG_DIR, 'auth-events.log'), authEvents.join('\n'));
  fs.writeFileSync(path.join(LOG_DIR, 'console-errors.log'), [...consoleErrors].join('\n\n'));
  fs.writeFileSync(
    path.join(RUN_DIR, 'finding-summary.txt'),
    [
      `Run directory: ${RUN_DIR}`,
      `Findings: ${findings.length}`,
      '',
      ...findings.map((f) => `${f.id} [${f.severity}] ${f.title} :: ${f.details}`),
    ].join('\n'),
  );

  console.log(`QA_AUTH_HARDENING_EVIDENCE_DIR=${RUN_DIR}`);
  console.log(`QA_AUTH_HARDENING_FINDINGS=${findings.length}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
