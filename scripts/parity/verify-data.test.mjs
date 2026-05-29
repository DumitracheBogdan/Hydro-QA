import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSignature, checkFields, checkInspectionActions, checkVisitText, checkSamples, checkScalarField, extractFormValue, buildSummary, EXPECTED_IDS, KNOWN_FLAKY, applyFlowGuards } from "./verify-data.mjs";

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

// --- Samples flagship (2h): every added sampleTypeId must land in laboratorySamples (web->mobile) ---
test("checkSamples PASSes when every expected sampleTypeId is present in laboratorySamples (2h)", () => {
  const ls = [{ sampleTypeId: "A" }, { sampleTypeId: "B" }, { sampleTypeId: "C" }];
  const r = checkSamples(ls, ["A", "B", "C"]);
  assert.equal(r.status, "PASS");
  assert.equal(r.id, "2h-samples");
});
test("checkSamples FAILs when an expected sampleTypeId is missing (2h)", () => {
  const ls = [{ sampleTypeId: "A" }, { sampleTypeId: "B" }];
  assert.equal(checkSamples(ls, ["A", "B", "C"]).status, "FAIL");
});
test("checkSamples FAILs on empty expected (no vacuous pass) (2h)", () => {
  assert.equal(checkSamples([{ sampleTypeId: "A" }], []).status, "FAIL");
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
test("2g-item-detail is promoted (NOT in KNOWN_FLAKY) so a 2g failure reds the gate", () => {
  assert.equal(KNOWN_FLAKY.has("2g-item-detail"), false);
  const checks = EXPECTED_IDS.map((id) => ({ id, status: id === "2g-item-detail" ? "FAIL" : "PASS", details: "" }));
  const s = buildSummary({ runId: "R", visitRef: "V" }, checks);
  assert.equal(s.gateFailed, true); // 2g now gates
});

// --- 4a/4b/4c/4d: generic scalar web->mobile API-set checks (mirror 2h scoring model) ---
test("checkScalarField PASSes when the object's field equals the expected want (4x)", () => {
  const r = checkScalarField("4a-inspection-notes", "Web->Mobile (API)", { notes: "PARITY-R insp-notes" }, "notes", "PARITY-R insp-notes");
  assert.equal(r.status, "PASS");
  assert.equal(r.id, "4a-inspection-notes");
});
test("checkScalarField FAILs when the field value differs (4x)", () => {
  const r = checkScalarField("4c-item-reference", "Web->Mobile (API)", { itemReference: "WRONG" }, "itemReference", "PARITY-R item-ref");
  assert.equal(r.status, "FAIL");
});
test("checkScalarField FAILs when the field is missing/undefined (undefined !== want) (4x/L1)", () => {
  assert.equal(checkScalarField("4d-item-location", "Web->Mobile (API)", {}, "itemLocation", "PARITY-R item-loc").status, "FAIL");
});
test("checkScalarField FAILs on an empty/undefined want (no vacuous pass) (4x/L6)", () => {
  assert.equal(checkScalarField("4b-booking-info", "Web->Mobile (API)", { accessInfo: "" }, "accessInfo", "").status, "FAIL");
  assert.equal(checkScalarField("4b-booking-info", "Web->Mobile (API)", { accessInfo: "x" }, "accessInfo", undefined).status, "FAIL");
});
test("checkScalarField FAILs gracefully when the object itself is null/undefined (4b site absent)", () => {
  assert.equal(checkScalarField("4b-booking-info", "Web->Mobile (API)", null, "accessInfo", "PARITY-R booking").status, "FAIL");
});

// --- the 4 new checks are pinned in EXPECTED_IDS (denominator) ---
test("EXPECTED_IDS includes the 4 new web->mobile API checks (4a/4b/4c/4d)", () => {
  for (const id of ["4a-inspection-notes", "4b-booking-info", "4c-item-reference", "4d-item-location"]) {
    assert.ok(EXPECTED_IDS.includes(id), `${id} must be in EXPECTED_IDS`);
  }
});

// --- the 4 new checks start in KNOWN_FLAKY (until CI-green) so they cannot red the gate ---
// Inverse of the "2g-item-detail is promoted (NOT in KNOWN_FLAKY)" test: a failure of any new
// check must NOT flip gateFailed while it is still in the flaky allowlist.
test("the 4 new checks are in KNOWN_FLAKY (until CI-green) so a failure does not red the gate (4x)", () => {
  for (const id of ["4a-inspection-notes", "4b-booking-info", "4c-item-reference", "4d-item-location"]) {
    assert.equal(KNOWN_FLAKY.has(id), true, `${id} must be KNOWN_FLAKY until CI-green`);
  }
  // a failing new check leaves the gate green (the existing 11 are unaffected)
  const checks = EXPECTED_IDS.map((id) => ({ id, status: id === "4a-inspection-notes" ? "FAIL" : "PASS", details: "" }));
  const s = buildSummary({ runId: "R", visitRef: "V" }, checks);
  assert.equal(s.gateFailed, false); // 4a flaky -> does not gate
  assert.equal(s.failed, 1);         // but is still reported failed
});

// --- M4 + H-1: every mobile->web read-back check must also require its Maestro flow to have
// succeeded, so a silently-failed flow in reuse mode can't stale-pass off prior-run data. ---
test("applyFlowGuards forces each mobile->web check FAIL when its flow failed (M4, H-1)", () => {
  const cases = [
    ["3a-signature", "p02"],
    ["3b-visit-info", "p03"],
    ["3c-risk", "p04"],
    ["3e-site-induction", "p03b"],
  ];
  for (const [id, flow] of cases) {
    const guarded = applyFlowGuards([{ id, status: "PASS", details: "ok" }], { [flow]: 1 });
    assert.equal(guarded[0].status, "FAIL", `${id} should FAIL when ${flow} failed`);
  }
});
test("applyFlowGuards leaves checks untouched when the guarded flow passed or status is absent (M4)", () => {
  const checks = [
    { id: "3e-site-induction", status: "PASS", details: "ok" },
    { id: "3a-signature", status: "PASS", details: "ok" },
  ];
  assert.equal(applyFlowGuards(checks, { p03b: 0, p02: 0 }).find((c) => c.id === "3e-site-induction").status, "PASS");
  assert.equal(applyFlowGuards(checks, null).find((c) => c.id === "3e-site-induction").status, "PASS");
  // a flow code that doesn't map to a given check leaves it alone
  assert.equal(applyFlowGuards(checks, { p03b: 1 }).find((c) => c.id === "3a-signature").status, "PASS");
});
