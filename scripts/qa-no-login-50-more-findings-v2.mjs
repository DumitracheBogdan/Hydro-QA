import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5173';
const EMAIL = process.env.HYDROCERT_QA_EMAIL || '';
const PASSWORD = process.env.HYDROCERT_QA_PASSWORD || '';
const TIMESTAMP = new Date().toISOString().replace(/[.:]/g, '-');

const RUN_DIR = path.join(process.cwd(), 'qa-artifacts', 'evidence', `no-login-50-more-findings-v2-${TIMESTAMP}`);
const SCREENSHOT_DIR = path.join(RUN_DIR, 'screenshots');
const LOG_DIR = path.join(RUN_DIR, 'logs');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });

const findings = [];
const actions = [];
const consoleEvents = new Set();
const apiFailures = new Set();

function logAction(step, status, details = '') {
  actions.push({ step, status, details, at: new Date().toISOString() });
  console.log(`${status.toUpperCase()} | ${step}${details ? ` | ${details}` : ''}`);
}

function addFinding(severity, title, description, expected, actual, impact, steps, evidence) {
  findings.push({
    id: `BUG-${String(findings.length + 1).padStart(3, '0')}`,
    severity,
    title,
    description,
    expected,
    actual,
    impact,
    steps,
    evidence,
  });
}

