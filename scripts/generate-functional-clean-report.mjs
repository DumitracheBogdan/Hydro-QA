import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'qa-artifacts', 'hydrocert_qa_report_bugs_only.html');

const RUNS = [
  path.join(ROOT, 'qa-artifacts', 'evidence', 'functional-fast-nonidentical-2026-02-27T19-21-36-798Z', 'summary.json'),
  path.join(ROOT, 'qa-artifacts', 'evidence', 'resume-batch-2026-02-27T22-49-18-428Z', 'summary.json'),
  path.join(ROOT, 'qa-artifacts', 'evidence', 'resume-extra-2026-02-27T22-43-20-896Z', 'summary.json'),
  path.join(ROOT, 'qa-artifacts', 'evidence', 'validate-planner-eye-2026-02-27T22-58-59-374Z', 'summary.json'),
];

// Strictly removed after explicit re-validation.
const EXCLUDE_IDS = new Set([
  'NBUG-011',
  'NBUG-014',
  'NBUG-017',
  'NBUG-018',
  'NBUG-019',
  'NBUG-021',
  'NBUG-023',
]);

function esc(v=''){
  return String(v)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

function rel(abs){
  return path.relative(path.dirname(OUT), abs).split(path.sep).join('/');
}

function normalizeSeverity(b){
  const raw = String(b.severity || b.sev || 'MEDIUM').toUpperCase();
  if (raw.includes('CRITICAL')) return 'CRITICAL';
  if (raw.includes('HIGH')) return 'HIGH';
  if (raw.includes('LOW')) return 'LOW';
  return 'MEDIUM';
}

function normalizeBug(b){
  const id = b.id || 'BUG-UNK';
  const title = b.title || b.description || id;
  const severity = normalizeSeverity(b);
  const description = b.description || b.detail || title;
  const expected = b.expected || 'Expected behavior should occur consistently after the action.';
  const actual = b.actual || b.detail || description;
  const steps = Array.isArray(b.steps) && b.steps.length
    ? b.steps
    : [
        'Open the target page/module.',
        'Perform the action described in the title.',
        'Observe the resulting behavior.',
      ];
  const evidence = Array.isArray(b.evidence) ? b.evidence : [];
  const sample = Array.isArray(b.sample) ? b.sample : [];
  return { id, title, severity, description, expected, actual, steps, evidence, sample };
}

const all = [];
for (const p of RUNS){
  if (!fs.existsSync(p)) continue;
  const j = JSON.parse(fs.readFileSync(p,'utf-8'));
  for (const b of (j.bugs || [])) all.push(normalizeBug(b));
}

const byId = new Map();
for (const b of all){
  if (EXCLUDE_IDS.has(String(b.id || '').toUpperCase())) continue;
  if (!byId.has(b.id)) byId.set(b.id, b);
}
const bugs = [...byId.values()].sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true}));

const counts = { CRITICAL:0, HIGH:0, MEDIUM:0, LOW:0 };
for (const b of bugs) counts[b.severity] = (counts[b.severity]||0) + 1;

const sevClass = (s)=> s.toLowerCase();
const now = new Date().toISOString();

