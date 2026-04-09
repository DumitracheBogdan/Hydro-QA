import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const stamp = new Date().toISOString().replace(/[.:]/g, '-');
const run = `maestro-mobile-smoke-${stamp}`;
const runDir = path.join(process.cwd(), 'qa-artifacts', 'infra-regression', run);
fs.mkdirSync(runDir, { recursive: true });

const MOBILE_FLOWS_DIR = path.join(process.cwd(), 'mobile-flows');
const TEST_FILTER = new Set(
  String(process.env.HYDROCERT_TEST_IDS || '')
    .split(',')
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean)
);

const FLOWS = [
  { id: 'MOB01', yaml: '01_visits_home.yaml', area: 'Home', test: 'Visits home screen elements' },
  { id: 'MOB02', yaml: '02_history.yaml', area: 'History', test: 'History screen elements' },
  { id: 'MOB03', yaml: '03_activity.yaml', area: 'Activity', test: 'Activity screen elements' },
  { id: 'MOB04', yaml: '04_account.yaml', area: 'Account', test: 'Account screen elements and actions' },
  { id: 'MOB05', yaml: '05_visit_detail.yaml', area: 'Visit Detail', test: 'Visit detail tabs and actions' },
  { id: 'MOB06', yaml: '06_bottom_navigation.yaml', area: 'Navigation', test: 'Bottom navigation tab switching' },
  { id: 'MOB07', yaml: '07_search_and_filters.yaml', area: 'Search', test: 'Search and filter chips' },
  { id: 'MOB08', yaml: '08_login.yaml', area: 'Login', test: 'Login screen elements and validation' },
  { id: 'MOB09', yaml: '09_logout_confirm.yaml', area: 'Account', test: 'Logout confirmation dialog (Cancel + Confirm)' },
  { id: 'MOB10', yaml: '10_my_signature.yaml', area: 'Account', test: 'My Signature screen' },
  { id: 'MOB11', yaml: '11_change_password.yaml', area: 'Account', test: 'Change Password screen and validation' },
  { id: 'MOB12', yaml: '12_actions_crud.yaml', area: 'Visit Actions', test: 'Quick Actions FAB and Actions CRUD' },
  { id: 'MOB13', yaml: '13_start_inspection.yaml', area: 'Inspections', test: 'Start Inspection from Inspections tab' },
  { id: 'MOB14', yaml: '14_visit_detail_sections.yaml', area: 'Visit Detail', test: 'Visit Detail expandable sections (Details, Signature, Actions)' },
  { id: 'MOB15', yaml: '15_location_map.yaml', area: 'Navigation', test: 'Location icon opens map' },
];

const checks = [];

function pushCheck({ id, area, test, status, details, evidence = [] }) {
  checks.push({ id, area, test, status, details, evidence });
  console.log(`${id} | ${status} | ${test} | ${details}`);
}

function shouldRun(id) {
  return TEST_FILTER.size === 0 || TEST_FILTER.has(String(id).toUpperCase());
}

// Check if Maestro CLI is available
function isMaestroAvailable() {
  try {
    execSync('npx maestro --version', { stdio: 'pipe', timeout: 30000 });
    return true;
  } catch {
    return false;
  }
}

// Check if Android emulator is running
function isEmulatorRunning() {
  try {
    const output = execSync('adb devices', { stdio: 'pipe', timeout: 10000 }).toString();
    const lines = output.split('\n').filter((line) => line.trim() && !line.startsWith('List'));
    return lines.some((line) => line.includes('device') && !line.includes('offline'));
  } catch {
    return false;
  }
}

const maestroOk = isMaestroAvailable();
const emulatorOk = maestroOk && isEmulatorRunning();

if (!maestroOk || !emulatorOk) {
  const reason = !maestroOk ? 'Maestro CLI not available' : 'Android emulator not running';
  console.log(`SKIP_ALL: ${reason}`);
  for (const flow of FLOWS) {
    if (!shouldRun(flow.id)) continue;
    pushCheck({
      id: flow.id,
      area: flow.area,
      test: flow.test,
      status: 'SKIP',
      details: reason,
    });
  }
} else {
  for (const flow of FLOWS) {
    if (!shouldRun(flow.id)) continue;

    const yamlPath = path.join(MOBILE_FLOWS_DIR, flow.yaml);
    if (!fs.existsSync(yamlPath)) {
      pushCheck({
        id: flow.id,
        area: flow.area,
        test: flow.test,
        status: 'SKIP',
        details: `Flow YAML not found: ${flow.yaml}`,
      });
      continue;
    }

    try {
      const outputFile = path.join(runDir, `${flow.id}-output.txt`);
      execSync(`npx maestro test "${yamlPath}"`, {
        stdio: 'pipe',
        timeout: 120000,
        cwd: process.cwd(),
      });

      pushCheck({
        id: flow.id,
        area: flow.area,
        test: flow.test,
        status: 'PASS',
        details: `Maestro flow ${flow.yaml} passed`,
      });
    } catch (err) {
      const stderr = err.stderr ? err.stderr.toString().slice(0, 500) : '';
      const stdout = err.stdout ? err.stdout.toString().slice(0, 500) : '';
      pushCheck({
        id: flow.id,
        area: flow.area,
        test: flow.test,
        status: 'FAIL',
        details: `Maestro flow ${flow.yaml} failed: ${(stderr || stdout || err.message).slice(0, 200)}`,
      });
    }
  }
}

const totals = {
  total: checks.length,
  pass: checks.filter((c) => c.status === 'PASS').length,
  fail: checks.filter((c) => c.status === 'FAIL').length,
  skip: checks.filter((c) => c.status === 'SKIP').length,
};

const summary = {
  generatedAt: new Date().toISOString(),
  environment: { flowsDir: MOBILE_FLOWS_DIR },
  totals,
  checks,
};

const summaryPath = path.join(runDir, 'summary.json');
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

const mdLines = [];
mdLines.push('# Maestro Mobile Smoke Report');
mdLines.push(`Date: ${new Date().toISOString()}`);
mdLines.push(`Flows Dir: ${MOBILE_FLOWS_DIR}`);
mdLines.push('');
mdLines.push('## Summary');
mdLines.push(`- Total checks: ${totals.total}`);
mdLines.push(`- Passed: ${totals.pass}`);
mdLines.push(`- Failed: ${totals.fail}`);
mdLines.push(`- Skipped: ${totals.skip}`);
mdLines.push('');
mdLines.push('## Checks');
mdLines.push('| ID | Area | Test | Status | Details |');
mdLines.push('|---|---|---|---|---|');
for (const c of checks) {
  mdLines.push(`| ${c.id} | ${c.area} | ${String(c.test).replace(/\|/g, '/')} | ${c.status} | ${String(c.details).replace(/\|/g, '/')} |`);
}
if (checks.some((c) => c.status === 'FAIL')) {
  mdLines.push('');
  mdLines.push('## Fail Evidence');
  for (const c of checks.filter((x) => x.status === 'FAIL')) {
    if (!c.evidence?.length) continue;
    mdLines.push(`- ${c.id}: ${c.evidence.join(', ')}`);
  }
}
const reportPath = path.join(runDir, 'report.md');
fs.writeFileSync(reportPath, mdLines.join('\n'), 'utf-8');

console.log(`SUMMARY_JSON=${summaryPath}`);
console.log(`REPORT_MD=${reportPath}`);
console.log(`TOTAL=${totals.total} PASS=${totals.pass} FAIL=${totals.fail} SKIP=${totals.skip}`);
