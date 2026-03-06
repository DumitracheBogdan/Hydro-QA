
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5173';
const EMAIL = process.env.HYDROCERT_QA_EMAIL || '';
const PASSWORD = process.env.HYDROCERT_QA_PASSWORD || '';
const TARGET_COUNT = 60;
const TIMESTAMP = new Date().toISOString().replace(/[.:]/g, '-');

const RUN_DIR = path.join(process.cwd(), 'qa-artifacts', 'evidence', `no-login-60-unique-findings-${TIMESTAMP}`);
const SCREENSHOT_DIR = path.join(RUN_DIR, 'screenshots');
const LOG_DIR = path.join(RUN_DIR, 'logs');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });

const findings = [];
const findingKeys = new Set();
const actions = [];
const consoleEvents = new Set();
const apiFailures = new Set();
let evidenceIndex = 1;

function logAction(step, status, details = '') {
  actions.push({ step, status, details, at: new Date().toISOString() });
  console.log(`${status.toUpperCase()} | ${step}${details ? ` | ${details}` : ''}`);
}

function normalize(str) {
  return String(str || '').trim().toLowerCase();
}

function addFinding({
  severity = 'LOW',
  key,
  title,
  description,
  expected,
  actual,
  impact,
  steps = [],
  evidence = [],
  area = 'General',
}) {
  const dedupeKey = key || normalize(`${title}|${actual}|${area}`);
  if (!title || findingKeys.has(dedupeKey)) return false;
  findingKeys.add(dedupeKey);
  findings.push({
    id: `BUG-${String(findings.length + 1).padStart(3, '0')}`,
    severity,
    area,
    title,
    description,
    expected,
    actual,
    impact,
    steps,
    evidence,
  });
  return true;
}

