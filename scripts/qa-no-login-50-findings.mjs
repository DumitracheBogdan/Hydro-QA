import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5173';
const EMAIL = process.env.HYDROCERT_QA_EMAIL || '';
const PASSWORD = process.env.HYDROCERT_QA_PASSWORD || '';
const TIMESTAMP = new Date().toISOString().replace(/[.:]/g, '-');

const RUN_DIR = path.join(process.cwd(), 'qa-artifacts', 'evidence', `no-login-50-findings-${TIMESTAMP}`);
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
            box-shadow:0 0 0 3px rgba(255,30,30,0.20) !important;
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

async function ringBySelectors(page, selectors = []) {
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
    const count = await locator.count();
    if (!count) return false;
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
    await waitSettled(page, 1600);
  }
  if (page.url().includes('/login')) {
    throw new Error('Authentication failed in bootstrap.');
  }
  logAction('login-bootstrap', 'ok', page.url());
}

async function collectGeneralFindings(page) {
  logAction('collect-general', 'start');

  // Dashboard
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitSettled(page, 700);
  await ringBySelectors(page, ['aside']);
  const dashboardMenuShot = await shot(page, 'ann-01-dashboard-sidebar');

  const team = page.locator('aside').getByText(/Team Management/i).first();
  const settings = page.locator('aside').getByText(/Settings/i).first();
  if (await team.isVisible().catch(() => false)) {
    const before = page.url();
    await team.click({ timeout: 2200 }).catch(() => {});
    await page.waitForTimeout(400);
    if (before === page.url()) {
      addFinding(
        'MEDIUM',
        'Team Management Menu Item Is Non-Actionable',
        'Team Management is displayed but clicking it does not navigate.',
        'Menu item should open Team Management page.',
        'URL/content remain unchanged after click.',
        'Team administration path is blocked.',
        ['Open Dashboard.', 'Click Team Management.', 'Observe no route/page transition.'],
        [dashboardMenuShot],
      );
    }
  }

  if (await settings.isVisible().catch(() => false)) {
    const before = page.url();
    await settings.click({ timeout: 2200 }).catch(() => {});
    await page.waitForTimeout(400);
    if (before === page.url()) {
      addFinding(
        'MEDIUM',
        'Settings Menu Item Is Non-Actionable',
        'Settings is displayed but clicking it does not navigate.',
        'Menu item should open Settings page.',
        'URL/content remain unchanged after click.',
        'Configuration path is blocked from UI.',
        ['Open Dashboard.', 'Click Settings.', 'Observe no route/page transition.'],
        [dashboardMenuShot],
      );
    }
  }

  const firstJobRow = page.locator('table tbody tr').first();
  if (await firstJobRow.isVisible().catch(() => false)) {
    await ringBySelectors(page, ['table tbody tr:first-child']);
    const jobsRowShot = await shot(page, 'ann-02-dashboard-first-job-row');
    const before = page.url();
    await firstJobRow.click({ timeout: 2200 }).catch(() => {});
    await page.waitForTimeout(350);
    if (before === page.url()) {
      addFinding(
        'LOW',
        'Dashboard Job Rows Are Not Clickable',
        'Rows in Latest Jobs table do not open job details.',
        'Clicking job rows should open job details screen.',
        'No navigation/drawer/modal is triggered.',
        'Users cannot drill-down from dashboard jobs widget.',
        ['Open Dashboard.', 'Click first row in Latest Jobs.', 'Observe no navigation.'],
        [jobsRowShot],
      );
    }
  }

  // Customers
  await page.goto('/customers', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitSettled(page, 700);
  await ringBySelectors(page, ['tbody tr:first-child', 'tbody tr:first-child td:last-child']);
  const customersShot = await shot(page, 'ann-03-customers-row-sites');

  const customerRow = page.locator('tbody tr').first();
  if (await customerRow.isVisible().catch(() => false)) {
    const before = page.url();
    await customerRow.click({ timeout: 2200 }).catch(() => {});
    await page.waitForTimeout(350);
    if (before === page.url()) {
      addFinding(
        'MEDIUM',
        'Customer Rows Are Not Clickable',
        'Customer table row click does not open details.',
        'Customer row should open a detail view.',
        'No route change and no detail panel appears.',
        'Customer detail workflow is blocked.',
        ['Open Customers.', 'Click first customer row.', 'Observe no transition.'],
        [customersShot],
      );
    }
  }

  const siteLabel = page.locator('tbody tr td').filter({ hasText: /\[\d+\s*sites\]/i }).first();
  if (await siteLabel.isVisible().catch(() => false)) {
    const before = page.url();
    await siteLabel.click({ timeout: 2200 }).catch(() => {});
    await page.waitForTimeout(350);
    if (before === page.url()) {
      addFinding(
        'LOW',
        'Sites Count Appears As Static Label',
        'Sites count chip/label is not interactive.',
        'Sites count should link to site-level details.',
        'Label click has no effect.',
        'Site drill-down from customers grid is unavailable.',
        ['Open Customers.', 'Click [n sites] label.', 'Observe no interaction.'],
        [customersShot],
      );
    }
  }

  // Visits list + detail
  await page.goto('/visits-list', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitSettled(page, 900);
  await ringBySelectors(page, ['tbody tr:first-child td:nth-child(4)', 'tbody tr:first-child td:last-child']);
  const visitsRowsShot = await shot(page, 'ann-04-visits-list-row-type-status');

  const searchInput = page.locator('input[placeholder*="Search visits"]').first();
  if (await searchInput.isVisible().catch(() => false)) {
    const beforeRows = await page.locator('tbody tr').count().catch(() => 0);
    await searchInput.fill('zzzz-qa-no-hit-2026').catch(() => {});
    await page.keyboard.press('Enter').catch(() => {});
    await waitSettled(page, 600);
    const afterRows = await page.locator('tbody tr').count().catch(() => 0);
    await ringBySelectors(page, ['input[placeholder*="Search visits"]', 'tbody']);
    const searchShot = await shot(page, 'ann-05-visits-search-nohit');
    if (beforeRows > 0 && afterRows >= beforeRows) {
      addFinding(
        'MEDIUM',
        'Visits Search Does Not Filter Results For Non-Matching Query',
        'Search input accepts non-matching text but rows remain unchanged.',
        'Non-matching query should return zero rows / empty state.',
        `Rows before search: ${beforeRows}; rows after search: ${afterRows}.`,
        'Users cannot trust search when locating specific visits.',
        ['Open Visits List.', 'Search for non-existing token.', 'Observe table remains unfiltered.'],
        [searchShot],
      );
    }

    // Try clear filters stability check
    const clearBtn = page.getByText(/Clear Filters/i).first();
    if (await clearBtn.isVisible().catch(() => false)) {
      await clearBtn.click({ timeout: 2500 }).catch(() => {});
      await page.waitForTimeout(500);
      const bodyLen = await page
        .evaluate(() => (document.body?.innerText || '').trim().length)
        .catch(() => 0);
      await ringBySelectors(page, ['main, body']);
      const clearShot = await shot(page, 'ann-06-visits-clear-filters-state');
      if (bodyLen < 40) {
        addFinding(
          'HIGH',
          'Visits Clear Filters Can Blank The Page',
          'After clicking Clear Filters, page may collapse into empty/blank state.',
          'Clear Filters should reset controls and keep list visible.',
          'Page textual content drops to near-empty state.',
          'User flow is blocked until manual refresh.',
          ['Open Visits List.', 'Apply any search/filter.', 'Click Clear Filters and observe page state.'],
          [clearShot],
        );
      }
    }
  }

  const firstVisitRow = page.locator('tbody tr').first();
  if (await firstVisitRow.isVisible().catch(() => false)) {
    await firstVisitRow.click({ timeout: 3000 }).catch(() => {});
    await waitSettled(page, 800);
    await ensureRingStyle(page);
    await clearRings(page);
    await ringByLocator(page.getByText(/Unknown Client/i).first());
    await ringByLocator(page.getByText(/^No status$/i).first());
    await ringByLocator(page.getByRole('button', { name: /Download Report/i }).first());
    const detailHeaderShot = await shot(page, 'ann-07-visit-detail-header');
    const detailText = ((await page.locator('main').innerText().catch(() => '')) || '').replace(/\s+/g, ' ');

    if (/Unknown Client/i.test(detailText)) {
      addFinding(
        'MEDIUM',
        'Visit Detail Shows Unknown Client',
        'Visit detail displays unresolved client placeholder.',
        'Actual client name should be rendered.',
        'Client field renders "Unknown Client".',
        'Operational context is incomplete for field engineers.',
        ['Open Visits List.', 'Open first visit detail.', 'Inspect Client field.'],
        [detailHeaderShot],
      );
    }

    if (/No status/i.test(detailText)) {
      addFinding(
        'MEDIUM',
        'Visit Detail Shows No Status',
        'Visit detail status badge is unresolved.',
        'A valid visit status should be displayed.',
        'Status badge renders "No status".',
        'Status-based planning and prioritization become unreliable.',
        ['Open Visits List.', 'Open first visit detail.', 'Inspect status badge.'],
        [detailHeaderShot],
      );
    }

    const downloadBtn = page.getByRole('button', { name: /Download Report/i }).first();
    if (await downloadBtn.isVisible().catch(() => false)) {
      const disabled = await downloadBtn.isDisabled().catch(() => false);
      if (disabled) {
        addFinding(
          'LOW',
          'Download Report Is Disabled On Visit Detail',
          'Download report action is visible but not usable.',
          'Action should be enabled or explicit reason should be shown.',
          'Button remains disabled without inline reason.',
          'Users cannot retrieve visit report from detail view.',
          ['Open Visits List.', 'Open first visit detail.', 'Inspect Download Report button state.'],
          [detailHeaderShot],
        );
      }
    }

    if (/No signature available/i.test(detailText)) {
      await ensureRingStyle(page);
      await clearRings(page);
      await ringByLocator(page.getByText(/No signature available/i).first());
      const signatureShot = await shot(page, 'ann-08-visit-detail-signature');
      addFinding(
        'LOW',
        'Visit Detail Missing Client Signature',
        'Signature block indicates missing signature.',
        'Signed/unsigned state should include clear actionable flow.',
        'Signature panel shows "No signature available".',
        'Audit sign-off evidence is incomplete for this visit.',
        ['Open Visits List.', 'Open first visit detail.', 'Scroll to Client Signature section.'],
        [signatureShot],
      );
    }

    // Share report behavior
    const shareBtn = page.getByRole('button', { name: /Share Report/i }).first();
    if (await shareBtn.isVisible().catch(() => false)) {
      const before = page.url();
      await shareBtn.click({ timeout: 2200 }).catch(() => {});
      await page.waitForTimeout(600);
      const after = page.url();
      const hasDialog = await page.locator('[role="dialog"]').count().catch(() => 0);
      if (before === after && hasDialog === 0) {
        await ensureRingStyle(page);
        await clearRings(page);
        await ringByLocator(shareBtn);
        const shareShot = await shot(page, 'ann-09-visit-detail-share-report');
        addFinding(
          'LOW',
          'Share Report Has No Visible Feedback',
          'Share action click does not show modal/toast/confirmation in tested flow.',
          'Share action should provide immediate user feedback.',
          'No visible UI feedback captured after click.',
          'User cannot confirm whether share succeeded.',
          ['Open Visits List.', 'Open first visit detail.', 'Click Share Report and observe response.'],
          [shareShot],
        );
      }
    }

    // Attachments upload picker
    const attachmentsTab = page.getByRole('button', { name: /Attachments/i }).first();
    if (await attachmentsTab.isVisible().catch(() => false)) {
      await attachmentsTab.click({ timeout: 2500 }).catch(() => {});
      await waitSettled(page, 500);
      const uploadBtn = page.getByRole('button', { name: /^Upload$/i }).first();
      if (await uploadBtn.isVisible().catch(() => false)) {
        const chooser = page.waitForEvent('filechooser', { timeout: 1500 }).catch(() => null);
        await uploadBtn.click({ timeout: 2200 }).catch(() => {});
        const fileChooser = await chooser;
        if (!fileChooser) {
          await ensureRingStyle(page);
          await clearRings(page);
          await ringByLocator(uploadBtn);
          const uploadShot = await shot(page, 'ann-10-attachments-upload-no-picker');
          addFinding(
            'MEDIUM',
            'Attachments Upload Does Not Open File Picker',
            'Upload button is present but no file chooser opens in tested page state.',
            'Upload should open native file picker.',
            'No file chooser event is triggered.',
            'Attachment flow is blocked for evidence/documents.',
            ['Open visit detail.', 'Go to Attachments tab.', 'Click Upload and observe no picker.'],
            [uploadShot],
          );
        }
      }
    }
  }

  // Add new visit screen UI check (previously reported)
  await page.goto('/visits', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitSettled(page, 700);
  const addVisitBtn = page.getByRole('button', { name: /Add New Visit/i }).first();
  if (await addVisitBtn.isVisible().catch(() => false)) {
    await addVisitBtn.click({ timeout: 2600 }).catch(() => {});
    await waitSettled(page, 900);
    const siteInput = page.locator('input[placeholder*="Search Site"]').first();
    if (await siteInput.isVisible().catch(() => false)) {
      await siteInput.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(400);
      const firstOption = page.locator('[role="option"]').first();
      if (await firstOption.isVisible().catch(() => false)) {
        await firstOption.click({ timeout: 2200 }).catch(() => {});
        await page.waitForTimeout(500);
        const staleOptionVisible = await page.locator('[role="option"]').first().isVisible().catch(() => false);
        if (staleOptionVisible) {
          await ringBySelectors(page, ['input[placeholder*="Search Site"]', '[role="option"]']);
          const addVisitShot = await shot(page, 'ann-11-add-visit-site-dropdown-persist');
          addFinding(
            'MEDIUM',
            'Site Dropdown Remains Visible After Selection',
            'Site dropdown list persists after selecting an option.',
            'Dropdown should close automatically after selection.',
            'Dropdown options remain visible and can overlap other controls.',
            'Form usability is degraded and users can misclick.',
            ['Open Add New Visit.', 'Select site from dropdown.', 'Observe dropdown remains visible.'],
            [addVisitShot],
          );
        }
      }
    }
  }

  // Console findings
  if ([...consoleEvents].some((e) => /A props object containing a \"key\" prop/i.test(e))) {
    addFinding(
      'LOW',
      'React Key Prop Spread Warning In Console',
      'Runtime console warning indicates key prop is spread into JSX.',
      'No React key warnings should appear in tested flows.',
      'Warning appears during regular navigation.',
      'Frontend quality/reliability risk and noisy diagnostics.',
      ['Navigate dashboard/visits pages.', 'Open console logs.', 'Observe React key spread warning.'],
      [path.join(LOG_DIR, 'console-errors.log')],
    );
  }

  if ([...consoleEvents].some((e) => /Google Maps JavaScript API has been loaded directly without loading=async/i.test(e))) {
    addFinding(
      'LOW',
      'Google Maps Loaded Without Async Flag',
      'Console warns Maps API is loaded without async loading pattern.',
      'Maps script should use recommended async loading.',
      'Warning appears in standard usage.',
      'Potential startup/performance impact.',
      ['Open app pages using map components.', 'Inspect console warnings.'],
      [path.join(LOG_DIR, 'console-errors.log')],
    );
  }

  logAction('collect-general', 'ok');
}

function addRowInstanceFindings(rows, evidenceShot) {
  for (const row of rows) {
    if (findings.length >= 50) break;
    const reference = row.cells[0] || '(unknown-ref)';
    const customerSite = row.cells[2] || '';
    const visitType = row.cells[3] || '';
    const status = row.cells[7] || '';

    if (/^Unknown$/i.test(visitType) && findings.length < 50) {
      addFinding(
        'MEDIUM',
        `Visit Type Is Unknown For ${reference}`,
        `Visit ${reference} shows unresolved Visit Type.`,
        'Visit Type should map to a defined business type.',
        'Visit Type is displayed as "Unknown".',
        'Filtering/reporting by type is unreliable for this visit.',
        ['Open Visits List.', `Locate ${reference}.`, 'Check Visit Type column.'],
        [evidenceShot],
      );
    }

    if (/No status/i.test(status) && findings.length < 50) {
      addFinding(
        'MEDIUM',
        `Status Is Missing For ${reference}`,
        `Visit ${reference} does not expose workflow status.`,
        'Visit should expose valid status (Scheduled/Confirmed/etc.).',
        'Status column shows "No status".',
        'Execution workflow and prioritization are impaired.',
        ['Open Visits List.', `Locate ${reference}.`, 'Check Status column.'],
        [evidenceShot],
      );
    }

    if (/Unknown Customer and Site/i.test(customerSite) && findings.length < 50) {
      addFinding(
        'LOW',
        `Customer/Site Is Unknown For ${reference}`,
        `Visit ${reference} has unresolved customer/site identity.`,
        'Customer and site should be resolved for each visit row.',
        'Customer & Site column shows "Unknown Customer and Site".',
        'Route planning and customer communication are error-prone.',
        ['Open Visits List.', `Locate ${reference}.`, 'Check Customer & Site column.'],
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
    await waitSettled(page, 900);
    await ringBySelectors(page, ['tbody tr:first-child td:nth-child(4)', 'tbody tr:first-child td:last-child', 'tbody tr:first-child td:nth-child(3)']);
    const rowEvidenceShot = await shot(page, 'ann-12-visits-list-row-instance-evidence');
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

  const finalFindings = findings.slice(0, 50);
  if (finalFindings.length < 50) {
    throw new Error(`Collected only ${finalFindings.length} findings, expected 50.`);
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
    [
      `Run directory: ${RUN_DIR}`,
      `Findings: ${summary.findingsCount}`,
      '',
      ...summary.findings.map((f) => `${f.id} [${f.severity}] ${f.title}`),
    ].join('\n'),
    'utf-8',
  );

  console.log(`QA_NO_LOGIN_50_FINDINGS_DIR=${RUN_DIR}`);
  console.log(`QA_NO_LOGIN_50_FINDINGS_COUNT=${summary.findingsCount}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