const cards = bugs.map((b)=>{
  const ev = b.evidence.filter(Boolean).map((e)=>{
    const abs = path.isAbsolute(e) ? e : path.join(ROOT, e);
    if (!fs.existsSync(abs)) return '';
    const href = rel(abs);
    const name = path.basename(abs);
    const isVideo = /\.(mp4|webm)$/i.test(name);
    if (isVideo){
      return `<div class="video-container"><h5>Video Evidence</h5><video controls preload="metadata"><source src="${esc(href)}" type="video/mp4"></video></div>`;
    }
    return `<div class="screenshot-container"><h5>Screenshot Evidence</h5><a href="${esc(href)}" target="_blank"><img src="${esc(href)}" alt="${esc(name)}"></a></div>`;
  }).join('\n');

  const sample = b.sample.length
    ? `<div class="steps"><p><strong>Sample Data / Logs:</strong></p><ul>${b.sample.slice(0,6).map(s=>`<li><code>${esc(s)}</code></li>`).join('')}</ul></div>`
    : '';

  return `
<div class="bug-card ${sevClass(b.severity)}">
  <h4><span class="severity ${sevClass(b.severity)}">${esc(b.severity)}</span> ${esc(b.id)}: ${esc(b.title)} <span class="new-badge">NEW</span></h4>
  <p><strong>Description:</strong> ${esc(b.description)}</p>
  <p><strong>Expected:</strong> ${esc(b.expected)}</p>
  <p><strong>Actual:</strong> ${esc(b.actual)}</p>
  <p><strong>Impact:</strong> <span class="impact">${esc(b.severity)} functional reliability issue.</span></p>
  <div class="steps"><p><strong>Steps to Reproduce:</strong></p><ol>${b.steps.map(x=>`<li>${esc(x)}</li>`).join('')}</ol></div>
  ${sample}
  ${ev}
</div>`;
}).join('\n');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HydroCert QA Test Report - Functional Bugs Only</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background: #f5f7fa; }
    .container { max-width: 1100px; margin: 0 auto; padding: 20px; }
    header { background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); color: white; padding: 30px 20px; text-align: center; border-radius: 8px; margin-bottom: 25px; }
    header h1 { font-size: 1.8em; margin-bottom: 8px; }
    header .date { font-size: 1em; opacity: 0.92; }
    .section { background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .section h2 { color: #1e3c72; border-bottom: 2px solid #2a5298; padding-bottom: 8px; margin-bottom: 12px; font-size: 1.3em; }
    .section-intro { color: #b02a37; font-weight: 600; margin-bottom: 14px; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin: 15px 0; }
    .summary-card { padding: 20px; border-radius: 8px; text-align: center; }
    .summary-card.critical { background: #dc3545; color: #fff; }
    .summary-card.fail { background: #f8d7da; color: #721c24; }
    .summary-card.warning { background: #fff3cd; color: #856404; }
    .summary-card.info { background: #d1ecf1; color: #0c5460; }
    .summary-card .number { font-size: 2.5em; font-weight: bold; }
    .summary-card .label { font-size: 0.9em; margin-top: 5px; }
    .new-badge { background: #28a745; color: #fff; font-size: 0.72em; padding: 2px 8px; border-radius: 12px; margin-left: 6px; font-weight: 700; vertical-align: middle; }
    .severity { padding: 3px 10px; border-radius: 12px; font-size: 0.75em; font-weight: 700; display: inline-block; text-transform: uppercase; }
    .severity.critical { background: #8b0000; color: #fff; }
    .severity.high { background: #dc3545; color: #fff; }
    .severity.medium { background: #fd7e14; color: #fff; }
    .severity.low { background: #17a2b8; color: #fff; }
    .bug-card { border: 1px solid #e0e0e0; border-radius: 6px; padding: 15px; margin: 12px 0; background: #fff; }
    .bug-card.critical { border-left: 4px solid #8b0000; background: #fff4f4; }
    .bug-card.high { border-left: 4px solid #dc3545; background: #fff7f7; }
    .bug-card.medium { border-left: 4px solid #fd7e14; background: #fffaf5; }
    .bug-card.low { border-left: 4px solid #17a2b8; background: #f8fcff; }
    .bug-card h4 { color: #222; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 1.03em; }
    .bug-card p { margin: 6px 0; color: #444; font-size: 0.95em; }
    .impact { color: #b02a37; font-weight: 700; }
    .steps { background: #f3f4f6; padding: 12px; border-radius: 4px; margin: 12px 0; }
    .steps ol,.steps ul { margin-left: 20px; }
    .steps li { margin: 3px 0; }
    .screenshot-container { margin: 15px 0; background: #f8f9fa; border-radius: 8px; padding: 12px; border: 1px solid #e0e0e0; }
    .screenshot-container h5, .video-container h5 { color: #555; margin-bottom: 8px; font-size: 0.9em; }
    .screenshot-container img { width: 100%; max-width: 760px; border-radius: 6px; display: block; margin: 0 auto; border: 1px solid #ddd; }
    .video-container { margin: 15px 0; background: #2d2d2d; border-radius: 8px; padding: 12px; }
    .video-container video { width: 100%; max-width: 760px; border-radius: 6px; display: block; margin: 0 auto; }
    code { background: #f2f4f8; padding: 2px 6px; border-radius: 4px; }
  </style>
</head>
<body>
<div class="container">
<header>
  <h1>HydroCert QA Test Report - Functional Bugs Only</h1>
  <p class="date">${esc(now)} | Consolidated validated runs only</p>
</header>

<section class="section">
  <h2>Test Results Summary</h2>
  <div class="summary-grid">
    <div class="summary-card critical"><div class="number">${counts.CRITICAL}</div><div class="label">Critical Bugs</div></div>
    <div class="summary-card fail"><div class="number">${counts.HIGH}</div><div class="label">High Bugs</div></div>
    <div class="summary-card warning"><div class="number">${counts.MEDIUM}</div><div class="label">Medium Bugs</div></div>
    <div class="summary-card info"><div class="number">${counts.LOW}</div><div class="label">Low Issues</div></div>
    <div class="summary-card info"><div class="number">${bugs.length}</div><div class="label">Total Issues</div></div>
  </div>
</section>

<section class="section">
  <h2>Functional Bugs <span class="new-badge">NEW</span></h2>
  <p class="section-intro">Only validated functional bugs from approved runs (A11y-only/legacy noisy runs excluded).</p>
  ${cards}
</section>
</div>
</body>
</html>`;

fs.writeFileSync(OUT, html, 'utf-8');
console.log(`WROTE=${OUT}`);
console.log(`COUNT=${bugs.length}`);