async function waitSettled(page, ms = 700) {
  await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

async function ensureRingStyle(page) {
  await page
    .evaluate(() => {
      const styleId = 'qa-red-ring-style';
      if (document.getElementById(styleId)) return;
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        [data-qa-ring='1'] {
          outline: 3px solid #ff1e1e !important;
          box-shadow: 0 0 0 4px rgba(255, 30, 30, 0.22) !important;
          border-radius: 9999px !important;
          position: relative !important;
        }
      `;
      document.head.appendChild(style);
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

async function ringSelectors(page, selectors = []) {
  await ensureRingStyle(page);
  await clearRings(page);
  if (!selectors.length) return;
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

async function ringLocator(locator) {
  await ensureRingStyle(locator.page());
  const count = await locator.count().catch(() => 0);
  if (count < 1) return false;
  await locator.first().evaluate((el) => el.setAttribute('data-qa-ring', '1')).catch(() => {});
  return true;
}

async function shot(page, name) {
  const safe = `${String(evidenceIndex).padStart(3, '0')}-${name}`.replace(/[^a-z0-9\-_.]/gi, '-');
  evidenceIndex += 1;
  const file = path.join(SCREENSHOT_DIR, `${safe}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function shotWithSelectors(page, name, selectors = []) {
  await ringSelectors(page, selectors);
  const file = await shot(page, name);
  await clearRings(page);
  return file;
}

async function loginBootstrap(page) {
  logAction('login-bootstrap', 'start');
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await waitSettled(page, 1200);

  if (page.url().includes('/login')) {
    await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL);
    await page.locator('input[type="password"], input[name="password"]').first().fill(PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).first().click();
    await waitSettled(page, 2000);
  }

  if (page.url().includes('/login')) {
    throw new Error('Authentication failed during bootstrap.');
  }

  logAction('login-bootstrap', 'ok', page.url());
}
async function checkCoreFlows(page) {
  logAction('core-flows', 'start');

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitSettled(page, 900);

  const teamLink = page.locator('aside').getByText(/Team Management/i).first();
  if (await teamLink.isVisible().catch(() => false)) {
    const before = page.url();
    await ringLocator(teamLink);
    const ev = await shot(page, 'sidebar-team-management-click');
    await clearRings(page);
    await teamLink.click({ timeout: 2500 }).catch(() => {});
    await page.waitForTimeout(500);
    if (before === page.url()) {
      addFinding({
        severity: 'MEDIUM',
        key: 'core-team-management-non-actionable',
        area: 'Navigation',
        title: 'Team Management Sidebar Item Is Visible But Non-Actionable',
        description: 'The Team Management item is displayed in the sidebar, but clicking it does not trigger navigation.',
        expected: 'Sidebar item should navigate to Team Management page.',
        actual: 'URL and content remain unchanged after click.',
        impact: 'Admin cannot access team configuration flow from primary navigation.',
        steps: ['Open Dashboard.', 'Click Team Management in sidebar.', 'Observe no route change.'],
        evidence: [ev],
      });
    }
  }

  const settingsLink = page.locator('aside').getByText(/Settings/i).first();
  if (await settingsLink.isVisible().catch(() => false)) {
    const before = page.url();
    await ringLocator(settingsLink);
    const ev = await shot(page, 'sidebar-settings-click');
    await clearRings(page);
    await settingsLink.click({ timeout: 2500 }).catch(() => {});
    await page.waitForTimeout(500);
    if (before === page.url()) {
      addFinding({
        severity: 'MEDIUM',
        key: 'core-settings-non-actionable',
        area: 'Navigation',
        title: 'Settings Sidebar Item Is Visible But Non-Actionable',
        description: 'The Settings menu item appears enabled but does not navigate.',
        expected: 'Click should open settings page.',
        actual: 'No page transition occurs after click.',
        impact: 'Configuration workflow is blocked from sidebar.',
        steps: ['Open Dashboard.', 'Click Settings in sidebar.', 'Observe no transition.'],
        evidence: [ev],
      });
    }
  }

  const firstJobRow = page.locator('table tbody tr').first();
  if (await firstJobRow.isVisible().catch(() => false)) {
    const before = page.url();
    await ringSelectors(page, ['table tbody tr:first-child']);
    const ev = await shot(page, 'dashboard-first-job-row-click');
    await clearRings(page);
    await firstJobRow.click({ timeout: 2500 }).catch(() => {});
    await page.waitForTimeout(500);
    if (before === page.url()) {
      addFinding({
        severity: 'LOW',
        key: 'core-dashboard-job-row-no-drilldown',
        area: 'Dashboard',
        title: 'Latest Jobs Rows Do Not Provide Drilldown Interaction',
        description: 'Rows in Latest Jobs table appear actionable but do not open detail.',
        expected: 'Click should open job details or related record.',
        actual: 'No modal, drawer, or navigation occurs.',
        impact: 'Users cannot investigate jobs directly from dashboard widget.',
        steps: ['Open Dashboard.', 'Click first row in Latest Jobs.', 'Observe no action.'],
        evidence: [ev],
      });
    }
  }

  await page.goto('/customers', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitSettled(page, 900);

  const customerRow = page.locator('tbody tr').first();
  if (await customerRow.isVisible().catch(() => false)) {
    const before = page.url();
    await ringSelectors(page, ['tbody tr:first-child']);
    const ev = await shot(page, 'customers-first-row-click');
    await clearRings(page);
    await customerRow.click({ timeout: 2500 }).catch(() => {});
    await page.waitForTimeout(500);
    if (before === page.url()) {
      addFinding({
        severity: 'MEDIUM',
        key: 'core-customers-row-no-detail',
        area: 'Customers',
        title: 'Customer List Rows Are Not Opening Customer Details',
        description: 'Customer table rows are static and do not drill into customer view.',
        expected: 'Click on row should open customer detail page.',
        actual: 'No visible action after row click.',
        impact: 'Customer management is limited to list view only.',
        steps: ['Open Customers.', 'Click first customer row.', 'Observe no navigation.'],
        evidence: [ev],
      });
    }
  }

  const sitesCount = page.locator('tbody tr td').filter({ hasText: /\[\d+\s*sites\]/i }).first();
  if (await sitesCount.isVisible().catch(() => false)) {
    const before = page.url();
    await ringLocator(sitesCount);
    const ev = await shot(page, 'customers-sites-count-click');
    await clearRings(page);
    await sitesCount.click({ timeout: 2500 }).catch(() => {});
    await page.waitForTimeout(500);
    if (before === page.url()) {
      addFinding({
        severity: 'LOW',
        key: 'core-customers-sites-count-static',
        area: 'Customers',
        title: 'Sites Counter Cell Looks Interactive But Acts As Static Text',
        description: 'The [n sites] label in customer grid does not open site list.',
        expected: 'Sites counter should navigate to customer site details.',
        actual: 'Cell click has no effect.',
        impact: 'Site-level navigation is missing from customer table.',
        steps: ['Open Customers.', 'Click [n sites] cell.', 'Observe no action.'],
        evidence: [ev],
      });
    }
  }

  await page.goto('/visits', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitSettled(page, 1000);

  const dayTruncated = await page.locator('text=/\.\.\./').count().catch(() => 0);
  if (dayTruncated > 0) {
    const ev = await shotWithSelectors(page, 'visits-day-truncated-labels', ['main']);
    addFinding({
      severity: 'LOW',
      key: 'core-visits-day-truncated-text',
      area: 'Schedule - Visits',
      title: 'Day View Displays Truncated Event Titles Without Inline Expansion',
      description: 'Multiple events are rendered with ellipsis in day calendar view.',
      expected: 'Event title should remain clear or have direct inline reveal mechanism.',
      actual: `Detected ${dayTruncated} truncated labels in day view.`,
      impact: 'Operators may confuse similarly prefixed event titles.',
      steps: ['Open Schedule > Visits (Day).', 'Inspect event labels.', 'Observe ellipsized labels.'],
      evidence: [ev],
    });
  }

  const eventCard = page.locator('div,span').filter({ hasText: /Schedul/i }).first();
  if (await eventCard.isVisible().catch(() => false)) {
    await eventCard.hover().catch(() => {});
    await page.waitForTimeout(300);
    const tooltip = page.locator('[role="tooltip"], .tooltip, [data-radix-popper-content-wrapper]').first();
    const tooltipText = await tooltip.innerText().catch(() => '');
    if (/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(tooltipText)) {
      await ringLocator(tooltip);
      const ev = await shot(page, 'visits-tooltip-uuid');
      await clearRings(page);
      addFinding({
        severity: 'MEDIUM',
        key: 'core-visits-tooltip-shows-uuid',
        area: 'Schedule - Visits',
        title: 'Visit Tooltip Exposes Technical UUID Instead Of User-Friendly Context',
        description: 'Hover tooltip contains raw UUID rather than meaningful visit metadata.',
        expected: 'Tooltip should display title/site/date for human-readable context.',
        actual: `Tooltip text includes UUID pattern: "${tooltipText.trim().slice(0, 120)}"`,
        impact: 'Increases cognitive load and reduces clarity for planners.',
        steps: ['Open Schedule > Visits.', 'Hover a scheduled event.', 'Inspect tooltip text.'],
        evidence: [ev],
      });
    }
  }

  const addVisitBtn = page.getByRole('button', { name: /Add New Visit/i }).first();
  if (await addVisitBtn.isVisible().catch(() => false)) {
    await addVisitBtn.click({ timeout: 4000 }).catch(() => {});
    await waitSettled(page, 1000);

    const siteInput = page.locator('input[placeholder*="Search Site"], input[placeholder*="Site"]').first();
    if (await siteInput.isVisible().catch(() => false)) {
      await siteInput.click({ timeout: 2200 }).catch(() => {});
      await siteInput.fill('Melton').catch(() => {});
      await page.waitForTimeout(500);

      const option = page.locator('li,div').filter({ hasText: /Melton Court/i }).first();
      if (await option.isVisible().catch(() => false)) {
        await option.click({ timeout: 2200 }).catch(() => {});
        await page.waitForTimeout(500);

        const dropdownStillOpen = await page
          .locator('li,div')
          .filter({ hasText: /^Melton Court$/i })
          .count()
          .catch(() => 0);
        if (dropdownStillOpen > 0) {
          const ev = await shotWithSelectors(page, 'add-visit-site-dropdown-stuck', [
            'input[placeholder*="Search Site"]',
            'li',
          ]);
          addFinding({
            severity: 'MEDIUM',
            key: 'core-addvisit-site-dropdown-stays-open',
            area: 'Add Visit',
            title: 'Site Dropdown Remains Visible After Selection',
            description: 'After selecting a site, dropdown option remains visible under field.',
            expected: 'Dropdown should close immediately after selection.',
            actual: 'Selected value is set but option list remains visible.',
            impact: 'Visual clutter and overlap risk with adjacent controls.',
            steps: [
              'Open Add New Visit.',
              'Search and select "Melton Court".',
              'Observe dropdown option still visible.',
            ],
            evidence: [ev],
          });
        }
      }

      const personDropdown = page.locator('text=/Person\s*\*/i').first();
      const engineersDropdown = page.locator('text=/Engineers\s*\*/i').first();
      if (await personDropdown.isVisible().catch(() => false) && await engineersDropdown.isVisible().catch(() => false)) {
        await personDropdown.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(250);
        await engineersDropdown.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(250);
        const openLists = await page.locator('[role="listbox"], ul, .dropdown-menu').count().catch(() => 0);
        if (openLists >= 2) {
          const ev = await shotWithSelectors(page, 'add-visit-multiple-dropdowns-open', ['main']);
          addFinding({
            severity: 'MEDIUM',
            key: 'core-addvisit-multi-dropdown-overlap',
            area: 'Add Visit',
            title: 'Multiple Dropdown Menus Stay Open Simultaneously In Add Visit Form',
            description: 'Opening person and engineer selectors can leave multiple panels open.',
            expected: 'Opening a new dropdown should close previous open dropdown.',
            actual: `Detected ${openLists} open dropdown/list containers concurrently.`,
            impact: 'Can create overlap and accidental mis-selection.',
            steps: ['Open Add New Visit.', 'Open Person dropdown.', 'Open Engineers dropdown.', 'Observe both remain open.'],
            evidence: [ev],
          });
        }
      }
    }

    const endControl = page.locator('input').nth(3);
    if (await endControl.isVisible().catch(() => false)) {
      await endControl.click({ timeout: 2200 }).catch(() => {});
      await page.waitForTimeout(250);
      const earlierOption = page.locator('li,div,button').filter({ hasText: /^07:00$/ }).first();
      if (await earlierOption.isVisible().catch(() => false)) {
        const ev = await shotWithSelectors(page, 'add-visit-end-time-earlier-option', ['main']);
        addFinding({
          severity: 'LOW',
          key: 'core-addvisit-endtime-earlier-option',
          area: 'Add Visit',
          title: 'End Time Dropdown Offers Values Earlier Than Start Time',
          description: 'End-time chooser still includes options that can violate time ordering.',
          expected: 'End-time options should be constrained to start time or later.',
          actual: 'Earlier time options remain present in dropdown.',
          impact: 'Leads to avoidable validation errors during scheduling.',
          steps: ['Open Add New Visit.', 'Set start time.', 'Open end time dropdown and inspect earlier options.'],
          evidence: [ev],
        });
      }
    }

    await page.goto('/visits-list', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitSettled(page, 900);
  }

  const rowsData = await page.locator('tbody tr').evaluateAll((trs) =>
    trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => (td.textContent || '').replace(/\s+/g, ' ').trim())),
  );

  if (rowsData.length > 0) {
    const typeUnknown = rowsData.filter((r) => /unknown/i.test(r[3] || '')).length;
    const statusNo = rowsData.filter((r) => /no status/i.test(r[7] || '')).length;
    const customerUnknown = rowsData.filter((r) => /unknown customer and site/i.test(r[2] || '')).length;
    const engineerNA = rowsData.filter((r) => /not assigned/i.test(r[6] || '')).length;

    const ev = await shotWithSelectors(page, 'visits-list-aggregate-quality', ['table']);

    if (typeUnknown > 0) {
      addFinding({
        severity: typeUnknown / rowsData.length > 0.5 ? 'MEDIUM' : 'LOW',
        key: 'agg-visits-type-unknown',
        area: 'Visits List',
        title: 'Visits List Shows High Rate Of "Unknown" Visit Type Values',
        description: 'Visit type column contains unresolved placeholder values.',
        expected: 'Visit type should be resolved to valid business taxonomy.',
        actual: `${typeUnknown}/${rowsData.length} visible rows show Visit Type = "Unknown".`,
        impact: 'Reporting, filtering and triage by visit type become unreliable.',
        steps: ['Open Visits List.', 'Inspect Visit Type column across visible rows.', 'Observe Unknown placeholders.'],
        evidence: [ev],
      });
    }

    if (statusNo > 0) {
      addFinding({
        severity: statusNo / rowsData.length > 0.5 ? 'MEDIUM' : 'LOW',
        key: 'agg-visits-status-no',
        area: 'Visits List',
        title: 'Visits List Contains Unresolved "No status" Badges',
        description: 'Status column contains unresolved placeholder badge values.',
        expected: 'Every visit should expose a valid status state.',
        actual: `${statusNo}/${rowsData.length} visible rows show "No status".`,
        impact: 'Status-driven workflows and scheduling visibility are degraded.',
        steps: ['Open Visits List.', 'Inspect Status column.', 'Observe No status badges.'],
        evidence: [ev],
      });
    }

    if (customerUnknown > 0) {
      addFinding({
        severity: customerUnknown / rowsData.length > 0.3 ? 'MEDIUM' : 'LOW',
        key: 'agg-visits-customer-unknown',
        area: 'Visits List',
        title: 'Visits List Contains Unknown Customer/Site Placeholders',
        description: 'Customer & Site column contains unresolved placeholders.',
        expected: 'Customer and site should resolve to actual names/addresses.',
        actual: `${customerUnknown}/${rowsData.length} visible rows show Unknown Customer and Site.`,
        impact: 'Field team may open wrong records or miss context before dispatch.',
        steps: ['Open Visits List.', 'Inspect Customer & Site column.', 'Observe Unknown placeholders.'],
        evidence: [ev],
      });
    }

    if (engineerNA > 0) {
      addFinding({
        severity: engineerNA / rowsData.length > 0.5 ? 'MEDIUM' : 'LOW',
        key: 'agg-visits-engineer-not-assigned',
        area: 'Visits List',
        title: 'Large Share Of Visits Are Displayed As Not Assigned',
        description: 'Assigned Engineer column indicates unresolved assignment for many rows.',
        expected: 'Planner should surface assigned engineer for scheduled visits.',
        actual: `${engineerNA}/${rowsData.length} visible rows show Not Assigned.`,
        impact: 'Resource allocation checks from list view become harder.',
        steps: ['Open Visits List.', 'Inspect Assigned Engineer column.', 'Observe Not Assigned values.'],
        evidence: [ev],
      });
    }
  }

  const searchInput = page.locator('input[placeholder*="Search visits"]').first();
  if (await searchInput.isVisible().catch(() => false)) {
    const beforeCount = await page.locator('tbody tr').count().catch(() => 0);
    await searchInput.fill('qa_nonexistent_token_60_unique').catch(() => {});
    await page.keyboard.press('Enter').catch(() => {});
    await waitSettled(page, 600);
    const afterCount = await page.locator('tbody tr').count().catch(() => 0);
    const ev = await shotWithSelectors(page, 'visits-list-search-no-hit', ['input[placeholder*="Search visits"]', 'table']);
    if (beforeCount > 0 && afterCount >= beforeCount) {
      addFinding({
        severity: 'MEDIUM',
        key: 'core-visits-search-not-narrowing',
        area: 'Visits List',
        title: 'Visits Search Does Not Narrow Results For Unique Non-Match Query',
        description: 'Non-matching token does not reduce list rows in tested state.',
        expected: 'Query with no matches should return zero rows or no-results state.',
        actual: `Rows before=${beforeCount}, after=${afterCount}.`,
        impact: 'Search reliability is reduced for high-volume operational lists.',
        steps: ['Open Visits List.', 'Search unique non-existing token.', 'Observe row count remains unchanged.'],
        evidence: [ev],
      });
    }

    const clearFilters = page.getByText(/Clear Filters/i).first();
    if (await clearFilters.isVisible().catch(() => false)) {
      await clearFilters.click({ timeout: 2500 }).catch(() => {});
      await page.waitForTimeout(700);
      const mainText = await page.locator('body').innerText().catch(() => '');
      const isBlankLike = normalize(mainText).length < 30;
      if (isBlankLike) {
        const ev2 = await shotWithSelectors(page, 'visits-clear-filters-blank-state', ['body']);
        addFinding({
          severity: 'CRITICAL',
          key: 'core-visits-clearfilters-blank-page',
          area: 'Visits List',
          title: 'Clear Filters Action Can Collapse Page Into Blank State',
          description: 'After clear filters, page can enter near-empty blank state.',
          expected: 'Clear filters should restore populated list safely.',
          actual: 'Main page content becomes blank-like after clear action.',
          impact: 'Primary list becomes unusable until manual refresh.',
          steps: ['Open Visits List.', 'Apply any filter.', 'Click Clear Filters.', 'Observe blank/near-empty page.'],
          evidence: [ev2],
        });
      }
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await waitSettled(page, 700);
    }
  }

  const firstVisit = page.locator('tbody tr').first();
  if (await firstVisit.isVisible().catch(() => false)) {
    await firstVisit.click({ timeout: 3000 }).catch(() => {});
    await waitSettled(page, 900);

    const detailText = await page.locator('main').innerText().catch(() => '');
    const ev = await shotWithSelectors(page, 'visit-detail-header-state', ['main']);

    if (/unknown client/i.test(detailText)) {
      addFinding({
        severity: 'MEDIUM',
        key: 'core-visit-detail-unknown-client',
        area: 'Visit Detail',
        title: 'Visit Detail Header Shows Unknown Client Placeholder',
        description: 'Client identity is unresolved in detail header.',
        expected: 'Client should be resolved to actual entity name.',
        actual: 'Client field displays "Unknown Client".',
        impact: 'Context and accountability are reduced in visit review.',
        steps: ['Open Visits List.', 'Open first visit detail.', 'Check Client field.'],
        evidence: [ev],
      });
    }

    if (/\bno status\b/i.test(detailText)) {
      addFinding({
        severity: 'MEDIUM',
        key: 'core-visit-detail-no-status',
        area: 'Visit Detail',
        title: 'Visit Detail Status Badge Is Unresolved',
        description: 'Detail page status badge remains unresolved.',
        expected: 'Status badge should display valid lifecycle state.',
        actual: 'Badge displays "No status".',
        impact: 'Status-driven operational decisions are hindered.',
        steps: ['Open Visits List.', 'Open first visit detail.', 'Inspect status badge.'],
        evidence: [ev],
      });
    }

    const downloadBtn = page.getByRole('button', { name: /Download Report/i }).first();
    if (await downloadBtn.isVisible().catch(() => false)) {
      const disabled = await downloadBtn.isDisabled().catch(() => false);
      if (disabled) {
        await ringLocator(downloadBtn);
        const ev2 = await shot(page, 'visit-detail-download-disabled');
        await clearRings(page);
        addFinding({
          severity: 'LOW',
          key: 'core-visit-download-disabled-no-reason',
          area: 'Visit Detail',
          title: 'Download Report Is Disabled Without Inline Explanation',
          description: 'Report button appears but is disabled and no reason is shown nearby.',
          expected: 'Either enable report download or present explicit reason.',
          actual: 'Button is disabled with no explanatory helper text.',
          impact: 'Users cannot determine whether this is bug, permission or missing data.',
          steps: ['Open a visit detail.', 'Locate Download Report button.', 'Observe disabled state without reason text.'],
          evidence: [ev2],
        });
      }
    }

    const shareBtn = page.getByRole('button', { name: /Share Report/i }).first();
    if (await shareBtn.isVisible().catch(() => false)) {
      const beforeUrl = page.url();
      await shareBtn.click({ timeout: 2500 }).catch(() => {});
      await page.waitForTimeout(700);
      const hasDialog = await page.locator('[role="dialog"]').count().catch(() => 0);
      const hasToast = await page.locator('text=/success|copied|shared/i').count().catch(() => 0);
      if (beforeUrl === page.url() && hasDialog === 0 && hasToast === 0) {
        await ringLocator(shareBtn);
        const ev3 = await shot(page, 'visit-detail-share-no-feedback');
        await clearRings(page);
        addFinding({
          severity: 'LOW',
          key: 'core-visit-share-no-feedback',
          area: 'Visit Detail',
          title: 'Share Report Action Lacks Immediate Visible Feedback',
          description: 'Share action does not show modal, toast or state change.',
          expected: 'Share action should provide immediate user confirmation.',
          actual: 'No visible UI feedback detected after click.',
          impact: 'Users cannot tell whether share operation succeeded.',
          steps: ['Open visit detail.', 'Click Share Report.', 'Observe absence of visible feedback.'],
          evidence: [ev3],
        });
      }
    }
  }

  logAction('core-flows', 'ok', `findings=${findings.length}`);
}
async function collectAuditSignals(page, route, routeName) {
  await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitSettled(page, 700);

  const result = await page.evaluate(() => {
    const isVisible = (el) => {
      if (!el) return false;
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };

    const cssPath = (el) => {
      if (!(el instanceof Element)) return '';
      if (el.id) return `#${CSS.escape(el.id)}`;
      const parts = [];
      let node = el;
      for (let i = 0; i < 4 && node && node.nodeType === 1; i += 1) {
        const tag = node.tagName.toLowerCase();
        const cls = (node.className || '').toString().trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
        let part = tag;
        if (cls) part += `.${cls}`;
        const parent = node.parentElement;
        if (parent) {
          const siblings = [...parent.children].filter((s) => s.tagName === node.tagName);
          if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
        }
        parts.unshift(part);
        node = parent;
      }
      return parts.join(' > ');
    };

    const textNodes = [...document.querySelectorAll('td,th,div,span,p,a,button,label,h1,h2,h3,h4')]
      .filter((el) => isVisible(el))
      .map((el) => {
        const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
        return {
          selector: cssPath(el),
          text: txt,
          overflow: el.scrollWidth - el.clientWidth,
          width: el.clientWidth,
          hasTitle: !!el.getAttribute('title'),
        };
      })
      .filter((x) => x.text.length >= 10 && x.width > 24 && x.overflow > 14)
      .filter((x) => !x.hasTitle)
      .slice(0, 30);

    const iconButtons = [...document.querySelectorAll('button,[role="button"]')]
      .filter((el) => isVisible(el))
      .map((el) => {
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        const aria = (el.getAttribute('aria-label') || '').trim();
        const title = (el.getAttribute('title') || '').trim();
        const labelledBy = (el.getAttribute('aria-labelledby') || '').trim();
        const hasIcon = !!el.querySelector('svg,img,i');
        return { selector: cssPath(el), text, aria, title, labelledBy, hasIcon };
      })
      .filter((x) => x.hasIcon && !x.text && !x.aria && !x.title && !x.labelledBy)
      .slice(0, 20);

    const interactive = [...document.querySelectorAll('button,a,[role="button"],input[type="checkbox"],input[type="radio"]')]
      .filter((el) => isVisible(el))
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { selector: cssPath(el), width: Math.round(r.width), height: Math.round(r.height) };
      })
      .filter((x) => x.width > 0 && x.height > 0 && (x.width < 30 || x.height < 30))
      .slice(0, 30);

    const fields = [...document.querySelectorAll('input,select,textarea')]
      .filter((el) => isVisible(el))
      .filter((el) => {
        const t = (el.getAttribute('type') || '').toLowerCase();
        return !['hidden', 'submit', 'button', 'reset'].includes(t);
      })
      .map((el) => {
        const id = el.getAttribute('id');
        const hasFor = id ? !!document.querySelector(`label[for="${CSS.escape(id)}"]`) : false;
        const hasParentLabel = !!el.closest('label');
        const hasAria = !!(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby'));
        const placeholder = el.getAttribute('placeholder') || '';
        return {
          selector: cssPath(el),
          hasFor,
          hasParentLabel,
          hasAria,
          placeholder,
          type: (el.getAttribute('type') || el.tagName || '').toLowerCase(),
        };
      })
      .filter((x) => !x.hasFor && !x.hasParentLabel && !x.hasAria)
      .slice(0, 20);

    const duplicateIds = (() => {
      const map = new Map();
      [...document.querySelectorAll('[id]')].forEach((el) => {
        const id = el.id;
        map.set(id, (map.get(id) || 0) + 1);
      });
      return [...map.entries()].filter(([, count]) => count > 1).map(([id, count]) => ({ id, count })).slice(0, 10);
    })();

    const unknownPlaceholders = [...document.querySelectorAll('*')]
      .filter((el) => isVisible(el))
      .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
      .filter((txt) => /\bunknown\b/i.test(txt))
      .slice(0, 120).length;

    return {
      truncated: textNodes,
      iconButtons,
      smallTargets: interactive,
      unlabeledFields: fields,
      duplicateIds,
      unknownPlaceholders,
      bodyOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });

  for (const item of result.truncated.slice(0, 10)) {
    if (findings.length >= TARGET_COUNT) break;
    const ev = await shotWithSelectors(page, `${routeName}-truncated-text`, [item.selector]);
    addFinding({
      severity: 'LOW',
      key: `audit-truncated-${routeName}-${normalize(item.selector)}`,
      area: `UI Audit (${routeName})`,
      title: `${routeName}: Truncated Text Without Tooltip At ${item.selector}`,
      description: 'Visible text overflows container without explicit tooltip/title fallback.',
      expected: 'Truncated UI text should include tooltip/title or allow full content view.',
      actual: `Overflow delta=${item.overflow}px; sample="${(item.text || '').slice(0, 80)}"`,
      impact: 'Content readability and quick scanning are reduced.',
      steps: ['Open page.', `Inspect element ${item.selector}.`, 'Observe truncated text.'],
      evidence: [ev],
    });
  }

  for (const item of result.iconButtons.slice(0, 8)) {
    if (findings.length >= TARGET_COUNT) break;
    const ev = await shotWithSelectors(page, `${routeName}-icon-button-no-label`, [item.selector]);
    addFinding({
      severity: 'MEDIUM',
      key: `audit-icon-no-label-${routeName}-${normalize(item.selector)}`,
      area: `Accessibility (${routeName})`,
      title: `${routeName}: Icon-Only Button Lacks Accessible Name At ${item.selector}`,
      description: 'Icon button has no visible text, aria-label, title or aria-labelledby.',
      expected: 'Every interactive control should expose an accessible name.',
      actual: 'Accessible-name attributes are missing for this icon-only button.',
      impact: 'Screen reader users cannot identify button purpose.',
      steps: ['Open page.', `Focus ${item.selector}.`, 'Inspect accessibility name attributes.'],
      evidence: [ev],
    });
  }

  for (const item of result.smallTargets.slice(0, 10)) {
    if (findings.length >= TARGET_COUNT) break;
    const ev = await shotWithSelectors(page, `${routeName}-small-target`, [item.selector]);
    addFinding({
      severity: 'LOW',
      key: `audit-small-target-${routeName}-${normalize(item.selector)}-${item.width}x${item.height}`,
      area: `UI Audit (${routeName})`,
      title: `${routeName}: Click Target Below Comfortable Size At ${item.selector}`,
      description: 'Interactive target is smaller than common touch/click ergonomics guidance.',
      expected: 'Primary interactive targets should be at least ~32x32px (preferably 44x44 for touch).',
      actual: `Measured target size ${item.width}x${item.height}px.`,
      impact: 'Increases miss-click risk, especially on touch devices.',
      steps: ['Open page.', `Inspect ${item.selector}.`, 'Measure target dimensions.'],
      evidence: [ev],
    });
  }

  for (const item of result.unlabeledFields.slice(0, 8)) {
    if (findings.length >= TARGET_COUNT) break;
    const ev = await shotWithSelectors(page, `${routeName}-unlabeled-field`, [item.selector]);
    addFinding({
      severity: 'MEDIUM',
      key: `audit-unlabeled-field-${routeName}-${normalize(item.selector)}`,
      area: `Accessibility (${routeName})`,
      title: `${routeName}: Form Field Lacks Programmatic Label At ${item.selector}`,
      description: 'Field appears without associated label for accessibility APIs.',
      expected: 'Input/select/textarea should have <label for>, wrapping label, or aria-label/labelledby.',
      actual: `No programmatic label found. Placeholder="${item.placeholder}"`,
      impact: 'Form usability degrades for assistive technologies and voice input.',
      steps: ['Open page.', `Inspect field ${item.selector}.`, 'Check label association attributes.'],
      evidence: [ev],
    });
  }

  if (result.duplicateIds.length > 0 && findings.length < TARGET_COUNT) {
    const idSummary = result.duplicateIds.map((d) => `${d.id}(${d.count})`).join(', ');
    const ev = await shotWithSelectors(page, `${routeName}-duplicate-ids`, ['body']);
    addFinding({
      severity: 'MEDIUM',
      key: `audit-duplicate-ids-${routeName}-${normalize(idSummary)}`,
      area: `Markup Integrity (${routeName})`,
      title: `${routeName}: Duplicate HTML IDs Detected In DOM`,
      description: 'Multiple elements share same id value.',
      expected: 'ID values should be unique within a page.',
      actual: `Duplicate IDs found: ${idSummary}`,
      impact: 'Label targeting, scripting and accessibility references can break.',
      steps: ['Open page.', 'Inspect DOM for repeated id attributes.', 'Confirm duplicates.'],
      evidence: [ev],
    });
  }

  if (result.unknownPlaceholders >= 8 && findings.length < TARGET_COUNT) {
    const ev = await shotWithSelectors(page, `${routeName}-unknown-placeholders`, ['main']);
    addFinding({
      severity: 'LOW',
      key: `audit-unknown-placeholder-density-${routeName}-${result.unknownPlaceholders}`,
      area: `Data Presentation (${routeName})`,
      title: `${routeName}: High Density Of "Unknown" Placeholders In Visible UI`,
      description: 'Page displays many unresolved placeholder values.',
      expected: 'Key fields should be resolved or explicitly marked with reason/context.',
      actual: `Detected ${result.unknownPlaceholders} visible "Unknown" text occurrences.`,
      impact: 'Trust and clarity of displayed data are reduced.',
      steps: ['Open page.', 'Scan visible content for Unknown placeholders.', 'Count unresolved entries.'],
      evidence: [ev],
    });
  }

  if (result.bodyOverflowX && findings.length < TARGET_COUNT) {
    const ev = await shotWithSelectors(page, `${routeName}-horizontal-overflow`, ['body']);
    addFinding({
      severity: 'LOW',
      key: `audit-overflow-x-${routeName}`,
      area: `Responsive (${routeName})`,
      title: `${routeName}: Horizontal Overflow Detected In Desktop View`,
      description: 'Page content width exceeds viewport width.',
      expected: 'Desktop layout should avoid unexpected horizontal overflow.',
      actual: 'documentElement.scrollWidth > clientWidth.',
      impact: 'Can cause clipped content and accidental horizontal scrolling.',
      steps: ['Open page.', 'Check layout width against viewport.', 'Observe overflow.'],
      evidence: [ev],
    });
  }
}
async function collectMobileSignals(browser) {
  logAction('mobile-audit', 'start');
  const mobileContext = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 390, height: 844 },
  });
  const mpage = await mobileContext.newPage();

  try {
    await mpage.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitSettled(mpage, 1000);

    if (mpage.url().includes('/login')) {
      await mpage.locator('input[type="email"], input[name="email"]').first().fill(EMAIL);
      await mpage.locator('input[type="password"], input[name="password"]').first().fill(PASSWORD);
      await mpage.getByRole('button', { name: /sign in/i }).first().click();
      await waitSettled(mpage, 1800);
    }

    const mobileRoutes = [
      { route: '/dashboard', name: 'mobile-dashboard' },
      { route: '/customers', name: 'mobile-customers' },
      { route: '/visits', name: 'mobile-visits' },
      { route: '/planner', name: 'mobile-planner' },
      { route: '/visits-list', name: 'mobile-visits-list' },
    ];

    for (const { route, name } of mobileRoutes) {
      if (findings.length >= TARGET_COUNT) break;
      await mpage.goto(route, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await waitSettled(mpage, 900);

      const metrics = await mpage.evaluate(() => {
        const doc = document.documentElement;
        const overflowX = doc.scrollWidth > doc.clientWidth;
        const tinyTextCount = [...document.querySelectorAll('*')]
          .filter((el) => {
            const cs = getComputedStyle(el);
            const fs = parseFloat(cs.fontSize || '0');
            const lh = parseFloat(cs.lineHeight || '0');
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && fs > 0 && fs < 11 && (isNaN(lh) || lh < 14);
          })
          .length;

        const clipped = [...document.querySelectorAll('td,th,div,span,p,a,button,label')]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) return false;
            return el.scrollWidth - el.clientWidth > 12 && (el.textContent || '').trim().length > 8;
          })
          .slice(0, 25)
          .map((el) => {
            const txt = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
            let sel = el.tagName.toLowerCase();
            if (el.id) sel = `#${el.id}`;
            else if (el.className) sel += `.${String(el.className).split(/\s+/).filter(Boolean).slice(0, 2).join('.')}`;
            return { selector: sel, text: txt };
          });

        return { overflowX, tinyTextCount, clipped };
      });

      if (metrics.overflowX && findings.length < TARGET_COUNT) {
        const ev = await shotWithSelectors(mpage, `${name}-overflow-x`, ['body']);
        addFinding({
          severity: 'MEDIUM',
          key: `mobile-overflow-${name}`,
          area: 'Responsive',
          title: `${name}: Horizontal Overflow On Mobile Viewport`,
          description: 'Mobile layout exceeds viewport width and requires horizontal scrolling.',
          expected: 'Layout should fit within viewport width on common mobile dimensions.',
          actual: 'scrollWidth > clientWidth at 390px viewport.',
          impact: 'Mobile readability and interaction quality are reduced.',
          steps: ['Open page on 390px viewport.', 'Inspect horizontal scroll behavior.', 'Observe overflow.'],
          evidence: [ev],
        });
      }

      if (metrics.tinyTextCount > 0 && findings.length < TARGET_COUNT) {
        const ev = await shotWithSelectors(mpage, `${name}-tiny-text`, ['main']);
        addFinding({
          severity: 'LOW',
          key: `mobile-tiny-text-${name}-${metrics.tinyTextCount}`,
          area: 'Responsive',
          title: `${name}: Tiny Text Instances Detected In Mobile Layout`,
          description: 'Some visible text renders below recommended legibility threshold.',
          expected: 'Body/UI text should maintain readable mobile size.',
          actual: `Detected ${metrics.tinyTextCount} tiny text nodes (font-size < 11px).`,
          impact: 'Readability degrades for mobile users.',
          steps: ['Open page on mobile viewport.', 'Inspect text sizing.', 'Observe tiny labels.'],
          evidence: [ev],
        });
      }

      for (const c of metrics.clipped.slice(0, 4)) {
        if (findings.length >= TARGET_COUNT) break;
        const ev = await shotWithSelectors(mpage, `${name}-clipped-text`, ['main']);
        addFinding({
          severity: 'MEDIUM',
          key: `mobile-clipped-${name}-${normalize(c.selector)}-${normalize(c.text)}`,
          area: 'Responsive',
          title: `${name}: Clipped Text In Mobile Context (${c.selector})`,
          description: 'Text is clipped/ellipsized significantly in constrained viewport.',
          expected: 'Critical labels should remain readable or expose full text affordance.',
          actual: `Clipped sample: "${c.text}"`,
          impact: 'Mobile users may lose context while scanning rows/cards.',
          steps: ['Open page in mobile viewport.', 'Inspect clipped text element.', 'Observe truncated text.'],
          evidence: [ev],
        });
      }
    }
  } finally {
    await mobileContext.close();
  }

  logAction('mobile-audit', 'ok', `findings=${findings.length}`);
}

