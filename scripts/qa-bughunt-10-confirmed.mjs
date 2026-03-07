import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.HYDROCERT_BASE_URL || 'http://localhost:5173';
const EMAIL = process.env.HYDROCERT_QA_EMAIL || '';
const PASSWORD = process.env.HYDROCERT_QA_PASSWORD || '';

const runStamp = new Date().toISOString().replace(/[.:]/g, '-');
const RUN_DIR = path.join(process.cwd(), 'qa-artifacts', 'evidence', `bughunt-10-confirmed-${runStamp}`);
const SHOT_DIR = path.join(RUN_DIR, 'screenshots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const checks = [
  { id: 'BUG-001', page: '/customers', placeholder: 'Search customers, sites, codes, city, postal code...', severity: 'MEDIUM', location: 'Customers > Filter Customers', title: 'Customers search input missing programmatic label' },
  { id: 'BUG-002', page: '/customers', placeholder: 'Customer Name', severity: 'MEDIUM', location: 'Customers > Filter Customers', title: 'Customer Name filter missing programmatic label' },
  { id: 'BUG-003', page: '/customers', placeholder: 'Contract Manager', severity: 'MEDIUM', location: 'Customers > Filter Customers', title: 'Contract Manager filter missing programmatic label' },
  { id: 'BUG-004', page: '/customers', placeholder: 'Booked By', severity: 'MEDIUM', location: 'Customers > Filter Customers', title: 'Booked By filter missing programmatic label (Customers)' },

  { id: 'BUG-005', page: '/visits-list', placeholder: 'Search visits, locations, clients...', severity: 'MEDIUM', location: 'Visits List > Filter Visits', title: 'Visits search input missing programmatic label' },
  { id: 'BUG-006', page: '/visits-list', placeholder: 'Visit reference', severity: 'MEDIUM', location: 'Visits List > Filter Visits', title: 'Visit reference filter missing programmatic label' },

  { id: 'BUG-007', page: '/visits/addnewvisit', selector: 'button#status[role="combobox"]', severity: 'MEDIUM', location: 'Add New Visit > Visit Details', title: 'Status combobox missing programmatic label' },
  { id: 'BUG-008', page: '/visits/addnewvisit', selector: 'button#from[role="combobox"]', severity: 'MEDIUM', location: 'Add New Visit > Visit Details', title: 'Start time combobox missing programmatic label' },
  { id: 'BUG-009', page: '/visits/addnewvisit', selector: 'button#to[role="combobox"]', severity: 'MEDIUM', location: 'Add New Visit > Visit Details', title: 'End time combobox missing programmatic label' },
  { id: 'BUG-010', page: '/visits/addnewvisit', selector: 'input[name="points"]', severity: 'MEDIUM', location: 'Add New Visit > Visit Details', title: 'Points numeric input missing programmatic label' },
];

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function settled(page, ms = 650) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

async function ensureLoggedIn(page) {
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 35000 });
  await settled(page, 1200);
  if (page.url().includes('/login')) {
    await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL);
    await page.locator('input[type="password"], input[name="password"]').first().fill(PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).first().click();
    await settled(page, 1500);
  }
  if (page.url().includes('/login')) {
    throw new Error('Login failed.');
  }
}

async function ensureRingStyle(page) {
  await page.evaluate(() => {
    if (document.getElementById('qa-ring-style')) return;
    const s = document.createElement('style');
    s.id = 'qa-ring-style';
    s.textContent = `[data-qa-ring='1']{outline:3px solid #ff1e1e !important; box-shadow:0 0 0 5px rgba(255,30,30,.22)!important; border-radius:8px !important;}`;
    document.head.appendChild(s);
  });
}

async function clearRing(page) {
  await page.evaluate(() => {
    document.querySelectorAll('[data-qa-ring="1"]').forEach((n) => n.removeAttribute('data-qa-ring'));
  }).catch(() => {});
}

async function ringNode(page, locator) {
  await ensureRingStyle(page);
  await clearRing(page);
  const handle = await locator.elementHandle();
  if (!handle) return false;
  await page.evaluate((el) => el.setAttribute('data-qa-ring', '1'), handle).catch(() => {});
  return true;
}

