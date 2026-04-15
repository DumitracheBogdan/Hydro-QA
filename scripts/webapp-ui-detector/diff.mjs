function keyOf(el) {
  const name = (el.name || '').trim();
  if (name) return `${el.role}::${name}`;
  return `${el.role}::${el.selectorHint || ''}`;
}

function indexElements(elements) {
  const map = new Map();
  for (const el of elements || []) {
    const k = keyOf(el);
    if (!map.has(k)) map.set(k, el);
  }
  return map;
}

export function diffPage(baseline, current) {
  const bMap = indexElements(baseline);
  const cMap = indexElements(current);
  const missing = [];
  const introduced = [];
  const textChanged = [];

  for (const [k, el] of bMap.entries()) {
    if (!cMap.has(k)) missing.push(el);
    else {
      const cur = cMap.get(k);
      if ((el.text || '') !== (cur.text || '') && (el.text || cur.text)) {
        textChanged.push({ role: el.role, name: el.name, selectorHint: el.selectorHint, baselineText: el.text, currentText: cur.text, bbox: cur.bbox });
      }
    }
  }
  for (const [k, el] of cMap.entries()) {
    if (!bMap.has(k)) introduced.push(el);
  }
  return { missing, introduced, textChanged };
}

export function diffAll(baseline, current) {
  const baselinePages = baseline.pages || {};
  const currentPages = current.pages || {};
  const perPage = {};
  const totals = { routes: 0, missing: 0, introduced: 0, textChanged: 0, newPages: 0, lostPages: 0 };
  const newPages = [];
  const lostPages = [];

  const allPaths = new Set([...Object.keys(baselinePages), ...Object.keys(currentPages)]);
  for (const p of allPaths) {
    const b = baselinePages[p];
    const c = currentPages[p];
    if (b && !c) { lostPages.push(p); totals.lostPages += 1; continue; }
    if (!b && c) { newPages.push(p); totals.newPages += 1; }
    if (!b || !c) continue;
    const d = diffPage(b.elements, c.elements);
    perPage[p] = { url: c.url, slug: c.slug, screenshot: c.screenshot, baselineScreenshot: b.screenshot, ...d };
    totals.missing += d.missing.length;
    totals.introduced += d.introduced.length;
    totals.textChanged += d.textChanged.length;
    totals.routes += 1;
  }

  return { perPage, newPages, lostPages, totals };
}
