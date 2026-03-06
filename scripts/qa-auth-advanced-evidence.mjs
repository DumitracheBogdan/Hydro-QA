import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5173';
const TIMESTAMP = new Date().toISOString().replace(/[.:]/g, '-');
const RUN_DIR = path.join(process.cwd(), 'qa-artifacts', 'evidence', `auth-advanced-run-${TIMESTAMP}`);
const SCREENSHOT_DIR = path.join(RUN_DIR, 'screenshots');
const VIDEO_DIR = path.join(RUN_DIR, 'videos');
const LOG_DIR = path.join(RUN_DIR, 'logs');

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
fs.mkdirSync(VIDEO_DIR, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });

const findings = [];
const actions = [];
const uniqueConsoleErrors = new Set();
const authRequests = [];

function logAction(step, status, details = '') {
  actions.push({ step, status, details, at: new Date().toISOString() });
  console.log(`${status.toUpperCase()} | ${step}${details ? ` | ${details}` : ''}`);
}

function addFinding(severity, title, details, evidence) {
  findings.push({
    id: `AA-${String(findings.length + 1).padStart(3, '0')}`,
    severity,
    title,
    details,
    evidence,
  });
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
      uniqueConsoleErrors.add(msg.text());
    }
  });

  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('/auth') || url.includes('/users/profile/me') || url.includes('/login')) {
      authRequests.push(`REQ ${req.method()} ${url}`);
    }
  });

  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('/auth') || url.includes('/users/profile/me') || url.includes('/login')) {
      authRequests.push(`RES ${res.status()} ${url}`);
    }
  });

  const shot = async (name) => {
    const target = path.join(SCREENSHOT_DIR, `${name}.png`);
    await page.screenshot({ path: target, fullPage: true });
    return target;
  };

  try {
    logAction('open-login-via-dashboard', 'start');
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(800);
    const initialShot = await shot('auth-advanced-01-login-initial');
    const current = page.url();
    if (/\/login/i.test(current)) {
      addFinding(
        'High',
        'Protected routes still redirect to login',
        `Accessing /dashboard ends on ${current}`,
        [initialShot],
      );
    }
    logAction('open-login-via-dashboard', 'ok', current);

    logAction('forgot-password-link-check', 'start');
    const forgotLink = page.getByRole('link', { name: /forgot password/i }).first();
    const forgotVisible = await forgotLink.isVisible().catch(() => false);
    let forgotHref = '';
    let forgotTargetUrl = '';
    if (forgotVisible) {
      forgotHref = (await forgotLink.getAttribute('href').catch(() => '')) || '';
      const popupPromise = page.waitForEvent('popup', { timeout: 2500 }).catch(() => null);
      await forgotLink.click({ timeout: 3500 }).catch(() => {});
      const popup = await popupPromise;
      if (popup) {
        await popup.waitForLoadState('domcontentloaded', { timeout: 6000 }).catch(() => {});
        forgotTargetUrl = popup.url();
        await popup.close().catch(() => {});
      } else {
        forgotTargetUrl = page.url();
      }
    }
    const forgotShot = await shot('auth-advanced-02-forgot-password');
    if (forgotVisible && (!forgotHref || forgotHref === '#' || /\/login/i.test(forgotTargetUrl))) {
      addFinding(
        'Medium',
        'Forgot password link has no effective navigation target',
        `href="${forgotHref}" targetUrl="${forgotTargetUrl}"`,
        [forgotShot],
      );
    }
    logAction('forgot-password-link-check', 'ok', `href=${forgotHref || 'none'}`);

    logAction('keep-signed-in-persistence-check', 'start');
    const keepMe = page.locator('input[type="checkbox"]').first();
    const keepVisible = await keepMe.isVisible().catch(() => false);
    let afterReloadChecked = false;
    if (keepVisible) {
      const before = await keepMe.isChecked().catch(() => false);
      await keepMe.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(200);
      const toggled = await keepMe.isChecked().catch(() => false);
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 9000 }).catch(() => {});
      await page.waitForTimeout(450);
      afterReloadChecked = await keepMe.isChecked().catch(() => false);
      if (toggled !== before && afterReloadChecked !== toggled) {
        const persistShot = await shot('auth-advanced-03-keep-signed-in-persistence');
        addFinding(
          'Low',
          'Keep me signed in toggle does not persist after reload',
          `before=${before} toggled=${toggled} afterReload=${afterReloadChecked}`,
          [persistShot],
        );
      }
    }
    logAction('keep-signed-in-persistence-check', 'ok', `checkedAfterReload=${afterReloadChecked}`);

    logAction('enter-submit-check', 'start');
    const email = page.locator('input[type="email"], input[name="email"]').first();
    const pass = page.locator('input[type="password"], input[name="password"]').first();
    const signBtn = page.getByRole('button', { name: /sign in/i }).first();
    await email.fill('invalid@example.com').catch(() => {});
    await pass.fill('wrong-pass').catch(() => {});
    const reqBeforeEnter = authRequests.length;
    await pass.press('Enter').catch(() => {});
    await page.waitForTimeout(1500);
    const reqAfterEnter = authRequests.length;
    const enterShot = await shot('auth-advanced-04-enter-submit');
    if (reqAfterEnter === reqBeforeEnter) {
      addFinding(
        'Low',
        'Pressing Enter on password field does not trigger observable auth request',
        'No additional auth-related request/response log was captured after Enter submit.',
        [enterShot],
      );
    }
    logAction('enter-submit-check', 'ok', `authEventsDelta=${reqAfterEnter - reqBeforeEnter}`);

    logAction('sign-in-spam-click-check', 'start');
    const reqBeforeSpam = authRequests.length;
    for (let i = 0; i < 5; i += 1) {
      await signBtn.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(80);
    }
    await page.waitForTimeout(1700);
    const reqAfterSpam = authRequests.length;
    const spamDelta = reqAfterSpam - reqBeforeSpam;
    const spamShot = await shot('auth-advanced-05-signin-spam');
    if (spamDelta > 8) {
      addFinding(
        'Medium',
        'Sign in appears vulnerable to rapid repeat submissions',
        `Auth event delta after rapid 5 clicks: ${spamDelta}`,
        [spamShot],
      );
    }
    logAction('sign-in-spam-click-check', 'ok', `delta=${spamDelta}`);

    logAction('deep-link-redirect-param-check', 'start');
    const targetDeepLink = `/visits/details/8b3419e3-e758-48aa-bcdc-724d4ff2534e?from=qa`;
    await page.goto(targetDeepLink, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 9000 }).catch(() => {});
    await page.waitForTimeout(700);
    const deepFinalUrl = page.url();
    const deepShot = await shot('auth-advanced-06-deeplink-redirect');

    const hasReturnHint = /redirect|return|next|callback|from=qa/i.test(deepFinalUrl);
    if (/\/login/i.test(deepFinalUrl) && !hasReturnHint) {
      addFinding(
        'Medium',
        'Deep-link redirect to login does not preserve intended destination',
        `Deep link "${targetDeepLink}" ended at "${deepFinalUrl}" without explicit return hint.`,
        [deepShot],
      );
    }
    logAction('deep-link-redirect-param-check', 'ok', deepFinalUrl);
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
    authEventCount: authRequests.length,
    authEvents: authRequests,
    consoleErrorCount: uniqueConsoleErrors.size,
    consoleErrors: [...uniqueConsoleErrors],
  };

  fs.writeFileSync(path.join(RUN_DIR, 'summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
  fs.writeFileSync(path.join(LOG_DIR, 'auth-events.log'), authRequests.join('\n'), 'utf-8');
  fs.writeFileSync(path.join(LOG_DIR, 'console-errors.log'), [...uniqueConsoleErrors].join('\n\n'), 'utf-8');
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

  console.log(`QA_AUTH_ADVANCED_EVIDENCE_DIR=${RUN_DIR}`);
  console.log(`QA_AUTH_ADVANCED_FINDINGS=${findings.length}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

