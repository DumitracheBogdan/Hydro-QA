import fs from 'node:fs';

const [a, b] = process.argv.slice(2);
if (!a || !b) {
  console.error('Usage: compare-summaries.mjs <run1.json> <run2.json>');
  process.exit(2);
}

const r1 = JSON.parse(fs.readFileSync(a, 'utf-8'));
const r2 = JSON.parse(fs.readFileSync(b, 'utf-8'));

const map1 = new Map(r1.perRoute.map((r) => [r.path, r]));
const map2 = new Map(r2.perRoute.map((r) => [r.path, r]));

const divergences = [];
const allPaths = new Set([...map1.keys(), ...map2.keys()]);
for (const p of allPaths) {
  const x = map1.get(p);
  const y = map2.get(p);
  if (!x || !y) {
    divergences.push({ path: p, reason: x ? 'missing in run2' : 'missing in run1' });
    continue;
  }
  for (const k of ['missing', 'introduced', 'textChanged']) {
    if (x[k] !== y[k]) {
      divergences.push({ path: p, metric: k, run1: x[k], run2: y[k] });
    }
  }
}

if (divergences.length > 0) {
  console.error('FLAKE DETECTED — detector produced different results on two consecutive runs against the same baseline:');
  for (const d of divergences) console.error('  ', JSON.stringify(d));
  console.error('\nThis means a dynamic element slipped past the chrome filter. Inspect crops/ + diff.json to find which element churns between runs.');
  process.exit(1);
}

console.log(`Self-check passed — both runs agree on ${r1.perRoute.length} routes.`);
process.exit(0);
