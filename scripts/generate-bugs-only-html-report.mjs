import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const QA_ARTIFACTS = path.join(ROOT, 'qa-artifacts');
const EVIDENCE_ROOT = path.join(QA_ARTIFACTS, 'evidence');
const OUTPUT_PATH = path.join(QA_ARTIFACTS, 'hydrocert_qa_report_bugs_only.html');

const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3, unknown: 4 };

function normalizeSeverity(value) {
  const s = String(value || '').trim().toLowerCase();
  if (s.includes('critical')) return 'critical';
  if (s.includes('high')) return 'high';
  if (s.includes('medium')) return 'medium';
  if (s.includes('low')) return 'low';
  return 'unknown';
}

function normalizeKey(v) {
  return String(v || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toRel(fromFile, targetAbs) {
  return path.relative(path.dirname(fromFile), targetAbs).split(path.sep).join('/');
}

function uniq(arr) {
  return [...new Set(arr)];
}

function listSummaryFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(root, d.name, 'summary.json'))
    .filter((p) => fs.existsSync(p));
}

function resolveEvidencePaths(list, runDir) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const raw of list) {
    const text = String(raw || '').trim();
    if (!text) continue;
    const abs = path.isAbsolute(text) ? text : path.resolve(runDir, text);
    if (fs.existsSync(abs)) out.push(abs);
  }
  return uniq(out);
}

function latestFileByPattern(dir, pattern) {
  const files = fs
    .readdirSync(dir)
    .filter((name) => pattern.test(name))
    .map((name) => path.join(dir, name));
  if (!files.length) return null;
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0];
}

function loadManualDerivedIssues() {
  const manualPath = latestFileByPattern(QA_ARTIFACTS, /^manual-qa-full-.*\.json$/i);
  if (!manualPath || !fs.existsSync(manualPath)) return [];

  let data;
  try {
    data = JSON.parse(fs.readFileSync(manualPath, 'utf-8'));
  } catch {
    return [];
  }

  const actions = Array.isArray(data.actions) ? data.actions : [];
  const issues = [];

  const unknownHits = actions.filter((a) =>
    /unknown customer and site/i.test(String(a.label || '')) &&
    /unknown location/i.test(String(a.label || '')) &&
    /no status/i.test(String(a.label || '')),
  );
  if (unknownHits.length >= 5) {
    issues.push({
      sourceRuns: ['manual-derived'],
      title: 'Visits List shows placeholder data (Unknown Customer/Site/Location + No status)',
      severity: 'medium',
      description:
        'Multiple visits rows display placeholder values instead of complete operational data.',
      expected:
        'Visits list rows should show real customer/site/location and valid workflow status for assigned visits.',
      actual: `Detected ${unknownHits.length} rows containing Unknown placeholders + No status in manual traversal.`,
      impact:
        'Operators cannot rely on scheduling list data quality, increasing dispatch and reporting errors.',
      steps: [
        'Open Visits List.',
        'Review multiple rows in the list.',
        'Observe placeholder values: Unknown Customer/Site/Location and No status.',
      ],
      evidence: [manualPath],
    });
  }

  const shareHits = actions.filter((a) => /share report/i.test(String(a.label || '')));
  if (shareHits.length >= 5) {
    const sameState = shareHits.filter((a) => a.beforeUrl === a.afterUrl).length;
    if (sameState === shareHits.length) {
      issues.push({
        sourceRuns: ['manual-derived'],
        title: 'Share Report action has no observable user feedback',
        severity: 'medium',
        description:
          'Share Report was clicked repeatedly across visit detail pages without observable navigation/state feedback in the captured session.',
        expected:
          'Share action should provide visible feedback (dialog, toast, native share trigger confirmation, or copy confirmation).',
        actual: `${shareHits.length}/${shareHits.length} Share Report clicks ended with no observable route/state transition in automation logs.`,
        impact:
          'Users cannot confirm whether sharing succeeded, leading to repeated attempts and operational uncertainty.',
        steps: [
          'Open a visit details page.',
          'Click Share Report.',
          'Observe that no visible confirmation is captured by the UI flow logger.',
        ],
        evidence: [manualPath],
      });
    }
  }

  const uploadHits = actions.filter((a) => /^upload$/i.test(String(a.label || '')));
  if (uploadHits.length >= 5) {
    const sameState = uploadHits.filter((a) => a.beforeUrl === a.afterUrl).length;
    if (sameState === uploadHits.length) {
      issues.push({
        sourceRuns: ['manual-derived'],
        title: 'Upload action in Attachments has no observable picker/feedback',
        severity: 'medium',
        description:
          'Upload button was triggered multiple times on visit details attachments without observable UI response in run logs.',
        expected:
          'Upload should open file picker and/or show immediate upload interaction feedback.',
        actual: `${uploadHits.length}/${uploadHits.length} Upload clicks stayed on same page state in automation logs.`,
        impact:
          'Attachment workflow becomes unclear and may block evidence/document upload operations.',
        steps: [
          'Open Visit Details -> Attachments tab.',
          'Click Upload.',
          'Observe missing visual feedback in the captured interaction flow.',
        ],
        evidence: [manualPath],
      });
    }
  }

  return issues;
}

