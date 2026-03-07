import fs from 'node:fs';
import path from 'node:path';

function usage() {
  console.log('Usage: node scripts/md-report-to-html-preview.mjs <input-md> [output-html]');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inlineMd(text) {
  return escapeHtml(text).replace(/`([^`]+)`/g, '<code>$1</code>');
}

function markdownToHtml(md) {
  const lines = md.replace(/\r/g, '').split('\n');
  const out = [];
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      out.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      out.push('</ol>');
      inOl = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      closeLists();
      continue;
    }

    const h1 = line.match(/^#\s+(.*)$/);
    const h2 = line.match(/^##\s+(.*)$/);
    const h3 = line.match(/^###\s+(.*)$/);
    const li = line.match(/^\s*-\s+(.*)$/);
    const oli = line.match(/^\s*\d+\.\s+(.*)$/);

    if (h1) {
      closeLists();
      out.push(`<h1>${inlineMd(h1[1])}</h1>`);
      continue;
    }
    if (h2) {
      closeLists();
      out.push(`<h2>${inlineMd(h2[1])}</h2>`);
      continue;
    }
    if (h3) {
      closeLists();
      out.push(`<h3>${inlineMd(h3[1])}</h3>`);
      continue;
    }
    if (li) {
      if (inOl) {
        out.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        out.push('<ul>');
        inUl = true;
      }
      out.push(`<li>${inlineMd(li[1])}</li>`);
      continue;
    }
    if (oli) {
      if (inUl) {
        out.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        out.push('<ol>');
        inOl = true;
      }
      out.push(`<li>${inlineMd(oli[1])}</li>`);
      continue;
    }

    closeLists();
    out.push(`<p>${inlineMd(line)}</p>`);
  }

  closeLists();
  return out.join('\n');
}

function findBacktickPaths(md) {
  const matches = [...md.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());
  return [...new Set(matches)];
}

function toWebPath(fromDir, targetPath) {
  const rel = path.relative(fromDir, targetPath);
  return rel.split(path.sep).join('/');
}

function findEvidenceDir(mdPaths, repoRoot) {
  const ev = mdPaths.find((p) => p.includes('qa-artifacts/evidence/'));
  if (!ev) return null;
  const normalized = ev.replaceAll('/', path.sep);
  const abs = path.resolve(repoRoot, normalized);
  const marker = `${path.sep}qa-artifacts${path.sep}evidence${path.sep}`;
  const idx = abs.indexOf(marker);
  if (idx === -1) return null;
  const after = abs.slice(idx + marker.length);
  const parts = after.split(path.sep);
  if (!parts.length) return null;
  return path.join(abs.slice(0, idx + marker.length), parts[0]);
}

function listFilesSafe(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map((name) => path.join(dir, name));
}

function renderMediaCards(files, outputDir) {
  if (!files.length) return '<p class="empty">Nu exista fisiere media detectate.</p>';
  return files
    .map((abs) => {
      const ext = path.extname(abs).toLowerCase();
      const label = escapeHtml(path.basename(abs));
      const src = encodeURI(toWebPath(outputDir, abs));
      if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) {
        return `<article class="card"><h4>${label}</h4><a href="${src}" target="_blank"><img src="${src}" alt="${label}"></a></article>`;
      }
      if (['.webm', '.mp4', '.mov'].includes(ext)) {
        return `<article class="card"><h4>${label}</h4><video controls preload="metadata" src="${src}"></video></article>`;
      }
      return `<article class="card"><h4>${label}</h4><a href="${src}" target="_blank">Open file</a></article>`;
    })
    .join('\n');
}

function renderPathList(paths, outputDir, repoRoot) {
  if (!paths.length) return '<p class="empty">Nu exista referinte de fisiere in markdown.</p>';
  const lis = paths
    .map((p) => {
      const abs = path.resolve(repoRoot, p.replaceAll('/', path.sep));
      const href = encodeURI(toWebPath(outputDir, abs));
      return `<li><a href="${href}" target="_blank"><code>${escapeHtml(p)}</code></a></li>`;
    })
    .join('\n');
  return `<ul>${lis}</ul>`;
}

function buildHtml({ title, mdHtml, referencedPathsHtml, imageCards, videoCards, generatedAt }) {
  return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --bg: #f4f7fb;
      --panel: #ffffff;
      --ink: #14213d;
      --muted: #54607a;
      --line: #d7e0f0;
      --accent: #0b78e3;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      background: radial-gradient(circle at 10% 10%, #eaf4ff 0, var(--bg) 42%);
      color: var(--ink);
      line-height: 1.45;
    }
    .wrap {
      width: min(1300px, 96vw);
      margin: 20px auto 40px;
      display: grid;
      grid-template-columns: 1.1fr 1fr;
      gap: 16px;
    }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 4px 18px rgba(26, 53, 96, 0.08);
      min-height: 120px;
    }
    h1, h2, h3 { margin: 0.8em 0 0.4em; line-height: 1.25; }
    h1 { font-size: 1.5rem; }
    h2 { font-size: 1.15rem; border-top: 1px solid var(--line); padding-top: 10px; }
    h3 { font-size: 1rem; color: #1b4f8b; }
    p, li { color: var(--ink); }
    code {
      background: #eef4ff;
      border: 1px solid #d4e1fa;
      border-radius: 6px;
      padding: 1px 6px;
      font-family: Consolas, "Courier New", monospace;
      font-size: 0.9em;
    }
    .meta {
      font-size: 0.9rem;
      color: var(--muted);
      margin-bottom: 8px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 12px;
    }
    .card {
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 10px;
      background: #fff;
    }
    .card h4 {
      margin: 0 0 8px;
      font-size: 0.88rem;
      color: var(--muted);
      word-break: break-all;
    }
    img, video {
      width: 100%;
      height: auto;
      border-radius: 8px;
      border: 1px solid #dce5f7;
      background: #f0f3f9;
    }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .section-title {
      margin: 0 0 10px;
      font-size: 1.05rem;
    }
    .empty { color: var(--muted); font-style: italic; }
    @media (max-width: 980px) {
      .wrap { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="panel">
      <div class="meta">Generat la: ${escapeHtml(generatedAt)}</div>
      ${mdHtml}
    </section>
    <section class="panel">
      <h2 class="section-title">Preview Screenshots</h2>
      <div class="grid">${imageCards}</div>
      <h2 class="section-title">Preview Videos</h2>
      <div class="grid">${videoCards}</div>
      <h2 class="section-title">Referenced Files</h2>
      ${referencedPathsHtml}
    </section>
  </div>
</body>
</html>`;
}

