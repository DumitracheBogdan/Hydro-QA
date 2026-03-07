import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5173';
const LOGIN_EMAIL = process.env.HYDROCERT_QA_EMAIL || '';
const LOGIN_PASSWORD = process.env.HYDROCERT_QA_PASSWORD || '';

const TIMESTAMP = new Date().toISOString().replace(/[.:]/g, '-');
const RUN_DIR = path.join(process.cwd(), 'qa-artifacts', 'evidence', `no-login-infra-run-${TIMESTAMP}`);
const SCREENSHOT_DIR = path.join(RUN_DIR, 'screenshots');
const VIDEO_DIR = path.join(RUN_DIR, 'videos');
const LOG_DIR = path.join(RUN_DIR, 'logs');

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
fs.mkdirSync(VIDEO_DIR, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });

const findings = [];
const actions = [];
const consoleErrors = new Set();
const pageErrors = new Set();
const apiFailures = new Set();

function addFinding(severity, title, details, evidence = []) {
  findings.push({
    id: `NLI-${String(findings.length + 1).padStart(3, '0')}`,
    severity,
    title,
    details,
    evidence,
  });
}

function logAction(step, status, details = '') {
  actions.push({
    step,
    status,
    details,
    at: new Date().toISOString(),
  });
  console.log(`${status.toUpperCase()} | ${step}${details ? ` | ${details}` : ''}`);
}

async function shot(page, name) {
  const target = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: target, fullPage: true });
  return target;
}

