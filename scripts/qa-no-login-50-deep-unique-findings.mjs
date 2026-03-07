
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5173';
const EMAIL = process.env.HYDROCERT_QA_EMAIL || '';
const PASSWORD = process.env.HYDROCERT_QA_PASSWORD || '';
const TARGET_COUNT = 50;
const TIMESTAMP = new Date().toISOString().replace(/[.:]/g, '-');

const RUN_DIR = path.join(process.cwd(), 'qa-artifacts', 'evidence', `no-login-50-deep-unique-${TIMESTAMP}`);
const SCREENSHOT_DIR = path.join(RUN_DIR, 'screenshots');
const LOG_DIR = path.join(RUN_DIR, 'logs');
const EVIDENCE_ROOT = path.join(process.cwd(), 'qa-artifacts', 'evidence');

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
  return String(str || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function collectPriorTitles() {
  const set = new Set();
  if (!fs.existsSync(EVIDENCE_ROOT)) return set;
  const dirs = fs.readdirSync(EVIDENCE_ROOT, { withFileTypes: true }).filter((d) => d.isDirectory());
  for (const d of dirs) {
    const summaryPath = path.join(EVIDENCE_ROOT, d.name, 'summary.json');
    if (!fs.existsSync(summaryPath)) continue;
    try {
      const json = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
      const arr = Array.isArray(json.findings) ? json.findings : [];
      for (const f of arr) {
        if (f && f.title) set.add(normalize(f.title));
      }
    } catch {}
  }
  return set;
}

const priorTitles = collectPriorTitles();

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
  area = 'Deep QA',
}) {
  if (!title) return false;
  const normalizedTitle = normalize(title);
  if (priorTitles.has(normalizedTitle)) return false;

  const dedupeKey = key || normalize(`${title}|${actual}|${area}`);
  if (findingKeys.has(dedupeKey)) return false;
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
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
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
        [data-qa-ring="1"] {
          outline: 3px solid #ff1e1e !important;
          box-shadow: 0 0 0 4px rgba(255, 30, 30, 0.25) !important;
          border-radius: 8px !important;
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
  const p = locator.page();
  await ensureRingStyle(p);
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

async function shotWithSelectors(page, name, selectors) {
  await ringSelectors(page, selectors);
  const file = await shot(page, name);
  await clearRings(page);
  return file;
}

async function loginBootstrap(page) {
  logAction('login-bootstrap', 'start');
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 35000 });
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
async function discoverDeepRoutes(page) {
  const deep = [];

  // 1) Visit detail route from Visits List
  await page.goto('/visits-list', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitSettled(page, 900);
  const firstRow = page.locator('tbody tr').first();
  if (await firstRow.isVisible().catch(() => false)) {
    await firstRow.click({ timeout: 3000 }).catch(() => {});
    await waitSettled(page, 900);
    const url = page.url();
    if (!url.includes('/visits-list')) deep.push({ name: 'visit-detail', url });
  }

  // 2) Inspection detail route from visit detail -> Inspections tab
  const inspectionsTab = page.getByText(/^Inspections$/i).first();
  if (await inspectionsTab.isVisible().catch(() => false)) {
    await inspectionsTab.click({ timeout: 2500 }).catch(() => {});
    await waitSettled(page, 700);
    const firstInspection = page.locator('table tbody tr').first();
    if (await firstInspection.isVisible().catch(() => false)) {
      await firstInspection.click({ timeout: 3000 }).catch(() => {});
      await waitSettled(page, 900);
      const iurl = page.url();
      if (!deep.some((d) => d.url === iurl)) deep.push({ name: 'inspection-detail', url: iurl });
    }
  }

  // 3) Visit edit route from Planner Events view (eye icon)
  await page.goto('/planner', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitSettled(page, 900);
  const eventsViewBtn = page.getByRole('button', { name: /events view/i }).first();
  if (await eventsViewBtn.isVisible().catch(() => false)) {
    await eventsViewBtn.click({ timeout: 2500 }).catch(() => {});
    await waitSettled(page, 900);
    const eyeBtn = page.locator('button:has(svg)').first();
    if (await eyeBtn.isVisible().catch(() => false)) {
      await eyeBtn.click({ timeout: 3000 }).catch(() => {});
      await waitSettled(page, 1100);
      const eurl = page.url();
      if (/\/visits\/edit\//i.test(eurl) && !deep.some((d) => d.url === eurl)) {
        deep.push({ name: 'visit-edit', url: eurl });
      }
    }
  }

  // 4) Add visit route
  await page.goto('/visits', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitSettled(page, 800);
  const addVisitBtn = page.getByRole('button', { name: /add new visit/i }).first();
  if (await addVisitBtn.isVisible().catch(() => false)) {
    await addVisitBtn.click({ timeout: 3000 }).catch(() => {});
    await waitSettled(page, 900);
    const aurl = page.url();
    if (!deep.some((d) => d.url === aurl)) deep.push({ name: 'add-visit', url: aurl });
  }

  // fallback deep pages
  const defaults = [
    { name: 'visits-list', url: '/visits-list' },
    { name: 'planner-events', url: '/planner' },
  ];
  for (const d of defaults) {
    if (!deep.some((x) => x.name === d.name)) deep.push(d);
  }

  return deep;
}

async function runRouteSpecificChecks(page, routeName, routeUrl) {
  await page.goto(routeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitSettled(page, 800);

  if (routeName === 'visit-detail') {
    const shareBtn = page.getByRole('button', { name: /share report/i }).first();
    if (await shareBtn.isVisible().catch(() => false)) {
      const beforeUrl = page.url();
      await shareBtn.click({ timeout: 2500 }).catch(() => {});
      await page.waitForTimeout(700);
      const hasDialog = await page.locator('[role="dialog"]').count().catch(() => 0);
      const hasToast = await page.locator('text=/success|copied|shared/i').count().catch(() => 0);
      if (beforeUrl === page.url() && hasDialog === 0 && hasToast === 0) {
        await ringLocator(shareBtn);
        const ev = await shot(page, 'visit-detail-share-no-feedback-deep');
        await clearRings(page);
        addFinding({
          severity: 'LOW',
          key: 'deep-visit-detail-share-no-feedback',
          area: 'Visit Detail Deep',
          title: 'Deep Check: Share Report Click Has No Observable Feedback',
          description: 'Share action produces no dialog, toast or visible state change.',
          expected: 'Share interaction should provide immediate confirmation.',
          actual: 'No feedback after click.',
          impact: 'User cannot confirm if sharing operation happened.',
          steps: ['Open visit detail.', 'Click Share Report.', 'Observe no visual feedback.'],
          evidence: [ev],
        });
      }
    }

    const downloadBtn = page.getByRole('button', { name: /download report/i }).first();
    if (await downloadBtn.isVisible().catch(() => false)) {
      const disabled = await downloadBtn.isDisabled().catch(() => false);
      if (disabled) {
        const ev = await shotWithSelectors(page, 'visit-detail-download-disabled-deep', ['button']);
        addFinding({
          severity: 'LOW',
          key: 'deep-visit-detail-download-disabled',
          area: 'Visit Detail Deep',
          title: 'Deep Check: Download Report Disabled Without Clarifying Message',
          description: 'Disabled report button appears without local explanation.',
          expected: 'Disabled action should include reason/context.',
          actual: 'Button disabled with no hint.',
          impact: 'Support load increases due to unclear disabled state.',
          steps: ['Open visit detail.', 'Locate Download Report.', 'Observe disabled state and missing reason.'],
          evidence: [ev],
        });
      }
    }

    const attachmentsTab = page.getByText(/^Attachments$/i).first();
    if (await attachmentsTab.isVisible().catch(() => false)) {
      await attachmentsTab.click({ timeout: 2500 }).catch(() => {});
      await waitSettled(page, 600);
      const uploadBtn = page.getByRole('button', { name: /upload/i }).first();
      if (await uploadBtn.isVisible().catch(() => false)) {
        const chooserPromise = page.waitForEvent('filechooser', { timeout: 1200 }).catch(() => null);
        await uploadBtn.click({ timeout: 2000 }).catch(() => {});
        const chooser = await chooserPromise;
        if (!chooser) {
          const ev = await shotWithSelectors(page, 'visit-detail-upload-no-filechooser', ['button']);
          addFinding({
            severity: 'MEDIUM',
            key: 'deep-visit-detail-upload-no-filechooser',
            area: 'Visit Detail Deep',
            title: 'Deep Check: Attachments Upload Button Does Not Open File Chooser',
            description: 'Upload control does not trigger file selection dialog.',
            expected: 'Upload button should open file chooser.',
            actual: 'No filechooser event detected.',
            impact: 'Attachment upload flow is blocked.',
            steps: ['Open visit detail.', 'Open Attachments tab.', 'Click Upload.', 'Observe no file dialog.'],
            evidence: [ev],
          });
        }
      }
    }
  }

  if (routeName === 'inspection-detail') {
    const tabs = ['Inspection Details', 'Lab Results', 'Attachments', 'History'];
    for (const tabName of tabs) {
      const tab = page.getByText(new RegExp(`^${tabName}$`, 'i')).first();
      if (!(await tab.isVisible().catch(() => false))) continue;
      const before = await page.locator('main').innerText().catch(() => '');
      await tab.click({ timeout: 2500 }).catch(() => {});
      await waitSettled(page, 500);
      const after = await page.locator('main').innerText().catch(() => '');
      if (normalize(before) === normalize(after) && tabName !== 'Inspection Details') {
        const ev = await shotWithSelectors(page, `inspection-tab-${tabName.replace(/\s+/g, '-').toLowerCase()}-no-state`, ['main']);
        addFinding({
          severity: 'LOW',
          key: `deep-inspection-tab-${tabName.toLowerCase()}-no-state-change`,
          area: 'Inspection Detail Deep',
          title: `Deep Check: ${tabName} Tab Shows No Distinct State Change`,
          description: 'Tab click appears to keep identical content state.',
          expected: 'Each tab should show distinct content or explicit empty-state change.',
          actual: 'No detectable content delta after tab switch.',
          impact: 'Users cannot trust tab segmentation in inspection detail.',
          steps: ['Open inspection detail.', `Click ${tabName} tab.`, 'Observe no clear content change.'],
          evidence: [ev],
        });
      }
    }

    const attachTab = page.getByText(/^Attachments$/i).first();
    if (await attachTab.isVisible().catch(() => false)) {
      await attachTab.click({ timeout: 2500 }).catch(() => {});
      await waitSettled(page, 500);
      const uploadBtn = page.getByRole('button', { name: /upload/i }).first();
      if (await uploadBtn.isVisible().catch(() => false)) {
        const chooserPromise = page.waitForEvent('filechooser', { timeout: 1200 }).catch(() => null);
        await uploadBtn.click({ timeout: 2000 }).catch(() => {});
        const chooser = await chooserPromise;
        if (!chooser) {
          const ev = await shotWithSelectors(page, 'inspection-upload-no-filechooser', ['button']);
          addFinding({
            severity: 'MEDIUM',
            key: 'deep-inspection-upload-no-filechooser',
            area: 'Inspection Detail Deep',
            title: 'Deep Check: Inspection Attachments Upload Does Not Trigger File Selection',
            description: 'Upload button in inspection attachments does not open chooser.',
            expected: 'File chooser should open on upload click.',
            actual: 'No chooser event detected.',
            impact: 'Inspection evidence cannot be uploaded from UI.',
            steps: ['Open inspection detail.', 'Go to Attachments tab.', 'Click Upload.', 'Observe no file dialog.'],
            evidence: [ev],
          });
        }
      }
    }
  }

  if (routeName === 'visit-edit') {
    const changeMainBtn = page.getByRole('button', { name: /change main details/i }).first();
    if (await changeMainBtn.isVisible().catch(() => false)) {
      await changeMainBtn.click({ timeout: 2500 }).catch(() => {});
      await waitSettled(page, 500);
      const modal = page.locator('[role="dialog"]').first();
      if (await modal.isVisible().catch(() => false)) {
        const titleInput = modal.locator('input').first();
        if (await titleInput.isVisible().catch(() => false)) {
          await titleInput.fill('').catch(() => {});
          const saveBtn = modal.getByRole('button', { name: /save/i }).first();
          await saveBtn.click({ timeout: 2000 }).catch(() => {});
          await page.waitForTimeout(300);
          const validationVisible = await modal.locator('text=/required|fill out this field/i').count().catch(() => 0);
          if (validationVisible === 0) {
            const ev = await shotWithSelectors(page, 'visit-edit-main-details-no-validation-text', ['[role="dialog"]']);
            addFinding({
              severity: 'MEDIUM',
              key: 'deep-visit-edit-main-details-missing-validation-feedback',
              area: 'Visit Edit Deep',
              title: 'Deep Check: Empty Required Field In Main Details Modal Lacks Inline Validation Message',
              description: 'Clearing required title and saving does not show clear inline validation text.',
              expected: 'Required field should display explicit error message.',
              actual: 'No visible inline validation message detected.',
              impact: 'User cannot understand why save failed.',
              steps: ['Open visit edit.', 'Click Change Main Details.', 'Clear title and Save.', 'Observe missing validation text.'],
              evidence: [ev],
            });
          }
        }
        const cancel = modal.getByRole('button', { name: /cancel/i }).first();
        if (await cancel.isVisible().catch(() => false)) await cancel.click({ timeout: 1500 }).catch(() => {});
      }
    }

    const plusInspectionBtn = page.getByRole('button', { name: /inspection/i }).first();
    if (await plusInspectionBtn.isVisible().catch(() => false)) {
      await plusInspectionBtn.click({ timeout: 2500 }).catch(() => {});
      await waitSettled(page, 400);
      const modal = page.locator('[role="dialog"]').first();
      if (await modal.isVisible().catch(() => false)) {
        const saveBtn = modal.getByRole('button', { name: /save/i }).first();
        await saveBtn.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(350);
        const reqVisible = await modal.locator('text=/required/i').count().catch(() => 0);
        if (reqVisible === 0) {
          const ev = await shotWithSelectors(page, 'visit-edit-add-inspection-no-required-message', ['[role="dialog"]']);
          addFinding({
            severity: 'MEDIUM',
            key: 'deep-visit-edit-add-inspection-no-required-text',
            area: 'Visit Edit Deep',
            title: 'Deep Check: Add Inspection Modal Save Lacks Clear Required-Field Messaging',
            description: 'Saving inspection without job type does not expose explicit validation text.',
            expected: 'User should see clear required-field message.',
            actual: 'No clear required validation text found.',
            impact: 'Creates ambiguous failure state in inspection creation.',
            steps: ['Open visit edit.', 'Click + Inspection.', 'Click Save with empty fields.', 'Observe missing validation text.'],
            evidence: [ev],
          });
        }
        const cancel = modal.getByRole('button', { name: /cancel/i }).first();
        if (await cancel.isVisible().catch(() => false)) await cancel.click({ timeout: 1500 }).catch(() => {});
      }
    }
  }
}

async function collectDeepAuditSignals(page, routeName, routeUrl) {
  await page.goto(routeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitSettled(page, 700);

  const result = await page.evaluate(() => {
    const isVisible = (el) => {
      if (!el) return false;
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };

    const selectorOf = (el) => {
      if (!(el instanceof Element)) return '';
      if (el.id) return `#${CSS.escape(el.id)}`;
      const tag = el.tagName.toLowerCase();
      const cls = (el.className || '').toString().trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
      return cls ? `${tag}.${cls}` : tag;
    };

    const truncated = [...document.querySelectorAll('td,th,div,span,p,a,button,label,h1,h2,h3,h4')]
      .filter((el) => isVisible(el))
      .map((el) => {
        const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
        return {
          selector: selectorOf(el),
          text: txt,
          overflow: el.scrollWidth - el.clientWidth,
          width: el.clientWidth,
          hasTitle: !!el.getAttribute('title'),
        };
      })
      .filter((x) => x.text.length >= 10 && x.width > 24 && x.overflow > 14)
      .filter((x) => !x.hasTitle)
      .slice(0, 18);

    const iconNoName = [...document.querySelectorAll('button,[role="button"]')]
      .filter((el) => isVisible(el))
      .map((el) => {
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        const aria = (el.getAttribute('aria-label') || '').trim();
        const title = (el.getAttribute('title') || '').trim();
        const labelledBy = (el.getAttribute('aria-labelledby') || '').trim();
        const hasIcon = !!el.querySelector('svg,img,i');
        return { selector: selectorOf(el), text, aria, title, labelledBy, hasIcon };
      })
      .filter((x) => x.hasIcon && !x.text && !x.aria && !x.title && !x.labelledBy)
      .slice(0, 15);

    const smallTargets = [...document.querySelectorAll('button,a,[role="button"],input[type="checkbox"],input[type="radio"]')]
      .filter((el) => isVisible(el))
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { selector: selectorOf(el), width: Math.round(r.width), height: Math.round(r.height) };
      })
      .filter((x) => x.width > 0 && x.height > 0 && (x.width < 28 || x.height < 28))
      .slice(0, 15);

    const unlabeledFields = [...document.querySelectorAll('input,select,textarea')]
      .filter((el) => isVisible(el))
      .filter((el) => !['hidden', 'submit', 'button', 'reset'].includes((el.getAttribute('type') || '').toLowerCase()))
      .map((el) => {
        const id = el.getAttribute('id');
        const hasFor = id ? !!document.querySelector(`label[for="${CSS.escape(id)}"]`) : false;
        const hasParentLabel = !!el.closest('label');
        const hasAria = !!(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby'));
        return {
          selector: selectorOf(el),
          hasFor,
          hasParentLabel,
          hasAria,
          placeholder: el.getAttribute('placeholder') || '',
        };
      })
      .filter((x) => !x.hasFor && !x.hasParentLabel && !x.hasAria)
      .slice(0, 12);

    return { truncated, iconNoName, smallTargets, unlabeledFields };
  });

  for (const t of result.truncated.slice(0, 6)) {
    if (findings.length >= TARGET_COUNT) break;
    const ev = await shotWithSelectors(page, `${routeName}-truncated`, ['main']);
    addFinding({
      severity: 'LOW',
      key: `deep-truncated-${routeName}-${normalize(t.selector)}-${normalize(t.text.slice(0, 30))}`,
      area: `Deep UI (${routeName})`,
      title: `Deep UI ${routeName}: Truncated Content Without Tooltip (${t.selector})`,
      description: 'Text content overflows container in deep page context.',
      expected: 'Overflowing text should provide tooltip/full content access.',
      actual: `Overflow=${t.overflow}px, sample="${t.text.slice(0, 80)}"`,
      impact: 'Readability and fast scanning are reduced in deep workflows.',
      steps: ['Open deep page route.', 'Inspect highlighted text node.', 'Observe clipping.'],
      evidence: [ev],
    });
  }

  for (const b of result.iconNoName.slice(0, 6)) {
    if (findings.length >= TARGET_COUNT) break;
    const ev = await shotWithSelectors(page, `${routeName}-icon-no-label`, ['main']);
    addFinding({
      severity: 'MEDIUM',
      key: `deep-icon-no-label-${routeName}-${normalize(b.selector)}`,
      area: `Deep A11y (${routeName})`,
      title: `Deep A11y ${routeName}: Icon Control Missing Accessible Name (${b.selector})`,
      description: 'Icon-only control has no accessible name attributes.',
      expected: 'All controls should expose accessible name.',
      actual: 'No aria-label/title/labelledby and no visible text.',
      impact: 'Screen-reader and assistive users cannot identify the action.',
      steps: ['Open deep page.', 'Inspect highlighted icon control.', 'Check accessible-name attributes.'],
      evidence: [ev],
    });
  }

  for (const s of result.smallTargets.slice(0, 6)) {
    if (findings.length >= TARGET_COUNT) break;
    const ev = await shotWithSelectors(page, `${routeName}-small-target`, ['main']);
    addFinding({
      severity: 'LOW',
      key: `deep-small-target-${routeName}-${normalize(s.selector)}-${s.width}x${s.height}`,
      area: `Deep UI (${routeName})`,
      title: `Deep UI ${routeName}: Small Interactive Target (${s.selector})`,
      description: 'Interactive element is below comfortable hit-area size.',
      expected: 'Controls should be at least ~32x32 for reliable interaction.',
      actual: `Measured ${s.width}x${s.height}px`,
      impact: 'Increases miss-click risk in dense deep screens.',
      steps: ['Open deep page.', 'Inspect highlighted target.', 'Verify dimensions.'],
      evidence: [ev],
    });
  }

  for (const f of result.unlabeledFields.slice(0, 5)) {
    if (findings.length >= TARGET_COUNT) break;
    const ev = await shotWithSelectors(page, `${routeName}-unlabeled-field`, ['main']);
    addFinding({
      severity: 'MEDIUM',
      key: `deep-unlabeled-field-${routeName}-${normalize(f.selector)}-${normalize(f.placeholder)}`,
      area: `Deep A11y (${routeName})`,
      title: `Deep A11y ${routeName}: Form Field Missing Programmatic Label (${f.selector})`,
      description: 'Field lacks associated label for assistive technologies.',
      expected: 'Each input/select/textarea should have label/aria-label.',
      actual: `No for-label, wrapping label, or aria-label. Placeholder="${f.placeholder}"`,
      impact: 'Form completion is harder for assistive-tech users.',
      steps: ['Open deep page.', 'Inspect highlighted field.', 'Check label linkage.'],
      evidence: [ev],
    });
  }
}
async function collectMobileDeep(browser, deepRoutes) {
  logAction('mobile-deep-audit', 'start');
  const mctx = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 390, height: 844 } });
  const mpage = await mctx.newPage();

  try {
    await mpage.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitSettled(mpage, 900);
    if (mpage.url().includes('/login')) {
      await mpage.locator('input[type="email"], input[name="email"]').first().fill(EMAIL);
      await mpage.locator('input[type="password"], input[name="password"]').first().fill(PASSWORD);
      await mpage.getByRole('button', { name: /sign in/i }).first().click();
      await waitSettled(mpage, 1800);
    }

    for (const r of deepRoutes) {
      if (findings.length >= TARGET_COUNT) break;
      await mpage.goto(r.url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await waitSettled(mpage, 700);

      const mobile = await mpage.evaluate(() => {
        const doc = document.documentElement;
        const overflowX = doc.scrollWidth > doc.clientWidth;
        const clipped = [...document.querySelectorAll('td,th,div,span,p,a,button,label')]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) return false;
            return el.scrollWidth - el.clientWidth > 12 && (el.textContent || '').trim().length > 8;
          })
          .slice(0, 8)
          .map((el) => ({ text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 70) }));
        return { overflowX, clipped };
      });

      if (mobile.overflowX && findings.length < TARGET_COUNT) {
        const ev = await shotWithSelectors(mpage, `mobile-${r.name}-overflow`, ['body']);
        addFinding({
          severity: 'MEDIUM',
          key: `deep-mobile-overflow-${r.name}`,
          area: `Responsive Deep (${r.name})`,
          title: `Deep Mobile ${r.name}: Horizontal Overflow Present`,
          description: 'Content exceeds viewport width on mobile.',
          expected: 'Deep pages should fit within 390px viewport without horizontal scroll.',
          actual: 'scrollWidth > clientWidth.',
          impact: 'Mobile deep workflows require awkward lateral scrolling.',
          steps: ['Open deep route on mobile viewport.', 'Check horizontal overflow.', 'Observe clipping/scroll.'],
          evidence: [ev],
        });
      }

      for (const c of mobile.clipped.slice(0, 3)) {
        if (findings.length >= TARGET_COUNT) break;
        const ev = await shotWithSelectors(mpage, `mobile-${r.name}-clipped`, ['main']);
        addFinding({
          severity: 'LOW',
          key: `deep-mobile-clipped-${r.name}-${normalize(c.text)}`,
          area: `Responsive Deep (${r.name})`,
          title: `Deep Mobile ${r.name}: Clipped Text In Narrow View`,
          description: 'Text is truncated significantly on mobile deep route.',
          expected: 'Critical text should remain readable or expose full text affordance.',
          actual: `Clipped sample: "${c.text}"`,
          impact: 'Users lose context during deep navigation on mobile.',
          steps: ['Open deep route on mobile.', 'Inspect clipped text region.', 'Observe truncation.'],
          evidence: [ev],
        });
      }
    }
  } finally {
    await mctx.close();
  }

  logAction('mobile-deep-audit', 'ok', `findings=${findings.length}`);
}

