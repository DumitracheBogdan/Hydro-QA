// robot/runner/run_robot_suite.mjs
// Spawns Robot, then the converter, then prints SUMMARY_JSON=<path> on stdout.
// Contract consumed by scripts/run_regression_bundle.mjs (matches /^SUMMARY_JSON=(.+)$/m).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SUITE_PATH = process.env.ROBOT_SUITE_PATH || 'robot/suites/sanity';
const SUITE_ID   = process.env.ROBOT_SUITE_ID   || 'ROBOTSAN03';

const stamp  = new Date().toISOString().replace(/[.:]/g, '-');
const runDir = path.join(process.cwd(), 'qa-artifacts', 'infra-regression', `robot-${SUITE_ID}-${stamp}`);
fs.mkdirSync(runDir, { recursive: true });

const robot = spawnSync('robot',
  ['--outputdir', runDir, '--output', 'output.xml', '--log', 'log.html', '--report', 'report.html', SUITE_PATH],
  { stdio: 'inherit' }
);
// Robot exit codes: 0 = all pass; 1..250 = N failed; >250 = engine error.
if (robot.status === null || robot.status > 250) {
  console.error(`Robot failed to execute (exit=${robot.status})`);
  process.exit(2);
}

const xmlPath     = path.join(runDir, 'output.xml');
const summaryPath = path.join(runDir, 'summary.json');

const python = process.platform === 'win32' ? 'python' : 'python3';
const conv = spawnSync(python,
  ['robot/lib/output_xml_to_summary.py', '--input', xmlPath, '--output', summaryPath],
  { stdio: 'inherit' }
);
if (conv.status !== 0) {
  console.error(`Converter failed (exit=${conv.status})`);
  process.exit(3);
}

// Bundle contract: emit these two lines on stdout.
console.log(`SUMMARY_JSON=${summaryPath}`);
console.log(`REPORT_MD=${path.join(runDir, 'report.html')}`);
