import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.HYDROCERT_BASE_URL || 'http://localhost:5173';
const EMAIL = process.env.HYDROCERT_QA_EMAIL || '';
const PASSWORD = process.env.HYDROCERT_QA_PASSWORD || '';

const TIMESTAMP = new Date().toISOString().replace(/[.:]/g, '-');
const RUN_DIR = path.join(process.cwd(), 'qa-artifacts', 'evidence', `senior-10-different-tests-${TIMESTAMP}`);
const SHOTS_DIR = path.join(RUN_DIR, 'screenshots');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

const tests = [];
const bugs = [];
let shotIndex = 1;

function log(msg) {
  console.log(`[qa-10-diff] ${msg}`);
}

function recordTest(id, name, status, details = '', evidence = []) {
  tests.push({ id, name, status, details, evidence });
}

function addBug(title, severity, testId, expected, actual, steps, evidence = []) {
  bugs.push({
    id: `BUG-${String(bugs.length + 1).padStart(3, '0')}`,
    title,
    severity,
    testId,
    expected,
    actual,
    steps,
    evidence,
  });
}

async function settled(page, ms = 700) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

async function ensureRingStyle(page) {
  await page.evaluate(() => {
    if (document.getElementById('qa-ring-style')) return;
    const s = document.createElement('style');
    s.id = 'qa-ring-style';
    s.textContent = `[data-qa-ring='1']{outline:3px solid #ff1e1e !important; box-shadow:0 0 0 4px rgba(255,30,30,.22)!important; border-radius:8px !important;}`;
    document.head.appendChild(s);
  }).catch(() => {});
}

async function clearRings(page) {
  await page.evaluate(() => {
    document.querySelectorAll('[data-qa-ring="1"]').forEach((n) => n.removeAttribute('data-qa-ring'));
  }).catch(() => {});
}

async function ringSelectors(page, selectors) {
  await ensureRingStyle(page);
  await clearRings(page);
  await page.evaluate((sels) => {
    for (const sel of sels) {
      try {
        const n = document.querySelector(sel);
        if (n) n.setAttribute('data-qa-ring', '1');
      } catch {}
    }
  }, selectors).catch(() => {});
}

async function screenshot(page, name) {
  const file = path.join(SHOTS_DIR, `${String(shotIndex).padStart(2, '0')}-${name}.png`);
  shotIndex += 1;
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function shotWithRings(page, name, selectors = []) {
  if (selectors.length) await ringSelectors(page, selectors);
  const file = await screenshot(page, name);
  await clearRings(page);
  return file;
}

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function login(page) {
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 35000 });
  await settled(page, 1000);
  if (page.url().includes('/login')) {
    const email = page.locator('input[type="email"],input[name="email"]').first();
    const pass = page.locator('input[type="password"],input[name="password"]').first();
    const btn = page.getByRole('button', { name: /sign in/i }).first();
    await email.fill(EMAIL);
    await pass.fill(PASSWORD);
    await btn.click();
    await settled(page, 1600);
  }
  if (page.url().includes('/login')) {
    throw new Error('Login failed; still on /login');
  }
}

async function tryClick(page, candidates) {
  for (const c of candidates) {
    const el = typeof c === 'string' ? page.locator(c).first() : c;
    const visible = await el.isVisible().catch(() => false);
    if (!visible) continue;
    await el.click().catch(() => {});
    return true;
  }
  return false;
}

async function selectDropdownByPlaceholder(page, placeholderRegex, optionRegex) {
  const input = page.getByPlaceholder(placeholderRegex).first();
  if (!(await input.isVisible().catch(() => false))) return false;
  await input.click().catch(() => {});
  await page.waitForTimeout(220);

  const optionCandidates = [
    page.getByRole('option', { name: optionRegex }).first(),
    page.locator('li,div,span').filter({ hasText: optionRegex }).first(),
  ];

  for (const option of optionCandidates) {
    if (await option.isVisible().catch(() => false)) {
      await option.click().catch(() => {});
      await page.waitForTimeout(500);
      return true;
    }
  }
  return false;
}

function tableRows(page) {
  return page.locator('tbody tr');
}

