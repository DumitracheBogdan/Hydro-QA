import fs from 'node:fs';
import path from 'node:path';
import { chromium, request } from 'playwright';

const WEB_BASE = process.env.HYDROCERT_WEB_BASE || 'https://hydrocert-prod-webapp.azurewebsites.net';
const API_BASE = process.env.HYDROCERT_API_BASE || 'https://hydrocert-prod-api.azurewebsites.net';
const EMAIL = process.env.HYDROCERT_QA_EMAIL || '';
const PASSWORD = process.env.HYDROCERT_QA_PASSWORD || '';

const stamp = new Date().toISOString().replace(/[.:]/g, '-');
const runName = `infra-prod-postdeploy-hardening-${stamp}`;
const runDir = path.join(process.cwd(), 'qa-artifacts', 'infra-regression', runName);
const shotsDir = path.join(runDir, 'screenshots');
fs.mkdirSync(shotsDir, { recursive: true });

const checks = [];
let shotIndex = 1;

function add(id, area, test, status, details = '', evidence = []) {
  checks.push({ id, area, test, status, details, evidence });
  console.log(`${id} | ${status} | ${test} | ${details}`);
}

async function shot(page, name) {
  const file = path.join(shotsDir, `${String(shotIndex).padStart(3, '0')}-${name}.png`);
  shotIndex += 1;
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function run(page, id, area, test, fn) {
  try {
    const result = await fn();
    add(id, area, test, result?.status || 'PASS', result?.details || '', result?.evidence || []);
  } catch (error) {
    const evidence = page ? [await shot(page, `${id.toLowerCase()}-error`).catch(() => null)].filter(Boolean) : [];
    add(id, area, test, 'FAIL', String(error).replace(/\s+/g, ' ').slice(0, 320), evidence);
  }
}

async function settle(page, ms = 800) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

async function loginUi(page) {
  await page.goto(`${WEB_BASE}/dashboard`);
  await settle(page, 1000);
  if (page.url().includes('/login')) {
    await page.locator('input[name="email"], input[type="email"]').first().fill(EMAIL);
    await page.locator('input[name="password"], input[type="password"]').first().fill(PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).first().click();
    await page.waitForURL((url) => !url.toString().includes('/login'), { timeout: 25000 }).catch(() => {});
    await settle(page, 1000);
  }
  return !page.url().includes('/login');
}

async function waitForLoginRedirect(page, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (page.url().includes('/login')) return true;
    await page.waitForTimeout(250);
  }
  return page.url().includes('/login');
}

async function tryLogout(page) {
  const direct = page.getByRole('menuitem', { name: /logout|sign out/i }).first();
  if (await direct.isVisible().catch(() => false)) {
    await direct.click().catch(() => {});
    await settle(page, 700);
    return;
  }

  const triggers = [
    page.locator('header button[aria-haspopup="menu"]').first(),
    page.getByRole('button', { name: /tech quarter/i }).first(),
    page.getByRole('button', { name: /admin admin/i }).first(),
    page.getByRole('button', { name: /^aa$/i }).first(),
    page.locator('header button').last(),
  ];

  for (const trigger of triggers) {
    if (!(await trigger.isVisible().catch(() => false))) continue;
    await trigger.click().catch(() => {});
    await page.waitForTimeout(300);

    const logoutMenu = page.getByRole('menuitem', { name: /logout|sign out/i }).first();
    if (await logoutMenu.isVisible().catch(() => false)) {
      await logoutMenu.click().catch(() => {});
      await settle(page, 700);
      return;
    }

    const logoutButton = page.getByRole('button', { name: /logout|sign out/i }).first();
    if (await logoutButton.isVisible().catch(() => false)) {
      await logoutButton.click().catch(() => {});
      await settle(page, 700);
      return;
    }
  }

  throw new Error('Could not find logout control');
}

const browser = await chromium.launch({ headless: true });
const pageContext = await browser.newContext({ viewport: { width: 1536, height: 864 } });
const page = await pageContext.newPage();
const webCtx = await request.newContext({ baseURL: WEB_BASE });
const anonApi = await request.newContext({ baseURL: API_BASE });

