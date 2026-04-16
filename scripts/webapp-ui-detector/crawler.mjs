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

async function applyInteraction(page, interaction) {
  if (interaction.kind !== 'click') {
    console.log(`[crawler]   unknown interaction kind: ${interaction.kind}`);
    return false;
  }
  const locator = page.getByRole(interaction.role, { name: interaction.name, exact: !!interaction.exact }).first();
  if (!(await locator.isVisible().catch(() => false))) {
    console.log(`[crawler]   interaction target not visible: ${interaction.role}::${interaction.name}`);
    return false;
  }
  await locator.click({ timeout: 3000 }).catch((e) => {
    console.log(`[crawler]   click failed on ${interaction.role}::${interaction.name}: ${String(e).slice(0, 80)}`);
  });
  await page.waitForTimeout(interaction.waitMs || 400);
  return true;
}

async function captureState({ page, fullUrl, canonicalKey, slug, shotDir, interactions }) {
  console.log(`[crawler] visiting ${fullUrl}  →  ${canonicalKey}`);
  try {
    await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
  } catch (e) {
    console.log(`[crawler] goto failed for ${fullUrl}: ${String(e).slice(0, 140)}`);
    return null;
  }
  await waitForPage(page);
  await dismissNoise(page);

  if (page.url().includes('/login')) {
    console.log(`[crawler] ${fullUrl} redirected to login — skipping`);
    return null;
  }

  for (const action of interactions || []) {
    await applyInteraction(page, action);
  }

  let raw = [];
  try {
    raw = await collectInventory(page, { excludeAncestorSelectors: EXCLUDE_ANCESTOR_SELECTORS });
  } catch (e) {
    console.log(`[crawler] inventory failed on ${canonicalKey}: ${String(e).slice(0, 140)}`);
  }

  const elements = applyChromeFilter(raw);

  const shotPath = path.join(shotDir, `${slug}.png`);
  try {
    await page.screenshot({ path: shotPath, fullPage: true });
  } catch (e) {
    console.log(`[crawler] screenshot failed on ${canonicalKey}: ${String(e).slice(0, 140)}`);
  }

  console.log(`[crawler]   captured ${elements.length} chrome elements (raw=${raw.length})`);
  return { url: fullUrl, slug, screenshot: shotPath, elements };
}

export async function crawlRoutes({ page, baseUrl, routes, outDir }) {
  const shotDir = path.join(outDir, 'current', 'screenshots');
  fs.mkdirSync(shotDir, { recursive: true });

  const pages = {};

  for (const route of routes) {
    const fullUrl = baseUrl + route.path;
    const baseCanonical = route.canonicalAs || route.path;
    const states = route.states && route.states.length > 0 ? route.states : [{ id: null }];

    for (const state of states) {
      const canonical = state.id ? `${baseCanonical}@${state.id}` : baseCanonical;
      const slug = slugifyPath(canonical);
      const result = await captureState({
        page,
        fullUrl,
        canonicalKey: canonical,
        slug,
        shotDir,
        interactions: state.interactions,
      });
      if (result) {
        pages[canonical] = { ...result, concretePath: route.path, stateId: state.id || null };
      }
    }
  }

  return pages;
}