function parseMdFindingBlocks(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const headingIndexes = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (/^###\s+/.test(lines[i])) headingIndexes.push(i);
  }
  const blocks = [];
  for (let h = 0; h < headingIndexes.length; h += 1) {
    const start = headingIndexes[h];
    const end = h + 1 < headingIndexes.length ? headingIndexes[h + 1] : lines.length;
    const heading = lines[start].replace(/^###\s+/, '').trim();
    const body = lines.slice(start + 1, end);
    blocks.push({ heading, body });
  }
  return blocks;
}

function parseMdEvidencePaths(blockText) {
  const matches = [...blockText.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());
  return matches.filter((x) => x.includes('qa-artifacts/evidence/'));
}

function extractHeadingMeta(heading) {
  let severity = normalizeSeverity(heading);
  let title = heading;
  const idMatch = heading.match(/^([A-Z][A-Z0-9-]+)\s*\(([^)]+)\)/i);
  if (idMatch) {
    severity = normalizeSeverity(idMatch[2]);
    title = '';
  }
  const numbered = heading.match(/^\d+\)\s*(critical|high|medium|low)\s*-\s*(.+)$/i);
  if (numbered) {
    severity = normalizeSeverity(numbered[1]);
    title = numbered[2].trim();
  }
  return { severity, title };
}

function parseMdMeta(mdPath) {
  const text = fs.readFileSync(mdPath, 'utf-8');
  const blocks = parseMdFindingBlocks(text);
  const records = [];

  for (const block of blocks) {
    const { severity: sevFromHead, title: titleFromHead } = extractHeadingMeta(block.heading);
    let severity = sevFromHead;
    let title = titleFromHead;
    let description = '';
    let expected = '';
    let actual = '';
    let impact = '';
    const steps = [];
    const evidence = [];
    let mode = '';

    for (const lineRaw of block.body) {
      const line = lineRaw.trimEnd();
      const trimmed = line.trim();
      if (!trimmed) continue;

      const titleMatch = trimmed.match(/^- Title:\s*(.+)$/i);
      if (titleMatch) {
        title = titleMatch[1].trim();
        mode = '';
        continue;
      }

      const sevMatch = trimmed.match(/^- Severity:\s*(.+)$/i);
      if (sevMatch) {
        severity = normalizeSeverity(sevMatch[1]);
        mode = '';
        continue;
      }

      const inlineDesc = trimmed.match(/^- (Description|What was observed):\s*(.+)$/i);
      if (inlineDesc) {
        description = inlineDesc[2].trim();
        mode = inlineDesc[1].toLowerCase().includes('observed') ? 'description' : '';
        continue;
      }
      if (/^- What was observed:\s*$/i.test(trimmed)) {
        mode = 'description';
        continue;
      }

      const inlineExpected = trimmed.match(/^- Expected:\s*(.+)$/i);
      if (inlineExpected) {
        expected = inlineExpected[1].trim();
        mode = '';
        continue;
      }
      if (/^- Expected:\s*$/i.test(trimmed)) {
        mode = 'expected';
        continue;
      }

      const inlineActual = trimmed.match(/^- Actual:\s*(.+)$/i);
      if (inlineActual) {
        actual = inlineActual[1].trim();
        mode = '';
        continue;
      }
      if (/^- Actual:\s*$/i.test(trimmed)) {
        mode = 'actual';
        continue;
      }

      const inlineImpact = trimmed.match(/^- (Impact|Risk):\s*(.+)$/i);
      if (inlineImpact) {
        impact = inlineImpact[2].trim();
        mode = '';
        continue;
      }
      if (/^- (Impact|Risk):\s*$/i.test(trimmed)) {
        mode = 'impact';
        continue;
      }

      if (/^- Repro:|^- Repro steps:|^- Steps to Reproduce:/i.test(trimmed)) {
        mode = 'repro';
        continue;
      }
      if (/^- Evidence(:| files:)?/i.test(trimmed)) {
        mode = 'evidence';
        continue;
      }

      const stepMatch = trimmed.match(/^\d+\.\s+(.+)$/);
      if (stepMatch && mode === 'repro') {
        steps.push(stepMatch[1].trim());
        continue;
      }

      const bulletMatch = trimmed.match(/^-\s+(.+)$/);
      if (bulletMatch) {
        const textValue = bulletMatch[1].trim();
        if (mode === 'description') {
          description = description ? `${description} ${textValue}` : textValue;
        } else if (mode === 'actual') {
          actual = actual ? `${actual} ${textValue}` : textValue;
        } else if (mode === 'expected') {
          expected = expected ? `${expected} ${textValue}` : textValue;
        } else if (mode === 'impact') {
          impact = impact ? `${impact} ${textValue}` : textValue;
        } else if (mode === 'repro') {
          steps.push(textValue);
        }
      }
    }

    const joined = [block.heading, ...block.body].join('\n');
    const relEvidence = parseMdEvidencePaths(joined);
    for (const rel of relEvidence) {
      const abs = path.resolve(ROOT, rel.replaceAll('/', path.sep));
      if (fs.existsSync(abs)) evidence.push(abs);
    }

    if (!title) continue;
    records.push({
      title,
      normTitle: normalizeKey(title),
      severity,
      description,
      expected,
      actual,
      impact,
      steps,
      evidence: uniq(evidence),
    });
  }

  return records;
}