async function addConsoleAndApiFindings(page) {
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await waitSettled(page, 500);

  const consoleList = [...consoleEvents];
  const apiList = [...apiFailures];

  if (consoleList.some((e) => /google maps javascript api has been loaded directly without loading=async/i.test(e)) && findings.length < TARGET_COUNT) {
    const ev = await shotWithSelectors(page, 'console-maps-warning-context', ['body']);
    addFinding({
      severity: 'LOW',
      key: 'console-google-maps-no-async',
      area: 'Console Quality',
      title: 'Console Warning: Google Maps Script Loaded Without Async Pattern',
      description: 'Runtime warning indicates non-recommended loading mode for Maps API.',
      expected: 'No recurring runtime warnings in regular navigation.',
      actual: 'Console emits warning about loading=async recommendation.',
      impact: 'May indicate avoidable performance overhead and noisy logs.',
      steps: ['Traverse visits-related pages.', 'Open browser console.', 'Observe Maps loading warning.'],
      evidence: [ev, path.join(LOG_DIR, 'console-errors.log')],
    });
  }

  if (consoleList.some((e) => /props object containing a "key" prop/i.test(e)) && findings.length < TARGET_COUNT) {
    const ev = await shotWithSelectors(page, 'console-react-key-warning-context', ['body']);
    addFinding({
      severity: 'LOW',
      key: 'console-react-key-spread-warning',
      area: 'Console Quality',
      title: 'Console Warning: React Key Prop Spread Pattern Detected',
      description: 'React warning appears about spreading key prop into JSX.',
      expected: 'No framework warnings during nominal UI usage.',
      actual: 'Console logs warning about key prop spread usage.',
      impact: 'Increases console noise and can hide more severe runtime errors.',
      steps: ['Use multiple modules.', 'Open browser console.', 'Inspect warning entries.'],
      evidence: [ev, path.join(LOG_DIR, 'console-errors.log')],
    });
  }

  const groupedApiByCode = apiList.reduce((acc, line) => {
    const m = String(line).match(/^(\d{3})\s+([A-Z]+)\s+(.+)$/);
    if (!m) return acc;
    const key = `${m[1]} ${m[2]}`;
    acc[key] = acc[key] || [];
    acc[key].push(m[3]);
    return acc;
  }, {});

  for (const [codeMethod, urls] of Object.entries(groupedApiByCode)) {
    if (findings.length >= TARGET_COUNT) break;
    const uniqDomainPath = [...new Set(urls.map((u) => {
      try {
        const x = new URL(u);
        return `${x.pathname}`;
      } catch {
        return u;
      }
    }))].slice(0, 4);

    const isSevere = /^5\d\d/.test(codeMethod) || /^429/.test(codeMethod);
    const ev = await shotWithSelectors(page, `api-failure-${codeMethod.replace(/\s+/g, '-')}`, ['body']);
    addFinding({
      severity: isSevere ? 'MEDIUM' : 'LOW',
      key: `api-failure-${codeMethod}-${uniqDomainPath.join('|')}`,
      area: 'Integration',
      title: `API Failure Events Observed (${codeMethod})`,
      description: 'During UI traversal, API failures were captured by network observer.',
      expected: 'Critical user-facing flows should avoid repeated API error responses.',
      actual: `${urls.length} responses with ${codeMethod}. Sample paths: ${uniqDomainPath.join(', ')}`,
      impact: 'May cause partial rendering or inconsistent UI state.',
      steps: ['Navigate across modules.', 'Monitor network responses.', `Observe ${codeMethod} errors.`],
      evidence: [ev, path.join(LOG_DIR, 'api-failures.log')],
    });
  }
}

