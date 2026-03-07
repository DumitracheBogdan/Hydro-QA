import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5173';
const TIMESTAMP = new Date().toISOString().replace(/[.:]/g, '-');
const RUN_DIR = path.join(process.cwd(), 'qa-artifacts', 'evidence', `login-run-${TIMESTAMP}`);
const SCREENSHOT_DIR = path.join(RUN_DIR, 'screenshots');
const VIDEO_DIR = path.join(RUN_DIR, 'videos');
const LOG_DIR = path.join(RUN_DIR, 'logs');

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
fs.mkdirSync(VIDEO_DIR, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });

const findings = [];
const actions = [];
const consoleErrors = new Set();
const responses = [];

function logAction(step, status, details = '') {
  actions.push({ step, status, details, at: new Date().toISOString() });
  console.log(`${status.toUpperCase()} | ${step}${details ? ` | ${details}` : ''}`);
}

function addFinding(severity, title, details, evidence) {
  findings.push({
    id: `L-${String(findings.length + 1).padStart(3, '0')}`,
    severity,
    title,
    details,
    evidence,
  });
}

async function main() {
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
    if (msg.type() === 'error') consoleErrors.add(msg.text());
  });
  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('/auth') || url.includes('/users/profile/me')) {
      responses.push(`${res.status()} ${url}`);
    }
  });

  const shot = async (name) => {
    const p = path.join(SCREENSHOT_DIR, `${name}.png`);
    await page.screenshot({ path: p, fullPage: true });
    return p;
  };

  try {
    logAction('open-login', 'start');
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(800);
    const loginShot = await shot('login-01-initial');

    const onLogin = /login/i.test(page.url()) || (await page.locator('text=/Login to your account/i').count()) > 0;
    if (onLogin) {
      addFinding(
        'High',
        'Protected route opens login page due failed silent authentication',
        `Opening /dashboard shows login screen. Current URL: ${page.url()}`,
        [loginShot],
      );
    }
    logAction('open-login', 'ok', `onLogin=${onLogin}`);

    const email = page.getByLabel(/Email/i).first();
    const password = page.getByLabel(/Password/i).first();
    const signIn = page.getByRole('button', { name: /Sign in/i }).first();

    const signInEnabled = await signIn.isEnabled().catch(() => false);
    logAction('check-signin-default', 'ok', `enabled=${signInEnabled}`);

    await email.fill('').catch(() => {});
    await password.fill('').catch(() => {});
    await signIn.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(1200);

    const emptyAttemptShot = await shot('login-02-empty-submit');
    const emptyFeedbackCount = await page
      .locator('text=/required|invalid|error|please enter|must be/i')
      .count()
      .catch(() => 0);

    await email.fill('invalid-email').catch(() => {});
    await password.fill('1').catch(() => {});
    await signIn.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(1400);

    const invalidAttemptShot = await shot('login-03-invalid-submit');
    const invalidFeedbackCount = await page
      .locator('text=/required|invalid|error|incorrect|failed|unauthorized/i')
      .count()
      .catch(() => 0);

    if (signInEnabled && emptyFeedbackCount === 0) {
      addFinding(
        'Medium',
        'Login form allows empty submission without visible inline feedback',
        'Sign in button is enabled with empty fields and no immediate validation message is rendered.',
        [emptyAttemptShot],
      );
    }

    if (invalidFeedbackCount === 0) {
      addFinding(
        'Low',
        'Login invalid credentials attempt has no clear visible feedback',
        'After invalid email/password submit, no clear inline/alert feedback was detected in UI.',
        [invalidAttemptShot],
      );
    }

    const auth401 = responses.filter((x) => x.startsWith('401 '));
    if (auth401.length > 0) {
      addFinding(
        'High',
        'Authentication endpoints return 401 during login/silent auth flow',
        auth401.join(' | '),
        [loginShot, invalidAttemptShot],
      );
    }
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
    responses,
    consoleErrors: [...consoleErrors],
  };

  fs.writeFileSync(path.join(RUN_DIR, 'summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
  fs.writeFileSync(path.join(LOG_DIR, 'auth-responses.log'), responses.join('\n'), 'utf-8');
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

  console.log(`QA_LOGIN_EVIDENCE_DIR=${RUN_DIR}`);
  console.log(`QA_LOGIN_FINDINGS=${findings.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