function loadMdMetaIndex() {
  const mdFiles = fs
    .readdirSync(QA_ARTIFACTS)
    .filter((name) => /^QA-Report-Hydrocert-.*\.md$/i.test(name))
    .filter((name) => !/Senior-Project-Assessment/i.test(name))
    .map((name) => path.join(QA_ARTIFACTS, name));

  const entries = [];
  for (const file of mdFiles) {
    entries.push(...parseMdMeta(file));
  }

  const byTitle = new Map();
  for (const m of entries) {
    const curr = byTitle.get(m.normTitle);
    if (!curr) {
      byTitle.set(m.normTitle, m);
      continue;
    }
    const score = (x) =>
      (x.description ? x.description.length : 0) +
      (x.expected ? x.expected.length : 0) +
      (x.actual ? x.actual.length : 0) +
      (x.impact ? x.impact.length : 0) +
      x.steps.length * 20 +
      x.evidence.length * 10;
    if (score(m) > score(curr)) byTitle.set(m.normTitle, m);
  }
  return [...byTitle.values()];
}

function findBestMdMeta(mdMetaList, title) {
  const norm = normalizeKey(title);
  let match = mdMetaList.find((m) => m.normTitle === norm);
  if (match) return match;
  match = mdMetaList.find((m) => norm.includes(m.normTitle) || m.normTitle.includes(norm));
  return match || null;
}

function isLikelyIssueFromMd(entry) {
  const title = String(entry?.title || '').trim();
  if (!title) return false;
  const normTitle = normalizeKey(title);
  if (/^run [a-z0-9]/i.test(normTitle)) return false;
  if (/scope|execution run|coverage|additional logs|validated observations/.test(normTitle)) return false;

  if (entry.severity && entry.severity !== 'unknown') return true;
  if (entry.actual || entry.expected || entry.impact) return true;
  if (Array.isArray(entry.steps) && entry.steps.length > 0) return true;
  if (Array.isArray(entry.evidence) && entry.evidence.length > 0) {
    return /bug|issue|error|warning|redirect|disabled|broken|missing|fails|failure|runtime|inaccessible|non functional|non-functional|unknown/.test(
      normTitle,
    );
  }
  return false;
}

function isLoginRelated(issue) {
  const blob = [
    issue.title,
    issue.description,
    issue.expected,
    issue.actual,
    issue.impact,
    ...(issue.steps || []),
    ...(issue.sourceRuns || []),
    ...((issue.evidence || []).map((x) => path.basename(String(x)))),
  ]
    .join(' ')
    .toLowerCase();

  const re =
    /\blogin\b|\bauth\b|\bsign[\s-]?in\b|\bpassword\b|\btoken\b|\brefresh\b|\bforgot\b|\bkeep me signed\b|\/login|\/auth|silent login|throttling\/lockout|autocomplete metadata/;
  return re.test(blob);
}

