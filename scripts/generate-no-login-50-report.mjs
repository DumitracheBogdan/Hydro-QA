import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const QA_ARTIFACTS = path.join(ROOT, 'qa-artifacts');
const EVIDENCE_ROOT = path.join(QA_ARTIFACTS, 'evidence');
const OUTPUT_PATH = path.join(QA_ARTIFACTS, 'hydrocert_no_login_50_findings_report.html');

const SECTION_ORDER = ['critical', 'high', 'medium', 'low', 'unknown'];

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function severityKey(v) {
  const s = String(v || '').toLowerCase().trim();
  if (s.includes('critical')) return 'critical';
  if (s.includes('high')) return 'high';
  if (s.includes('medium')) return 'medium';
  if (s.includes('low')) return 'low';
  return 'unknown';
}

function toRel(absPath) {
  return path.relative(path.dirname(OUTPUT_PATH), absPath).split(path.sep).join('/');
}

function getLatestNoLogin50RunDir() {
  if (!fs.existsSync(EVIDENCE_ROOT)) return null;
  const dirs = fs
    .readdirSync(EVIDENCE_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith('no-login-50-findings-'))
    .map((d) => path.join(EVIDENCE_ROOT, d.name));
  if (!dirs.length) return null;
  dirs.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return dirs[0];
}

function buildEvidenceHtml(finding) {
  const items = Array.isArray(finding.evidence) ? finding.evidence : [];
  const chunks = [];

  items.forEach((raw, idx) => {
    const abs = path.isAbsolute(raw) ? raw : path.resolve(raw);
    if (!fs.existsSync(abs)) return;
    const ext = path.extname(abs).toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      const rel = toRel(abs);
      chunks.push(`
      <div class="screenshot-container">
        <h5>Screenshot Evidence ${idx + 1}</h5>
        <a href="${escapeHtml(rel)}" target="_blank"><img src="${escapeHtml(rel)}" alt="${escapeHtml(path.basename(abs))}"></a>
      </div>`);
      return;
    }

    if (ext === '.log' || ext === '.txt') {
      const rawText = fs.readFileSync(abs, 'utf-8');
      let sample = rawText.split(/\r?\n/).slice(0, 40).join('\n');
      if (/google maps/i.test(finding.title)) {
        const line = rawText
          .split(/\r?\n/)
          .find((l) => /google maps javascript api has been loaded directly/i.test(l));
        if (line) sample = line;
      }
      chunks.push(`
      <div class="screenshot-container">
        <h5>Log Evidence ${idx + 1}</h5>
        <a href="${escapeHtml(toRel(abs))}" target="_blank">${escapeHtml(path.basename(abs))}</a>
        <pre>${escapeHtml(sample)}</pre>
      </div>`);
    }
  });

  return chunks.join('\n');
}

function introFor(sectionKey) {
  switch (sectionKey) {
    case 'critical':
      return 'Critical issues require immediate remediation before release.';
    case 'high':
      return 'High severity bugs impact core workflows and should be prioritized.';
    case 'medium':
      return 'Medium issues impact reliability, UX confidence, or operational clarity.';
    case 'low':
      return 'Low issues are non-blocking but should be fixed to improve polish and trust.';
    default:
      return 'Additional issues with unspecified severity.';
  }
}

function renderSection(sectionKey, findings) {
  if (!findings.length) return '';
  const title = `${sectionKey.charAt(0).toUpperCase()}${sectionKey.slice(1)} Severity Bugs`;
  const cards = findings
    .map((f) => {
      const sev = severityKey(f.severity);
      const steps = Array.isArray(f.steps) && f.steps.length
        ? f.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('\n')
        : '<li>Open relevant page</li><li>Perform target action</li><li>Observe actual behavior</li>';
      const evidence = buildEvidenceHtml(f);
      return `
    <div class="bug-card ${sev}">
      <h4>
        <span class="severity ${sev}">${escapeHtml(sev)}</span>
        ${escapeHtml(f.id)}: ${escapeHtml(f.title)}
        <span class="new-badge">NEW</span>
      </h4>
      <p><strong>Description:</strong> ${escapeHtml(f.description || '-')}</p>
      <p><strong>Expected:</strong> ${escapeHtml(f.expected || '-')}</p>
      <p><strong>Actual:</strong> ${escapeHtml(f.actual || '-')}</p>
      <p><strong>Impact:</strong> <span class="impact">${escapeHtml(f.impact || '-')}</span></p>
      <div class="steps">
        <p><strong>Steps to Reproduce:</strong></p>
        <ol>${steps}</ol>
      </div>
      ${evidence}
    </div>`;
    })
    .join('\n');
  return `
      <section class="section">
        <h2>${escapeHtml(title)} <span class="new-badge">NEW</span></h2>
        <p class="section-intro">${escapeHtml(introFor(sectionKey))}</p>
        ${cards}
      </section>`;
}

