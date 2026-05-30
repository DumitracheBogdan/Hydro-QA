import { test } from "node:test";
import assert from "node:assert/strict";
import { buildP04 } from "./gen-p04.mjs";
import { RISK_COMMENT_FIELDS_AUTOMATED, buildExpected } from "./setup-data.mjs";

// M9: the value gen-p04 types MUST equal what verify-data expects (buildExpected.riskAssessment),
// modulo the Maestro ${RUN_ID} substitution. This test couples the two so they can never drift.
test("buildP04 types exactly the value verify-data expects (modulo RUN_ID) (M9)", () => {
  const flow = buildP04();
  const sampleValue = buildExpected("RUNTOKEN").riskAssessment[RISK_COMMENT_FIELDS_AUTOMATED[0]];
  assert.equal(sampleValue, "PARITY-RUNTOKEN rc");
  const flowLiteral = sampleValue.replace("RUNTOKEN", "${RUN_ID}"); // "PARITY-${RUN_ID} rc"
  assert.ok(flow.includes(`inputText: ${JSON.stringify(flowLiteral)}`), `flow should type ${flowLiteral}`);
});

test("buildP04 emits one input per automated field and scrolls to each field label (M9)", () => {
  const flow = buildP04();
  const inputCount = (flow.match(/inputText: "PARITY-\$\{RUN_ID\} rc"/g) || []).length;
  assert.equal(inputCount, RISK_COMMENT_FIELDS_AUTOMATED.length);
  for (const label of RISK_COMMENT_FIELDS_AUTOMATED) {
    assert.ok(flow.includes(JSON.stringify(label)), `flow should reference field label ${label}`);
  }
});

// 3c flake fix (run 26683863166): the CI emulator sometimes lands the "below label" tap on empty
// space, so inputText no-ops and the value never persists — but Maestro reports the tap COMPLETED, so
// the flow exits 0 and run_flow (which retries only on non-zero exit) never retries -> 3c FAILs. An
// assertVisible of the typed value after each input makes a silent miss EXIT NON-ZERO -> run_flow
// relaunches + retries. One assert per automated field, paired with its input.
test("buildP04 asserts the typed value is visible after each input (silent-miss -> retry) (3c flake)", () => {
  const flow = buildP04();
  const assertCount = (flow.match(/assertVisible: "PARITY-\$\{RUN_ID\} rc"/g) || []).length;
  assert.equal(assertCount, RISK_COMMENT_FIELDS_AUTOMATED.length);
  // the assert must come AFTER the input (verifies what was just typed), not before it
  assert.ok(flow.indexOf("inputText:") < flow.indexOf("assertVisible:"), "assertVisible must follow inputText");
});