function isNotImplementedFeatureIssue(issue) {
  const blob = [issue.title, issue.description, issue.expected, issue.actual, issue.impact]
    .join(' ')
    .toLowerCase();
  return /\bteam management\b|\bsettings\b/.test(blob);
}

function canonicalIssueKey(issue) {
  const blob = [issue.title, issue.description, issue.actual, issue.impact].join(' ').toLowerCase();

  if (/welcome,\s*!|dashboard greeting|personalization string is broken|missing user name/.test(blob)) {
    return 'dashboard-greeting-empty-user';
  }
  if (/runtime data error|cannot read properties of undefined.*items|getfilteredappointments/.test(blob)) {
    return 'visits-runtime-items-undefined';
  }
  if (/react rendering warnings|key prop|unique key prop|cannot update a component/.test(blob)) {
    return 'react-console-render-warnings';
  }

  return normalizeKey(issue.title);
}

function mergeMdOnlyFindings(summaryFindings, mdMetaList) {
  const seen = new Set(summaryFindings.map((f) => normalizeKey(f.title)));
  const extras = [];

  for (const m of mdMetaList) {
    if (!isLikelyIssueFromMd(m)) continue;
    const key = normalizeKey(m.title);
    if (seen.has(key)) continue;
    seen.add(key);
    extras.push({
      title: m.title,
      severity: m.severity || 'unknown',
      description: m.description || m.title,
      expected: m.expected || '',
      actual: m.actual || '',
      impact: m.impact || '',
      steps: Array.isArray(m.steps) ? m.steps : [],
      evidence: Array.isArray(m.evidence) ? m.evidence : [],
      sourceRuns: ['md-findings'],
    });
  }

  return [...summaryFindings, ...extras];
}

function loadFindings(mdMetaList) {
  const summaries = listSummaryFiles(EVIDENCE_ROOT);
  const all = [];

  for (const summaryPath of summaries) {
    try {
      const json = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
      const runDir = path.dirname(summaryPath);
      const findings = Array.isArray(json.findings) ? json.findings : [];
      for (const f of findings) {
        const title = String(f.title || 'Untitled finding').trim();
        const meta = findBestMdMeta(mdMetaList, title);
        all.push({
          sourceRuns: [path.basename(runDir)],
          title,
          severity: normalizeSeverity(meta?.severity || f.severity),
          description: meta?.description || title,
          expected: meta?.expected || '',
          actual: meta?.actual || String(f.details || '').trim(),
          impact: meta?.impact || '',
          steps: Array.isArray(meta?.steps) ? meta.steps : [],
          evidence: uniq([
            ...resolveEvidencePaths(f.evidence, runDir),
            ...((meta?.evidence || []).filter((x) => fs.existsSync(x))),
          ]),
        });
      }
    } catch {
      // ignore invalid summary
    }
  }

  return all;
}

function dedupeFindings(findings) {
  const map = new Map();
  for (const f of findings) {
    const key = canonicalIssueKey(f);
    if (!map.has(key)) {
      map.set(key, { ...f, evidence: uniq(f.evidence), sourceRuns: uniq(f.sourceRuns || []) });
      continue;
    }
    const curr = map.get(key);
    curr.evidence = uniq([...curr.evidence, ...f.evidence]);
    curr.sourceRuns = uniq([...(curr.sourceRuns || []), ...(f.sourceRuns || [])]);
    if (!curr.expected && f.expected) curr.expected = f.expected;
    if (!curr.actual && f.actual) curr.actual = f.actual;
    if (!curr.impact && f.impact) curr.impact = f.impact;
    if ((!curr.steps || !curr.steps.length) && f.steps?.length) curr.steps = f.steps;
    if ((SEV_ORDER[f.severity] ?? 4) < (SEV_ORDER[curr.severity] ?? 4)) curr.severity = f.severity;
  }
  return [...map.values()];
}

function splitEvidence(files) {
  const images = [];
  const videos = [];
  const other = [];
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) images.push(file);
    else if (['.webm', '.mp4', '.mov'].includes(ext)) videos.push(file);
    else other.push(file);
  }
  return { images, videos, other };
}

