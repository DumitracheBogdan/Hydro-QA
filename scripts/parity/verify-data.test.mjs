import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSignature, checkFields, checkInspectionActions, checkVisitText, extractFormValue, buildSummary, EXPECTED_IDS, applyFlowGuards } from "./verify-data.mjs";

const inspection = {
  inspectionForms: [
    { formName: "Visit Information", formFields: [
      { formField: { fieldName: "Assisting 1" }, value: "PARITY-R Inspector 1" },
      { formField: { fieldName: "Assisting 2" }, value: "PARITY-R Inspector 2" },
      { formField: { fieldName: "Works being carried out" }, value: "PARITY-R Works" },
    ] },
    { formName: "Risk Assessment", formFields: [
      { formField: { fieldName: "Accessing Area/Lone Working- Comments" }, value: "PARITY-R risk comment" },
    ] },
  ],
};

test("extractFormValue finds a value by form + field name", () => {
  assert.equal(extractFormValue(inspection, "Visit Information", "Assisting 1"), "PARITY-R Inspector 1");
  assert.equal(extractFormValue(inspection, "Risk Assessment", "Accessing Area/Lone Working- Comments"), "PARITY-R risk comment");
  assert.equal(extractFormValue(inspection, "Nope", "x"), undefined);
});

test("checkSignature passes only with name + image", () => {
  assert.equal(checkSignature({ signature: "img", signatureName: "PARITY-R Client" }, { signatureName: "PARITY-R Client" }).status, "PASS");
  assert.equal(checkSignature({ signature: "", signatureName: "" }, { signatureName: "PARITY-R Client" }).status, "FAIL");
});

test("checkFields passes when all expected values match", () => {
  const r = checkFields("3b", "Mobile->Web", inspection, "Visit Information", { "Assisting 1": "PARITY-R Inspector 1", "Assisting 2": "PARITY-R Inspector 2", "Works being carried out": "PARITY-R Works" });
  assert.equal(r.status, "PASS");
});

test("checkFields fails and reports per-field when one is missing", () => {
  const r = checkFields("3b", "Mobile->Web", inspection, "Visit Information", { "Assisting 1": "PARITY-R Inspector 1", "Works being carried out": "WRONG" });
  assert.equal(r.status, "FAIL");
  assert.equal(r.fields["Assisting 1"], true);
  assert.equal(r.fields["Works being carried out"], false);
});

test("checkInspectionActions passes when all expected names present", () => {
  const acts = [{ name: "PARITY-R Hi" }, { name: "PARITY-R Med" }, { name: "PARITY-R Lo" }];
  const r = checkInspectionActions(acts, [{ name: "PARITY-R Hi" }, { name: "PARITY-R Med" }, { name: "PARITY-R Lo" }]);
  assert.equal(r.status, "PASS");
});

test("checkVisitText passes when all visit-level text fields match", () => {
  const want = { waterSystemDescription: "PARITY-R watersys", workDetails: "PARITY-R workdetails", samplingDetails: "PARITY-R sampling" };
  const r = checkVisitText({ ...want }, want);
  assert.equal(r.status, "PASS");
  assert.equal(r.id, "3d-visit-text");
});

test("checkVisitText fails and reports per-field when one differs", () => {
  const want = { waterSystemDescription: "PARITY-R watersys", workDetails: "PARITY-R workdetails", samplingDetails: "PARITY-R sampling" };
  const r = checkVisitText({ waterSystemDescription: "PARITY-R watersys", workDetails: "WRONG", samplingDetails: null }, want);
  assert.equal(r.status, "FAIL");
  assert.equal(r.fields.waterSystemDescription, true);
  assert.equal(r.fields.workDetails, false);
  assert.equal(r.fields.samplingDetails, false);
});

// --- M1: priority must be compared, not just name ---
test("checkInspectionActions FAILs when a priority mismatches (M1)", () => {
  const actions = [{ name: "PARITY-R Insp Hi", priority: "low" }]; // wrong priority
  const r = checkInspectionActions(actions, [{ name: "PARITY-R Insp Hi", priority: "high" }]);
  assert.equal(r.status, "FAIL");
});
test("checkInspectionActions PASSes when name+priority both match (M1)", () => {
  const actions = [{ name: "PARITY-R Insp Hi", priority: "high" }];
  const r = checkInspectionActions(actions, [{ name: "PARITY-R Insp Hi", priority: "high" }]);
  assert.equal(r.status, "PASS");
});

