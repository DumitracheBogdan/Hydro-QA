import path from 'node:path';
import fs from 'node:fs';
import { collectInventory } from './collect-inventory.mjs';
import { isSafeToClick } from './crawler-policy.mjs';

const UUID_RE = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const NUMERIC_ID_RE = /\/\d{2,}(?=\/|$)/g;

export function canonicalPath(p) {
  if (!p) return p;
  return p.replace(UUID_RE, '/:uuid').replace(NUMERIC_ID_RE, '/:id');
}

function normalizeUrl(urlStr, base) {
  try {
    const u = new URL(urlStr, base);
    if (u.origin !== new URL(base).origin) return null;
    u.hash = '';
    u.search = '';
    let p = u.pathname.replace(/\/+$/, '') || '/';
    return p;
  } catch {
    return null;
  }
}

export function slugifyPath(p) {
  return p
    .replace(/^\/+/, '')
    .replace(/\/$/, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'root';
}

async function dismissNoise(page) {
  await page.keyboard.press('Escape').catch(() => {});
  const closers = ['[aria-label="Close"]', 'button[aria-label*="close" i]'];
  for (const sel of closers) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(200);
    }
  }
}

async function waitForPage(page) {
  await page.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(400);
}

export async function crawl({ page, baseUrl, startPath = '/', seedPaths = [], maxPages = 80, outDir, maxClicksPerPage = 12 }) {
  const shotDir = path.join(outDir, 'current', 'screenshots');
  fs.mkdirSync(shotDir, { recursive: true });

  const queue = [startPath, ...seedPaths];
  const visited = new Map();
  const walkStart = Date.now();
  const walkBudgetMs = 10 * 60 * 1000;

  while (queue.length > 0 && visited.size < maxPages) {
    if (Date.now() - walkStart > walkBudgetMs) {
      console.log(`[crawler] time budget hit after ${visited.size} pages`);
      break;
    }
    const urlPath = queue.shift();
    if (visited.has(urlPath)) continue;

    const fullUrl = baseUrl + urlPath;
    console.log(`[crawler] visiting ${fullUrl}`);
    try {
      await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    } catch (e) {
      console.log(`[crawler] goto failed for ${fullUrl}: ${String(e).slice(0, 140)}`);
      visited.set(urlPath, { error: String(e).slice(0, 300), elements: [] });
      continue;
    }
    await waitForPage(page);
    await dismissNoise(page);

    const finalUrl = page.url();
    const finalPath = normalizeUrl(finalUrl, baseUrl);
    if (finalPath && finalPath.includes('/login')) {
      console.log(`[crawler] ${urlPath} redirected to login — skipping`);
      visited.set(urlPath, { redirectedTo: finalPath, elements: [] });
      continue;
    }
    const effectivePath = finalPath || urlPath;
    const canonical = canonicalPath(effectivePath);
    if (visited.has(canonical)) {
      console.log(`[crawler] ${urlPath} maps to already-visited ${canonical}`);
      continue;
    }

    const slug = slugifyPath(canonical);
    const shotPath = path.join(shotDir, `${slug}.png`);

    let elements = [];
    try {
      elements = await collectInventory(page);
    } catch (e) {
      console.log(`[crawler] inventory failed on ${effectivePath}: ${String(e).slice(0, 140)}`);
    }

    try {
      await page.screenshot({ path: shotPath, fullPage: true });
    } catch (e) {
      console.log(`[crawler] screenshot failed on ${effectivePath}: ${String(e).slice(0, 140)}`);
    }

    visited.set(canonical, {
      url: fullUrl,
      concretePath: effectivePath,
      slug,
      screenshot: shotPath,
      elements,
    });
    console.log(`[crawler]   captured ${elements.length} elements`);

    const anchors = await page.locator('a[href]').elementHandles().catch(() => []);
    for (const h of anchors) {
      const href = await h.getAttribute('href').catch(() => null);
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
      const n = normalizeUrl(href, baseUrl);
      if (!n || n.includes('/login')) continue;
      const cn = canonicalPath(n);
      if (!visited.has(cn) && !queue.includes(n)) queue.push(n);
    }

    let clicks = 0;
    const clickedNames = new Set();
    for (const el of elements) {
      if (clicks >= maxClicksPerPage) break;
      if (el.role !== 'button') continue;
      if (!isSafeToClick(el.name, el.role)) continue;
      const k = el.name.toLowerCase();
      if (clickedNames.has(k)) continue;
      clickedNames.add(k);

      const before = page.url();
      const locator = page.getByRole('button', { name: el.name, exact: true }).first();
      if (!(await locator.isVisible().catch(() => false))) continue;
      await locator.click({ timeout: 2500 }).catch(() => {});
      clicks += 1;
      await page.waitForTimeout(500);
      const after = page.url();
      if (after !== before) {
        const nPath = normalizeUrl(after, baseUrl);
        if (nPath && !visited.has(canonicalPath(nPath)) && !queue.includes(nPath)) queue.push(nPath);
        try {
          await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await waitForPage(page);
        } catch {}
      } else {
        await dismissNoise(page);
      }
    }

    if (effectivePath === '/visits-list' || effectivePath === '/customers') {
      const firstRow = page.locator('tbody tr, [role="row"]').nth(1);
      if (await firstRow.isVisible().catch(() => false)) {
        const before = page.url();
        await firstRow.click({ timeout: 2500 }).catch(() => {});
        await page.waitForTimeout(700);
        const after = page.url();
        if (after !== before) {
          const nPath = normalizeUrl(after, baseUrl);
          if (nPath && !visited.has(canonicalPath(nPath)) && !queue.includes(nPath)) {
            console.log(`[crawler]   row-click discovered ${nPath}`);
            queue.push(nPath);
          }
        }
      }
    }
  }

  const pages = {};
  for (const [p, data] of visited.entries()) {
    if (!data.elements || data.redirectedTo || data.error) continue;
    pages[p] = data;
  }
  return pages;
}