function main() {
  const inputArg = process.argv[2];
  const outputArg = process.argv[3];
  if (!inputArg) {
    usage();
    process.exit(1);
  }

  const repoRoot = process.cwd();
  const inputPath = path.resolve(repoRoot, inputArg);
  if (!fs.existsSync(inputPath)) {
    console.error(`Input markdown not found: ${inputPath}`);
    process.exit(1);
  }

  const outputPath =
    outputArg
      ? path.resolve(repoRoot, outputArg)
      : path.join(path.dirname(inputPath), `${path.basename(inputPath, '.md')}.html`);
  const outputDir = path.dirname(outputPath);
  fs.mkdirSync(outputDir, { recursive: true });

  const md = fs.readFileSync(inputPath, 'utf-8');
  const mdPaths = findBacktickPaths(md).filter((p) => p.includes('/') || p.includes('\\'));
  const evidenceDir = findEvidenceDir(mdPaths, repoRoot);

  const screenshotsDir = evidenceDir ? path.join(evidenceDir, 'screenshots') : null;
  const videosDir = evidenceDir ? path.join(evidenceDir, 'videos') : null;
  const images = listFilesSafe(screenshotsDir).filter((f) => /\.(png|jpg|jpeg|gif|webp)$/i.test(f));
  const videos = listFilesSafe(videosDir).filter((f) => /\.(webm|mp4|mov)$/i.test(f));

  const mdHtml = markdownToHtml(md);
  const imageCards = renderMediaCards(images, outputDir);
  const videoCards = renderMediaCards(videos, outputDir);
  const referencedPathsHtml = renderPathList(mdPaths, outputDir, repoRoot);
  const title = (md.match(/^#\s+(.+)$/m)?.[1] || path.basename(inputPath)).trim();

  const html = buildHtml({
    title,
    mdHtml,
    imageCards,
    videoCards,
    referencedPathsHtml,
    generatedAt: new Date().toISOString(),
  });

  fs.writeFileSync(outputPath, html, 'utf-8');
  console.log(`HTML_REPORT=${outputPath}`);
  console.log(`EVIDENCE_DIR=${evidenceDir || 'not-detected'}`);
  console.log(`IMAGES=${images.length}`);
  console.log(`VIDEOS=${videos.length}`);
}

main();
