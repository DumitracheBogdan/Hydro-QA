import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const TARGET_ENV = (process.env.HYDROCERT_TARGET_ENV || process.env.HYDROCERT_ENV || 'dev').toLowerCase();
const MODE = (process.env.HYDROCERT_REGRESSION_MODE || 'standard').toLowerCase() === 'full' ? 'full' : 'standard';
const ROOT = process.cwd();
const INFRA_ROOT = path.join(ROOT, 'qa-artifacts', 'infra-regression');
const stamp = new Date().toISOString().replace(/[.:]/g, '-');
const runLabel = `${TARGET_ENV}-${MODE}-regression-${stamp}`;
const outputDir = path.join(INFRA_ROOT, runLabel);
const suitesDir = path.join(outputDir, 'suites');

const SUITES = {
  deep: {
    key: 'deep',
    id: 'DEEP32',
    label: 'Deep Regression',
    script: path.join('scripts', 'tmp-dev-infra-deep-regression.mjs'),
    tests: 32,
  },
  api: {
    key: 'api',
    id: 'API34',
    label: 'API Ultra',
    script: path.join('scripts', 'tmp-dev-infra-api-ultra.mjs'),
    tests: 34,
  },
  roleaccess: {
    key: 'roleaccess',
    id: 'ROLE06',
    label: 'Role Access Security',
    script: path.join('scripts', 'qa-role-access-security.mjs'),
    tests: 6,
  },
  roleaccessreadonly: {
    key: 'roleaccessreadonly',
    id: 'ROLERO06',
    label: 'Role Access Read-Only',
    script: path.join('scripts', 'qa-role-access-readonly.mjs'),
    tests: 6,
  },
  postdeployhardening: {
    key: 'postdeployhardening',
    id: 'PRODPOST07',
    label: 'Prod Post-Deploy Hardening',
    script: path.join('scripts', 'qa-prod-postdeploy-hardening.mjs'),
    tests: 7,
  },
  ui: {
    key: 'ui',
    id: 'UI22',
    label: 'UI Ultra',
    script: path.join('scripts', 'tmp-dev-infra-ui-ultra.mjs'),
    tests: 22,
  },
  essential: {
    key: 'essential',
    id: 'ESS25',
    label: 'Essential Delta',
    script: path.join('scripts', 'tmp-dev-infra-essential-delta.mjs'),
    tests: 25,
  },
  advanced: {
    key: 'advanced',
    id: 'NEW60',
    label: 'Senior New Tests',
    script: path.join('scripts', 'tmp-dev-infra-senior-newtests.mjs'),
    tests: 60,
  },
  soak: {
    key: 'soak',
    id: 'SOAK11',
    label: 'Soak 10m',
    script: path.join('scripts', 'tmp-dev-infra-soak-10m.mjs'),
    tests: 11,
  },
};

