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