// --- L1/L6: no vacuous pass on empty expected or missing field ---
test("checkFields FAILs on an empty expected object (no vacuous pass) (L6)", () => {
  assert.equal(checkFields("x", "d", inspection, "Visit Information", {}).status, "FAIL");
});
test("checkVisitText FAILs on an empty expected object (L6)", () => {
  assert.equal(checkVisitText({}, {}).status, "FAIL");
});
test("checkFields FAILs when a field is missing (undefined !== non-empty want) (L1)", () => {
  assert.equal(checkFields("x", "d", inspection, "Visit Information", { "Nonexistent Field": "PARITY-R x" }).status, "FAIL");
});

// --- H1/H3/M10: buildSummary pins the denominator and fails open is impossible ---
test("buildSummary keeps all expected checks and scores them (H1)", () => {
  const checks = EXPECTED_IDS.map((id) => ({ id, direction: "x", status: "PASS", details: "" }));
  const s = buildSummary({ runId: "R", visitRef: "V" }, checks);
  assert.equal(s.total, EXPECTED_IDS.length);
  assert.equal(s.passed, EXPECTED_IDS.length);
  assert.equal(s.failed, 0);
});
test("buildSummary injects a synthetic FAIL for any expected check that never materialized (M10)", () => {
  const checks = EXPECTED_IDS.filter((id) => id !== "2a-description").map((id) => ({ id, direction: "x", status: "PASS", details: "" }));
  const s = buildSummary({ runId: "R", visitRef: "V" }, checks);
  assert.equal(s.total, EXPECTED_IDS.length); // denominator pinned, not shrunk
  assert.equal(s.checks.find((c) => c.id === "2a-description").status, "FAIL");
  assert.equal(s.failed, 1);
});
test("buildSummary with mobileMissing fails the absent web->mobile checks, never silently drops them (H3)", () => {
  const apiOnly = ["2c-inspection-actions", "3a-signature", "3b-visit-info", "3c-risk", "3d-visit-text", "3e-site-induction"]
    .map((id) => ({ id, direction: "x", status: "PASS", details: "" }));
  const s = buildSummary({ runId: "R", visitRef: "V" }, apiOnly, { mobileMissing: true });
  for (const id of ["2a-description", "2b-visit-actions", "2d-visit-text"]) {
    assert.equal(s.checks.find((c) => c.id === id).status, "FAIL");
  }
  assert.ok(s.failed >= 3);
});

// --- Split done-bar: gateFailed ignores documented-flaky checks but flags hard failures ---
test("buildSummary.gateFailed flags any hard failure (empty flaky set)", () => {
  const checks = EXPECTED_IDS.map((id) => ({ id, status: id === "3c-risk" ? "FAIL" : "PASS", details: "" }));
  const s = buildSummary({ runId: "R", visitRef: "V" }, checks);
  assert.equal(s.gateFailed, true);
});
test("buildSummary.gateFailed ignores a knownFlaky check but still reports it failed", () => {
  const checks = EXPECTED_IDS.map((id) => ({ id, status: id === "3c-risk" ? "FAIL" : "PASS", details: "" }));
  const s = buildSummary({ runId: "R", visitRef: "V" }, checks, { knownFlaky: new Set(["3c-risk"]) });
  assert.equal(s.gateFailed, false);
  assert.equal(s.failed, 1);
});

// --- M4: a fixed-value mobile->web check (3e) must also require its Maestro flow to have succeeded ---
test("applyFlowGuards forces 3e FAIL when the p03b flow failed, even if API read-back matched (M4)", () => {
  const checks = [{ id: "3e-site-induction", direction: "Mobile->Web", status: "PASS", details: "ok" }];
  const guarded = applyFlowGuards(checks, { p03b: 1 });
  assert.equal(guarded.find((c) => c.id === "3e-site-induction").status, "FAIL");
});
test("applyFlowGuards leaves checks untouched when the guarded flow passed or status is absent (M4)", () => {
  const checks = [
    { id: "3e-site-induction", status: "PASS", details: "ok" },
    { id: "3a-signature", status: "PASS", details: "ok" },
  ];
  assert.equal(applyFlowGuards(checks, { p03b: 0 }).find((c) => c.id === "3e-site-induction").status, "PASS");
  assert.equal(applyFlowGuards(checks, null).find((c) => c.id === "3e-site-induction").status, "PASS");
  assert.equal(applyFlowGuards(checks, { p03b: 1 }).find((c) => c.id === "3a-signature").status, "PASS");
});
