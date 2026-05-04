import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const WEB_BASE = process.env.HYDROCERT_WEB_BASE || 'https://hydrocert-dev-webapp-fzgveghygfc3enbt.ukwest-01.azurewebsites.net';
const EMAIL = process.env.HYDROCERT_QA_EMAIL || '';
const PASS = process.env.HYDROCERT_QA_PASSWORD || '';
const TEST_FILTER = new Set(
  String(process.env.HYDROCERT_TEST_IDS || '')
    .split(',')
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean)
);

const stamp = new Date().toISOString().replace(/[.:]/g, '-');
const run = `maestro-web-smoke-${stamp}`;
const runDir = path.join(process.cwd(), 'qa-artifacts', 'infra-regression', run);
const shotsDir = path.join(runDir, 'screenshots');
fs.mkdirSync(shotsDir, { recursive: true });

const checks = [];
let shotIndex = 1;

function pushCheck({ id, area, test, status, details, evidence = [] }) {
  checks.push({ id, area, test, status, details, evidence });
  console.log(`${id} | ${status} | ${test} | ${details}`);
}

function shouldRun(id) {
  return TEST_FILTER.size === 0 || TEST_FILTER.has(String(id).toUpperCase());
}

async function settled(page, ms = 800) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

async function shot(page, name) {
  const file = path.join(shotsDir, `${String(shotIndex).padStart(2, '0')}-${name}.png`);
  shotIndex += 1;
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function ensureLoggedIn(page) {
  await page.goto(`${WEB_BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await settled(page, 1000);
  if (page.url().includes('/login')) {
    await page.locator('input[name="email"],input[type="email"]').first().fill(EMAIL);
    await page.locator('input[name="password"],input[type="password"]').first().fill(PASS);
    await page.getByRole('button', { name: /sign in/i }).first().click();
    await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 25000 }).catch(() => {});
    await settled(page, 1200);
  }
  return !page.url().includes('/login');
}

async function assertVisible(page, textOrLocator, timeoutMs = 8000) {
  try {
    if (typeof textOrLocator === 'string') {
      const loc = page.getByText(new RegExp(textOrLocator, 'i')).first();
      await loc.waitFor({ state: 'visible', timeout: timeoutMs });
      return true;
    }
    await textOrLocator.waitFor({ state: 'visible', timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

// ============================================================
// M01 - Login Page
// ============================================================
async function testM01_Login(page) {
  const id = 'M01';
  if (!shouldRun(id)) return;
  try {
    await page.goto(`${WEB_BASE}/login`, { waitUntil: 'domcontentloaded' });
    await settled(page, 800);

    const emailInput = await assertVisible(page, page.locator('input[name="email"],input[type="email"]').first());
    const passwordInput = await assertVisible(page, page.locator('input[name="password"],input[type="password"]').first());
    const signInBtn = await assertVisible(page, page.getByRole('button', { name: /sign in/i }).first());
    const forgotLink = await page.getByText(/forgot password/i).first().isVisible().catch(() => false);

    const evidence = [await shot(page, 'M01-login-page')];

    if (emailInput && passwordInput && signInBtn) {
      // Perform login
      await page.locator('input[name="email"],input[type="email"]').first().fill(EMAIL);
      await page.locator('input[name="password"],input[type="password"]').first().fill(PASS);
      await page.getByRole('button', { name: /sign in/i }).first().click();
      await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 25000 }).catch(() => {});
      await settled(page, 1200);
      evidence.push(await shot(page, 'M01-login-after'));

      const loggedIn = !page.url().includes('/login');
      pushCheck({ id, area: 'Login', test: 'Login page elements and sign-in flow', status: loggedIn ? 'PASS' : 'FAIL', details: loggedIn ? 'Email, password, sign-in button visible; login successful' : 'Login form visible but sign-in failed', evidence });
    } else {
      pushCheck({ id, area: 'Login', test: 'Login page elements and sign-in flow', status: 'FAIL', details: `Missing elements: email=${emailInput} password=${passwordInput} signIn=${signInBtn} forgot=${forgotLink}`, evidence });
    }
  } catch (err) {
    pushCheck({ id, area: 'Login', test: 'Login page elements and sign-in flow', status: 'FAIL', details: `Error: ${err.message}`, evidence: [] });
  }
}

// ============================================================
// M02 - Forgot Password
// ============================================================
async function testM02_ForgotPassword(page) {
  const id = 'M02';
  if (!shouldRun(id)) return;
  try {
    // Clear ALL session state so we land on the actual login page (not redirected to dashboard)
    await page.context().clearCookies();
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.goto(`${WEB_BASE}/login`, { waitUntil: 'networkidle' });
    await settled(page, 2000);

    const forgotLink = page.getByText(/forgot password/i).first();
    const forgotVisible = await assertVisible(page, forgotLink);
    if (!forgotVisible) {
      pushCheck({ id, area: 'Login', test: 'Forgot password flow', status: 'FAIL', details: 'Forgot password link not visible', evidence: [await shot(page, 'M02-no-forgot')] });
      return;
    }

    await forgotLink.click();
    await settled(page, 600);
    const evidence = [await shot(page, 'M02-forgot-page')];

    const heading = await assertVisible(page, 'Forgot Password');
    const emailField = await assertVisible(page, page.locator('input[name="email"],input[type="email"]').first());
    const sendBtn = await page.getByText(/send reset link/i).first().isVisible().catch(() => false);
    const backBtn = await page.getByText(/back to login/i).first().isVisible().catch(() => false);

    const allOk = heading && emailField && sendBtn;
    pushCheck({ id, area: 'Login', test: 'Forgot password flow', status: allOk ? 'PASS' : 'FAIL', details: `heading=${heading} emailField=${emailField} sendBtn=${sendBtn} backBtn=${backBtn}`, evidence });
  } catch (err) {
    pushCheck({ id, area: 'Login', test: 'Forgot password flow', status: 'FAIL', details: `Error: ${err.message}`, evidence: [] });
  }
}

// ============================================================
// M03 - Dashboard Day View
// ============================================================
async function testM03_DashboardDayView(page) {
  const id = 'M03';
  if (!shouldRun(id)) return;
  try {
    await ensureLoggedIn(page);
    await page.goto(`${WEB_BASE}/visits`, { waitUntil: 'domcontentloaded' });
    await settled(page, 1000);

    const visitsHeading = await assertVisible(page, 'Visits');
    const overview = await assertVisible(page, 'overview of your.*visits');
    const addNewVisit = await assertVisible(page, 'Add New Visit');
    const dayBtn = await assertVisible(page, page.getByText('Day').first());
    const monthBtn = await assertVisible(page, page.getByText('Month').first());
    const allEngineers = await assertVisible(page, 'All Engineers');

    // Click Day button to ensure day view
    await page.getByText('Day').first().click().catch(() => {});
    await settled(page, 500);

    const evidence = [await shot(page, 'M03-dashboard-day')];
    const allOk = visitsHeading && addNewVisit && dayBtn && monthBtn;
    pushCheck({ id, area: 'Dashboard', test: 'Dashboard day view elements', status: allOk ? 'PASS' : 'FAIL', details: `visits=${visitsHeading} addNew=${addNewVisit} day=${dayBtn} month=${monthBtn} engineers=${allEngineers}`, evidence });
  } catch (err) {
    pushCheck({ id, area: 'Dashboard', test: 'Dashboard day view elements', status: 'FAIL', details: `Error: ${err.message}`, evidence: [] });
  }
}

// ============================================================
// M04 - Dashboard Month View
// ============================================================
async function testM04_DashboardMonthView(page) {
  const id = 'M04';
  if (!shouldRun(id)) return;
  try {
    await ensureLoggedIn(page);
    await page.goto(`${WEB_BASE}/visits`, { waitUntil: 'domcontentloaded' });
    await settled(page, 1000);

    // Switch to Month view
    const monthBtn = page.getByText('Month').first();
    await monthBtn.click().catch(() => {});
    await settled(page, 800);

    const monthVisible = await assertVisible(page, monthBtn);
    const addNewVisit = await assertVisible(page, 'Add New Visit');
    const dayBtn = await assertVisible(page, page.getByText('Day').first());
    const allEngineers = await assertVisible(page, 'All Engineers');

    // Switch back to Day
    await page.getByText('Day').first().click().catch(() => {});
    await settled(page, 500);

    const evidence = [await shot(page, 'M04-dashboard-month')];
    const allOk = monthVisible && addNewVisit && dayBtn;
    pushCheck({ id, area: 'Dashboard', test: 'Dashboard month view toggle', status: allOk ? 'PASS' : 'FAIL', details: `month=${monthVisible} addNew=${addNewVisit} day=${dayBtn} engineers=${allEngineers}`, evidence });
  } catch (err) {
    pushCheck({ id, area: 'Dashboard', test: 'Dashboard month view toggle', status: 'FAIL', details: `Error: ${err.message}`, evidence: [] });
  }
}

// ============================================================
// M05 - Add New Visit Form
// ============================================================
async function testM05_AddNewVisit(page) {
  const id = 'M05';
  if (!shouldRun(id)) return;
  try {
    await ensureLoggedIn(page);
    await page.goto(`${WEB_BASE}/visits`, { waitUntil: 'domcontentloaded' });
    await settled(page, 1000);

    // Click Add New Visit
    await page.getByText('Add New Visit').first().click();
    await settled(page, 1200);

    const heading = await assertVisible(page, 'Add New Visit');
    const visitDetails = await assertVisible(page, 'Visit Details');
    const inspections = await assertVisible(page, 'Inspections');
    const bookingPerson = await assertVisible(page, 'Booking Person');
    const engineerAssignment = await assertVisible(page, 'Engineer Assignment');
    const cancelBtn = await assertVisible(page, 'Cancel');
    const createBtn = await assertVisible(page, 'Create Visit');

    // Fill title to verify input
    const titleInput = page.getByPlaceholder(/enter title/i).first();
    const titleVisible = await assertVisible(page, titleInput);
    if (titleVisible) {
      await titleInput.fill('QA Maestro Smoke Test');
      await page.waitForTimeout(300);
    }

    const evidence = [await shot(page, 'M05-add-new-visit')];

    // Click Cancel to avoid creating data
    await page.getByText('Cancel').first().click().catch(() => {});
    await settled(page, 500);

    const allOk = heading && visitDetails && cancelBtn && createBtn;
    pushCheck({ id, area: 'Forms', test: 'Add new visit form elements', status: allOk ? 'PASS' : 'FAIL', details: `heading=${heading} visitDetails=${visitDetails} inspections=${inspections} booking=${bookingPerson} engineer=${engineerAssignment} cancel=${cancelBtn} create=${createBtn}`, evidence });
  } catch (err) {
    pushCheck({ id, area: 'Forms', test: 'Add new visit form elements', status: 'FAIL', details: `Error: ${err.message}`, evidence: [] });
  }
}

// ============================================================
// M06 - Planner
// ============================================================
async function testM06_Planner(page) {
  const id = 'M06';
  if (!shouldRun(id)) return;
  try {
    await ensureLoggedIn(page);

    // Navigate via sidebar
    await page.getByText('Schedule').first().click().catch(() => {});
    await settled(page, 500);
    await page.getByText('Planner').first().click().catch(() => {});
    await settled(page, 1200);

    const monthView = await assertVisible(page, 'Month View');
    const eventsView = await assertVisible(page, 'Events View');
    const statusFilter = await assertVisible(page, page.getByText('Status').first());
    const jobTypeFilter = await assertVisible(page, page.getByText('Job Type').first());

    // Click Month View and Events View buttons
    await page.getByText('Month View').first().click().catch(() => {});
    await settled(page, 500);
    await page.getByText('Events View').first().click().catch(() => {});
    await settled(page, 500);

    const evidence = [await shot(page, 'M06-planner')];
    const allOk = monthView && eventsView;
    pushCheck({ id, area: 'Planner', test: 'Planner page elements and views', status: allOk ? 'PASS' : 'FAIL', details: `monthView=${monthView} eventsView=${eventsView} status=${statusFilter} jobType=${jobTypeFilter}`, evidence });
  } catch (err) {
    pushCheck({ id, area: 'Planner', test: 'Planner page elements and views', status: 'FAIL', details: `Error: ${err.message}`, evidence: [] });
  }
}

// ============================================================
// M07 - Visits List
// ============================================================
async function testM07_VisitsList(page) {
  const id = 'M07';
  if (!shouldRun(id)) return;
  try {
    await ensureLoggedIn(page);

    // Navigate via sidebar
    await page.getByText('Visits List').first().click().catch(() => {});
    await settled(page, 1200);

    const visitRef = await assertVisible(page, 'Visit Reference');
    const title = await assertVisible(page, 'Title');
    const customerSite = await assertVisible(page, 'Customer.*Site');
    const searchInput = await assertVisible(page, page.getByPlaceholder(/search visits/i).first());
    const clearFilters = await assertVisible(page, 'Clear Filters');

    // Check table has rows
    const rowCount = await page.locator('table tbody tr').count().catch(() => 0);

    const evidence = [await shot(page, 'M07-visits-list')];
    const allOk = visitRef && title && rowCount > 0;
    pushCheck({ id, area: 'Web Smoke', test: 'Visits list page and table', status: allOk ? 'PASS' : 'FAIL', details: `visitRef=${visitRef} title=${title} customer=${customerSite} rows=${rowCount} clearFilters=${clearFilters}`, evidence });
  } catch (err) {
    pushCheck({ id, area: 'Web Smoke', test: 'Visits list page and table', status: 'FAIL', details: `Error: ${err.message}`, evidence: [] });
  }
}

// ============================================================
// M08 - Visit Detail
// ============================================================
async function testM08_VisitDetail(page) {
  const id = 'M08';
  if (!shouldRun(id)) return;
  try {
    await ensureLoggedIn(page);

    // Navigate to visits list then click first row
    await page.getByText('Visits List').first().click().catch(() => {});
    await settled(page, 1200);

    // Wait for table rows
    const rowCount = await page.locator('table tbody tr').count().catch(() => 0);
    if (rowCount === 0) {
      pushCheck({ id, area: 'Web Smoke', test: 'Visit detail page tabs', status: 'SKIP', details: 'No visit rows available to click', evidence: [await shot(page, 'M08-no-rows')] });
      return;
    }

    await page.locator('table tbody tr').first().click();
    await settled(page, 1500);

    const backBtn = await assertVisible(page, 'Back to Visits');
    const downloadReport = await assertVisible(page, 'Download Report');

    // Test tabs
    const visitDetailsTab = await assertVisible(page, page.getByText('Visit Details').first());
    await page.getByText('Visit Details').first().click().catch(() => {});
    await settled(page, 500);

    const inspectionsTab = await assertVisible(page, page.locator('[data-slot="tabs-trigger"]').filter({ hasText: /inspections/i }).first());
    await page.locator('[data-slot="tabs-trigger"]').filter({ hasText: /inspections/i }).first().click().catch(() => {});
    await settled(page, 500);

    const attachmentsTab = await assertVisible(page, page.locator('[data-slot="tabs-trigger"]').filter({ hasText: /attachments/i }).first());
    await page.locator('[data-slot="tabs-trigger"]').filter({ hasText: /attachments/i }).first().click().catch(() => {});
    await settled(page, 500);

    const actions = await assertVisible(page, 'Actions');
    const clientSig = await assertVisible(page, 'Client Signature');

    const evidence = [await shot(page, 'M08-visit-detail')];
    const allOk = backBtn && visitDetailsTab && inspectionsTab && attachmentsTab;
    pushCheck({ id, area: 'Web Smoke', test: 'Visit detail page tabs', status: allOk ? 'PASS' : 'FAIL', details: `back=${backBtn} download=${downloadReport} detailsTab=${visitDetailsTab} inspections=${inspectionsTab} attachments=${attachmentsTab} actions=${actions} signature=${clientSig}`, evidence });

    // Go back
    await page.getByText('Back to Visits').first().click().catch(() => {});
    await settled(page, 800);
  } catch (err) {
    pushCheck({ id, area: 'Web Smoke', test: 'Visit detail page tabs', status: 'FAIL', details: `Error: ${err.message}`, evidence: [] });
  }
}

// ============================================================
// M09 - Sidebar Navigation
// ============================================================
async function testM09_SidebarNavigation(page) {
  const id = 'M09';
  if (!shouldRun(id)) return;
  try {
    await ensureLoggedIn(page);

    // Test Dashboard link
    await page.getByText('Dashboard').first().click().catch(() => {});
    await settled(page, 800);
    const dashboardOk = await assertVisible(page, 'Visits');

    // Test Customers link
    await page.getByText('Customers').first().click().catch(() => {});
    await settled(page, 600);

    // Test Schedule > Planner
    await page.getByText('Schedule').first().click().catch(() => {});
    await settled(page, 400);
    await page.getByText('Planner').first().click().catch(() => {});
    await settled(page, 800);
    const plannerOk = await assertVisible(page, 'Month View');

    // Test Visits List link
    await page.getByText('Visits List').first().click().catch(() => {});
    await settled(page, 800);
    const visitsListOk = await assertVisible(page, 'Visit Reference');

    // Test Team Management
    await page.getByText('Team Management').first().click().catch(() => {});
    await settled(page, 600);

    // Test Settings
    await page.getByText('Settings').first().click().catch(() => {});
    await settled(page, 600);

    // Test Toggle Sidebar
    const toggleBtn = page.getByText('Toggle Sidebar').first();
    const toggleVisible = await toggleBtn.isVisible().catch(() => false);
    if (toggleVisible) {
      await toggleBtn.click().catch(() => {});
      await page.waitForTimeout(400);
      await toggleBtn.click().catch(() => {});
      await page.waitForTimeout(400);
    }

    const evidence = [await shot(page, 'M09-sidebar-nav')];
    const allOk = dashboardOk && plannerOk && visitsListOk;
    pushCheck({ id, area: 'Navigation', test: 'Sidebar navigation links', status: allOk ? 'PASS' : 'FAIL', details: `dashboard=${dashboardOk} planner=${plannerOk} visitsList=${visitsListOk} toggle=${toggleVisible}`, evidence });
  } catch (err) {
    pushCheck({ id, area: 'Navigation', test: 'Sidebar navigation links', status: 'FAIL', details: `Error: ${err.message}`, evidence: [] });
  }
}

// ============================================================
// M10 - User Menu
// ============================================================
async function testM10_UserMenu(page) {
  const id = 'M10';
  if (!shouldRun(id)) return;
  try {
    await ensureLoggedIn(page);

    // Open user menu — use stable attribute selector, not display-name text (text varies per tenant/user)
    const userMenu = page.locator('button[aria-haspopup="menu"]').first();
    const userMenuVisible = await assertVisible(page, userMenu);
    if (!userMenuVisible) {
      pushCheck({ id, area: 'Navigation', test: 'User profile menu', status: 'FAIL', details: 'User menu trigger not visible', evidence: [await shot(page, 'M10-no-user-menu')] });
      return;
    }

    await userMenu.click();
    await settled(page, 500);

    const logoutVisible = await assertVisible(page, 'Logout');
    const evidence = [await shot(page, 'M10-user-menu')];

    // Close menu
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    pushCheck({ id, area: 'Navigation', test: 'User profile menu', status: logoutVisible ? 'PASS' : 'FAIL', details: `userMenu=${userMenuVisible} logout=${logoutVisible}`, evidence });
  } catch (err) {
    pushCheck({ id, area: 'Navigation', test: 'User profile menu', status: 'FAIL', details: `Error: ${err.message}`, evidence: [] });
  }
}

// ============================================================
// Main execution
// ============================================================
const artifactDir = path.join(process.cwd(), 'qa-artifacts');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  ignoreHTTPSErrors: true,
  recordVideo: { dir: path.join(artifactDir, 'videos'), size: { width: 1280, height: 720 } },
});
const page = await context.newPage();

try {
  await testM01_Login(page);
  await testM02_ForgotPassword(page);
  await testM03_DashboardDayView(page);
  await testM04_DashboardMonthView(page);
  await testM05_AddNewVisit(page);
  await testM06_Planner(page);
  await testM07_VisitsList(page);
  await testM08_VisitDetail(page);
  await testM09_SidebarNavigation(page);
  await testM10_UserMenu(page);
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}

const totals = {
  total: checks.length,
  pass: checks.filter((c) => c.status === 'PASS').length,
  fail: checks.filter((c) => c.status === 'FAIL').length,
  skip: checks.filter((c) => c.status === 'SKIP').length,
};

const summary = {
  generatedAt: new Date().toISOString(),
  environment: { webBase: WEB_BASE },
  totals,
  checks,
};

const summaryPath = path.join(runDir, 'summary.json');
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

const mdLines = [];
mdLines.push('# Maestro Web Smoke Report');
mdLines.push(`Date: ${new Date().toISOString()}`);
mdLines.push(`WebApp: ${WEB_BASE}`);
mdLines.push('');
mdLines.push('## Summary');
mdLines.push(`- Total checks: ${totals.total}`);
mdLines.push(`- Passed: ${totals.pass}`);
mdLines.push(`- Failed: ${totals.fail}`);
mdLines.push(`- Skipped: ${totals.skip}`);
mdLines.push('');
mdLines.push('## Checks');
mdLines.push('| ID | Area | Test | Status | Details |');
mdLines.push('|---|---|---|---|---|');
for (const c of checks) {
  mdLines.push(`| ${c.id} | ${c.area} | ${String(c.test).replace(/\|/g, '/')} | ${c.status} | ${String(c.details).replace(/\|/g, '/')} |`);
}
if (checks.some((c) => c.status === 'FAIL')) {
  mdLines.push('');
  mdLines.push('## Fail Evidence');
  for (const c of checks.filter((x) => x.status === 'FAIL')) {
    if (!c.evidence?.length) continue;
    mdLines.push(`- ${c.id}: ${c.evidence.join(', ')}`);
  }
}
const reportPath = path.join(runDir, 'report.md');
fs.writeFileSync(reportPath, mdLines.join('\n'), 'utf-8');

console.log(`SUMMARY_JSON=${summaryPath}`);
console.log(`REPORT_MD=${reportPath}`);
console.log(`TOTAL=${totals.total} PASS=${totals.pass} FAIL=${totals.fail} SKIP=${totals.skip}`);
