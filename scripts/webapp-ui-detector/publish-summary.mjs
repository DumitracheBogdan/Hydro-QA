import fs from 'node:fs';
import path from 'node:path';

const summaryPath = process.argv[2] || path.join('qa-artifacts', 'webapp-ui-detector', 'summary.json');
if (!fs.existsSync(summaryPath)) {
  console.log('_No summary.json produced — detector did not run or failed early._');
  process.exit(0);
}
const s = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));

const lines = [];
lines.push('## UI Change Detector — web-app');
lines.push('');
lines.push(`- Mode: **${s.mode}**`);
lines.push(`- Routes crawled: **${s.totals.routes}**`);
lines.push(`- Missing: **${s.totals.missing}**  |  Introduced: **${s.totals.introduced}**  |  TextChanged: **${s.totals.textChanged}**`);
lines.push(`- NewPages: **${s.totals.newPages}**  |  LostPages: **${s.totals.lostPages}**`);
lines.push('');

if (s.perRoute && s.perRoute.length > 0) {
  lines.push('| Route | Missing | Introduced | TextChanged |');
  lines.push('|-------|---------|------------|-------------|');
  for (const r of s.perRoute) {
    lines.push(`| \`${r.path}\` | ${r.missing} | ${r.introduced} | ${r.textChanged} |`);
  }
}
console.log(lines.join('\n'));