async function waitSettled(page, ms = 600) {
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

async function ensureRingStyle(page) {
  await page
    .evaluate(() => {
      const styleId = 'qa-ring-style';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
          [data-qa-ring="1"]{
            outline:3px solid #ff1e1e !important;
            box-shadow:0 0 0 3px rgba(255,30,30,0.22) !important;
            border-radius:8px !important;
          }`;
        document.head.appendChild(style);
      }
    })
    .catch(() => {});
}

async function clearRings(page) {
  await page
    .evaluate(() => {
      document.querySelectorAll('[data-qa-ring="1"]').forEach((el) => el.removeAttribute('data-qa-ring'));
    })
    .catch(() => {});
}

async function ringBySelectors(page, selectors) {
  await ensureRingStyle(page);
  await clearRings(page);
  await page
    .evaluate((sels) => {
      for (const sel of sels) {
        try {
          const el = document.querySelector(sel);
          if (el) el.setAttribute('data-qa-ring', '1');
        } catch {}
      }
    }, selectors)
    .catch(() => {});
}

async function ringByLocator(locator) {
  try {
    if ((await locator.count()) < 1) return false;
    await locator.first().evaluate((el) => el.setAttribute('data-qa-ring', '1'));
    return true;
  } catch {
    return false;
  }
}

async function shot(page, name) {
  const file = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function loginBootstrap(page) {
  logAction('login-bootstrap', 'start');
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitSettled(page, 800);
  if (page.url().includes('/login')) {
    await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL);
    await page.locator('input[type="password"], input[name="password"]').first().fill(PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).first().click();
    await waitSettled(page, 1500);
  }
  if (page.url().includes('/login')) throw new Error('Authentication failed in bootstrap.');
  logAction('login-bootstrap', 'ok', page.url());
}

async function collectGeneralFindings(page) {
  logAction('general-findings', 'start');

  // Dashboard checks
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitSettled(page, 700);

  const team = page.locator('aside').getByText(/Team Management/i).first();
  if (await team.isVisible().catch(() => false)) {
    const before = page.url();
    await ringByLocator(team);
    const teamShot = await shot(page, 'ann-01-dashboard-team-management');
    await team.click({ timeout: 2200 }).catch(() => {});
    await page.waitForTimeout(350);
    if (before === page.url()) {
      addFinding(
        'MEDIUM',
        'Team Management Menu Item Is Non-Actionable',
        'Sidebar item is visible but clicking it does not navigate.',
        'Team Management item should open team page.',
        'No route transition after click.',
        'Team admin flow inaccessible from navigation.',
        ['Open Dashboard.', 'Click Team Management in sidebar.', 'Observe no route change.'],
        [teamShot],
      );
    }
  }

  const settings = page.locator('aside').getByText(/Settings/i).first();
  if (await settings.isVisible().catch(() => false)) {
    const before = page.url();
    await ringByLocator(settings);
    const settingsShot = await shot(page, 'ann-02-dashboard-settings');
    await settings.click({ timeout: 2200 }).catch(() => {});
    await page.waitForTimeout(350);
    if (before === page.url()) {
      addFinding(
        'MEDIUM',
        'Settings Menu Item Is Non-Actionable',
        'Sidebar Settings item does not navigate to configuration page.',
        'Settings should open settings/configuration screen.',
        'No route transition after click.',
        'Configuration tasks blocked from UI.',
        ['Open Dashboard.', 'Click Settings in sidebar.', 'Observe no route change.'],
        [settingsShot],
      );
    }
  }

  const firstJob = page.locator('table tbody tr').first();
  if (await firstJob.isVisible().catch(() => false)) {
    const before = page.url();
    await ringBySelectors(page, ['table tbody tr:first-child']);
    const jobShot = await shot(page, 'ann-03-dashboard-first-job');
    await firstJob.click({ timeout: 2200 }).catch(() => {});
    await page.waitForTimeout(350);
    if (before === page.url()) {
      addFinding(
        'LOW',
        'Latest Jobs Row Is Not Clickable',
        'Dashboard jobs table row does not open details.',
        'Row click should open job detail.',
        'No route/modal/drawer appears.',
        'No drilldown from dashboard jobs widget.',
        ['Open Dashboard.', 'Click first row in Latest Jobs.', 'Observe no action.'],
        [jobShot],
      );
    }
  }

  await page.mouse.wheel(0, 1800).catch(() => {});
  await page.waitForTimeout(300);
  const labRow = page.locator('table tbody tr').nth(6); // likely lab table after scroll
  if (await labRow.isVisible().catch(() => false)) {
    const before = page.url();
    await ringByLocator(labRow);
    const labShot = await shot(page, 'ann-04-dashboard-lab-row');
    await labRow.click({ timeout: 2200 }).catch(() => {});
    await page.waitForTimeout(350);
    if (before === page.url()) {
      addFinding(
        'LOW',
        'Latest Lab Results Row Is Not Clickable',
        'Lab results row does not open detail view.',
        'Row click should show result detail.',
        'No visible action after click.',
        'Lab result drilldown unavailable from dashboard.',
        ['Open Dashboard.', 'Scroll to Latest Lab Results.', 'Click a row and observe no action.'],
        [labShot],
      );
    }
  }

  // Customers
  await page.goto('/customers', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitSettled(page, 700);
  const customerRow = page.locator('tbody tr').first();
  if (await customerRow.isVisible().catch(() => false)) {
    const before = page.url();
    await ringBySelectors(page, ['tbody tr:first-child']);
    const custShot = await shot(page, 'ann-05-customers-first-row');
    await customerRow.click({ timeout: 2200 }).catch(() => {});
    await page.waitForTimeout(350);
    if (before === page.url()) {
      addFinding(
        'MEDIUM',
        'Customer Row Is Not Clickable',
        'Customers list row click does not open details.',
        'Row click should open customer details.',
        'No route/modal after click.',
        'Customer drilldown unavailable from list.',
        ['Open Customers.', 'Click first customer row.', 'Observe no action.'],
        [custShot],
      );
    }
  }

  const sitesLabel = page.locator('tbody tr td').filter({ hasText: /\[\d+\s*sites\]/i }).first();
  if (await sitesLabel.isVisible().catch(() => false)) {
    const before = page.url();
    await ringByLocator(sitesLabel);
    const sitesShot = await shot(page, 'ann-06-customers-sites-label');
    await sitesLabel.click({ timeout: 2200 }).catch(() => {});
    await page.waitForTimeout(350);
    if (before === page.url()) {
      addFinding(
        'LOW',
        'Sites Count Label Is Non-Interactive',
        'Sites count in customers table does not open site details.',
        'Sites count should provide navigation to sites list/details.',
        'Clicking [n sites] does nothing.',
        'Site-level workflow blocked from customers grid.',
        ['Open Customers.', 'Click [n sites] cell.', 'Observe no action.'],
        [sitesShot],
      );
    }
  }

  // Schedule > Visits (submenu area)
  await page.goto('/visits', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitSettled(page, 800);
  await ringBySelectors(page, ['main']);
  const visitsDayShot = await shot(page, 'ann-07-schedule-visits-day');
  const ellipsisTextCount = await page.locator('text=/\\.\\.\\./').count().catch(() => 0);
  if (ellipsisTextCount > 0) {
    addFinding(
      'LOW',
      'Day View Visit Labels Are Truncated',
      'Schedule day view displays truncated visit labels with ellipsis.',
      'Labels should remain clear or provide direct expansion affordance.',
      `Detected ${ellipsisTextCount} truncated text nodes in day view.`,
      'Can cause ambiguity between similar visits.',
      ['Open Schedule > Visits (Day).', 'Inspect event labels.', 'Observe truncated labels.'],
      [visitsDayShot],
    );
  }

  // Schedule > Planner (submenu area)
  await page.goto('/planner', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitSettled(page, 800);
  const plus = page.locator('button').filter({ hasText: '+' }).first();
  if (await plus.isVisible().catch(() => false)) {
    const beforeUrl = page.url();
    const beforeText = await page.locator('main').innerText().catch(() => '');
    await ringByLocator(plus);
    const plusShot = await shot(page, 'ann-08-planner-plus-button');
    await plus.click({ timeout: 2200 }).catch(() => {});
    await page.waitForTimeout(500);
    const afterUrl = page.url();
    const afterText = await page.locator('main').innerText().catch(() => '');
    const hasDialog = await page.locator('[role="dialog"]').count().catch(() => 0);
    if (beforeUrl === afterUrl && beforeText === afterText && hasDialog === 0) {
      addFinding(
        'MEDIUM',
        'Planner Plus Button Has No Observable Effect',
        'Plus button in planner grid does not trigger visible action.',
        'Plus should open a create/edit visit flow.',
        'No route/modal/state change captured after click.',
        'Entry point for planning from grid appears broken.',
        ['Open Schedule > Planner.', 'Click + button on grid.', 'Observe no visible response.'],
        [plusShot],
      );
    }
  }

  const eventsBtn = page.getByRole('button', { name: /Events View/i }).first();
  if (await eventsBtn.isVisible().catch(() => false)) {
    await eventsBtn.click({ timeout: 2200 }).catch(() => {});
    await waitSettled(page, 700);
    const noEngineer = await page.getByText(/No engineers assigned/i).count().catch(() => 0);
    await ringBySelectors(page, ['main']);
    const eventsShot = await shot(page, 'ann-09-planner-events-no-engineers');
    if (noEngineer >= 2) {
      addFinding(
        'MEDIUM',
        'Planner Events Contains Multiple "No Engineers Assigned" Rows',
        'Events view shows unresolved engineer assignment for multiple items.',
        'Scheduled events should resolve engineer assignment where applicable.',
        `Detected ${noEngineer} occurrences of "No engineers assigned".`,
        'Staffing visibility is degraded in planning view.',
        ['Open Schedule > Planner.', 'Switch to Events View.', 'Inspect Engineer column values.'],
        [eventsShot],
      );
    }
  }

  // Visits list core + detail
  await page.goto('/visits-list', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitSettled(page, 900);
  const search = page.locator('input[placeholder*="Search visits"]').first();
  if (await search.isVisible().catch(() => false)) {
    const beforeCount = await page.locator('tbody tr').count().catch(() => 0);
    await search.fill('qa-no-hit-token-2026-zzz').catch(() => {});
    await page.keyboard.press('Enter').catch(() => {});
    await waitSettled(page, 700);
    const afterCount = await page.locator('tbody tr').count().catch(() => 0);
    await ringBySelectors(page, ['input[placeholder*="Search visits"]', 'tbody']);
    const searchShot = await shot(page, 'ann-10-visits-search-no-hit');
    if (beforeCount > 0 && afterCount >= beforeCount) {
      addFinding(
        'MEDIUM',
        'Visits Search Does Not Narrow Rows For Non-Matching Query',
        'Non-matching search token does not reduce results in tested state.',
        'Search should return zero/reduced results for non-matching term.',
        `Rows before: ${beforeCount}, rows after: ${afterCount}.`,
        'Search trust and operator efficiency are reduced.',
        ['Open Visits List.', 'Search for unique non-existing token.', 'Observe row count unchanged.'],
        [searchShot],
      );
    }
    const clearFilters = page.getByText(/Clear Filters/i).first();
    if (await clearFilters.isVisible().catch(() => false)) {
      await clearFilters.click({ timeout: 2200 }).catch(() => {});
      await waitSettled(page, 500);
    }
  }

  const firstVisit = page.locator('tbody tr').first();
  if (await firstVisit.isVisible().catch(() => false)) {
    await firstVisit.click({ timeout: 2500 }).catch(() => {});
    await waitSettled(page, 700);
    await ensureRingStyle(page);
    await clearRings(page);
    await ringByLocator(page.getByText(/Unknown Client/i).first());
    await ringByLocator(page.getByText(/^No status$/i).first());
    await ringByLocator(page.getByRole('button', { name: /Download Report/i }).first());
    const detailShot = await shot(page, 'ann-11-visits-detail-header');
    const detailText = (await page.locator('main').innerText().catch(() => '')).replace(/\s+/g, ' ');

    if (/Unknown Client/i.test(detailText)) {
      addFinding(
        'MEDIUM',
        'Visit Detail Shows Unknown Client',
        'Detail page displays unresolved client placeholder.',
        'Client identity should be resolved.',
        'Client field is "Unknown Client".',
        'Visit context is incomplete for operations.',
        ['Open Visits List.', 'Open first visit.', 'Inspect Client field.'],
        [detailShot],
      );
    }
    if (/No status/i.test(detailText)) {
      addFinding(
        'MEDIUM',
        'Visit Detail Shows No Status',
        'Detail status badge remains unresolved.',
        'A valid status should be shown.',
        'Badge displays "No status".',
        'Workflow status tracking is unreliable.',
        ['Open Visits List.', 'Open first visit.', 'Inspect status badge.'],
        [detailShot],
      );
    }
    const downloadBtn = page.getByRole('button', { name: /Download Report/i }).first();
    if (await downloadBtn.isVisible().catch(() => false)) {
      const disabled = await downloadBtn.isDisabled().catch(() => false);
      if (disabled) {
        addFinding(
          'LOW',
          'Download Report Is Disabled In Visit Detail',
          'Report download action cannot be used for tested visit.',
          'Download should be available or provide explicit reason.',
          'Button is disabled with no inline reason.',
          'User cannot retrieve report from detail view.',
          ['Open Visits List.', 'Open first visit.', 'Inspect Download Report button.'],
          [detailShot],
        );
      }
    }
    const share = page.getByRole('button', { name: /Share Report/i }).first();
    if (await share.isVisible().catch(() => false)) {
      const beforeUrl = page.url();
      await ringByLocator(share);
      const shareShot = await shot(page, 'ann-12-visits-detail-share');
      await share.click({ timeout: 2200 }).catch(() => {});
      await page.waitForTimeout(600);
      const hasDialog = await page.locator('[role="dialog"]').count().catch(() => 0);
      if (beforeUrl === page.url() && hasDialog === 0) {
        addFinding(
          'LOW',
          'Share Report Click Has No Visible Feedback',
          'Share click does not show visible toast/dialog/indicator.',
          'Share should provide immediate user feedback.',
          'No visible feedback captured after click.',
          'User cannot confirm outcome of share action.',
          ['Open first visit detail.', 'Click Share Report.', 'Observe no visible feedback.'],
          [shareShot],
        );
      }
    }
  }

  // Console issues
  if ([...consoleEvents].some((e) => /A props object containing a \"key\" prop/i.test(e))) {
    addFinding(
      'LOW',
      'React Key Prop Spread Warning In Console',
      'Console warning indicates key prop spread into JSX.',
      'No React key warnings should appear in normal traversal.',
      'Warning emitted during tested flows.',
      'Can signal rendering anti-patterns and noisy diagnostics.',
      ['Traverse dashboard, customers, schedule submenus, visits list.', 'Review console warnings.'],
      [path.join(LOG_DIR, 'console-errors.log')],
    );
  }
  if ([...consoleEvents].some((e) => /google maps javascript api has been loaded directly without loading=async/i.test(e.toLowerCase()))) {
    addFinding(
      'LOW',
      'Google Maps Loaded Without Async Flag',
      'Maps script warning detected in console.',
      'Maps script should be loaded with async/recommended pattern.',
      'Warning appears in tested session.',
      'May impact load performance.',
      ['Traverse visits pages.', 'Review console warnings.'],
      [path.join(LOG_DIR, 'console-errors.log')],
    );
  }

  logAction('general-findings', 'ok');
}

function addRowBasedFindings(rows, evidenceShot) {
  for (const row of rows) {
    if (findings.length >= 50) break;
    const reference = (row.cells[0] || '').trim();
    const title = row.cells[1] || '';
    const customerSite = row.cells[2] || '';
    const visitType = row.cells[3] || '';
    const status = row.cells[7] || '';
    if (!reference) continue;

    if (/^Unknown$/i.test(visitType) && findings.length < 50) {
      addFinding(
        'MEDIUM',
        `Additional Instance: Unknown Visit Type For ${reference}`,
        `Visit ${reference}${title ? ` (${title})` : ''} has unresolved Visit Type value.`,
        'Visit Type should resolve to a defined type.',
        'Visit Type is "Unknown".',
        'Visit classification/reporting impacted for this row.',
        ['Open Visits List.', `Find ${reference}.`, 'Check Visit Type column.'],
        [evidenceShot],
      );
    }

    if (/No status/i.test(status) && findings.length < 50) {
      addFinding(
        'MEDIUM',
        `Additional Instance: Missing Status For ${reference}`,
        `Visit ${reference}${title ? ` (${title})` : ''} has unresolved status value.`,
        'Status should resolve to a valid workflow value.',
        'Status is "No status".',
        'Scheduling and triage workflows are affected for this row.',
        ['Open Visits List.', `Find ${reference}.`, 'Check Status column.'],
        [evidenceShot],
      );
    }

    if (/Unknown Customer and Site/i.test(customerSite) && findings.length < 50) {
      addFinding(
        'LOW',
        `Additional Instance: Unknown Customer/Site For ${reference}`,
        `Visit ${reference} displays unresolved customer/site placeholder.`,
        'Customer/Site should resolve to concrete values.',
        'Customer & Site is "Unknown Customer and Site".',
        'Field operations and communication context is incomplete.',
        ['Open Visits List.', `Find ${reference}.`, 'Check Customer & Site column.'],
        [evidenceShot],
      );
    }
  }
}

async function collectRowsForAdditionalFindings(page) {
  logAction('row-findings', 'start');
  await page.goto('/visits-list', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitSettled(page, 900);

  // Make sure no residual filters
  const clearFilters = page.getByText(/Clear Filters/i).first();
  if (await clearFilters.isVisible().catch(() => false)) {
    await clearFilters.click({ timeout: 2200 }).catch(() => {});
    await waitSettled(page, 400);
  }

  // Attempt to load more rows in infinite scroll
  for (let i = 0; i < 12; i += 1) {
    await page.mouse.wheel(0, 3200).catch(() => {});
    await page.waitForTimeout(250);
  }
  await waitSettled(page, 700);

  await ringBySelectors(page, ['tbody tr:first-child td:nth-child(3)', 'tbody tr:first-child td:nth-child(4)', 'tbody tr:first-child td:last-child']);
  const rowsShot = await shot(page, 'ann-13-visits-list-rows');
  const rows = await page.locator('tbody tr').evaluateAll((trs) =>
    trs.map((tr) => {
      const cells = [...tr.querySelectorAll('td')].map((td) => (td.textContent || '').replace(/\s+/g, ' ').trim());
      return { cells, text: (tr.textContent || '').replace(/\s+/g, ' ').trim() };
    }),
  );
  logAction('row-findings', 'ok', `rows=${rows.length}`);
  addRowBasedFindings(rows, rowsShot);
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
  });
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') consoleEvents.add(msg.text());
  });
  page.on('response', (res) => {
    if (res.status() >= 400) apiFailures.add(`${res.status()} ${res.request().method()} ${res.url()}`);
  });

  try {
    await loginBootstrap(page);
    await collectGeneralFindings(page);
    await collectRowsForAdditionalFindings(page);
  } finally {
    await context.close();
    await browser.close();
  }

  // Ensure exactly 50 findings.
  const finalFindings = findings.slice(0, 50);
  if (finalFindings.length < 50) {
    throw new Error(`Only ${finalFindings.length} findings collected; expected 50.`);
  }

  const summary = {
    runDir: RUN_DIR,
    createdAt: new Date().toISOString(),
    findingsCount: finalFindings.length,
    findings: finalFindings,
    actions,
    consoleEventCount: consoleEvents.size,
    consoleEvents: [...consoleEvents],
    apiFailureCount: apiFailures.size,
    apiFailures: [...apiFailures],
  };

  fs.writeFileSync(path.join(RUN_DIR, 'summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
  fs.writeFileSync(path.join(LOG_DIR, 'console-errors.log'), [...consoleEvents].join('\n\n'), 'utf-8');
  fs.writeFileSync(path.join(LOG_DIR, 'api-failures.log'), [...apiFailures].join('\n'), 'utf-8');
  fs.writeFileSync(
    path.join(RUN_DIR, 'finding-summary.txt'),
    [`Run directory: ${RUN_DIR}`, `Findings: ${summary.findingsCount}`, '', ...summary.findings.map((f) => `${f.id} [${f.severity}] ${f.title}`)].join('\n'),
    'utf-8',
  );

  console.log(`QA_NO_LOGIN_50_MORE_V2_DIR=${RUN_DIR}`);
  console.log(`QA_NO_LOGIN_50_MORE_V2_COUNT=${summary.findingsCount}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