function defaultExpected(title) {
  const t = String(title || '');
  if (/redirect/i.test(t)) return 'User should remain on the intended page and follow documented auth/routing behavior.';
  if (/login|sign in|auth/i.test(t)) return 'Authentication flow should submit once, return clear feedback, and enforce secure behavior.';
  if (/header|autocomplete|ui|label|status/i.test(t)) return 'UI should follow accessibility and consistency standards.';
  return 'Feature should behave consistently and match product requirements.';
}

function defaultImpact(severity) {
  if (severity === 'critical') return 'CRITICAL - Major business risk and release blocker.';
  if (severity === 'high') return 'HIGH - Core user flow degradation with high operational impact.';
  if (severity === 'medium') return 'MEDIUM - Noticeable functional inconsistency and support risk.';
  return 'LOW - UX/quality issue with limited business impact.';
}

function sevLabel(sev) {
  return sev === 'unknown' ? 'INFO' : sev.toUpperCase();
}

function renderCard(issue, globalIndex) {
  const id = `BUG-${String(globalIndex + 1).padStart(3, '0')}`;
  const { images, videos, other } = splitEvidence(issue.evidence);

  const steps = (issue.steps && issue.steps.length
    ? issue.steps
    : ['Open relevant page', 'Perform the target action', 'Observe actual behavior versus expected'])
    .map((s) => `<li>${escapeHtml(s)}</li>`)
    .join('\n');

  const screenshotBlocks = images
    .map((img, i) => {
      const rel = encodeURI(toRel(OUTPUT_PATH, img));
      const cap = images.length > 1 ? `Screenshot Evidence ${i + 1}` : 'Screenshot Evidence';
      return `
      <div class="screenshot-container">
        <h5>${cap}</h5>
        <a href="${rel}" target="_blank"><img src="${rel}" alt="${escapeHtml(path.basename(img))}"></a>
      </div>`;
    })
    .join('\n');

  const videoBlocks = videos
    .map((video, i) => {
      const rel = encodeURI(toRel(OUTPUT_PATH, video));
      const cap = videos.length > 1 ? `Video Evidence ${i + 1}` : 'Video Evidence';
      return `
      <div class="video-container">
        <h5>${cap}</h5>
        <video controls preload="metadata" src="${rel}"></video>
      </div>`;
    })
    .join('\n');

  const otherBlock = other.length
    ? `
      <div class="steps">
        <p><strong>Supporting files:</strong></p>
        <ul>
          ${other
            .map((file) => {
              const rel = encodeURI(toRel(OUTPUT_PATH, file));
              return `<li><a href="${rel}" target="_blank"><code>${escapeHtml(path.basename(file))}</code></a></li>`;
            })
            .join('\n')}
        </ul>
      </div>
    `
    : '';

  return `
    <div class="bug-card ${issue.severity}">
      <h4>
        <span class="severity ${issue.severity}">${sevLabel(issue.severity)}</span>
        ${id}: ${escapeHtml(issue.title)}
        <span class="new-badge">NEW</span>
      </h4>
      <p><strong>Description:</strong> ${escapeHtml(issue.description || issue.title)}</p>
      <p><strong>Expected:</strong> ${escapeHtml(issue.expected || defaultExpected(issue.title))}</p>
      <p><strong>Actual:</strong> ${escapeHtml(issue.actual || issue.description || '-')}</p>
      <p><strong>Impact:</strong> <span class="impact">${escapeHtml(issue.impact || defaultImpact(issue.severity))}</span></p>
      <div class="steps">
        <p><strong>Steps to Reproduce:</strong></p>
        <ol>
          ${steps}
        </ol>
      </div>
      ${screenshotBlocks}
      ${videoBlocks}
      ${otherBlock}
    </div>
  `;
}

function countBySeverity(findings) {
  const c = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
  for (const f of findings) c[f.severity] = (c[f.severity] || 0) + 1;
  return c;
}

function renderSection(title, intro, issues, startIndex) {
  if (!issues.length) return { html: '', count: 0 };
  const cards = issues.map((issue, i) => renderCard(issue, startIndex + i)).join('\n');
  return {
    html: `
      <section class="section">
        <h2>${escapeHtml(title)} <span class="new-badge">NEW</span></h2>
        <p class="section-intro">${escapeHtml(intro)}</p>
        ${cards}
      </section>
    `,
    count: issues.length,
  };
}