async function waitSettled(page, ms = 450) {
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

async function ensureAuthenticated(page) {
  logAction('auth-bootstrap', 'start');
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitSettled(page, 700);

  const redirectedToLogin = page.url().includes('/login');
  const hasLoginTitle = (await page.locator('text=/Login to your account/i').count().catch(() => 0)) > 0;

  if (redirectedToLogin || hasLoginTitle) {
    const email = page.locator('input[type="email"], input[name="email"]').first();
    const password = page.locator('input[type="password"], input[name="password"]').first();
    const signIn = page.getByRole('button', { name: /sign in/i }).first();

    await email.fill(LOGIN_EMAIL);
    await password.fill(LOGIN_PASSWORD);
    await signIn.click({ timeout: 6000 });
    await waitSettled(page, 1200);
  }

  if (page.url().includes('/login')) {
    const authFailShot = await shot(page, 'auth-bootstrap-failed');
    throw new Error(`Authentication bootstrap failed. Evidence: ${authFailShot}`);
  }

  await page.context().storageState({ path: path.join(RUN_DIR, 'storage-state-after-bootstrap.json') });
  logAction('auth-bootstrap', 'ok', `url=${page.url()}`);
}

async function dashboardScenario(page) {
  logAction('dashboard-scenario', 'start');
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitSettled(page);

  const h1 = ((await page.locator('h1').first().textContent().catch(() => '')) || '').trim();
  const baseShot = await shot(page, '01-dashboard-home');

  if (h1.includes('Welcome, !')) {
    addFinding('Medium', 'Dashboard greeting renders empty user name', `Observed heading: "${h1}"`, [baseShot]);
  }

  const search = page.getByPlaceholder(/Search/i).first();
  if (await search.isVisible().catch(() => false)) {
    await search.fill('Old Mill');
    await page.waitForTimeout(700);
    const rowsFiltered = await page.locator('table tbody tr').count().catch(() => 0);
    const searchShot = await shot(page, '02-dashboard-search');
    if (rowsFiltered === 0) {
      addFinding(
        'Low',
        'Dashboard search returned empty state for known term',
        'Search term "Old Mill" returned zero rows during this run.',
        [searchShot],
      );
    }
  }

  await page.getByRole('button', { name: /clear filters/i }).first().click({ timeout: 2500 }).catch(() => {});
  await waitSettled(page, 300);
  await shot(page, '03-dashboard-clear-filters');
  logAction('dashboard-scenario', 'ok');
}

async function customersScenario(page) {
  logAction('customers-scenario', 'start');
  await page.goto('/customers', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitSettled(page);
  const firstShot = await shot(page, '04-customers-home');

  const searchInput = page.getByPlaceholder(/Search customers/i).first();
  if (await searchInput.isVisible().catch(() => false)) {
    await searchInput.fill('Rutland');
    await page.waitForTimeout(850);
    const rutlandRows = await page
      .locator('tbody tr')
      .filter({ hasText: /rutland/i })
      .count()
      .catch(() => 0);
    const searchedShot = await shot(page, '05-customers-search-rutland');
    if (rutlandRows < 1) {
      addFinding('Medium', 'Customer search does not expose expected match', 'Search term "Rutland" not visible in list output.', [
        firstShot,
        searchedShot,
      ]);
    }
  }

  await page.getByRole('button', { name: /clear filters/i }).first().click({ timeout: 3000 }).catch(() => {});
  await waitSettled(page, 450);
  await shot(page, '06-customers-clear-filters');
  logAction('customers-scenario', 'ok');
}

async function visitsCalendarScenario(page) {
  logAction('visits-calendar-scenario', 'start');
  await page.goto('/visits', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitSettled(page);
  const dayShot = await shot(page, '07-visits-day-view');

  const visitCard = page.locator('main').getByText(/150 Cheapside|Schedule/i).first();

  if (await visitCard.isVisible().catch(() => false)) {
    await visitCard.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(500);
    const modalVisible =
      (await page.getByRole('button', { name: /close/i }).first().isVisible().catch(() => false)) ||
      (await page.getByText(/Delete visit/i).first().isVisible().catch(() => false));
    const modalShot = await shot(page, '08-visits-open-modal');
    if (!modalVisible) {
      addFinding('Medium', 'Visit card click does not consistently open details modal', 'Expected modal was not visible.', [dayShot, modalShot]);
    }
    await page.getByRole('button', { name: /close/i }).first().click({ timeout: 2500 }).catch(() => {});
    await page.waitForTimeout(300);
  }

  await page.getByRole('button', { name: /^Month$/i }).first().click({ timeout: 2500 }).catch(() => {});
  await page.waitForTimeout(400);
  await shot(page, '09-visits-month-view');
  logAction('visits-calendar-scenario', 'ok');
}

async function addVisitScenario(page) {
  logAction('add-visit-scenario', 'start');
  await page.goto('/visits/addnewvisit', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitSettled(page, 700);
  const initialShot = await shot(page, '10-add-visit-initial');

  const title = page.locator('input').filter({ has: page.locator('xpath=ancestor::*') }).first();
  const titleByName = page.locator('input[name="title"], input[id*="title" i]').first();
  if (await titleByName.isVisible().catch(() => false)) {
    await titleByName.fill(`QA Infra ${new Date().toISOString().slice(11, 19)}`);
  } else if (await title.isVisible().catch(() => false)) {
    await title.fill(`QA Infra ${new Date().toISOString().slice(11, 19)}`).catch(() => {});
  }

  const siteInput = page.getByPlaceholder(/search site/i).first();
  if (await siteInput.isVisible().catch(() => false)) {
    await siteInput.click();
    await page.waitForTimeout(200);
    await siteInput.fill('Melton');
    await page.waitForTimeout(600);
    const siteOption = page.getByRole('option', { name: /melton court/i }).first();
    if (await siteOption.isVisible().catch(() => false)) {
      await siteOption.click();
      await page.waitForTimeout(350);
      // Check if option remains visible (known visual bug pattern).
      const stillVisible = await siteOption.isVisible().catch(() => false);
      const siteShot = await shot(page, '11-add-visit-site-selected');
      if (stillVisible) {
        addFinding(
          'Medium',
          'Site dropdown remains open after selecting option',
          'After selecting "Melton Court", options list remains visible and overlaps form.',
          [initialShot, siteShot],
        );
      }
    }
  }

  // Attempt form submit to validate runtime behavior without making this run about login.
  const createBtn = page.getByRole('button', { name: /create visit/i }).first();
  if (await createBtn.isVisible().catch(() => false)) {
    await createBtn.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(1100);
    const bodyText = ((await page.locator('body').innerText().catch(() => '')) || '').replace(/\s+/g, ' ');
    const errVisible = /failed to create|error/i.test(bodyText);
    const createShot = await shot(page, '12-add-visit-submit-attempt');
    if (errVisible) {
      addFinding(
        'High',
        'Create Visit submit returns runtime error in UI',
        'Form submit surfaced an explicit error toast/message in the current run.',
        [createShot],
      );
    }
  }
  logAction('add-visit-scenario', 'ok');
}

async function visitsListScenario(page) {
  logAction('visits-list-scenario', 'start');
  await page.goto('/visits-list', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitSettled(page);
  const listShot = await shot(page, '13-visits-list-home');

  const search = page.getByPlaceholder(/search/i).first();
  if (await search.isVisible().catch(() => false)) {
    const initialRows = await page.locator('tbody tr').count().catch(() => 0);
    await search.fill('qazwsx-not-found-qa');
    await page.keyboard.press('Enter').catch(() => {});
    await page.waitForTimeout(900);
    const afterRows = await page.locator('tbody tr').count().catch(() => 0);
    const rowsText = ((await page.locator('tbody').innerText().catch(() => '')) || '').replace(/\s+/g, ' ');
    const noResultsVisible = /no visits found|no results|no data/i.test(rowsText);
    if (initialRows > 0 && afterRows === initialRows && !noResultsVisible) {
      addFinding(
        'Medium',
        'Visits list search does not narrow non-matching rows',
        `Search for non-existing token kept row count unchanged (${initialRows} -> ${afterRows}).`,
        [listShot, await shot(page, '14-visits-list-search-katy')],
      );
    }
  }

  // Try clear filters and detect white-screen crash pattern.
  await page.getByRole('button', { name: /clear filters/i }).first().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const htmlLen = await page.evaluate(() => document.body.innerText.trim().length).catch(() => 0);
  const clearShot = await shot(page, '15-visits-list-clear-filters');
  const hasTypeError = [...consoleErrors].some((e) => /Cannot read properties of undefined \(reading 'length'\)/i.test(e));
  if (htmlLen === 0 || hasTypeError) {
    addFinding(
      'Critical',
      'Visits list becomes blank after "Clear Filters"',
      hasTypeError
        ? 'Clear Filters triggers runtime TypeError in console and destabilizes list state.'
        : 'UI entered empty/blank state after clearing filters.',
      [clearShot],
    );
  }
  logAction('visits-list-scenario', 'ok');
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
    if (msg.type() === 'error') consoleErrors.add(msg.text());
  });
  page.on('pageerror', (err) => {
    pageErrors.add(err.message);
  });
  page.on('response', (res) => {
    if (res.status() >= 400) {
      apiFailures.add(`${res.status()} ${res.request().method()} ${res.url()}`);
    }
  });

  try {
    await ensureAuthenticated(page);
    await dashboardScenario(page);
    await customersScenario(page);
    await visitsCalendarScenario(page);
    await addVisitScenario(page);
    await visitsListScenario(page);
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
    pageErrorCount: pageErrors.size,
    pageErrors: [...pageErrors],
    apiFailureCount: apiFailures.size,
    apiFailures: [...apiFailures],
  };

  fs.writeFileSync(path.join(RUN_DIR, 'summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
  fs.writeFileSync(path.join(LOG_DIR, 'console-errors.log'), [...consoleErrors].join('\n\n'), 'utf-8');
  fs.writeFileSync(path.join(LOG_DIR, 'page-errors.log'), [...pageErrors].join('\n\n'), 'utf-8');
  fs.writeFileSync(path.join(LOG_DIR, 'api-failures.log'), [...apiFailures].join('\n'), 'utf-8');

  const summaryLines = [
    `Run directory: ${RUN_DIR}`,
    `Findings: ${findings.length}`,
    `Console errors: ${consoleErrors.size}`,
    `Page errors: ${pageErrors.size}`,
    `API failures: ${apiFailures.size}`,
    '',
    ...findings.map((f) => `${f.id} [${f.severity}] ${f.title} :: ${f.details}`),
  ];
  fs.writeFileSync(path.join(RUN_DIR, 'finding-summary.txt'), summaryLines.join('\n'), 'utf-8');

  console.log(`QA_NO_LOGIN_INFRA_EVIDENCE_DIR=${RUN_DIR}`);
  console.log(`QA_NO_LOGIN_INFRA_FINDINGS=${findings.length}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
