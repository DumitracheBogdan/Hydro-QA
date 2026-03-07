import fs from 'node:fs';
import path from 'node:path';
import { chromium, devices } from 'playwright';

const BASE_URL = 'http://localhost:5173';
const STORAGE_STATE_PATH = path.join(process.cwd(), 'playwright-auth-state.json');
const TIMESTAMP = new Date().toISOString().replace(/[.:]/g, '-');
const RUN_DIR = path.join(process.cwd(), 'qa-artifacts', 'evidence', `different-run-${TIMESTAMP}`);
const SCREENSHOT_DIR = path.join(RUN_DIR, 'screenshots');
const VIDEO_DIR = path.join(RUN_DIR, 'videos');
const LOG_DIR = path.join(RUN_DIR, 'logs');

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
fs.mkdirSync(VIDEO_DIR, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });

const findings = [];
const actions = [];
const uniqueConsoleErrors = new Set();
const uniqueApiFailures = new Set();

const DEFAULT_VISIT_ID = '8b3419e3-e758-48aa-bcdc-724d4ff2534e';

function logAction(step, status, details = '') {
  actions.push({
    step,
    status,
    details,
    at: new Date().toISOString(),
  });
  console.log(`${status.toUpperCase()} | ${step}${details ? ` | ${details}` : ''}`);
}

function addFinding(severity, title, details, evidence) {
  findings.push({
    id: `D-${String(findings.length + 1).padStart(3, '0')}`,
    severity,
    title,
    details,
    evidence,
  });
}

async function attachObservers(page) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      uniqueConsoleErrors.add(msg.text());
    }
  });

  page.on('response', (res) => {
    if (res.status() >= 400) {
      uniqueApiFailures.add(`${res.status()} ${res.url()}`);
    }
  });
}

async function screenshot(page, name) {
  const target = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: target, fullPage: true });
  return target;
}

async function keyboardA11yScenario(browser) {
  logAction('keyboard-a11y', 'start');
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 1536, height: 864 },
    recordVideo: { dir: VIDEO_DIR, size: { width: 1536, height: 864 } },
    storageState: fs.existsSync(STORAGE_STATE_PATH) ? STORAGE_STATE_PATH : undefined,
  });
  const page = await context.newPage();
  await attachObservers(page);

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(600);

  const disabledMeta = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('[data-sidebar="menu-button"]')).map((node) => {
      const el = node;
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      const disabledAttr = el.hasAttribute('disabled');
      const ariaDisabled = el.getAttribute('aria-disabled') || '';
      const tabIndex = el.tabIndex;
      const href = el.tagName.toLowerCase() === 'a' ? el.getAttribute('href') || '' : '';
      return { text, disabledAttr, ariaDisabled, tabIndex, href };
    });
  });

  const problematicDisabled = disabledMeta.filter(
    (x) => x.disabledAttr && x.ariaDisabled !== 'true' && x.tabIndex >= 0,
  );

  const focusPath = [];
  for (let i = 0; i < 16; i += 1) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(70);
    const current = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return '';
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      const aria = el.getAttribute('aria-label') || '';
      const id = el.id || '';
      const tag = el.tagName.toLowerCase();
      return `${tag}|${aria || text || id || 'unnamed'}`;
    });
    focusPath.push(current);
  }

  const keyShot = await screenshot(page, 'different-01-keyboard-a11y');

  const welcome = ((await page.locator('h1').first().textContent().catch(() => '')) || '').trim();
  if (welcome.includes('Welcome, !')) {
    addFinding(
      'Medium',
      'Dashboard greeting still renders empty user name',
      `Observed heading: "${welcome}" during keyboard-focused scenario.`,
      [keyShot],
    );
  }

  if (problematicDisabled.length > 0) {
    addFinding(
      'Medium',
      'Disabled sidebar items are keyboard-focusable without aria-disabled',
      `Entries: ${problematicDisabled.map((x) => `${x.text}(tabIndex=${x.tabIndex}, href=${x.href})`).join(', ')}`,
      [keyShot],
    );
  }

  fs.writeFileSync(path.join(LOG_DIR, 'keyboard-focus-path.log'), focusPath.join('\n'), 'utf-8');

  await context.close();
  logAction('keyboard-a11y', 'ok');
}