function selectedSuiteKeys(environment, mode) {
  if (mode === 'full') return environment === 'dev'
    ? ['deep', 'api', 'roleaccess', 'ui', 'essential', 'soak', 'advanced']
    : ['deep', 'api', 'roleaccessreadonly', 'ui', 'essential', 'soak', 'advanced'];
  if (environment === 'prod') return ['deep', 'roleaccessreadonly', 'postdeployhardening'];
  return ['deep', 'api', 'roleaccess', 'ui'];
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copySuiteArtifacts(summaryPath, suiteId) {
  const suiteRunDir = path.dirname(summaryPath);
  const targetDir = path.join(suitesDir, suiteId);
  fs.cpSync(suiteRunDir, targetDir, { recursive: true, force: true });
  return targetDir;
}

function writeGitHubOutput(pairs) {
  const out = process.env.GITHUB_OUTPUT;
  if (!out) return;
  const lines = Object.entries(pairs).map(([key, value]) => `${key}=${String(value).replace(/\r?\n/g, ' ')}`);
  fs.appendFileSync(out, `${lines.join('\n')}\n`, 'utf8');
}

async function runNodeScript(scriptPath) {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

async function runPythonExcel(combinedJsonPath, excelPath, title, subtitle) {
  const python = process.platform === 'win32' ? 'python' : 'python3';
  const result = await new Promise((resolve, reject) => {
    const child = spawn(python, [
      path.join('scripts', 'generate_regression_excel_dashboard.py'),
      '--combined-json',
      combinedJsonPath,
      '--output',
      excelPath,
      '--title',
      title,
      '--subtitle',
      subtitle,
    ], {
      cwd: ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    child.stdout.on('data', (chunk) => process.stdout.write(chunk.toString()));
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stderr }));
  });

  if (result.code !== 0) {
    throw new Error(`Excel generation failed with exit code ${result.code}`);
  }
}

const suiteKeys = selectedSuiteKeys(TARGET_ENV, MODE);
const suiteDefs = suiteKeys.map((key) => SUITES[key]);

if (DRY_RUN) {
  const planned = {
    environment: TARGET_ENV,
    mode: MODE,
    suites: suiteDefs.map((suite) => ({ id: suite.id, label: suite.label, tests: suite.tests, script: suite.script })),
    expectedTests: suiteDefs.reduce((sum, suite) => sum + suite.tests, 0),
  };
  console.log(JSON.stringify(planned, null, 2));
  process.exit(0);
}

ensureDir(outputDir);
ensureDir(suitesDir);

const suiteRuns = [];
const combinedChecks = [];
let reportFiles = [];

for (const suite of suiteDefs) {
  console.log(`RUN_SUITE=${suite.id} SCRIPT=${suite.script}`);
  const result = await runNodeScript(suite.script);
  if (result.code !== 0) {
    throw new Error(`Suite ${suite.id} failed to execute. Exit code=${result.code}`);
  }

  const summaryMatch = result.stdout.match(/^SUMMARY_JSON=(.+)$/m);
  if (!summaryMatch) {
    throw new Error(`Suite ${suite.id} did not report SUMMARY_JSON path.`);
  }

  const reportMatch = result.stdout.match(/^REPORT_MD=(.+)$/m);
  const summaryPath = summaryMatch[1].trim();
  const reportPath = reportMatch ? reportMatch[1].trim() : '';
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  const copiedDir = copySuiteArtifacts(summaryPath, suite.id);

  const checks = (summary.checks || []).map((check) => ({ ...check, suite: suite.id }));
  combinedChecks.push(...checks);
  if (reportPath) reportFiles.push(reportPath);

  suiteRuns.push({
    suite: suite.id,
    label: suite.label,
    tests: suite.tests,
    summaryPath,
    reportPath,
    artifactDir: copiedDir,
    totals: summary.totals || {},
  });
}

const totals = {
  total: combinedChecks.length,
  pass: combinedChecks.filter((check) => check.status === 'PASS').length,
  fail: combinedChecks.filter((check) => check.status === 'FAIL').length,
  skip: combinedChecks.filter((check) => check.status === 'SKIP').length,
};

const combinedSummary = {
  generatedAt: new Date().toISOString(),
  environment: TARGET_ENV,
  mode: MODE,
  runLabel,
  suiteRuns,
  totals,
  checks: combinedChecks,
};

const combinedJsonPath = path.join(outputDir, 'combined-summary.json');
fs.writeFileSync(combinedJsonPath, JSON.stringify(combinedSummary, null, 2));

const mdLines = [];
mdLines.push(`# Hydrocert ${TARGET_ENV.toUpperCase()} ${MODE === 'full' ? 'Full Regression' : 'Post-Deploy Regression'} Report`);
mdLines.push(`Generated: ${combinedSummary.generatedAt}`);
mdLines.push('');
mdLines.push('## Summary');
mdLines.push(`- Environment: ${TARGET_ENV}`);
mdLines.push(`- Mode: ${MODE}`);
mdLines.push(`- Total tests: ${totals.total}`);
mdLines.push(`- Passed: ${totals.pass}`);
mdLines.push(`- Failed: ${totals.fail}`);
mdLines.push(`- Skipped: ${totals.skip}`);
mdLines.push('');
mdLines.push('## Suites');
mdLines.push('| Suite | Label | Tests | Passed | Failed | Skipped |');
mdLines.push('|---|---|---:|---:|---:|---:|');
for (const suite of suiteRuns) {
  mdLines.push(`| ${suite.suite} | ${suite.label} | ${suite.tests} | ${suite.totals.pass || 0} | ${suite.totals.fail || 0} | ${suite.totals.skip || 0} |`);
}
mdLines.push('');
mdLines.push('## Checks');
mdLines.push('| # | Suite | ID | Area | Status | Test | Details |');
mdLines.push('|---:|---|---|---|---|---|---|');
combinedChecks.forEach((check, index) => {
  const details = String(check.details || '').replace(/\|/g, '/');
  const test = String(check.test || '').replace(/\|/g, '/');
  mdLines.push(`| ${index + 1} | ${check.suite} | ${check.id} | ${check.area} | ${check.status} | ${test} | ${details} |`);
});

const combinedReportPath = path.join(outputDir, 'report.md');
fs.writeFileSync(combinedReportPath, mdLines.join('\n'), 'utf8');

const excelName = `Hydrocert_${TARGET_ENV.toUpperCase()}_${MODE === 'full' ? 'Full_Regression' : 'Post_Deploy_Regression'}_${stamp.slice(0, 10)}.xlsx`;
const excelPath = path.join(outputDir, excelName);
const title = `Hydrocert ${TARGET_ENV.toUpperCase()} ${MODE === 'full' ? 'Regresie completa' : 'Regresie post-deploy'}`;
const subtitle = `Suite rulate: ${suiteRuns.map((suite) => suite.suite).join(', ')}`;
await runPythonExcel(combinedJsonPath, excelPath, title, subtitle);

writeGitHubOutput({
  output_dir: outputDir,
  combined_json: combinedJsonPath,
  report_md: combinedReportPath,
  excel_path: excelPath,
  environment: TARGET_ENV,
  mode: MODE,
  total_tests: totals.total,
  failed_tests: totals.fail,
});

console.log(`OUTPUT_DIR=${outputDir}`);
console.log(`COMBINED_JSON=${combinedJsonPath}`);
console.log(`REPORT_MD=${combinedReportPath}`);
console.log(`EXCEL_PATH=${excelPath}`);
console.log(`TOTAL=${totals.total} PASS=${totals.pass} FAIL=${totals.fail} SKIP=${totals.skip}`);
