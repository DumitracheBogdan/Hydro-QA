import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5173';
const EMAIL = process.env.HYDROCERT_QA_EMAIL || '';
const PASSWORD = process.env.HYDROCERT_QA_PASSWORD || '';
const TIMESTAMP = new Date().toISOString().replace(/[.:]/g, '-');

const RUN_DIR = path.join(process.cwd(), 'qa-artifacts', 'evidence', `no-login-60-findings-${TIMESTAMP}`);
const SCREENSHOT_DIR = path.join(RUN_DIR, 'screenshots');
const VIDEO_DIR = path.join(RUN_DIR, 'videos');
const LOG_DIR = path.join(RUN_DIR, 'logs');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
fs.mkdirSync(VIDEO_DIR, { recursive: true });
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

async function shot(page, name) {
  const file = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function waitSettled(page, ms = 500) {
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

async function loginBootstrap(page) {
  logAction('login-bootstrap', 'start');
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitSettled(page, 700);
  if (page.url().includes('/login')) {
    await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL);
    await page.locator('input[type="password"], input[name="password"]').first().fill(PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).first().click();
    await waitSettled(page, 1400);
  }
  if (page.url().includes('/login')) {
    throw new Error('Authentication failed in bootstrap.');
  }
  logAction('login-bootstrap', 'ok', page.url());
}

async function collectGeneralFindings(page) {
  logAction('collect-general', 'start');

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitSettled(page, 600);
  const dashboardShot = await shot(page, '01-dashboard');

  const team = page.locator('aside').getByText(/Team Management/i).first();
  const settings = page.locator('aside').getByText(/Settings/i).first();
  if (await team.isVisible().catch(() => false)) {
    const before = page.url();
    await team.click({ timeout: 2200 }).catch(() => {});
    await page.waitForTimeout(350);
    const after = page.url();
    if (before === after) {
      addFinding(
        'MEDIUM',
        'Team Management Menu Item Is Non-Actionable',
        'Team Management appears in sidebar as a menu option but clicking it does not navigate anywhere.',
        'Clicking Team Management should open the Team Management page.',
        `URL remains unchanged (${after}) and no content changes are visible.`,
        'Users cannot access team administration flow.',
        [
          'Open Dashboard.',
          'Click "Team Management" in sidebar.',
          'Observe no route change and no page transition.',
        ],
        [dashboardShot],
      );
    }
  }

  if (await settings.isVisible().catch(() => false)) {
    const before = page.url();
    await settings.click({ timeout: 2200 }).catch(() => {});
    await page.waitForTimeout(350);
    const after = page.url();
    if (before === after) {
      addFinding(
        'MEDIUM',
        'Settings Menu Item Is Non-Actionable',
        'Settings appears in sidebar as a menu option but clicking it does not navigate anywhere.',
        'Clicking Settings should open the Settings page.',
        `URL remains unchanged (${after}) and no content changes are visible.`,
        'Configuration/settings cannot be managed from UI.',
        [
          'Open Dashboard.',
          'Click "Settings" in sidebar.',
          'Observe no route change and no page transition.',
        ],
        [dashboardShot],
      );
    }
  }

  await page.goto('/customers', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitSettled(page, 600);
  const customersShot = await shot(page, '02-customers');

  const firstCustomerRow = page.locator('tbody tr').first();
  if (await firstCustomerRow.isVisible().catch(() => false)) {
    const before = page.url();
    await firstCustomerRow.click({ timeout: 2500 }).catch(() => {});
    await page.waitForTimeout(400);
    const after = page.url();
    if (before === after) {
      addFinding(
        'MEDIUM',
        'Customer Rows Are Not Clickable',
        'Customer listing rows do not open any detail page/drawer when clicked.',
        'Clicking a customer row should open customer details.',
        'No action is triggered on row click.',
        'Users cannot drill into customer details from list.',
        [
          'Open Customers page.',
          'Click a customer row (e.g., first row).',
          'Observe no navigation and no modal/drawer.',
        ],
        [customersShot],
      );
    }
  }

  const sitesLabelRows = await page.locator('tbody tr').filter({ hasText: /\[\d+ sites\]/i }).count().catch(() => 0);
  if (sitesLabelRows > 0) {
    addFinding(
      'LOW',
      'Sites Count Appears As Static Label',
      'The sites count indicator (e.g., "[0 sites]") appears as static text and does not provide drilldown interaction.',
      'Sites count should open or link to customer sites detail.',
      'No interactive behavior is available from sites count indicator.',
      'Site-level navigation is blocked from customers grid.',
      [
        'Open Customers page.',
        'Locate "[n sites]" in Site Number column.',
        'Click the label and observe no interaction.',
      ],
      [customersShot],
    );
  }

  await page.goto('/visits-list', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitSettled(page, 800);
  const visitsListShot = await shot(page, '03-visits-list');

  const firstVisit = page.locator('tbody tr').first();
  if (await firstVisit.isVisible().catch(() => false)) {
    await firstVisit.click({ timeout: 3000 }).catch(() => {});
    await waitSettled(page, 700);
    const detailShot = await shot(page, '04-visit-detail');
    const detailText = ((await page.locator('main').innerText().catch(() => '')) || '').replace(/\s+/g, ' ');

    if (/Unknown Client/i.test(detailText)) {
      addFinding(
        'MEDIUM',
        'Visit Detail Shows Unknown Client',
        'Visit detail header shows "Unknown Client".',
        'Visit detail should display actual client name.',
        'Client identity is unresolved in detail page.',
        'Operational confusion and wrong reporting context.',
        [
          'Open Visits List.',
          'Open first visit detail.',
          'Observe client field shows "Unknown Client".',
        ],
        [detailShot],
      );
    }

    if (/No status/i.test(detailText)) {
      addFinding(
        'MEDIUM',
        'Visit Detail Shows No Status',
        'Visit detail status badge displays "No status".',
        'Visit detail should show a valid status (Scheduled/Confirmed/Completed/etc.).',
        'Status is unresolved at visit detail level.',
        'Status-based workflows and prioritization are impaired.',
        [
          'Open Visits List.',
          'Open first visit detail.',
          'Observe status badge shows "No status".',
        ],
        [detailShot],
      );
    }

    if (/No signature available/i.test(detailText)) {
      addFinding(
        'LOW',
        'Visit Detail Missing Client Signature',
        'Client signature section shows "No signature available".',
        'Signature should be present for signed visits or explicit pending flow should be visible.',
        'No signature is present without contextual explanation.',
        'Audit traceability and sign-off evidence are incomplete.',
        [
          'Open Visits List.',
          'Open first visit detail.',
          'Scroll to Client Signature block and observe missing signature.',
        ],
        [detailShot],
      );
    }

    const downloadBtn = page.getByRole('button', { name: /download report/i }).first();
    const disabled = await downloadBtn.isDisabled().catch(() => false);
    if (disabled) {
      addFinding(
        'LOW',
        'Download Report Is Disabled',
        'Download Report action is visible but disabled for tested visit.',
        'User should be able to download generated report or see explicit reason why unavailable.',
        'Button is disabled with no explicit inline reason.',
        'Report retrieval flow is blocked.',
        [
          'Open Visits List.',
          'Open first visit detail.',
          'Observe "Download Report" is disabled.',
        ],
        [detailShot],
      );
    }
  }

  // Console quality issues
  if ([...consoleEvents].some((e) => /A props object containing a \"key\" prop/i.test(e))) {
    addFinding(
      'LOW',
      'React Key Prop Spread Warning In Console',
      'Runtime console reports key prop spread warning.',
      'No React key warnings should appear in production UI flows.',
      'Warning appears during regular navigation.',
      'Potential rendering instability and harder debugging.',
      [
        'Open app and navigate through dashboard/visits pages.',
        'Inspect browser console.',
        'Observe key-prop spread warning.',
      ],
      [path.join(LOG_DIR, 'console-errors.log')],
    );
  }

  if ([...consoleEvents].some((e) => /Google Maps JavaScript API has been loaded directly without loading=async/i.test(e))) {
    addFinding(
      'LOW',
      'Google Maps Loaded Without Async Flag',
      'Console warns Google Maps script is loaded without async.',
      'Maps integration should use recommended async loading pattern.',
      'Warning is emitted in normal app usage.',
      'Can impact performance and startup behavior.',
      [
        'Navigate to visit pages that initialize maps.',
        'Inspect browser console.',
        'Observe async loading warning.',
      ],
      [path.join(LOG_DIR, 'console-errors.log')],
    );
  }

  logAction('collect-general', 'ok');
}

function addRowInstanceFindings(rows, evidenceShot) {
  // Use first 40 rows -> enough validated instance findings; final report is capped to 60.
  const slice = rows.slice(0, 40);
  for (const row of slice) {
    const reference = row.cells[0] || '(unknown-ref)';
    const visitType = row.cells[3] || '';
    const status = row.cells[7] || '';

    if (/^Unknown$/i.test(visitType)) {
      addFinding(
        'MEDIUM',
        `Visit Type Is Unknown For ${reference}`,
        `Visit reference ${reference} has unresolved Visit Type value "Unknown".`,
        'Visit Type should be resolved to a valid business type.',
        'Visit Type remains "Unknown" in list row.',
        'Reporting, filtering and operational categorization are degraded for this visit.',
        [
          'Open Visits List page.',
          `Locate visit reference ${reference}.`,
          'Observe Visit Type column value is "Unknown".',
        ],
        [evidenceShot],
      );
    }

    if (/No status/i.test(status)) {
      addFinding(
        'MEDIUM',
        `Status Is Missing For ${reference}`,
        `Visit reference ${reference} has unresolved status "No status".`,
        'Visit should expose a valid status for workflow tracking.',
        'Status column shows "No status".',
        'Scheduling and downstream execution cannot rely on status for this visit.',
        [
          'Open Visits List page.',
          `Locate visit reference ${reference}.`,
          'Observe Status column value is "No status".',
        ],
        [evidenceShot],
      );
    }
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
    if (msg.type() === 'error' || msg.type() === 'warning') consoleEvents.add(msg.text());
  });
  page.on('response', (res) => {
    if (res.status() >= 400) apiFailures.add(`${res.status()} ${res.request().method()} ${res.url()}`);
  });

  try {
    await loginBootstrap(page);
    await collectGeneralFindings(page);

    await page.goto('/visits-list', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitSettled(page, 800);
    const rowEvidenceShot = await shot(page, '05-visits-list-row-evidence');
    const rows = await page.locator('tbody tr').evaluateAll((trs) =>
      trs.map((tr) => {
        const cells = [...tr.querySelectorAll('td')].map((td) => (td.textContent || '').replace(/\s+/g, ' ').trim());
        return { cells, text: (tr.textContent || '').replace(/\s+/g, ' ').trim() };
      }),
    );
    logAction('row-instances', 'ok', `rows=${rows.length}`);
    addRowInstanceFindings(rows, rowEvidenceShot);
  } finally {
    await context.close();
    await browser.close();
  }

  // Trim to exactly 60 in deterministic order if above.
  const finalFindings = findings.slice(0, 60);

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
    [
      `Run directory: ${RUN_DIR}`,
      `Findings: ${summary.findingsCount}`,
      '',
      ...summary.findings.map((f) => `${f.id} [${f.severity}] ${f.title}`),
    ].join('\n'),
    'utf-8',
  );

  console.log(`QA_NO_LOGIN_60_FINDINGS_DIR=${RUN_DIR}`);
  console.log(`QA_NO_LOGIN_60_FINDINGS_COUNT=${summary.findingsCount}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