try {
  await run(page, 'E04', 'Web', 'Main JS bundle is cacheable (has Cache-Control)', async () => {
    const root = await webCtx.get('/');
    const html = await root.text();
    const match = html.match(/<script[^>]+src="([^"]+)"/i);
    if (!match?.[1]) return { status: 'FAIL', details: 'no script src found in root html' };
    const jsPath = match[1].startsWith('http') ? match[1] : match[1].startsWith('/') ? match[1] : `/${match[1]}`;
    const asset = await webCtx.get(jsPath);
    const cacheControl = asset.headers()['cache-control'] || '';
    return cacheControl
      ? { status: 'PASS', details: `script=${jsPath}, cache-control=${cacheControl}` }
      : { status: 'FAIL', details: `script=${jsPath}, missing cache-control` };
  });

  await run(page, 'R07', 'Security', 'Web root has HSTS header', async () => {
    const response = await webCtx.get('/');
    const value = response.headers()['strict-transport-security'] || '';
    return value ? { status: 'PASS', details: value } : { status: 'FAIL', details: 'missing strict-transport-security' };
  });

  await run(page, 'R08', 'Security', 'Web root has X-Content-Type-Options nosniff', async () => {
    const response = await webCtx.get('/');
    const value = (response.headers()['x-content-type-options'] || '').toLowerCase();
    return value.includes('nosniff') ? { status: 'PASS', details: value } : { status: 'FAIL', details: value || 'missing header' };
  });

  await run(page, 'R09', 'Security', 'Web root has anti-frame policy (XFO/CSP)', async () => {
    const response = await webCtx.get('/');
    const xfo = response.headers()['x-frame-options'] || '';
    const csp = response.headers()['content-security-policy'] || '';
    const ok = Boolean(xfo) || /frame-ancestors/i.test(csp);
    return ok ? { status: 'PASS', details: xfo || 'csp frame-ancestors present' } : { status: 'FAIL', details: 'missing anti-frame policy' };
  });

  await run(page, 'R10', 'Security', 'TRACE method disabled on Web and API', async () => {
    const webTrace = await webCtx.fetch('/', { method: 'TRACE' });
    const apiTrace = await anonApi.fetch('/health', { method: 'TRACE' });
    const ok = webTrace.status() !== 200 && apiTrace.status() !== 200;
    return ok
      ? { status: 'PASS', details: `web=${webTrace.status()}, api=${apiTrace.status()}` }
      : { status: 'FAIL', details: `web=${webTrace.status()}, api=${apiTrace.status()}` };
  });

  await run(page, 'E23', 'UI', 'Logout flow redirects to login', async () => {
    const loggedIn = await loginUi(page);
    if (!loggedIn) return { status: 'FAIL', details: 'login failed before logout check' };
    await tryLogout(page);
    const atLogin = await waitForLoginRedirect(page, 6000);
    if (atLogin) return { status: 'PASS', details: `url=${page.url()}` };
    await page.goto(`${WEB_BASE}/dashboard`);
    await settle(page, 900);
    return page.url().includes('/login')
      ? { status: 'PASS', details: `protected route blocked after logout, url=${page.url()}` }
      : { status: 'FAIL', details: `url=${page.url()}`, evidence: [await shot(page, 'e23-logout-fail')] };
  });

  await run(page, 'E24', 'UI/Security', 'After logout, protected route redirects back to login', async () => {
    await page.goto(`${WEB_BASE}/dashboard`);
    await settle(page, 800);
    return page.url().includes('/login')
      ? { status: 'PASS', details: `url=${page.url()}` }
      : { status: 'FAIL', details: `url=${page.url()}`, evidence: [await shot(page, 'e24-protected-route-fail')] };
  });
} finally {
  await webCtx.dispose().catch(() => {});
  await anonApi.dispose().catch(() => {});
  await pageContext.close().catch(() => {});
  await browser.close().catch(() => {});
}

const totals = {
  total: checks.length,
  pass: checks.filter((check) => check.status === 'PASS').length,
  fail: checks.filter((check) => check.status === 'FAIL').length,
  skip: checks.filter((check) => check.status === 'SKIP').length,
};

const summary = {
  generatedAt: new Date().toISOString(),
  environment: { webBase: WEB_BASE, apiBase: API_BASE },
  runName,
  totals,
  checks,
};

const summaryPath = path.join(runDir, 'summary.json');
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

const report = [
  '# PROD Post-Deploy Hardening Report',
  `Date: ${new Date().toISOString()}`,
  `WebApp: ${WEB_BASE}`,
  `API: ${API_BASE}`,
  '',
  '## Summary',
  `- Total: ${totals.total}`,
  `- Pass: ${totals.pass}`,
  `- Fail: ${totals.fail}`,
  `- Skip: ${totals.skip}`,
  '',
  '## Checks',
  ...checks.map((check) => `- [${check.status}] ${check.id} ${check.test} :: ${check.details}`),
  '',
].join('\n');

const reportPath = path.join(runDir, 'report.md');
fs.writeFileSync(reportPath, report);

console.log(`SUMMARY_JSON=${summaryPath}`);
console.log(`REPORT_MD=${reportPath}`);
console.log(`TOTAL=${totals.total} PASS=${totals.pass} FAIL=${totals.fail} SKIP=${totals.skip}`);