async function auditLabel(locator) {
  const info = await locator.evaluate((el) => {
    const id = el.id || '';
    const ariaLabel = (el.getAttribute('aria-label') || '').trim();
    const ariaLabelledBy = (el.getAttribute('aria-labelledby') || '').trim();
    const wrappedLabel = el.closest('label');

    let byFor = null;
    if (id) {
      try {
        byFor = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      } catch {
        byFor = document.querySelector(`label[for="${id.replace(/"/g, '\\\"')}"]`);
      }
    }

    let labelledByText = '';
    if (ariaLabelledBy) {
      labelledByText = ariaLabelledBy
        .split(/\s+/)
        .map((rid) => document.getElementById(rid)?.textContent?.trim() || '')
        .filter(Boolean)
        .join(' ')
        .trim();
    }

    const labelTextByFor = byFor?.textContent?.trim() || '';
    const labelTextWrapped = wrappedLabel?.textContent?.trim() || '';

    const hasLabel = Boolean(ariaLabel || labelledByText || labelTextByFor || labelTextWrapped);

    return {
      tag: el.tagName,
      type: el.getAttribute('type') || '',
      id,
      name: el.getAttribute('name') || '',
      placeholder: el.getAttribute('placeholder') || '',
      ariaLabel,
      ariaLabelledBy,
      labelledByText,
      labelTextByFor,
      labelTextWrapped,
      hasLabel,
    };
  });

  return info;
}