async function fillToTargetWithUniqueUiFindings(page) {
  logAction('fill-to-target', 'start', `current=${findings.length}`);
  const routes = [
    { route: '/dashboard', name: 'dashboard' },
    { route: '/customers', name: 'customers' },
    { route: '/visits', name: 'visits' },
    { route: '/planner', name: 'planner' },
    { route: '/visits-list', name: 'visits-list' },
  ];

  let guard = 0;
  while (findings.length < TARGET_COUNT && guard < 6) {
    for (const r of routes) {
      if (findings.length >= TARGET_COUNT) break;
      await collectAuditSignals(page, r.route, r.name);
    }
    guard += 1;
  }

  logAction('fill-to-target', 'ok', `current=${findings.length}`);
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
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  page.on('console', (msg) => {
    const t = msg.type();
    if (t === 'error' || t === 'warning') consoleEvents.add(msg.text());
  });

  page.on('response', (res) => {
    if (res.status() >= 400) {
      apiFailures.add(`${res.status()} ${res.request().method()} ${res.url()}`);
    }
  });

  try {
    await loginBootstrap(page);
    await checkCoreFlows(page);
    await fillToTargetWithUniqueUiFindings(page);
    await collectMobileSignals(browser);
    await addConsoleAndApiFindings(page);
  } finally {
    await context.close();
    await browser.close();
  }

  if (findings.length < TARGET_COUNT) {
    throw new Error(`Only ${findings.length} unique findings captured; expected at least ${TARGET_COUNT}.`);
  }

  const finalFindings = findings.slice(0, TARGET_COUNT);

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

  console.log(`QA_NO_LOGIN_60_UNIQUE_DIR=${RUN_DIR}`);
  console.log(`QA_NO_LOGIN_60_UNIQUE_COUNT=${summary.findingsCount}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
