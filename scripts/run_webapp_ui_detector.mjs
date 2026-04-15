import fs from 'node:fs';
import path from 'node:path';
import { launchAuthed } from './lib/webapp-login.mjs';
import { crawl, slugifyPath } from './webapp-ui-detector/crawler.mjs';
import { diffAll } from './webapp-ui-detector/diff.mjs';
import { annotateFull, cropElement } from './webapp-ui-detector/annotate.mjs';

const MODE = (process.env.WEBAPP_UI_MODE || 'compare').toLowerCase();
const MAX_PAGES = Number(process.env.WEBAPP_UI_MAX_PAGES || '80');
const WEB_BASE = process.env.HYDROCERT_WEB_BASE;
const EMAIL = process.env.HYDROCERT_QA_EMAIL;
const PASSWORD = process.env.HYDROCERT_QA_PASSWORD;

if (!WEB_BASE || !EMAIL || !PASSWORD) {
  console.error('Missing HYDROCERT_WEB_BASE / HYDROCERT_QA_EMAIL / HYDROCERT_QA_PASSWORD');
  process.exit(2);
}
if (MODE !== 'compare' && MODE !== 'rebuild-baseline') {
  console.error(`Invalid WEBAPP_UI_MODE="${MODE}" — must be 'compare' or 'rebuild-baseline'`);
  process.exit(2);
}

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, 'qa-artifacts', 'webapp-ui-detector');
const baselineDir = path.join(repoRoot, 'webapp-baseline');
const baselineShots = path.join(baselineDir, 'screenshots');
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(baselineShots, { recursive: true });

console.log(`[detector] mode=${MODE} maxPages=${MAX_PAGES} base=${WEB_BASE}`);

const { browser, page } = await launchAuthed({ webBase: WEB_BASE, email: EMAIL, password: PASSWORD });

let currentPages;
try {
  currentPages = await crawl({
    page,
    baseUrl: WEB_BASE,
    startPath: '/dashboard',
    seedPaths: ['/visits', '/customers', '/visits-list', '/planner', '/visits/addnewvisit'],
    maxPages: MAX_PAGES,
    outDir,
  });
} finally {
  await browser.close().catch(() => {});
}

const currentData = { pages: currentPages };
fs.writeFileSync(path.join(outDir, 'current.json'), JSON.stringify(currentData, null, 2));

if (MODE === 'rebuild-baseline') {
  const newBaseline = { pages: {} };
  for (const [p, data] of Object.entries(currentPages)) {
    const slug = data.slug || slugifyPath(p);
    const dest = path.join(baselineShots, `${slug}.png`);
    if (data.screenshot && fs.existsSync(data.screenshot)) {
      fs.copyFileSync(data.screenshot, dest);
    }
    newBaseline.pages[p] = {
      url: data.url,
      slug,
      screenshot: `webapp-baseline/screenshots/${slug}.png`,
      elements: data.elements,
    };
  }
  fs.writeFileSync(path.join(baselineDir, 'pages.json'), JSON.stringify(newBaseline, null, 2));
  const summary = {
    mode: MODE,
    totals: { routes: Object.keys(newBaseline.pages).length, missing: 0, introduced: 0, textChanged: 0, newPages: 0, lostPages: 0 },
    perRoute: Object.keys(newBaseline.pages).map((p) => ({ path: p, missing: 0, introduced: 0, textChanged: 0 })),
  };
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(`[detector] baseline rebuilt — ${Object.keys(newBaseline.pages).length} routes written to webapp-baseline/`);
  process.exit(0);
}

const baselineJsonPath = path.join(baselineDir, 'pages.json');
if (!fs.existsSync(baselineJsonPath)) {
  console.error(`No baseline found at ${baselineJsonPath}. Run mode=rebuild-baseline first.`);
  process.exit(3);
}
const baseline = JSON.parse(fs.readFileSync(baselineJsonPath, 'utf-8'));

