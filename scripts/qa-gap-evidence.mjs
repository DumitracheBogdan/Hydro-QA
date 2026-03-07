import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5173';
const TIMESTAMP = new Date().toISOString().replace(/[.:]/g, '-');
const RUN_DIR = path.join(process.cwd(), 'qa-artifacts', 'evidence', `gap-run-${TIMESTAMP}`);
const SCREENSHOT_DIR = path.join(RUN_DIR, 'screenshots');
const VIDEO_DIR = path.join(RUN_DIR, 'videos');
const LOG_DIR = path.join(RUN_DIR, 'logs');
const STORAGE_STATE_PATH = path.join(process.cwd(), 'playwright-auth-state.json');

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
fs.mkdirSync(VIDEO_DIR, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });

const findings = [];
const consoleErrors = [];
const apiFailures = [];
const actions = [];

function logAction(step, status, details = '') {
  actions.push({ step, status, details, at: new Date().toISOString() });
  console.log(`${status.toUpperCase()} | ${step}${details ? ` | ${details}` : ''}`);
}

function addFinding({ severity, title, details, evidence }) {
  findings.push({
    id: `F-${String(findings.length + 1).padStart(3, '0')}`,
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
    storageState: fs.existsSync(STORAGE_STATE_PATH) ? STORAGE_STATE_PATH : undefined,
  });

  const pages = [];
  context.on('page', (p) => pages.push(p));

  const page = await context.newPage();
  pages.push(page);

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('response', (res) => {
    if (res.status() >= 400) {
      apiFailures.push(`${res.status()} ${res.url()}`);
    }
  });

  async function shot(name) {
    const target = path.join(SCREENSHOT_DIR, `${name}.png`);
    await page.screenshot({ path: target, fullPage: true });
    return target;
  }

  try {
    logAction('open-dashboard', 'start');
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(600);
    const dashboardShot = await shot('01-dashboard');

    const h1Text = ((await page.locator('h1').first().textContent().catch(() => '')) || '').trim();
    if (h1Text.includes('Welcome, !')) {
      addFinding({
        severity: 'Medium',
        title: 'Dashboard greeting shows empty user name',
        details: `Observed heading: "${h1Text}"`,
        evidence: [dashboardShot],
      });
    }

    const navEntries = await page
      .locator('a[data-sidebar="menu-button"], button[data-sidebar="menu-button"]')
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const el = node;
          return {
            text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
            href: el.tagName.toLowerCase() === 'a' ? el.getAttribute('href') || '' : '',
            disabledAttr: el.hasAttribute('disabled'),
            ariaDisabled: el.getAttribute('aria-disabled') || '',
          };
        }),
      );

    const tm = navEntries.find((x) => /team management/i.test(x.text));
    const st = navEntries.find((x) => /settings/i.test(x.text));
    const navShot = await shot('02-sidebar-navigation');

    if (tm?.disabledAttr && st?.disabledAttr) {
      addFinding({
        severity: 'High',
        title: 'Team Management and Settings are visible but disabled',
        details: `Team Management href=${tm.href}; Settings href=${st.href}`,
        evidence: [navShot],
      });
    }
    logAction('open-dashboard', 'ok');

    const routeProbe = [];
    for (const route of ['/team-management', '/settings', '/schedule']) {
      logAction(`probe-route-${route}`, 'start');
      await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 9000 }).catch(() => {});
      await page.waitForTimeout(500);
      const finalUrl = page.url();
      const routeShot = await shot(`03-route-${route.replace('/', '') || 'root'}`);
      routeProbe.push({ route, finalUrl, screenshot: routeShot });
      logAction(`probe-route-${route}`, 'ok', `final=${finalUrl}`);
    }

    const redirected = routeProbe.filter((x) => x.finalUrl.endsWith('/dashboard'));
    if (redirected.length === routeProbe.length) {
      addFinding({
        severity: 'High',
        title: 'Team/Settings/Schedule routes redirect to dashboard',
        details: routeProbe.map((x) => `${x.route} -> ${x.finalUrl}`).join(' | '),
        evidence: routeProbe.map((x) => x.screenshot),
      });
    }

    logAction('planner-deep-check', 'start');
    await page.goto('/planner', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(700);
    for (const buttonName of ['Month View', 'Events View', 'Sort', 'All sites']) {
      await page.getByRole('button', { name: new RegExp(`^${buttonName}$`, 'i') }).click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(150);
      await page.keyboard.press('Escape').catch(() => {});
    }
    const plannerCombos = Math.min(await page.getByRole('combobox').count().catch(() => 0), 5);
    for (let i = 0; i < plannerCombos; i += 1) {
      const combo = page.getByRole('combobox').nth(i);
      await combo.click({ timeout: 2500 }).catch(() => {});
      await page.waitForTimeout(120);
      const options = page.getByRole('option');
      const optionCount = await options.count().catch(() => 0);
      if (optionCount > 0) {
        await options.nth(0).click({ timeout: 2200 }).catch(() => {});
      } else {
        await page.keyboard.press('Escape').catch(() => {});
      }
      await page.waitForTimeout(110);
    }
    const plannerShot = await shot('03b-planner-deep-check');
    logAction('planner-deep-check', 'ok', `comboboxes=${plannerCombos}`);

    logAction('customers-deep-check', 'start');
    await page.goto('/customers', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 9000 }).catch(() => {});
    await page.waitForTimeout(600);
    const customerControls = page.locator(
      'main button, main [role="button"], main a[href], main [role="tab"]',
    );
    const customerCount = Math.min(await customerControls.count().catch(() => 0), 24);
    let customerClicks = 0;
    for (let i = 0; i < customerCount; i += 1) {
      const control = customerControls.nth(i);
      const text = (
        (await control.textContent().catch(() => '')) ||
        (await control.getAttribute('aria-label').catch(() => '')) ||
        ''
      )
        .replace(/\s+/g, ' ')
        .trim();
      if (!text || /^dashboard$|^customers$|^schedule$|^visits/i.test(text)) continue;
      const visible = await control.isVisible().catch(() => false);
      if (!visible) continue;
      try {
        await control.click({ trial: true, timeout: 1200 });
        await control.click({ timeout: 2000 });
        await page.waitForTimeout(180);
        customerClicks += 1;
        if (page.url() !== `${BASE_URL}/customers`) {
          await page.goto('/customers', { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForLoadState('networkidle', { timeout: 7000 }).catch(() => {});
          await page.waitForTimeout(120);
        }
      } catch {
        // Keep crawling; non-interactable controls are expected in exploratory mode.
      }
    }
    const customersShot = await shot('04-customers-deep-check');
    logAction('customers-deep-check', 'ok', `clicked=${customerClicks}`);

    logAction('visits-add-form-deep-check', 'start');
    await page.goto('/visits/addnewvisit', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(800);

    const textInputs = page.locator('main input[type="text"], main input:not([type]), main textarea');
    const inputCount = Math.min(await textInputs.count().catch(() => 0), 8);
    for (let i = 0; i < inputCount; i += 1) {
      const input = textInputs.nth(i);
      const visible = await input.isVisible().catch(() => false);
      if (!visible) continue;
      await input.fill(`QA-${i + 1}`).catch(() => {});
    }

    const checkboxNames = [
      'Chemistry Level 4',
      'Biology',
      'Physics',
      'Plumbing',
      'Electrical',
      'Safety Certified',
    ];
    let checkboxToggles = 0;
    for (const name of checkboxNames) {
      const cb = page.getByRole('checkbox', { name, exact: false }).first();
      const visible = await cb.isVisible().catch(() => false);
      if (!visible) continue;
      try {
        await cb.click({ timeout: 3000 });
        await page.waitForTimeout(90);
        checkboxToggles += 1;
      } catch {
        // Continue collecting from other fields.
      }
    }

    const comboCount = Math.min(await page.getByRole('combobox').count().catch(() => 0), 6);
    for (let i = 0; i < comboCount; i += 1) {
      const combo = page.getByRole('combobox').nth(i);
      const visible = await combo.isVisible().catch(() => false);
      if (!visible) continue;
      await combo.click({ timeout: 2500 }).catch(() => {});
      await page.waitForTimeout(130);
      const options = page.getByRole('option');
      const optionCount = await options.count().catch(() => 0);
      if (optionCount > 0) {
        await options.nth(0).click({ timeout: 2500 }).catch(() => {});
      } else {
        await page.keyboard.press('Escape').catch(() => {});
      }
      await page.waitForTimeout(120);
    }

    const addVisitShot = await shot('05-addnewvisit-deep-check');
    logAction('visits-add-form-deep-check', 'ok', `checkboxToggles=${checkboxToggles}`);

    logAction('visits-list-and-details-deep-check', 'start');
    await page.goto('/visits-list', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(700);

    const visitRows = page.locator('main button').filter({ hasText: /[0-9a-f]{8}-[0-9a-f]{4}/i });
    const rowsToOpen = Math.min(await visitRows.count().catch(() => 0), 3);
    for (let i = 0; i < rowsToOpen; i += 1) {
      await visitRows.nth(i).click({ timeout: 5000 }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(550);

      for (const tab of ['Visit Details', 'Inspections', 'Attachments']) {
        await page.getByRole('tab', { name: tab, exact: false }).click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(120);
      }

      await page.getByRole('button', { name: /Actions/i }).click({ timeout: 3500 }).catch(() => {});
      await page.waitForTimeout(160);
      await page.keyboard.press('Escape').catch(() => {});

      await page.getByRole('button', { name: /Back to Visits/i }).click({ timeout: 5000 }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(500);
    }
    const detailsShot = await shot('06-visit-details-deep-check');
    logAction('visits-list-and-details-deep-check', 'ok', `rowsOpened=${rowsToOpen}`);

    if (rowsToOpen === 0) {
      logAction('visit-details-direct-check', 'start');
      const fallbackDetailIds = [
        '8b3419e3-e758-48aa-bcdc-724d4ff2534e',
        'c85c952b-12ed-464b-a5de-eb6691b77411',
        '5173c282-61fe-42b2-80b2-9eed8ae1b311',
      ];
      let directOpened = 0;
      for (const id of fallbackDetailIds) {
        await page.goto(`/visits/details/${id}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForLoadState('networkidle', { timeout: 9000 }).catch(() => {});
        await page.waitForTimeout(450);
        const currentUrl = page.url();
        if (!currentUrl.includes('/visits/details/')) continue;
        directOpened += 1;
        for (const tab of ['Visit Details', 'Inspections', 'Attachments']) {
          await page.getByRole('tab', { name: tab, exact: false }).click({ timeout: 2500 }).catch(() => {});
          await page.waitForTimeout(100);
        }
        await page.getByRole('button', { name: /Actions/i }).click({ timeout: 2600 }).catch(() => {});
        await page.waitForTimeout(150);
        await page.keyboard.press('Escape').catch(() => {});
      }
      const directDetailsShot = await shot('06b-visit-details-direct-check');
      logAction('visit-details-direct-check', 'ok', `directOpened=${directOpened}`);
      if (directOpened === 0) {
        addFinding({
          severity: 'Medium',
          title: 'Visit details pages are not reachable from known IDs',
          details: 'Fallback visit details routes were not reachable.',
          evidence: [detailsShot, directDetailsShot],
        });
      }
    }

    logAction('visits-runtime-stress-check', 'start');
    await page.goto('/visits', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(500);

    const dayButtons = page
      .locator('main button')
      .filter({ hasNotText: /Toggle Sidebar|Add New Visit|Today|Day|Month|All Engineers/i });
    const dayClickCount = Math.min(await dayButtons.count().catch(() => 0), 14);
    for (let i = 0; i < dayClickCount; i += 1) {
      await dayButtons.nth(i).click({ timeout: 2200 }).catch(() => {});
      await page.waitForTimeout(100);
    }
    await page.getByRole('button', { name: /^Day$/i }).click({ timeout: 2500 }).catch(() => {});
    await page.getByRole('button', { name: /^Month$/i }).click({ timeout: 2500 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1500);

    const visitsStressShot = await shot('07-visits-stress-check');
    logAction('visits-runtime-stress-check', 'ok', `dayClicks=${dayClickCount}`);

    const uniqueErrors = [...new Set(consoleErrors)];
    const hasKeyError = uniqueErrors.some((e) => e.includes('key prop'));
    const hasItemsError = uniqueErrors.some((e) => e.includes("reading 'items'"));
    const hasSetStateRenderError = uniqueErrors.some((e) => e.includes('Cannot update a component'));

    if (hasKeyError) {
      addFinding({
        severity: 'Low',
        title: 'React key warnings in console',
        details: 'Console logs include key-prop spreading / missing unique key warnings.',
        evidence: [plannerShot, detailsShot, visitsStressShot],
      });
    }

    if (hasItemsError) {
      addFinding({
        severity: 'Medium',
        title: "Intermittent runtime error: Cannot read properties of undefined (reading 'items')",
        details: 'Observed during visits/planner stress interactions in the same session.',
        evidence: [visitsStressShot],
      });
    }

    if (hasSetStateRenderError) {
      addFinding({
        severity: 'Low',
        title: 'State update during render warning',
        details: 'Console shows setState during render warning (Toaster/CalendarTimeline).',
        evidence: [visitsStressShot],
      });
    }

    if (apiFailures.length > 0) {
      addFinding({
        severity: 'Medium',
        title: 'API failures observed during gap testing',
        details: apiFailures.join(' | '),
        evidence: [customersShot, addVisitShot, detailsShot, visitsStressShot],
      });
    }
  } finally {
    await context.close();
    await browser.close();
  }

  const summary = {
    runDir: RUN_DIR,
    startedAt: TIMESTAMP,
    finishedAt: new Date().toISOString(),
    findings,
    findingsCount: findings.length,
    consoleErrorCount: consoleErrors.length,
    uniqueConsoleErrors: [...new Set(consoleErrors)],
    apiFailureCount: apiFailures.length,
    apiFailures: [...new Set(apiFailures)],
    actions,
    screenshots: fs.readdirSync(SCREENSHOT_DIR).map((name) => path.join(SCREENSHOT_DIR, name)),
    videos: fs.existsSync(VIDEO_DIR)
      ? fs.readdirSync(VIDEO_DIR).map((name) => path.join(VIDEO_DIR, name))
      : [],
  };

  const summaryPath = path.join(RUN_DIR, 'summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');

  const consolePath = path.join(LOG_DIR, 'console-errors.log');
  fs.writeFileSync(consolePath, [...new Set(consoleErrors)].join('\n\n'), 'utf-8');

  const findingLines = [
    `Run directory: ${RUN_DIR}`,
    `Findings: ${findings.length}`,
    `Console errors: ${consoleErrors.length}`,
    `API failures: ${apiFailures.length}`,
    '',
    ...findings.map((f) => `${f.id} [${f.severity}] ${f.title} :: ${f.details}`),
  ];
  fs.writeFileSync(path.join(RUN_DIR, 'finding-summary.txt'), findingLines.join('\n'), 'utf-8');

  console.log(`QA_GAP_EVIDENCE_DIR=${RUN_DIR}`);
  console.log(`QA_GAP_FINDINGS=${findings.length}`);
  console.log(`QA_GAP_VIDEOS=${summary.videos.length}`);
  console.log(`QA_GAP_SCREENSHOTS=${summary.screenshots.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