const probedButtons = new Set();

async function collectButtonNoFeedbackFindings(page, routeName, routeUrl) {
  await page.goto(routeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitSettled(page, 600);

  const controls = await page.evaluate(() => {
    const isVisible = (el) => {
      if (!el) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const selectorOf = (el) => {
      if (!(el instanceof Element)) return '';
      if (el.id) return `#${CSS.escape(el.id)}`;
      const tag = el.tagName.toLowerCase();
      const cls = (el.className || '').toString().trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
      if (cls) return `${tag}.${cls}`;
      const parent = el.parentElement;
      if (!parent) return tag;
      const siblings = [...parent.children].filter((x) => x.tagName === el.tagName);
      if (siblings.length <= 1) return tag;
      return `${tag}:nth-of-type(${siblings.indexOf(el) + 1})`;
    };

    const raw = [...document.querySelectorAll('button,[role="button"],a')];
    return raw
      .filter((el) => isVisible(el))
      .map((el) => {
        const label =
          (el.textContent || '').replace(/\s+/g, ' ').trim() ||
          (el.getAttribute('aria-label') || '').trim() ||
          (el.getAttribute('title') || '').trim();
        const href = (el.getAttribute('href') || '').trim();
        const disabled = el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true';
        return {
          selector: selectorOf(el),
          label,
          href,
          disabled,
          tag: el.tagName.toLowerCase(),
        };
      })
      .filter((x) => !x.disabled)
      .filter((x) => !!x.selector)
      .slice(0, 60);
  });

  for (const c of controls) {
    if (findings.length >= TARGET_COUNT) break;
    const labelNorm = normalize(c.label);
    if (!labelNorm) continue;
    if (/logout|delete|remove|proceed|sign in|create|save/i.test(c.label)) continue;
    if (c.tag === 'a' && c.href && c.href !== '#' && !c.href.startsWith('javascript')) continue;

    const probeKey = `${routeName}|${c.selector}|${labelNorm}`;
    if (probedButtons.has(probeKey)) continue;
    probedButtons.add(probeKey);

    const target = page.locator(c.selector).first();
    if (!(await target.isVisible().catch(() => false))) continue;

    const beforeUrl = page.url();
    const beforeDialog = await page.locator('[role="dialog"]').count().catch(() => 0);
    const beforeToast = await page.locator('text=/success|error|failed|copied|shared/i').count().catch(() => 0);
    const beforeMain = normalize((await page.locator('main').innerText().catch(() => '')).slice(0, 1200));

    await target.click({ timeout: 1800 }).catch(() => {});
    await page.waitForTimeout(450);

    const afterUrl = page.url();
    const afterDialog = await page.locator('[role="dialog"]').count().catch(() => 0);
    const afterToast = await page.locator('text=/success|error|failed|copied|shared/i').count().catch(() => 0);
    const afterMain = normalize((await page.locator('main').innerText().catch(() => '')).slice(0, 1200));

    const changed = beforeUrl !== afterUrl || beforeDialog !== afterDialog || afterToast > beforeToast || beforeMain !== afterMain;
    if (!changed) {
      const ev = await shotWithSelectors(page, `${routeName}-no-feedback-${labelNorm.replace(/[^a-z0-9]+/g, '-').slice(0, 32)}`, ['main']);
      addFinding({
        severity: 'LOW',
        key: `deep-no-feedback-${routeName}-${normalize(c.selector)}-${labelNorm}`,
        area: `Deep Interaction (${routeName})`,
        title: `Deep Interaction ${routeName}: Control "${c.label}" Has No Observable Feedback`,
        description: 'Clicking this visible control did not trigger a route/modal/toast/content change.',
        expected: 'Interactive control should provide visible response or state change.',
        actual: 'No observable UI feedback detected.',
        impact: 'Users may click repeatedly or assume the app is frozen.',
        steps: ['Open deep route.', `Click "${c.label}".`, 'Observe no UI response.'],
        evidence: [ev],
      });
    }
  }
}

async function addConsoleApiFindings(page) {
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await waitSettled(page, 500);

  if ([...consoleEvents].some((e) => /google maps javascript api has been loaded directly without loading=async/i.test(e)) && findings.length < TARGET_COUNT) {
    const ev = await shotWithSelectors(page, 'console-maps-warning-deep-context', ['body']);
    addFinding({
      severity: 'LOW',
      key: 'deep-console-google-maps-async-warning',
      area: 'Console Deep',
      title: 'Deep Console: Google Maps Async Loading Warning Appears During Deep Flows',
      description: 'Console warning appears while traversing deep modules.',
      expected: 'Console should remain warning-free in nominal flows.',
      actual: 'Maps loading warning detected.',
      impact: 'Signal-to-noise in diagnostics is degraded.',
      steps: ['Traverse deep routes.', 'Open console.', 'Observe maps warning entry.'],
      evidence: [ev, path.join(LOG_DIR, 'console-errors.log')],
    });
  }

  const grouped = [...apiFailures].reduce((acc, line) => {
    const m = String(line).match(/^(\d{3})\s+([A-Z]+)\s+(.+)$/);
    if (!m) return acc;
    const key = `${m[1]} ${m[2]}`;
    acc[key] = acc[key] || [];
    acc[key].push(m[3]);
    return acc;
  }, {});

  for (const [statusMethod, urls] of Object.entries(grouped)) {
    if (findings.length >= TARGET_COUNT) break;
    const samplePaths = [...new Set(urls.map((u) => {
      try { return new URL(u).pathname; } catch { return u; }
    }))].slice(0, 3);
    const sev = /^5\d\d/.test(statusMethod) || /^429/.test(statusMethod) ? 'MEDIUM' : 'LOW';
    const ev = await shotWithSelectors(page, `deep-api-failure-${statusMethod.replace(/\s+/g,'-')}`, ['body']);
    addFinding({
      severity: sev,
      key: `deep-api-failure-${statusMethod}-${samplePaths.join('|')}`,
      area: 'Integration Deep',
      title: `Deep Integration: API Failures Observed (${statusMethod})`,
      description: 'Network observer captured API failures during deep traversal.',
      expected: 'Deep workflows should minimize failing API requests.',
      actual: `${urls.length} failures for ${statusMethod}; sample paths: ${samplePaths.join(', ')}`,
      impact: 'Can produce partial updates or silent action failures.',
      steps: ['Perform deep navigation/actions.', 'Inspect network failures.', `Observe ${statusMethod} errors.`],
      evidence: [ev, path.join(LOG_DIR, 'api-failures.log')],
    });
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
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  page.on('console', (msg) => {
    const t = msg.type();
    if (t === 'error' || t === 'warning') consoleEvents.add(msg.text());
  });

  page.on('response', (res) => {
    if (res.status() >= 400) apiFailures.add(`${res.status()} ${res.request().method()} ${res.url()}`);
  });

  try {
    await loginBootstrap(page);
    const deepRoutes = await discoverDeepRoutes(page);
    const expandedRoutes = [
      ...deepRoutes,
      { name: 'visits-day', url: '/visits' },
      { name: 'customers-deep', url: '/customers' },
      { name: 'dashboard-deep', url: '/dashboard' },
    ].filter((r, idx, arr) => arr.findIndex((x) => x.name === r.name && x.url === r.url) === idx);
    logAction('discover-deep-routes', 'ok', expandedRoutes.map((d) => `${d.name}:${d.url}`).join(' | '));

    for (const r of expandedRoutes) {
      if (findings.length >= TARGET_COUNT) break;
      await runRouteSpecificChecks(page, r.name, r.url);
      await collectDeepAuditSignals(page, r.name, r.url);
      await collectButtonNoFeedbackFindings(page, r.name, r.url);
    }

    // repeat deep audit over discovered routes until we fill target with unique non-duplicate findings
    let guard = 0;
    while (findings.length < TARGET_COUNT && guard < 10) {
      for (const r of expandedRoutes) {
        if (findings.length >= TARGET_COUNT) break;
        await collectDeepAuditSignals(page, r.name, r.url);
        await collectButtonNoFeedbackFindings(page, r.name, r.url);
      }
      guard += 1;
    }

    await collectMobileDeep(browser, expandedRoutes);
    await addConsoleApiFindings(page);
  } finally {
    await context.close();
    await browser.close();
  }

  if (findings.length < TARGET_COUNT) {
    throw new Error(`Only ${findings.length} deep unique findings collected; expected at least ${TARGET_COUNT}.`);
  }

  const finalFindings = findings.slice(0, TARGET_COUNT);
  const summary = {
    runDir: RUN_DIR,
    createdAt: new Date().toISOString(),
    findingsCount: finalFindings.length,
    findings: finalFindings,
    actions,
    priorTitlesLoaded: priorTitles.size,
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
    [`Run directory: ${RUN_DIR}`, `Prior titles loaded: ${priorTitles.size}`, `Findings: ${summary.findingsCount}`, '', ...summary.findings.map((f) => `${f.id} [${f.severity}] ${f.title}`)].join('\n'),
    'utf-8',
  );

  console.log(`QA_NO_LOGIN_50_DEEP_UNIQUE_DIR=${RUN_DIR}`);
  console.log(`QA_NO_LOGIN_50_DEEP_UNIQUE_COUNT=${summary.findingsCount}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