async function firstRowText(page) {
  const row = page.locator('tbody tr').first();
  if (!(await row.isVisible().catch(() => false))) return '';
  const txt = (await row.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  return txt;
}

function relToArtifacts(absPath) {
  return path.relative(path.join(process.cwd(), 'qa-artifacts'), absPath).split(path.sep).join('/');
}

function renderHtml() {
  const total = tests.length;
  const passed = tests.filter((t) => t.status === 'PASS').length;
  const failed = tests.filter((t) => t.status === 'FAIL').length;
  const skipped = tests.filter((t) => t.status === 'SKIP').length;

  const sevCount = {
    critical: bugs.filter((b) => b.severity.toLowerCase() === 'critical').length,
    high: bugs.filter((b) => b.severity.toLowerCase() === 'high').length,
    medium: bugs.filter((b) => b.severity.toLowerCase() === 'medium').length,
    low: bugs.filter((b) => b.severity.toLowerCase() === 'low').length,
  };

  const rows = tests.map((t) => `
    <tr>
      <td>${esc(t.id)}</td>
      <td>${esc(t.name)}</td>
      <td><span class="st ${t.status.toLowerCase()}">${esc(t.status)}</span></td>
      <td>${esc(t.details)}</td>
    </tr>`).join('');

  const bugsHtml = bugs.length ? bugs.map((b) => {
    const evid = (b.evidence || []).map((abs, i) => {
      const rel = relToArtifacts(abs);
      return `<div class="screenshot-container"><h5>Screenshot Evidence ${i + 1}</h5><a href="${esc(rel)}" target="_blank"><img src="${esc(rel)}" alt="evidence"></a></div>`;
    }).join('');

    const steps = (b.steps || []).map((s) => `<li>${esc(s)}</li>`).join('');
    return `
      <div class="bug-card ${esc(b.severity.toLowerCase())}">
        <h4><span class="severity ${esc(b.severity.toLowerCase())}">${esc(b.severity)}</span> ${esc(b.id)}: ${esc(b.title)} <span class="new-badge">NEW</span></h4>
        <p><strong>Expected:</strong> ${esc(b.expected)}</p>
        <p><strong>Actual:</strong> ${esc(b.actual)}</p>
        <div class="steps"><p><strong>Steps to Reproduce:</strong></p><ol>${steps}</ol></div>
        ${evid}
      </div>`;
  }).join('') : '<p>No confirmed bugs in this run.</p>';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>HydroCert QA - 10 Different Tests</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;line-height:1.6;color:#333;background:#f5f7fa}.container{max-width:1180px;margin:0 auto;padding:20px}header{background:linear-gradient(135deg,#1e3c72 0%,#2a5298 100%);color:#fff;padding:30px 20px;text-align:center;border-radius:8px;margin-bottom:25px}header h1{font-size:1.8em;margin-bottom:8px}header .date{font-size:1em;opacity:.9}.section{background:#fff;border-radius:8px;padding:20px;margin-bottom:20px;box-shadow:0 2px 8px rgba(0,0,0,.08)}.section h2{color:#1e3c72;border-bottom:2px solid #2a5298;padding-bottom:8px;margin-bottom:12px;font-size:1.3em}.summary-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:15px;margin:15px 0}.summary-card{padding:20px;border-radius:8px;text-align:center}.summary-card.info{background:#d1ecf1;color:#0c5460}.summary-card.pass{background:#d4edda;color:#155724}.summary-card.fail{background:#f8d7da;color:#721c24}.summary-card.warn{background:#fff3cd;color:#856404}.summary-card .number{font-size:2.3em;font-weight:700}.new-badge{background:#28a745;color:#fff;font-size:.72em;padding:2px 8px;border-radius:12px;margin-left:6px;font-weight:700;vertical-align:middle}.severity{padding:3px 10px;border-radius:12px;font-size:.75em;font-weight:700;display:inline-block;text-transform:uppercase}.severity.critical{background:#dc3545;color:#fff}.severity.high{background:#fd7e14;color:#fff}.severity.medium{background:#f0ad4e;color:#222}.severity.low{background:#17a2b8;color:#fff}.bug-card{border:1px solid #e0e0e0;border-radius:6px;padding:15px;margin:12px 0;border-left:4px solid #dc3545;background:#fff}.bug-card.high{border-left-color:#fd7e14;background:#fffaf5}.bug-card.medium{border-left-color:#f0ad4e;background:#fffdf7}.bug-card.low{border-left-color:#17a2b8;background:#f8fcff}.bug-card h4{color:#222;margin-bottom:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:1.03em}.bug-card p{margin:6px 0;color:#444;font-size:.95em}.steps{background:#f3f4f6;padding:12px;border-radius:4px;margin:12px 0}.steps ol{margin-left:20px}.screenshot-container{margin:15px 0;background:#f8f9fa;border-radius:8px;padding:12px;border:1px solid #e0e0e0}.screenshot-container h5{color:#555;margin-bottom:8px;font-size:.9em}.screenshot-container img{width:100%;max-width:760px;border-radius:6px;display:block;margin:0 auto;border:1px solid #ddd}.matrix{width:100%;border-collapse:collapse;font-size:.92em}.matrix th,.matrix td{border:1px solid #e4e4e4;padding:8px;vertical-align:top}.matrix th{background:#f3f7fb;text-align:left}.st{padding:2px 8px;border-radius:10px;font-size:.78em;font-weight:700}.st.pass{background:#d4edda;color:#155724}.st.fail{background:#f8d7da;color:#721c24}.st.skip{background:#fff3cd;color:#856404}</style></head><body><div class="container"><header><h1>HydroCert QA Test Report - 10 Total Different Tests</h1><p class="date">${esc(new Date().toISOString())} | Strict anti-false-positive run</p></header><section class="section"><h2>Run Summary</h2><div class="summary-grid"><div class="summary-card info"><div class="number">${total}</div><div>Total tests</div></div><div class="summary-card pass"><div class="number">${passed}</div><div>Passed</div></div><div class="summary-card fail"><div class="number">${failed}</div><div>Failed</div></div><div class="summary-card warn"><div class="number">${skipped}</div><div>Skipped</div></div><div class="summary-card warn"><div class="number">${bugs.length}</div><div>Confirmed bugs</div></div></div><p><strong>Severity split:</strong> Critical ${sevCount.critical} | High ${sevCount.high} | Medium ${sevCount.medium} | Low ${sevCount.low}</p></section><section class="section"><h2>Test Matrix</h2><table class="matrix"><thead><tr><th>ID</th><th>Test</th><th>Status</th><th>Details</th></tr></thead><tbody>${rows}</tbody></table></section><section class="section"><h2>Confirmed Bugs</h2>${bugsHtml}</section></div></body></html>`;
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 1536, height: 864 } });
  const page = await context.newPage();

  try {
    await login(page);

    // T01
    {
      const id = 'T01';
      const name = 'Customers: search by first-row token filters result set';
      await page.goto('/customers');
      await settled(page, 900);

      const before = await tableRows(page).count().catch(() => 0);
      const first = await firstRowText(page);
      const token = (first.split(' ').find((x) => x && x.length >= 4) || '').trim();
      const input = page.getByPlaceholder(/search customers/i).first();

      if (!token || !(await input.isVisible().catch(() => false))) {
        recordTest(id, name, 'SKIP', `token="${token}" or search input unavailable`);
      } else {
        await input.fill(token);
        await page.waitForTimeout(750);
        const after = await tableRows(page).count().catch(() => 0);
        const ok = after > 0 && after <= before;
        if (!ok) {
          const ev = await shotWithRings(page, 't01-customers-search-not-filtering', ['input[placeholder*="Search customers"]', 'table']);
          addBug('Customers search does not constrain rows for valid token', 'Medium', id,
            'Searching by a token from first row should reduce/scope results.',
            `before=${before}, after=${after}, token="${token}"`,
            ['Open Customers.', `Type token "${token}" in Search.`, 'Wait for filtering.', 'Compare row count.'],
            [ev]);
          recordTest(id, name, 'FAIL', `before=${before}, after=${after}`, [ev]);
        } else {
          recordTest(id, name, 'PASS', `before=${before}, after=${after}, token=${token}`);
        }
      }
    }

    // T02
    {
      const id = 'T02';
      const name = 'Customers: impossible Contract Manager filter returns empty state';
      await page.goto('/customers');
      await settled(page, 800);

      const cm = page.getByPlaceholder(/Contract Manager/i).first();
      if (!(await cm.isVisible().catch(() => false))) {
        recordTest(id, name, 'SKIP', 'Contract Manager field unavailable');
      } else {
        await cm.fill('zzzz_nonexistent_manager_qa');
        await page.waitForTimeout(700);
        const rows = await tableRows(page).count().catch(() => 0);
        const noRowsText = await page.getByText(/No customers found/i).first().isVisible().catch(() => false);
        const ok = rows === 0 || noRowsText;
        if (!ok) {
          const ev = await shotWithRings(page, 't02-contract-manager-filter-ignored', ['input[placeholder*="Contract Manager"]', 'table']);
          addBug('Contract Manager filter ignores impossible value', 'Medium', id,
            'Impossible manager value should return empty state.',
            `rows remained=${rows} after impossible filter`,
            ['Open Customers.', 'Type impossible value in Contract Manager.', 'Wait for update.', 'Observe non-empty rows remain.'],
            [ev]);
          recordTest(id, name, 'FAIL', `rows=${rows}`, [ev]);
        } else {
          recordTest(id, name, 'PASS', `rows=${rows}, noRowsText=${noRowsText}`);
        }
      }
    }

    // T03
    {
      const id = 'T03';
      const name = 'Customers: Clear Filters resets search + rowset';
      await page.goto('/customers');
      await settled(page, 800);
      const input = page.getByPlaceholder(/search customers/i).first();
      if (!(await input.isVisible().catch(() => false))) {
        recordTest(id, name, 'SKIP', 'Search input unavailable');
      } else {
        await input.fill('zzzzzzzz_qatest');
        await page.waitForTimeout(500);
        const filteredRows = await tableRows(page).count().catch(() => 0);
        await tryClick(page, [
          page.getByText(/Clear Filters/i).first(),
          page.getByRole('button', { name: /clear filters/i }).first(),
        ]);
        await settled(page, 700);

        const restoredRows = await tableRows(page).count().catch(() => 0);
        const val = await input.inputValue().catch(() => '');
        const ok = (restoredRows >= filteredRows) && !val;
        if (!ok) {
          const ev = await shotWithRings(page, 't03-customers-clear-filters-failed', ['input[placeholder*="Search customers"]', 'table']);
          addBug('Customers Clear Filters does not fully reset state', 'Medium', id,
            'Clear Filters should clear search and restore broader dataset.',
            `filteredRows=${filteredRows}, restoredRows=${restoredRows}, input="${val}"`,
            ['Open Customers.', 'Apply narrowing search.', 'Click Clear Filters.', 'Verify input empty and rows restored.'],
            [ev]);
          recordTest(id, name, 'FAIL', `filtered=${filteredRows}, restored=${restoredRows}, input="${val}"`, [ev]);
        } else {
          recordTest(id, name, 'PASS', `filtered=${filteredRows}, restored=${restoredRows}`);
        }
      }
    }

    // T04
    {
      const id = 'T04';
      const name = 'Visits: Day/Month toggle switches view and returns cleanly';
      await page.goto('/visits');
      await settled(page, 900);

      const dayHasHour = await page.getByText(/^07:00$/).first().isVisible().catch(() => false);
      await tryClick(page, [page.getByRole('button', { name: /^Month$/i }).first(), page.getByText(/^Month$/i).first()]);
      await settled(page, 700);
      const monthHasHour = await page.getByText(/^07:00$/).first().isVisible().catch(() => false);
      await tryClick(page, [page.getByRole('button', { name: /^Day$/i }).first(), page.getByText(/^Day$/i).first()]);
      await settled(page, 700);
      const dayAgainHasHour = await page.getByText(/^07:00$/).first().isVisible().catch(() => false);

      const ok = dayHasHour && !monthHasHour && dayAgainHasHour;
      if (!ok) {
        const ev = await shotWithRings(page, 't04-visits-toggle-inconsistent', ['main']);
        addBug('Visits Day/Month toggle leaves inconsistent timeline state', 'Low', id,
          'Day view should show hourly timeline; month view should hide it; return to day should restore it.',
          `dayStart=${dayHasHour}, monthStillHasHour=${monthHasHour}, dayReturn=${dayAgainHasHour}`,
          ['Open Visits Day.', 'Switch to Month.', 'Switch back to Day.', 'Verify 07:00 timeline visibility transitions.'],
          [ev]);
        recordTest(id, name, 'FAIL', `dayStart=${dayHasHour}, month=${monthHasHour}, dayReturn=${dayAgainHasHour}`, [ev]);
      } else {
        recordTest(id, name, 'PASS', 'Timeline transitions are consistent');
      }
    }

    // T05
    {
      const id = 'T05';
      const name = 'Visits: Add New Visit opens form and Cancel returns to schedule';
      await page.goto('/visits');
      await settled(page, 900);

      const opened = await tryClick(page, [
        page.getByRole('button', { name: /add new visit/i }).first(),
        page.getByText(/Add New Visit/i).first(),
      ]);

      if (!opened) {
        recordTest(id, name, 'SKIP', 'Add New Visit control unavailable');
      } else {
        await settled(page, 1000);
        const onForm = /addnewvisit/i.test(page.url()) || await page.getByText(/Add New Visit/i).first().isVisible().catch(() => false);
        if (!onForm) {
          const ev = await shotWithRings(page, 't05-add-new-visit-not-opened', ['body']);
          addBug('Add New Visit button does not open creation form', 'High', id,
            'Button should navigate to Add New Visit form.',
            `URL after click: ${page.url()}`,
            ['Open /visits.', 'Click Add New Visit.', 'Verify form opens.'],
            [ev]);
          recordTest(id, name, 'FAIL', `url=${page.url()}`, [ev]);
        } else {
          await tryClick(page, [page.getByRole('button', { name: /^Cancel$/i }).first(), page.getByText(/^Cancel$/i).first()]);
          await settled(page, 900);
          const returned = /\/visits(\?|$)/i.test(page.url()) && !/addnewvisit/i.test(page.url());
          if (!returned) {
            const ev = await shotWithRings(page, 't05-add-visit-cancel-not-returning', ['body']);
            addBug('Cancel in Add New Visit does not return to schedule page', 'Medium', id,
              'Cancel should return to /visits schedule.',
              `URL after cancel: ${page.url()}`,
              ['Open Add New Visit form.', 'Click Cancel.', 'Verify return to /visits.'],
              [ev]);
            recordTest(id, name, 'FAIL', `urlAfterCancel=${page.url()}`, [ev]);
          } else {
            recordTest(id, name, 'PASS', 'Open + Cancel flow works');
          }
        }
      }
    }

    // T06
    {
      const id = 'T06';
      const name = 'Add New Visit: required-field validation appears on empty submit';
      await page.goto('/visits/addnewvisit');
      await settled(page, 1000);

      await tryClick(page, [
        page.getByRole('button', { name: /create visit/i }).first(),
        page.getByText(/Create Visit/i).first(),
      ]);
      await settled(page, 700);

      const errors = await page.getByText(/This field is required/i).count().catch(() => 0);
      if (errors < 3) {
        const ev = await shotWithRings(page, 't06-required-validation-missing', ['button:has-text("Create Visit")']);
        addBug('Add New Visit required validation is incomplete', 'High', id,
          'Submitting empty form should show required validation on all mandatory controls.',
          `Only ${errors} required messages found.`,
          ['Open Add New Visit form.', 'Click Create Visit without data.', 'Count required validation messages.'],
          [ev]);
        recordTest(id, name, 'FAIL', `requiredErrors=${errors}`, [ev]);
      } else {
        recordTest(id, name, 'PASS', `requiredErrors=${errors}`);
      }
    }

    // T07
    {
      const id = 'T07';
      const name = 'Visits List: row opens Visit Details, Back to Visits returns';
      await page.goto('/visits-list');
      await settled(page, 900);
      const row = page.locator('tbody tr').first();
      if (!(await row.isVisible().catch(() => false))) {
        recordTest(id, name, 'SKIP', 'No row available in visits list');
      } else {
        await row.click().catch(() => {});
        await settled(page, 1000);
        const onDetails = /\/visits\/details\//i.test(page.url());
        if (!onDetails) {
          const ev = await shotWithRings(page, 't07-row-does-not-open-detail', ['table']);
          addBug('Visits list row navigation to details is broken', 'High', id,
            'Clicking row should open Visit Details page.',
            `URL after row click: ${page.url()}`,
            ['Open Visits List.', 'Click first row.', 'Verify detail page opens.'],
            [ev]);
          recordTest(id, name, 'FAIL', `url=${page.url()}`, [ev]);
        } else {
          const backClicked = await tryClick(page, [
            page.getByText(/Back to Visits/i).first(),
            page.getByRole('link', { name: /Back to Visits/i }).first(),
          ]);
          await settled(page, 800);
          const backOk = backClicked && /\/visits-list/i.test(page.url());
          if (!backOk) {
            const ev = await shotWithRings(page, 't07-back-to-visits-fails', ['body']);
            addBug('Back to Visits from detail does not return to list', 'Medium', id,
              'Back action should navigate to /visits-list.',
              `URL after back action: ${page.url()}`,
              ['Open visit details.', 'Click Back to Visits.', 'Verify return to list route.'],
              [ev]);
            recordTest(id, name, 'FAIL', `urlAfterBack=${page.url()}`, [ev]);
          } else {
            recordTest(id, name, 'PASS', 'Row navigation + back navigation work');
          }
        }
      }
    }

    // T08
    {
      const id = 'T08';
      const name = 'Visit Details: tabs switch content (Attachments / Visit Details)';
      await page.goto('/visits-list');
      await settled(page, 800);
      const row = page.locator('tbody tr').first();
      if (!(await row.isVisible().catch(() => false))) {
        recordTest(id, name, 'SKIP', 'No visits row found');
      } else {
        await row.click().catch(() => {});
        await settled(page, 900);

        const attachClicked = await tryClick(page, [
          page.getByText(/^Attachments$/i).first(),
          page.getByRole('tab', { name: /attachments/i }).first(),
        ]);
        await settled(page, 700);

        const attachmentSignals =
          (await page.getByText(/No document yet/i).first().isVisible().catch(() => false)) ||
          (await page.getByRole('button', { name: /Upload/i }).first().isVisible().catch(() => false));

        await tryClick(page, [
          page.getByText(/^Visit Details$/i).first(),
          page.getByRole('tab', { name: /visit details/i }).first(),
        ]);
        await settled(page, 600);

        const detailSignals = await page.getByText(/Description|Visit Details|Client Signature/i).first().isVisible().catch(() => false);

        const ok = attachClicked && attachmentSignals && detailSignals;
        if (!ok) {
          const ev = await shotWithRings(page, 't08-tabs-content-switch-fail', ['main']);
          addBug('Visit detail tabs do not reliably switch to expected content', 'Medium', id,
            'Attachments tab should show upload/empty-doc state; Visit Details should show detail blocks.',
            `attachClicked=${attachClicked}, attachmentSignals=${attachmentSignals}, detailSignals=${detailSignals}`,
            ['Open Visit Details.', 'Open Attachments tab.', 'Verify attachment section.', 'Return to Visit Details tab and verify content.'],
            [ev]);
          recordTest(id, name, 'FAIL', `attach=${attachmentSignals}, details=${detailSignals}`, [ev]);
        } else {
          recordTest(id, name, 'PASS', 'Tab content switching verified');
        }
      }
    }

    // T09
    {
      const id = 'T09';
      const name = 'Planner: Month View <-> Events View toggle renders each mode correctly';
      await page.goto('/planner');
      await settled(page, 1000);

      const eventsClicked = await tryClick(page, [
        page.getByRole('button', { name: /Events View/i }).first(),
        page.getByText(/Events View/i).first(),
      ]);
      await settled(page, 800);

      const eventsSignal =
        (await page.getByText(/Booking Person|No engineers assigned|No visits scheduled/i).first().isVisible().catch(() => false)) ||
        (await page.locator('button:has(svg[data-lucide="eye"])').first().isVisible().catch(() => false));

      const monthClicked = await tryClick(page, [
        page.getByRole('button', { name: /Month View/i }).first(),
        page.getByText(/Month View/i).first(),
      ]);
      await settled(page, 700);

      const monthSignal =
        (await page.getByText(/^Op$/).first().isVisible().catch(() => false)) ||
        (await page.getByText(/February|January|March|April|May|June|July|August|September|October|November|December/i).first().isVisible().catch(() => false));

      const ok = eventsClicked && monthClicked && eventsSignal && monthSignal;
      if (!ok) {
        const ev = await shotWithRings(page, 't09-planner-toggle-render-fail', ['main']);
        addBug('Planner mode toggle fails to render expected view content', 'Medium', id,
          'Events View and Month View should both render their specific content blocks.',
          `eventsClicked=${eventsClicked}, monthClicked=${monthClicked}, eventsSignal=${eventsSignal}, monthSignal=${monthSignal}`,
          ['Open Planner.', 'Switch to Events View and verify events content.', 'Switch back to Month View and verify calendar content.'],
          [ev]);
        recordTest(id, name, 'FAIL', `eventsSignal=${eventsSignal}, monthSignal=${monthSignal}`, [ev]);
      } else {
        recordTest(id, name, 'PASS', 'Both planner modes render correctly');
      }
    }

    // T10
    {
      const id = 'T10';
      const name = 'Dashboard: Status filter scopes jobs and Clear Filters restores list';
      await page.goto('/dashboard');
      await settled(page, 1000);

      const before = await tableRows(page).count().catch(() => 0);
      const statusSelected = await selectDropdownByPlaceholder(page, /Status/i, /In Progress/i);
      await settled(page, 600);
      if (!statusSelected) {
        const search = page.getByPlaceholder(/Search/i).first();
        if (!(await search.isVisible().catch(() => false))) {
          recordTest(id, name, 'SKIP', 'Dashboard status and search controls unavailable');
        } else {
          await search.fill('Old Mill');
          await settled(page, 500);
          const filtered = await tableRows(page).count().catch(() => 0);
          await tryClick(page, [
            page.getByText(/Clear Filters/i).first(),
            page.getByRole('button', { name: /Clear Filters/i }).first(),
          ]);
          await settled(page, 700);
          const restored = await tableRows(page).count().catch(() => 0);
          const ok = filtered <= before && restored >= filtered;
          if (!ok) {
            const ev = await shotWithRings(page, 't10-dashboard-search-clear-fallback-fail', ['main']);
            addBug('Dashboard search/clear fallback leaves inconsistent row set', 'Medium', id,
              'Search should scope rows and Clear Filters should restore the list.',
              `before=${before}, filtered=${filtered}, restored=${restored}`,
              ['Open Dashboard.', 'Search for Old Mill.', 'Click Clear Filters.', 'Compare row counts.'],
              [ev]);
            recordTest(id, name, 'FAIL', `fallback before=${before}, filtered=${filtered}, restored=${restored}`, [ev]);
          } else {
            recordTest(id, name, 'PASS', `fallback before=${before}, filtered=${filtered}, restored=${restored}`);
          }
        }
      } else {
        const filtered = await tableRows(page).count().catch(() => 0);
        await tryClick(page, [
          page.getByText(/Clear Filters/i).first(),
          page.getByRole('button', { name: /Clear Filters/i }).first(),
        ]);
        await settled(page, 700);
        const restored = await tableRows(page).count().catch(() => 0);
        const ok = filtered <= before && restored >= filtered;
        if (!ok) {
          const ev = await shotWithRings(page, 't10-dashboard-filter-restore-fail', ['main']);
          addBug('Dashboard status filter / clear filters leaves inconsistent row set', 'Medium', id,
            'Applying status filter should scope rows; clearing should restore broader list.',
            `before=${before}, filtered=${filtered}, restored=${restored}`,
            ['Open Dashboard.', 'Apply Status=In Progress.', 'Click Clear Filters.', 'Compare row counts.'],
            [ev]);
          recordTest(id, name, 'FAIL', `before=${before}, filtered=${filtered}, restored=${restored}`, [ev]);
        } else {
          recordTest(id, name, 'PASS', `before=${before}, filtered=${filtered}, restored=${restored}`);
        }
      }
    }
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    runDir: RUN_DIR,
    tests,
    bugs,
  };
  fs.writeFileSync(path.join(RUN_DIR, 'summary.json'), JSON.stringify(summary, null, 2));

  const html = renderHtml();
  const htmlOut = path.join(process.cwd(), 'qa-artifacts', 'hydrocert_senior_10_different_tests_report.html');
  fs.writeFileSync(htmlOut, html, 'utf-8');

  log(`Summary JSON: ${path.join(RUN_DIR, 'summary.json')}`);
  log(`HTML report: ${htmlOut}`);
  log(`Tests=${tests.length} PASS=${tests.filter((t) => t.status === 'PASS').length} FAIL=${tests.filter((t) => t.status === 'FAIL').length} SKIP=${tests.filter((t) => t.status === 'SKIP').length} Bugs=${bugs.length}`);
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