async function mobileResponsiveScenario(browser) {
  logAction('mobile-responsive', 'start');
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    baseURL: BASE_URL,
    recordVideo: { dir: VIDEO_DIR, size: { width: 390, height: 844 } },
    storageState: fs.existsSync(STORAGE_STATE_PATH) ? STORAGE_STATE_PATH : undefined,
  });
  const page = await context.newPage();
  await attachObservers(page);

  const routes = ['/dashboard', '/planner', '/visits/addnewvisit'];
  const overflows = [];

  for (const route of routes) {
    await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(600);
    const snap = await screenshot(page, `different-02-mobile-${route.replace(/\//g, '-') || 'root'}`);
    const metrics = await page.evaluate(() => {
      const aside = document.querySelector('aside');
      const asideWidth = aside ? aside.getBoundingClientRect().width : 0;
      return {
        overflow: document.documentElement.scrollWidth > window.innerWidth + 2,
        viewportWidth: window.innerWidth,
        pageWidth: document.documentElement.scrollWidth,
        asideWidth,
      };
    });
    overflows.push({ route, snap, ...metrics });
  }

  const overflowRoutes = overflows.filter((x) => x.overflow);
  if (overflowRoutes.length > 0) {
    addFinding(
      'Medium',
      'Horizontal overflow detected on mobile viewport',
      overflowRoutes.map((x) => `${x.route}(viewport=${x.viewportWidth}, page=${x.pageWidth})`).join(' | '),
      overflowRoutes.map((x) => x.snap),
    );
  }

  const sidebarCrowded = overflows.filter((x) => x.asideWidth > x.viewportWidth * 0.48);
  if (sidebarCrowded.length > 0) {
    addFinding(
      'Medium',
      'Mobile layout is sidebar-heavy (reduced content area)',
      sidebarCrowded
        .map((x) => `${x.route}(aside=${Math.round(x.asideWidth)}px of ${x.viewportWidth}px)`)
        .join(' | '),
      sidebarCrowded.map((x) => x.snap),
    );
  }

  await context.close();
  logAction('mobile-responsive', 'ok');
}

async function formValidationScenario(browser) {
  logAction('form-validation-negative', 'start');
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 1536, height: 864 },
    recordVideo: { dir: VIDEO_DIR, size: { width: 1536, height: 864 } },
    storageState: fs.existsSync(STORAGE_STATE_PATH) ? STORAGE_STATE_PATH : undefined,
  });
  const page = await context.newPage();
  await attachObservers(page);

  await page.goto('/visits/addnewvisit', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(600);

  const createBtn = page.getByRole('button', { name: /Create Visit/i }).first();
  const enabled = await createBtn.isEnabled().catch(() => false);
  let clicked = false;
  if (enabled) {
    await createBtn.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(900);
    clicked = true;
  }

  const currentUrl = page.url();
  const invalidCount = await page.locator('[aria-invalid="true"], input:invalid').count().catch(() => 0);
  const feedbackCount = await page
    .locator('text=/required|invalid|error|failed|missing/i')
    .count()
    .catch(() => 0);
  const validationShot = await screenshot(page, 'different-03-addnewvisit-validation');

  if (clicked && currentUrl.includes('/visits/') && !currentUrl.includes('/addnewvisit')) {
    addFinding(
      'High',
      'Create Visit allowed navigation from empty/invalid form',
      `After clicking Create Visit, URL changed to ${currentUrl}.`,
      [validationShot],
    );
  }

  if (clicked && currentUrl.includes('/addnewvisit') && invalidCount === 0 && feedbackCount === 0) {
    addFinding(
      'Medium',
      'No validation feedback after Create Visit attempt',
      'Create Visit is clickable but no visible validation message or invalid indicator is shown.',
      [validationShot],
    );
  }

  await context.close();
  logAction('form-validation-negative', 'ok', `enabled=${enabled}`);
}

