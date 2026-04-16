import path from 'node:path';
import fs from 'node:fs';
import { collectInventory } from './collect-inventory.mjs';
import { applyChromeFilter } from './chrome-filter.mjs';
import { EXCLUDE_ANCESTOR_SELECTORS } from './route-config.mjs';

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
  await page.waitForTimeout(500);
}

export async function crawlRoutes({ page, baseUrl, routes, outDir }) {
  const shotDir = path.join(outDir, 'current', 'screenshots');
  fs.mkdirSync(shotDir, { recursive: true });

  const pages = {};

  for (const route of routes) {
    const fullUrl = baseUrl + route.path;
    const canonical = route.canonicalAs || route.path;
    const slug = slugifyPath(canonical);
    const shotPath = path.join(shotDir, `${slug}.png`);

    console.log(`[crawler] visiting ${fullUrl}  →  ${canonical}`);
    try {
      await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    } catch (e) {
      console.log(`[crawler] goto failed for ${fullUrl}: ${String(e).slice(0, 140)}`);
      continue;
    }
    await waitForPage(page);
    await dismissNoise(page);

    const finalUrl = page.url();
    if (finalUrl.includes('/login')) {
      console.log(`[crawler] ${route.path} redirected to login — skipping`);
      continue;
    }

    let raw = [];
    try {
      raw = await collectInventory(page, { excludeAncestorSelectors: EXCLUDE_ANCESTOR_SELECTORS });
    } catch (e) {
      console.log(`[crawler] inventory failed on ${route.path}: ${String(e).slice(0, 140)}`);
    }

    const elements = applyChromeFilter(raw);

    try {
      await page.screenshot({ path: shotPath, fullPage: true });
    } catch (e) {
      console.log(`[crawler] screenshot failed on ${route.path}: ${String(e).slice(0, 140)}`);
    }

    pages[canonical] = {
      url: fullUrl,
      concretePath: route.path,
      slug,
      screenshot: shotPath,
      elements,
    };
    console.log(`[crawler]   captured ${elements.length} chrome elements (raw=${raw.length})`);
  }

  return pages;
}