for (const p of Object.keys(baseline.pages || {})) {
  const rel = baseline.pages[p].screenshot;
  if (rel && !path.isAbsolute(rel)) {
    baseline.pages[p]._absScreenshot = path.join(repoRoot, rel);
  } else {
    baseline.pages[p]._absScreenshot = rel;
  }
}

const result = diffAll(
  baseline,
  {
    pages: Object.fromEntries(
      Object.entries(currentPages).map(([p, d]) => [p, { url: d.url, slug: d.slug, elements: d.elements, screenshot: d.screenshot }])
    ),
  }
);

const annotatedDir = path.join(outDir, 'annotated');
const cropsDir = path.join(outDir, 'crops');
fs.mkdirSync(annotatedDir, { recursive: true });
fs.mkdirSync(cropsDir, { recursive: true });

const perRoute = [];
const enrichedPerPage = {};
for (const [p, d] of Object.entries(result.perPage)) {
  const slug = d.slug || slugifyPath(p);
  const missingShapes = d.missing.map((el, i) => ({ index: i + 1, bbox: el.bbox || { x: 0, y: 0, w: 0, h: 0 } }));
  const introducedShapes = d.introduced.map((el, i) => ({ index: i + 1, bbox: el.bbox || { x: 0, y: 0, w: 0, h: 0 } }));
  const currentShot = d.screenshot;
  const baselineAbs = (baseline.pages[p] || {})._absScreenshot;

  const currentAnnotated = path.join(annotatedDir, `${slug}.current.annotated.png`);
  const baselineAnnotated = path.join(annotatedDir, `${slug}.baseline.annotated.png`);
  if (introducedShapes.length) await annotateFull(currentShot, introducedShapes, currentAnnotated).catch(() => {});
  if (missingShapes.length && baselineAbs) await annotateFull(baselineAbs, missingShapes, baselineAnnotated).catch(() => {});

  const missingCrops = [];
  for (let i = 0; i < d.missing.length; i++) {
    const el = d.missing[i];
    if (!el.bbox || !baselineAbs) { missingCrops.push(null); continue; }
    const outCrop = path.join(cropsDir, `${slug}.missing-${i + 1}.png`);
    const done = await cropElement(baselineAbs, { index: i + 1, bbox: el.bbox }, outCrop).catch(() => null);
    missingCrops.push(done || null);
  }
  const introducedCrops = [];
  for (let i = 0; i < d.introduced.length; i++) {
    const el = d.introduced[i];
    if (!el.bbox) { introducedCrops.push(null); continue; }
    const outCrop = path.join(cropsDir, `${slug}.introduced-${i + 1}.png`);
    const done = await cropElement(currentShot, { index: i + 1, bbox: el.bbox }, outCrop).catch(() => null);
    introducedCrops.push(done || null);
  }

  enrichedPerPage[p] = {
    ...d,
    slug,
    currentAnnotated: fs.existsSync(currentAnnotated) ? currentAnnotated : null,
    baselineAnnotated: fs.existsSync(baselineAnnotated) ? baselineAnnotated : null,
    missingCrops,
    introducedCrops,
  };
  perRoute.push({ path: p, missing: d.missing.length, introduced: d.introduced.length, textChanged: d.textChanged.length });
}

const diffJson = {
  mode: MODE,
  perPage: enrichedPerPage,
  newPages: result.newPages,
  lostPages: result.lostPages,
  totals: result.totals,
};
fs.writeFileSync(path.join(outDir, 'diff.json'), JSON.stringify(diffJson, null, 2));

const summary = { mode: MODE, totals: result.totals, perRoute };
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));

console.log(`[detector] compare done — routes=${result.totals.routes} missing=${result.totals.missing} introduced=${result.totals.introduced} textChanged=${result.totals.textChanged} newPages=${result.totals.newPages} lostPages=${result.totals.lostPages}`);
process.exit(0);