async function searchScenario(browser) {
  logAction('dashboard-search-behavior', 'start');
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 1536, height: 864 },
    recordVideo: { dir: VIDEO_DIR, size: { width: 1536, height: 864 } },
    storageState: fs.existsSync(STORAGE_STATE_PATH) ? STORAGE_STATE_PATH : undefined,
  });
  const page = await context.newPage();
  await attachObservers(page);

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(600);

  const rows = page.locator('table tbody tr');
  const baseRows = await rows.count().catch(() => 0);
  const searchInput = page.getByPlaceholder(/Search/i).first();
  const hasSearch = await searchInput.isVisible().catch(() => false);

  let rowsGibberish = -1;
  let rowsKnown = -1;
  if (hasSearch) {
    await searchInput.fill('qazwsxedcrfvtgbyhn');
    await page.waitForTimeout(800);
    rowsGibberish = await rows.count().catch(() => 0);

    await searchInput.fill('Old Mill');
    await page.waitForTimeout(800);
    rowsKnown = await rows.count().catch(() => 0);
  }

  const searchShot = await screenshot(page, 'different-04-dashboard-search');

  if (hasSearch && baseRows > 0 && rowsGibberish === baseRows && rowsKnown === baseRows) {
    addFinding(
      'Medium',
      'Dashboard search appears non-reactive',
      `Row count unchanged for baseline/gibberish/known search (${baseRows}/${rowsGibberish}/${rowsKnown}).`,
      [searchShot],
    );
  }

  await context.close();
  logAction('dashboard-search-behavior', 'ok', `rows=${baseRows}`);
}

async function offlineResilienceScenario(browser) {
  logAction('offline-resilience', 'start');
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 1536, height: 864 },
    recordVideo: { dir: VIDEO_DIR, size: { width: 1536, height: 864 } },
    storageState: fs.existsSync(STORAGE_STATE_PATH) ? STORAGE_STATE_PATH : undefined,
  });

  const page = await context.newPage();
  await attachObservers(page);

  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.includes('localhost:3001') || url.includes('/api/')) {
      await route.abort('failed');
      return;
    }
    await route.continue();
  });

  await page.goto(`/visits/details/${DEFAULT_VISIT_ID}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForTimeout(5000);

  const bodyText = ((await page.locator('body').innerText().catch(() => '')) || '').replace(/\s+/g, ' ');
  const hasLoading = /loading/i.test(bodyText);
  const hasErrorWords = /error|failed|unavailable|try again|not found/i.test(bodyText);
  const offlineShot = await screenshot(page, 'different-05-offline-resilience');

  if (hasLoading && !hasErrorWords) {
    addFinding(
      'High',
      'No clear error state when API is unavailable',
      'Page remains in a loading-like state without explicit user-facing recovery message under API outage simulation.',
      [offlineShot],
    );
  }

  await context.close();
  logAction('offline-resilience', 'ok');
}

async function main() {
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: false,
    args: ['--start-maximized'],
  });

  try {
    await keyboardA11yScenario(browser);
    await mobileResponsiveScenario(browser);
    await formValidationScenario(browser);
    await searchScenario(browser);
    await offlineResilienceScenario(browser);
  } finally {
    await browser.close();
  }

  const summary = {
    runDir: RUN_DIR,
    startedAt: TIMESTAMP,
    finishedAt: new Date().toISOString(),
    findings,
    findingsCount: findings.length,
    actions,
    consoleErrorCount: uniqueConsoleErrors.size,
    consoleErrors: [...uniqueConsoleErrors],
    apiFailureCount: uniqueApiFailures.size,
    apiFailures: [...uniqueApiFailures],
  };

  fs.writeFileSync(path.join(RUN_DIR, 'summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
  fs.writeFileSync(path.join(LOG_DIR, 'console-errors.log'), [...uniqueConsoleErrors].join('\n\n'), 'utf-8');
  fs.writeFileSync(path.join(LOG_DIR, 'api-failures.log'), [...uniqueApiFailures].join('\n'), 'utf-8');

  const textLines = [
    `Run directory: ${RUN_DIR}`,
    `Findings: ${summary.findingsCount}`,
    `Console errors: ${summary.consoleErrorCount}`,
    `API failures: ${summary.apiFailureCount}`,
    '',
    ...findings.map((f) => `${f.id} [${f.severity}] ${f.title} :: ${f.details}`),
  ];
  fs.writeFileSync(path.join(RUN_DIR, 'finding-summary.txt'), textLines.join('\n'), 'utf-8');

  console.log(`QA_DIFFERENT_EVIDENCE_DIR=${RUN_DIR}`);
  console.log(`QA_DIFFERENT_FINDINGS=${summary.findingsCount}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

