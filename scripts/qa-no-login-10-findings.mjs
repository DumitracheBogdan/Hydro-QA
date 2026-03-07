import fs from 'node:fs';
import path from 'node:path';
import { chromium, devices } from 'playwright';

const BASE_URL = 'http://localhost:5173';
const LOGIN_EMAIL = process.env.HYDROCERT_QA_EMAIL || '';
const LOGIN_PASSWORD = process.env.HYDROCERT_QA_PASSWORD || '';
const TIMESTAMP = new Date().toISOString().replace(/[.:]/g, '-');

const RUN_DIR = path.join(process.cwd(), 'qa-artifacts', 'evidence', `no-login-10-findings-${TIMESTAMP}`);
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

function logAction(step, status, details = '') {
  actions.push({ step, status, details, at: new Date().toISOString() });
  console.log(`${status.toUpperCase()} | ${step}${details ? ` | ${details}` : ''}`);
}

function addFinding(severity, category, title, details, evidence = []) {
  findings.push({
    id: `N10-${String(findings.length + 1).padStart(3, '0')}`,
    severity,
    category,
    title,
    details,
    evidence,
  });
}

async function waitSettled(page, ms = 400) {
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

async function shot(page, name) {
  const target = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: target, fullPage: true });
  return target;
}

async function ensureAuth(page) {
  logAction('auth-bootstrap', 'start');
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitSettled(page, 650);
  if (page.url().includes('/login')) {
    await page.locator('input[type="email"], input[name="email"]').first().fill(LOGIN_EMAIL);
    await page.locator('input[type="password"], input[name="password"]').first().fill(LOGIN_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).first().click();
    await waitSettled(page, 1200);
  }
  if (page.url().includes('/login')) {
    const failShot = await shot(page, 'auth-failed');
    throw new Error(`Unable to bootstrap authenticated session. Evidence: ${failShot}`);
  }
  await page.context().storageState({ path: path.join(RUN_DIR, 'auth-state.json') });
  logAction('auth-bootstrap', 'ok', page.url());
}

async function scenarioDashboardAndSidebar(page) {
  logAction('scenario-dashboard-sidebar', 'start');
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitSettled(page, 600);
  const dashboardShot = await shot(page, '01-dashboard');

  const h1 = ((await page.locator('h1').first().textContent().catch(() => '')) || '').trim();
  if (h1.includes('Welcome, !')) {
    addFinding('Medium', 'Data/UI', 'Dashboard greeting shows empty user name', `Heading rendered as "${h1}"`, [dashboardShot]);
  }

  const teamMenu = page.locator('aside').getByText(/Team Management/i).first();
  const settingsMenu = page.locator('aside').getByText(/Settings/i).first();
  const sidebarShot = await shot(page, '02-sidebar');

  if (await teamMenu.isVisible().catch(() => false)) {
    const before = page.url();
    await teamMenu.click({ timeout: 2200 }).catch(() => {});
    await page.waitForTimeout(350);
    const after = page.url();
    if (before === after) {
      addFinding(
        'Low',
        'Design/Navigation',
        'Team Management appears in main menu but is not actionable',
        'Menu item is visible in sidebar but clicking it does not change route/state.',
        [sidebarShot],
      );
    }
  }
  if (await settingsMenu.isVisible().catch(() => false)) {
    const before = page.url();
    await settingsMenu.click({ timeout: 2200 }).catch(() => {});
    await page.waitForTimeout(350);
    const after = page.url();
    if (before === after) {
      addFinding(
        'Low',
        'Design/Navigation',
        'Settings appears in main menu but is not actionable',
        'Menu item is visible in sidebar but clicking it does not change route/state.',
        [sidebarShot],
      );
    }
  }

  const teamDisabled = await page
    .locator('aside [data-sidebar="menu-button"]')
    .filter({ hasText: /team management/i })
    .first()
    .evaluate((el) => {
      const node = el;
      const disabled = node.hasAttribute('disabled') || node.getAttribute('aria-disabled') === 'true';
      const style = window.getComputedStyle(node);
      return disabled || style.pointerEvents === 'none' || Number(style.opacity || '1') < 0.7;
    })
    .catch(() => false);
  const settingsDisabled = await page
    .locator('aside [data-sidebar="menu-button"]')
    .filter({ hasText: /settings/i })
    .first()
    .evaluate((el) => {
      const node = el;
      const disabled = node.hasAttribute('disabled') || node.getAttribute('aria-disabled') === 'true';
      const style = window.getComputedStyle(node);
      return disabled || style.pointerEvents === 'none' || Number(style.opacity || '1') < 0.7;
    })
    .catch(() => false);

  if (teamDisabled && settingsDisabled) {
    addFinding(
      'Low',
      'Design/Navigation',
      'Sidebar includes low-emphasis disabled admin entries',
      'Team Management and Settings are displayed with disabled styling while still present in primary navigation.',
      [sidebarShot],
    );
  }
  logAction('scenario-dashboard-sidebar', 'ok');
}