function run() {
  const runDir = getLatestNoLogin50RunDir();
  if (!runDir) {
    throw new Error('No no-login-50-findings run directory found.');
  }
  const summaryPath = path.join(runDir, 'summary.json');
  if (!fs.existsSync(summaryPath)) {
    throw new Error(`summary.json not found in ${runDir}`);
  }

  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
  const findings = Array.isArray(summary.findings) ? summary.findings : [];
  if (findings.length !== 50) {
    throw new Error(`Expected exactly 50 findings, got ${findings.length}`);
  }

  const grouped = {
    critical: [],
    high: [],
    medium: [],
    low: [],
    unknown: [],
  };
  findings.forEach((f) => grouped[severityKey(f.severity)].push(f));

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HydroCert QA Test Report - 50 Findings (No Login)</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f5f7fa;
    }
    .container {
      max-width: 1100px;
      margin: 0 auto;
      padding: 20px;
    }
    header {
      background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
      color: white;
      padding: 30px 20px;
      text-align: center;
      border-radius: 8px;
      margin-bottom: 25px;
    }
    header h1 { font-size: 1.8em; margin-bottom: 8px; }
    header .date { font-size: 1em; opacity: 0.9; }
    .section {
      background: white;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }
    .section h2 {
      color: #1e3c72;
      border-bottom: 2px solid #2a5298;
      padding-bottom: 8px;
      margin-bottom: 12px;
      font-size: 1.3em;
    }
    .section-intro {
      color: #dc3545;
      font-weight: 600;
      margin-bottom: 14px;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
      margin: 15px 0;
    }
    .summary-card {
      padding: 20px;
      border-radius: 8px;
      text-align: center;
    }
    .summary-card.critical { background: #dc3545; color: white; }
    .summary-card.fail { background: #f8d7da; color: #721c24; }
    .summary-card.warning { background: #fff3cd; color: #856404; }
    .summary-card.info { background: #d1ecf1; color: #0c5460; }
    .summary-card .number { font-size: 2.5em; font-weight: bold; }
    .summary-card .label { font-size: 0.9em; margin-top: 5px; }
    .new-badge {
      background: #28a745;
      color: #fff;
      font-size: 0.72em;
      padding: 2px 8px;
      border-radius: 12px;
      margin-left: 6px;
      font-weight: 700;
      vertical-align: middle;
    }
    .severity {
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 0.75em;
      font-weight: 700;
      display: inline-block;
      text-transform: uppercase;
    }
    .severity.critical { background: #8b0000; color: white; }
    .severity.high { background: #dc3545; color: white; }
    .severity.medium { background: #fd7e14; color: white; }
    .severity.low { background: #17a2b8; color: white; }
    .severity.unknown { background: #6c757d; color: white; }
    .bug-card {
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      padding: 15px;
      margin: 12px 0;
      border-left: 4px solid #dc3545;
      background: #fff;
    }
    .bug-card.critical { border-left-color: #8b0000; background: #fff4f4; }
    .bug-card.high { border-left-color: #dc3545; background: #fff7f7; }
    .bug-card.medium { border-left-color: #fd7e14; background: #fffaf5; }
    .bug-card.low,
    .bug-card.unknown { border-left-color: #17a2b8; background: #f8fcff; }
    .bug-card h4 {
      color: #222;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      font-size: 1.03em;
    }
    .bug-card p {
      margin: 6px 0;
      color: #444;
      font-size: 0.95em;
    }
    .impact {
      color: #b02a37;
      font-weight: 700;
    }
    .steps {
      background: #f3f4f6;
      padding: 12px;
      border-radius: 4px;
      margin: 12px 0;
    }
    .steps ol, .steps ul { margin-left: 20px; }
    .steps li { margin: 3px 0; }
    .screenshot-container {
      margin: 15px 0;
      background: #f8f9fa;
      border-radius: 8px;
      padding: 12px;
      border: 1px solid #e0e0e0;
    }
    .screenshot-container h5 {
      color: #555;
      margin-bottom: 8px;
      font-size: 0.9em;
    }
    .screenshot-container img {
      width: 100%;
      max-width: 700px;
      border-radius: 6px;
      display: block;
      margin: 0 auto;
      border: 1px solid #ddd;
    }
    pre {
      margin-top: 8px;
      background: #111827;
      color: #d1d5db;
      padding: 10px;
      border-radius: 8px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    a { color: #0d6efd; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>HydroCert QA Test Report - 50 Findings (No Login)</h1>
      <p class="date">${escapeHtml(summary.createdAt)} | Run: ${escapeHtml(path.basename(runDir))}</p>
    </header>

    <section class="section">
      <h2>Test Results Summary</h2>
      <div class="summary-grid">
        <div class="summary-card critical">
          <div class="number">${grouped.critical.length}</div>
          <div class="label">Critical Bugs</div>
        </div>
        <div class="summary-card fail">
          <div class="number">${grouped.high.length}</div>
          <div class="label">High Bugs</div>
        </div>
        <div class="summary-card warning">
          <div class="number">${grouped.medium.length}</div>
          <div class="label">Medium Bugs</div>
        </div>
        <div class="summary-card info">
          <div class="number">${grouped.low.length + grouped.unknown.length}</div>
          <div class="label">Low/Other Issues</div>
        </div>
        <div class="summary-card info">
          <div class="number">${findings.length}</div>
          <div class="label">Total Issues</div>
        </div>
      </div>
    </section>

    ${SECTION_ORDER.map((k) => renderSection(k, grouped[k])).join('\n')}
  </div>
</body>
</html>`;

  fs.writeFileSync(OUTPUT_PATH, html, 'utf-8');
  console.log(`REPORT_PATH=${OUTPUT_PATH}`);
  console.log(`RUN_DIR=${runDir}`);
}

run();