function renderHtml(findings) {
  const sorted = [...findings].sort((a, b) => {
    const sa = SEV_ORDER[a.severity] ?? 4;
    const sb = SEV_ORDER[b.severity] ?? 4;
    if (sa !== sb) return sa - sb;
    return a.title.localeCompare(b.title);
  });
  const counts = countBySeverity(sorted);

  const criticalIssues = sorted.filter((x) => x.severity === 'critical');
  const highIssues = sorted.filter((x) => x.severity === 'high');
  const mediumIssues = sorted.filter((x) => x.severity === 'medium');
  const lowIssues = sorted.filter((x) => x.severity === 'low' || x.severity === 'unknown');

  const sec1 = renderSection(
    'Critical Bugs - Data Persistence / Functional Failures',
    'These issues indicate severe behavior mismatches that can block production workflows.',
    criticalIssues,
    0,
  );
  const sec2 = renderSection(
    'High Severity Bugs',
    'High-severity issues affect primary navigation and protected user flows.',
    highIssues,
    sec1.count,
  );
  const sec3 = renderSection(
    'Medium Severity Bugs',
    'Medium issues impact reliability, UX confidence, or request handling robustness.',
    mediumIssues,
    sec1.count + sec2.count,
  );
  const sec4 = renderSection(
    'Low Severity Issues',
    'Low issues should be fixed to improve quality polish and consistency.',
    lowIssues,
    sec1.count + sec2.count + sec3.count,
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HydroCert QA Test Report - Bugs & Issues</title>
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
    .bug-card.critical {
      border-left-color: #8b0000;
      background: #fff4f4;
    }
    .bug-card.high {
      border-left-color: #dc3545;
      background: #fff7f7;
    }
    .bug-card.medium {
      border-left-color: #fd7e14;
      background: #fffaf5;
    }
    .bug-card.low,
    .bug-card.unknown {
      border-left-color: #17a2b8;
      background: #f8fcff;
    }
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
    .steps ol, .steps ul {
      margin-left: 20px;
    }
    .steps li {
      margin: 3px 0;
    }
    .video-container {
      margin: 15px 0;
      background: #2d2d2d;
      border-radius: 8px;
      padding: 12px;
    }
    .video-container h5 {
      color: #ccc;
      margin-bottom: 8px;
      font-size: 0.9em;
    }
    .video-container video {
      width: 100%;
      max-width: 700px;
      border-radius: 6px;
      display: block;
      margin: 0 auto;
    }
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
    a {
      color: #0d6efd;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>HydroCert QA Test Report - Bugs & Issues</h1>
      <p class="date">${new Date().toISOString()} | Consolidated | Bugs only</p>
    </header>

    <section class="section">
      <h2>Test Results Summary</h2>
      <div class="summary-grid">
        <div class="summary-card critical">
          <div class="number">${counts.critical}</div>
          <div class="label">Critical Bugs</div>
        </div>
        <div class="summary-card fail">
          <div class="number">${counts.high}</div>
          <div class="label">High Bugs</div>
        </div>
        <div class="summary-card warning">
          <div class="number">${counts.medium}</div>
          <div class="label">Medium Bugs</div>
        </div>
        <div class="summary-card info">
          <div class="number">${counts.low + counts.unknown}</div>
          <div class="label">Low Issues</div>
        </div>
        <div class="summary-card info">
          <div class="number">${sorted.length}</div>
          <div class="label">Total Issues</div>
        </div>
      </div>
    </section>

    ${sec1.html}
    ${sec2.html}
    ${sec3.html}
    ${sec4.html}
  </div>
</body>
</html>`;
}

function main() {
  const mdMeta = loadMdMetaIndex();
  const summaryFindings = loadFindings(mdMeta);
  const manualDerived = loadManualDerivedIssues();
  const combined = mergeMdOnlyFindings([...summaryFindings, ...manualDerived], mdMeta);
  const findings = dedupeFindings(combined)
    .filter((f) => !isLoginRelated(f))
    .filter((f) => !isNotImplementedFeatureIssue(f));
  const html = renderHtml(findings);
  fs.writeFileSync(OUTPUT_PATH, html, 'utf-8');
  console.log(`BUGS_ONLY_HTML=${OUTPUT_PATH}`);
  console.log(`ISSUES=${findings.length}`);
}

main();