function buildReport(findings, testsMeta) {
  const sevCounts = {
    critical: findings.filter((f) => f.severity === 'CRITICAL').length,
    high: findings.filter((f) => f.severity === 'HIGH').length,
    medium: findings.filter((f) => f.severity === 'MEDIUM').length,
    low: findings.filter((f) => f.severity === 'LOW').length,
  };

  const cards = findings.map((f) => {
    const steps = f.steps.map((s) => `<li>${esc(s)}</li>`).join('');
    const ev = f.evidence.map((rel, i) => `
      <div class="screenshot-container">
        <h5>Screenshot Evidence ${i + 1}</h5>
        <a href="${esc(rel)}" target="_blank"><img src="${esc(rel)}" alt="${esc(path.basename(rel))}"></a>
      </div>`).join('');

    return `
      <div class="bug-card medium">
        <h4>
          <span class="severity medium">MEDIUM</span>
          ${esc(f.id)}: ${esc(f.title)}
          <span class="new-badge">NEW</span>
        </h4>
        <p><strong>Location:</strong> ${esc(f.location)}</p>
        <p><strong>Description:</strong> ${esc(f.description)}</p>
        <p><strong>Expected:</strong> ${esc(f.expected)}</p>
        <p><strong>Actual:</strong> ${esc(f.actual)}</p>
        <p><strong>Impact:</strong> <span class="impact">${esc(f.impact)}</span></p>
        <div class="steps">
          <p><strong>Steps to Reproduce:</strong></p>
          <ol>${steps}</ol>
        </div>
        ${ev}
      </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HydroCert QA Test Report - Bugs & Issues</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background: #f5f7fa; }
    .container { max-width: 1100px; margin: 0 auto; padding: 20px; }
    header { background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); color: white; padding: 30px 20px; text-align: center; border-radius: 8px; margin-bottom: 25px; }
    header h1 { font-size: 1.8em; margin-bottom: 8px; }
    header .date { font-size: 1em; opacity: 0.9; }
    .section { background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .section h2 { color: #1e3c72; border-bottom: 2px solid #2a5298; padding-bottom: 8px; margin-bottom: 12px; font-size: 1.3em; }
    .section-intro { color: #dc3545; font-weight: 600; margin-bottom: 14px; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin: 15px 0; }
    .summary-card { padding: 20px; border-radius: 8px; text-align: center; }
    .summary-card.critical { background: #dc3545; color: white; }
    .summary-card.fail { background: #f8d7da; color: #721c24; }
    .summary-card.warning { background: #fff3cd; color: #856404; }
    .summary-card.info { background: #d1ecf1; color: #0c5460; }
    .summary-card .number { font-size: 2.5em; font-weight: bold; }
    .summary-card .label { font-size: 0.9em; margin-top: 5px; }
    .new-badge { background: #28a745; color: #fff; font-size: 0.72em; padding: 2px 8px; border-radius: 12px; margin-left: 6px; font-weight: 700; vertical-align: middle; }
    .severity { padding: 3px 10px; border-radius: 12px; font-size: 0.75em; font-weight: 700; display: inline-block; text-transform: uppercase; }
    .severity.medium { background: #fd7e14; color: white; }
    .bug-card { border: 1px solid #e0e0e0; border-radius: 6px; padding: 15px; margin: 12px 0; border-left: 4px solid #fd7e14; background: #fffaf5; }
    .bug-card h4 { color: #222; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 1.03em; }
    .bug-card p { margin: 6px 0; color: #444; font-size: 0.95em; }
    .impact { color: #b02a37; font-weight: 700; }
    .steps { background: #f3f4f6; padding: 12px; border-radius: 4px; margin: 12px 0; }
    .steps ol { margin-left: 20px; }
    .steps li { margin: 3px 0; }
    .screenshot-container { margin: 15px 0; background: #f8f9fa; border-radius: 8px; padding: 12px; border: 1px solid #e0e0e0; }
    .screenshot-container h5 { color: #555; margin-bottom: 8px; font-size: 0.9em; }
    .screenshot-container img { width: 100%; max-width: 700px; border-radius: 6px; display: block; margin: 0 auto; border: 1px solid #ddd; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>HydroCert QA Test Report - Bugs & Issues</h1>
      <p class="date">${esc(new Date().toISOString())} | UI/A11y Bug Hunt | New Run</p>
    </header>

    <section class="section">
      <h2>Test Results Summary</h2>
      <div class="summary-grid">
        <div class="summary-card critical">
          <div class="number">${sevCounts.critical}</div>
          <div class="label">Critical Bugs</div>
        </div>
        <div class="summary-card.fail">
          <div class="number">${sevCounts.high}</div>
          <div class="label">High Bugs</div>
        </div>
        <div class="summary-card.warning">
          <div class="number">${sevCounts.medium}</div>
          <div class="label">Medium Bugs</div>
        </div>
        <div class="summary-card.info">
          <div class="number">${sevCounts.low}</div>
          <div class="label">Low Issues</div>
        </div>
        <div class="summary-card.info">
          <div class="number">${findings.length}</div>
          <div class="label">Total Issues</div>
        </div>
      </div>
      <p><strong>Run details:</strong> ${esc(testsMeta)}</p>
    </section>

    <section class="section">
      <h2>Medium Severity Bugs <span class="new-badge">NEW</span></h2>
      <p class="section-intro">Each issue below is confirmed with direct DOM audit + screenshot evidence with red highlight.</p>
      ${cards}
    </section>
  </div>
</body>
</html>`;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 1536, height: 864 } });
  const page = await context.newPage();
  const findings = [];

  try {
    await ensureLoggedIn(page);

    for (const c of checks) {
      await page.goto(c.page, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await settled(page, 850);

      const locator = c.selector ? page.locator(c.selector).first() : page.getByPlaceholder(c.placeholder).first();
      const visible = await locator.isVisible().catch(() => false);
      if (!visible) continue;

      const audit = await auditLabel(locator);
      if (!audit.hasLabel) {
        await ringNode(page, locator);

        const stem = c.placeholder
          ? c.placeholder.toLowerCase().replace(/[^a-z0-9]+/g, '-')
          : c.selector.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);

        const file = path.join(SHOT_DIR, `${c.id.toLowerCase()}-${stem}.png`);
        await page.screenshot({ path: file, fullPage: true });
        await clearRing(page);

        findings.push({
          id: c.id,
          title: c.title,
          severity: c.severity,
          location: c.location,
          description: 'Input control has no programmatic label metadata for assistive technologies.',
          expected: 'Control should expose an accessible name via label, aria-label, or aria-labelledby.',
          actual: `placeholder="${audit.placeholder}", id="${audit.id}", name="${audit.name}", aria-label="${audit.ariaLabel}", aria-labelledby="${audit.ariaLabelledBy}", label-for-text="${audit.labelTextByFor}", wrapped-label-text="${audit.labelTextWrapped}".`,
          impact: 'Screen reader users cannot reliably identify filter purpose; this is an accessibility and UX defect.',
          steps: [
            `Open ${c.page}.`,
            c.placeholder
              ? `Locate field with placeholder "${c.placeholder}".`
              : `Locate control by selector "${c.selector}".`,
            'Inspect accessible name sources (label/aria-label/aria-labelledby).',
            'Observe that all are missing/empty.'
          ],
          evidence: [path.relative(path.join(process.cwd(), 'qa-artifacts'), file).split(path.sep).join('/')],
        });
      }
    }

    const summary = {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      checks: checks.length,
      findings: findings.length,
      runDir: RUN_DIR,
      items: findings,
    };

    fs.writeFileSync(path.join(RUN_DIR, 'summary.json'), JSON.stringify(summary, null, 2));

    const reportPath = path.join(process.cwd(), 'qa-artifacts', 'hydrocert_qa_report_bugs_only.html');
    const html = buildReport(findings, `checks=${checks.length}, findings=${findings.length}, run=${path.basename(RUN_DIR)}`);
    fs.writeFileSync(reportPath, html, 'utf-8');

    console.log(`[bughunt] summary: ${path.join(RUN_DIR, 'summary.json')}`);
    console.log(`[bughunt] report: ${reportPath}`);
    console.log(`[bughunt] findings: ${findings.length}`);

  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
})();