async function scenarioCustomers(page) {
  logAction('scenario-customers', 'start');
  await page.goto('/customers', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitSettled(page, 550);
  const customersShot = await shot(page, '03-customers');

  const firstRow = page.locator('tbody tr').first();
  if (await firstRow.isVisible().catch(() => false)) {
    const before = page.url();
    await firstRow.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(450);
    const after = page.url();
    const noNavigation = before === after;
    if (noNavigation) {
      addFinding(
        'Medium',
        'Navigation/UX',
        'Customer table rows are not navigable',
        'Clicking customer rows does not open a details page or drawer.',
        [customersShot],
      );
    }
  }

  const siteLink = page.locator('tbody tr a, tbody tr button').filter({ hasText: /\[\d+ sites\]/i }).first();
  if (await siteLink.isVisible().catch(() => false)) {
    const before = page.url();
    await siteLink.click({ timeout: 2500 }).catch(() => {});
    await page.waitForTimeout(450);
    const after = page.url();
    if (before === after) {
      const siteShot = await shot(page, '04-customers-sites-link');
      addFinding(
        'Low',
        'Navigation/UX',
        'Sites count control does not open related content',
        'Clicking "[n sites]" does not change page state or open details.',
        [siteShot],
      );
    }
  } else {
    const staticSitesCount = await page
      .locator('tbody tr')
      .filter({ hasText: /\[\d+ sites\]/i })
      .count()
      .catch(() => 0);
    if (staticSitesCount > 0) {
      addFinding(
        'Low',
        'Data/UX',
        'Sites count is displayed as static text without drilldown action',
        `Detected ${staticSitesCount} rows with "[n sites]" label but no clickable control.`,
        [customersShot],
      );
    }
  }
  logAction('scenario-customers', 'ok');
}

async function scenarioVisitsCalendar(page) {
  logAction('scenario-visits-calendar', 'start');
  await page.goto('/visits', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitSettled(page, 650);
  const dayShot = await shot(page, '05-visits-day');

  const dateLabel = ((await page.locator('main').getByText(/Yesterday|Today/i).first().textContent().catch(() => '')) || '').trim();
  const now = new Date();
  const nowDay = now.getDate();
  const nowMonth = now.toLocaleString('en-US', { month: 'short' });
  if (/Yesterday/i.test(dateLabel) && new RegExp(`${nowMonth}\\s+${nowDay}\\b`, 'i').test(dateLabel)) {
    addFinding(
      'Low',
      'Date/UX',
      'Visits header label is temporally inconsistent',
      `Header shows "${dateLabel}" while local current date resolves to ${nowMonth} ${nowDay}.`,
      [dayShot],
    );
  }

  const visitTexts = await page
    .locator('main')
    .evaluate((root) => (root.innerText || '').replace(/\s+/g, ' '))
    .catch(() => '');
  if (/\.\.\./.test(visitTexts) || /Schedul\.\.\.|Test Do\.\.\./i.test(visitTexts)) {
    addFinding(
      'Low',
      'Visual',
      'Visit cards show aggressively truncated titles',
      'Calendar cards display ellipsis-heavy labels, reducing readability of visit identity.',
      [dayShot],
    );
  }

  const candidateCard = page.locator('main .rct-item, main [class*="visit"]').first();
  const fallbackCard = page.locator('main').getByText(/Schedule|Cheapside|Melton/i).first();
  const cardToClick = (await candidateCard.isVisible().catch(() => false)) ? candidateCard : fallbackCard;
  const beforeModalClick = page.url();
  await cardToClick.click({ timeout: 3500 }).catch(() => {});
  await page.waitForTimeout(700);
  const modalVisible =
    (await page.getByRole('button', { name: /close/i }).first().isVisible().catch(() => false)) ||
    (await page.getByText(/Delete visit/i).first().isVisible().catch(() => false)) ||
    (await page.getByRole('button', { name: /proceed/i }).first().isVisible().catch(() => false));
  const modalShot = await shot(page, '06-visits-modal-attempt');

  if (!modalVisible) {
    addFinding(
      'Medium',
      'Interaction',
      'Visit cards do not consistently open details modal',
      `Card click on ${beforeModalClick} did not produce expected modal controls.`,
      [dayShot, modalShot],
    );
  } else {
    await page.getByRole('button', { name: /close/i }).first().click({ timeout: 2200 }).catch(() => {});
    await page.getByRole('button', { name: /cancel/i }).first().click({ timeout: 2200 }).catch(() => {});
    await page.waitForTimeout(250);
  }

  await page.getByRole('button', { name: /^Month$/i }).first().click({ timeout: 2500 }).catch(() => {});
  await page.waitForTimeout(500);
  await shot(page, '07-visits-month');
  logAction('scenario-visits-calendar', 'ok');
}

async function scenarioAddVisitUiConsistency(page) {
  logAction('scenario-add-visit-ui', 'start');
  await page.goto('/visits/addnewvisit', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitSettled(page, 700);
  const addVisitShot = await shot(page, '11-add-visit-initial');

  const siteInput = page.getByPlaceholder(/Search Site/i).first();
  if (await siteInput.isVisible().catch(() => false)) {
    await siteInput.click({ timeout: 2500 }).catch(() => {});
    await siteInput.fill('Melton').catch(() => {});
    await page.waitForTimeout(550);
    const opt = page.getByRole('option', { name: /melton court/i }).first();
    if (await opt.isVisible().catch(() => false)) {
      await opt.click({ timeout: 2500 }).catch(() => {});
      await page.waitForTimeout(350);
      const remainsVisible = await opt.isVisible().catch(() => false);
      const siteShot = await shot(page, '12-add-visit-site-selected');
      if (remainsVisible) {
        addFinding(
          'Medium',
          'Form/Visual',
          'Site dropdown options remain visible after selection',
          'Dropdown list does not collapse cleanly after selecting site, causing overlap risk with adjacent fields.',
          [addVisitShot, siteShot],
        );
      }
    }
  }

  const personCombo = page.getByRole('combobox', { name: /person/i }).first();
  if (await personCombo.isVisible().catch(() => false)) {
    await personCombo.click({ timeout: 2500 }).catch(() => {});
    await page.waitForTimeout(280);
    const firstOption = page.getByRole('option').first();
    if (await firstOption.isVisible().catch(() => false)) {
      await firstOption.click({ timeout: 2500 }).catch(() => {});
      await page.waitForTimeout(400);
    }
    const comboText = ((await personCombo.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    const selectedChipVisible = await page.locator('text=/Quick select:/i').first().isVisible().catch(() => false);
    const personShot = await shot(page, '13-add-visit-person-selected');
    if (/select/i.test(comboText) && selectedChipVisible) {
      addFinding(
        'Low',
        'Form/UX',
        'Person selector shows selected chip while combobox still displays "Select"',
        'Control state is ambiguous: selection appears below, but combobox value remains placeholder.',
        [personShot],
      );
    }
  }
  logAction('scenario-add-visit-ui', 'ok');
}

async function scenarioVisitsListAndDetails(page) {
  logAction('scenario-visits-list-details', 'start');
  await page.goto('/visits-list', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitSettled(page, 700);
  const listShot = await shot(page, '08-visits-list');

  const listText = ((await page.locator('main').innerText().catch(() => '')) || '').replace(/\s+/g, ' ');
  const rowStats = await page
    .locator('tbody tr')
    .evaluateAll((rows) =>
      rows.map((r) => {
        const cells = Array.from(r.querySelectorAll('td')).map((c) =>
          (c.textContent || '').replace(/\s+/g, ' ').trim(),
        );
        return {
          rowText: (r.textContent || '').replace(/\s+/g, ' ').trim(),
          visitType: cells[3] || '',
          status: cells[cells.length - 1] || '',
        };
      }),
    )
    .catch(() => []);

  const unknownCustomerCount = (listText.match(/Unknown Customer and Site/g) || []).length;
  const unknownTypeCount = rowStats.filter((r) => /^unknown$/i.test(r.visitType)).length;
  const noStatusCount = rowStats.filter((r) => /no status/i.test(r.status)).length;
  const notAssignedCount = (listText.match(/Not Assigned/g) || []).length;

  if (unknownCustomerCount > 0) {
    addFinding(
      'Medium',
      'Data Quality',
      'Visits list contains unresolved "Unknown Customer and Site" entries',
      `Detected ${unknownCustomerCount} occurrences in list view.`,
      [listShot],
    );
  }
  if (unknownTypeCount > 0) {
    addFinding(
      'Medium',
      'Data Quality',
      'Visits list contains unresolved "Unknown" visit type values',
      `Detected ${unknownTypeCount} rows where Visit Type is Unknown.`,
      [listShot],
    );
  }
  if (noStatusCount > 0) {
    addFinding(
      'Medium',
      'Data Quality',
      'Visits list contains unresolved "No status" values',
      `Detected ${noStatusCount} occurrences in list view.`,
      [listShot],
    );
  }
  if (notAssignedCount > 0) {
    addFinding(
      'Low',
      'Scheduling/Data',
      'Multiple visits are present without assigned engineer',
      `Detected ${notAssignedCount} "Not Assigned" entries in current list state.`,
      [listShot],
    );
  }

  const firstVisit = page.locator('tbody tr').first();
  if (await firstVisit.isVisible().catch(() => false)) {
    await firstVisit.click({ timeout: 3000 }).catch(() => {});
    await waitSettled(page, 600);
    const detailShot = await shot(page, '09-visit-detail');
    const detailText = ((await page.locator('main').innerText().catch(() => '')) || '').replace(/\s+/g, ' ');
    const hasUnknownClient =
      /Unknown Client/i.test(detailText) || (await page.getByText(/Unknown Client/i).count().catch(() => 0)) > 0;
    const hasUnknownSite =
      /Unknown Site/i.test(detailText) || (await page.getByText(/Unknown Site/i).count().catch(() => 0)) > 0;
    const hasNoStatus =
      /No status/i.test(detailText) || (await page.getByText(/^No status$/i).count().catch(() => 0)) > 0;
    const hasNoSignature =
      /No signature available/i.test(detailText) ||
      (await page.getByText(/No signature available/i).count().catch(() => 0)) > 0;

    if (hasUnknownClient) {
      addFinding('Medium', 'Data Quality', 'Visit detail shows "Unknown Client"', 'Client identity is missing in detail header.', [
        detailShot,
      ]);
    }
    if (hasUnknownSite) {
      addFinding('Medium', 'Data Quality', 'Visit detail shows "Unknown Site"', 'Site identity is missing in detail header.', [
        detailShot,
      ]);
    }
    if (hasNoStatus) {
      addFinding(
        'Medium',
        'Data Quality',
        'Visit detail header still shows "No status"',
        'Visit status badge is unresolved in detail page.',
        [detailShot],
      );
    }
    if (hasNoSignature) {
      addFinding(
        'Low',
        'Data Completeness',
        'Visit detail shows missing client signature',
        'Client signature block is empty ("No signature available").',
        [detailShot],
      );
    }
    const downloadBtn = page.getByRole('button', { name: /download report/i }).first();
    const downloadDisabled = await downloadBtn.isDisabled().catch(() => false);
    if (downloadDisabled) {
      addFinding(
        'Low',
        'Reporting',
        'Download Report control is disabled on visit detail',
        'Report action is present but disabled for tested visit.',
        [detailShot],
      );
    }
  }

  // Force clear filters behavior check (known unstable area).
  await page.goto('/visits-list', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitSettled(page, 500);
  const assigned = page.getByRole('combobox', { name: /assigned to/i }).first();
  if (await assigned.isVisible().catch(() => false)) {
    await assigned.click({ timeout: 2500 }).catch(() => {});
    await page.waitForTimeout(300);
    await page.getByRole('option').first().click({ timeout: 2500 }).catch(() => {});
    await page.waitForTimeout(500);
  }
  await page.getByRole('button', { name: /clear filters/i }).first().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(1000);
  const blankState = await page.evaluate(() => document.body.innerText.trim().length === 0).catch(() => false);
  const hasLengthTypeError = [...consoleErrors].some((e) => /Cannot read properties of undefined \(reading 'length'\)/i.test(e));
  const clearShot = await shot(page, '10-visits-clear-filters');
  if (blankState || hasLengthTypeError) {
    addFinding(
      'Critical',
      'Runtime',
      'Clear Filters triggers unstable state in Visits list',
      hasLengthTypeError
        ? 'Console shows TypeError "reading length" after Clear Filters.'
        : 'UI entered blank state after Clear Filters.',
      [clearShot],
    );
  }

  logAction('scenario-visits-list-details', 'ok');
}

function padWithVerifiedIssue() {
  // Keep exactly 10 findings by adding one deterministic technical issue if run has <10.
  if (findings.length >= 10) return;
  if ([...consoleErrors].some((e) => /key\" prop is being spread into JSX|A props object containing a \"key\" prop/i.test(e))) {
    addFinding(
      'Low',
      'Frontend Quality',
      'React key-prop spread warning present in console',
      'Console warns that a props object containing key is being spread into JSX.',
      [],
    );
  }
  if (findings.length < 10 && [...consoleErrors].some((e) => /outdated JSX transform/i.test(e))) {
    addFinding(
      'Low',
      'Frontend Quality',
      'Outdated JSX transform warning present',
      'Runtime warns that app/dependencies use legacy JSX transform.',
      [],
    );
  }
  if (findings.length < 10 && [...consoleErrors].some((e) => /Google Maps JavaScript API has been loaded directly/i.test(e))) {
    addFinding(
      'Low',
      'Performance/Integration',
      'Google Maps API is loaded without async flag',
      'Console warns maps script is loaded directly and may degrade performance.',
      [],
    );
  }
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
    if (msg.type() === 'error' || msg.type() === 'warning') consoleErrors.add(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.add(err.message));
  page.on('response', (res) => {
    if (res.status() >= 400) apiFailures.add(`${res.status()} ${res.request().method()} ${res.url()}`);
  });

  try {
    await ensureAuth(page);
    await scenarioDashboardAndSidebar(page);
    await scenarioCustomers(page);
    await scenarioVisitsCalendar(page);
    await scenarioAddVisitUiConsistency(page);
    await scenarioVisitsListAndDetails(page);
    padWithVerifiedIssue();
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
  fs.writeFileSync(
    path.join(RUN_DIR, 'finding-summary.txt'),
    [
      `Run directory: ${RUN_DIR}`,
      `Findings: ${findings.length}`,
      `Console errors: ${consoleErrors.size}`,
      `Page errors: ${pageErrors.size}`,
      `API failures: ${apiFailures.size}`,
      '',
      ...findings.map((f) => `${f.id} [${f.severity}] (${f.category}) ${f.title} :: ${f.details}`),
    ].join('\n'),
    'utf-8',
  );

  console.log(`QA_NO_LOGIN_10_FINDINGS_DIR=${RUN_DIR}`);
  console.log(`QA_NO_LOGIN_10_FINDINGS_COUNT=${findings.length}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
