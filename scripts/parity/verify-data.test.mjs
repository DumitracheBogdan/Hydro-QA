import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSignature, checkFields, checkInspectionActions, checkVisitText, checkSamples, checkScalarField, checkInspectionCount, checkActionPresent, checkSampleNote, checkEngineerCount, extractFormValue, buildSummary, EXPECTED_IDS, KNOWN_FLAKY, applyFlowGuards } from "./verify-data.mjs";

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

// --- 4f: the 36 Risk Assessment dropdowns are a hard-gated check. PROMOTED after CI run 26683132921
// confirmed 4f PASS (36/36 API) AND the mobile RA form rendered the Yes/No values (real web->mobile,
// not an API tautology). So it must NOT be in KNOWN_FLAKY — a 4f failure must red the gate. ---
test("EXPECTED_IDS includes 4f-ra-dropdowns and it is NOT KNOWN_FLAKY (hard-gated after CI promotion)", () => {
  assert.ok(EXPECTED_IDS.includes("4f-ra-dropdowns"));
  assert.ok(!KNOWN_FLAKY.has("4f-ra-dropdowns"));
});
test("checkFields drives 4f: all 36 RA dropdowns matching => PASS, one mismatch => FAIL (4f)", () => {
  const ff = (name, value) => ({ formField: { fieldName: name }, value });
  const insp = { inspectionForms: [{ formName: "Risk Assessment", formFields: [
    ff("Accessing Area/Lone Working", "Yes"), ff("Asbestos/Exposure", "No"),
  ] }] };
  const want = { "Accessing Area/Lone Working": "Yes", "Asbestos/Exposure": "No" };
  assert.equal(checkFields("4f-ra-dropdowns", "Web->Mobile (API)", insp, "Risk Assessment", want).status, "PASS");
  const bad = { "Accessing Area/Lone Working": "Yes", "Asbestos/Exposure": "Yes" }; // one wrong
  assert.equal(checkFields("4f-ra-dropdowns", "Web->Mobile (API)", insp, "Risk Assessment", bad).status, "FAIL");
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
test("the 4 promoted checks (4a-4d) are NOT in KNOWN_FLAKY so a failure reds the gate", () => {
  for (const id of ["4a-inspection-notes", "4b-booking-info", "4c-item-reference", "4d-item-location"]) {
    assert.equal(KNOWN_FLAKY.has(id), false, `${id} promoted (CI-verified PASS)`);
  }
  const checks = EXPECTED_IDS.map((id) => ({ id, status: id === "4a-inspection-notes" ? "FAIL" : "PASS", details: "" }));
  const s = buildSummary({ runId: "R", visitRef: "V" }, checks);
  assert.equal(s.gateFailed, true); // 4a now gates
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

// --- 2i: a SECOND inspection added on the webapp must show on the visit (inspections.length >= 2) ---
test("checkInspectionCount PASSes when the visit has at least the expected number of inspections (2i)", () => {
  const visit = { inspections: [{ id: "a" }, { id: "b" }] };
  const r = checkInspectionCount(visit, 2);
  assert.equal(r.status, "PASS");
  assert.equal(r.id, "2i-add-inspection");
});
test("checkInspectionCount FAILs when the visit has fewer than the expected inspections (2i)", () => {
  const visit = { inspections: [{ id: "a" }] };
  assert.equal(checkInspectionCount(visit, 2).status, "FAIL");
});
test("checkInspectionCount FAILs on a null/missing inspections array (no crash, no vacuous pass) (2i)", () => {
  assert.equal(checkInspectionCount(null, 2).status, "FAIL");
  assert.equal(checkInspectionCount({}, 2).status, "FAIL");
  assert.equal(checkInspectionCount({ inspections: [] }, 2).status, "FAIL");
});
test("checkInspectionCount FAILs on a non-positive atLeast (no vacuous pass) (2i/L6)", () => {
  assert.equal(checkInspectionCount({ inspections: [{ id: "a" }] }, 0).status, "FAIL");
});

// --- 2j: web->mobile booking status set on the webapp must read back on GET /visits.status ---
// 2j reuses the existing generic checkScalarField (status === 'confirmed'), so no new comparator.
test("checkScalarField scores the visit booking status field for 2j (status='confirmed')", () => {
  assert.equal(checkScalarField("2j-visit-status", "Web->Mobile (API)", { status: "confirmed" }, "status", "confirmed").status, "PASS");
  assert.equal(checkScalarField("2j-visit-status", "Web->Mobile (API)", { status: "scheduled" }, "status", "confirmed").status, "FAIL");
});

// --- the 2 new checks are pinned in EXPECTED_IDS (denominator) ---
test("EXPECTED_IDS includes the 2 new web->mobile checks (2i/2j)", () => {
  for (const id of ["2i-add-inspection", "2j-visit-status"]) {
    assert.ok(EXPECTED_IDS.includes(id), `${id} must be in EXPECTED_IDS`);
  }
});

// --- 4e: a CUSTOM visit-level action ADDED ON MOBILE (p12) must read back via GET /actions?visitId.
// mobile->web, scored by API read-back (like 3a/3b) + flow-guarded by p12. New comparator
// checkActionPresent — NAME-only exact match (deliberately unlike 2c, which also compares priority):
// the mobile flow's run-tagged name "PARITY-<runId> MobAct" is the sole identity, and it is set ONLY
// by the mobile flow (setup-data records the expected name but never POSTs it). ---
test("checkActionPresent PASSes when an action with the expected name is present (4e)", () => {
  const actions = [{ name: "PARITY-R Hi" }, { name: "PARITY-R MobAct" }, { name: "PARITY-R Lo" }];
  const r = checkActionPresent(actions, "PARITY-R MobAct");
  assert.equal(r.status, "PASS");
  assert.equal(r.id, "4e-mobile-action");
});
test("checkActionPresent FAILs when no action carries the expected name (4e)", () => {
  const actions = [{ name: "PARITY-R Hi" }, { name: "PARITY-R Lo" }];
  assert.equal(checkActionPresent(actions, "PARITY-R MobAct").status, "FAIL");
});
test("checkActionPresent FAILs on an empty actions array (no vacuous pass) (4e)", () => {
  assert.equal(checkActionPresent([], "PARITY-R MobAct").status, "FAIL");
});
test("checkActionPresent FAILs (no crash) on a null/undefined actions list (4e)", () => {
  assert.equal(checkActionPresent(null, "PARITY-R MobAct").status, "FAIL");
  assert.equal(checkActionPresent(undefined, "PARITY-R MobAct").status, "FAIL");
});
test("checkActionPresent FAILs on an empty/undefined expected name (no vacuous pass) (4e/L6)", () => {
  assert.equal(checkActionPresent([{ name: "PARITY-R MobAct" }], "").status, "FAIL");
  assert.equal(checkActionPresent([{ name: "PARITY-R MobAct" }], undefined).status, "FAIL");
});
test("checkActionPresent matches the name EXACTLY (a stray space does not pass) (4e)", () => {
  // exact === : "PARITY-R MobAct" must not match "PARITY-R  MobAct" (double space) or a substring
  assert.equal(checkActionPresent([{ name: "PARITY-R  MobAct" }], "PARITY-R MobAct").status, "FAIL");
  assert.equal(checkActionPresent([{ name: "PARITY-R MobAct EXTRA" }], "PARITY-R MobAct").status, "FAIL");
});

// --- 4e is pinned in EXPECTED_IDS (denominator) ---
test("EXPECTED_IDS includes the new mobile->web check (4e)", () => {
  assert.ok(EXPECTED_IDS.includes("4e-mobile-action"), "4e-mobile-action must be in EXPECTED_IDS");
});

// --- 4e starts in KNOWN_FLAKY (until CI shows the mobile flow sets+reads green) so it can't red the gate ---
test("4e is in KNOWN_FLAKY (until CI-green) so a failure does not red the gate (4e)", () => {
  assert.equal(KNOWN_FLAKY.has("4e-mobile-action"), true, "4e-mobile-action must be KNOWN_FLAKY until CI-green");
  // a failing 4e leaves the gate green (the existing 17 are unaffected)
  const checks = EXPECTED_IDS.map((id) => ({ id, status: id === "4e-mobile-action" ? "FAIL" : "PASS", details: "" }));
  const s = buildSummary({ runId: "R", visitRef: "V" }, checks);
  assert.equal(s.gateFailed, false); // 4e flaky -> does not gate
  assert.equal(s.failed, 1);         // but is still reported failed
});

// --- 4e is flow-guarded by p12: a silently-failed mobile flow (in reuse mode) must not stale-pass
// off a prior run's matching action. Mirrors the 3a->p02 / 3e->p03b guard. ---
test("applyFlowGuards forces 4e FAIL when its mobile flow p12 failed (4e)", () => {
  const guarded = applyFlowGuards([{ id: "4e-mobile-action", status: "PASS", details: "ok" }], { p12: 1 });
  assert.equal(guarded[0].status, "FAIL", "4e should FAIL when p12 failed");
});
test("applyFlowGuards leaves 4e untouched when p12 passed (4e)", () => {
  const guarded = applyFlowGuards([{ id: "4e-mobile-action", status: "PASS", details: "ok" }], { p12: 0 });
  assert.equal(guarded[0].status, "PASS");
});

// --- the 2 new checks start in KNOWN_FLAKY (until CI-green) so they cannot red the gate ---
test("the 2 promoted checks (2i/2j) are NOT in KNOWN_FLAKY so a failure reds the gate", () => {
  for (const id of ["2i-add-inspection", "2j-visit-status"]) {
    assert.equal(KNOWN_FLAKY.has(id), false, `${id} promoted (CI-verified PASS)`);
  }
  const checks = EXPECTED_IDS.map((id) => ({ id, status: id === "2i-add-inspection" ? "FAIL" : "PASS", details: "" }));
  const s = buildSummary({ runId: "R", visitRef: "V" }, checks);
  assert.equal(s.gateFailed, true); // 2i now gates
});

// --- 2k: a per-sample NOTE POSTed via /laboratory-samples/{id}/notes must read back on
// GET /laboratory-samples/{id}.sampleNote.noteText (web->mobile). The note is NESTED on the sample
// (the flat .notes field stays null — probe-confirmed 2026-05-30), so checkSampleNote drills
// sample.sampleNote.noteText rather than reusing checkScalarField (which does obj[field], a flat
// lookup that would compare the whole sampleNote object). Same null-tolerance + no-vacuous-pass
// guards as checkInspectionCount/checkScalarField. The TDD fixture uses the REAL nested shape. ---
test("checkSampleNote PASSes when sample.sampleNote.noteText equals the expected want (2k)", () => {
  const sample = { id: "S1", sampleNote: { noteText: "PARITY-R sample-note" } };
  const r = checkSampleNote(sample, "PARITY-R sample-note");
  assert.equal(r.status, "PASS");
  assert.equal(r.id, "2k-sample-note");
});
test("checkSampleNote FAILs when the nested noteText differs (2k)", () => {
  const sample = { id: "S1", sampleNote: { noteText: "WRONG" } };
  assert.equal(checkSampleNote(sample, "PARITY-R sample-note").status, "FAIL");
});
test("checkSampleNote FAILs when sampleNote is null/absent (note never landed) (2k)", () => {
  assert.equal(checkSampleNote({ id: "S1", sampleNote: null }, "PARITY-R sample-note").status, "FAIL");
  assert.equal(checkSampleNote({ id: "S1" }, "PARITY-R sample-note").status, "FAIL");
});
test("checkSampleNote FAILs (no crash) on a null/undefined sample (2k)", () => {
  assert.equal(checkSampleNote(null, "PARITY-R sample-note").status, "FAIL");
  assert.equal(checkSampleNote(undefined, "PARITY-R sample-note").status, "FAIL");
});
test("checkSampleNote FAILs on an empty/undefined want (no vacuous pass) (2k/L6)", () => {
  assert.equal(checkSampleNote({ sampleNote: { noteText: "" } }, "").status, "FAIL");
  assert.equal(checkSampleNote({ sampleNote: { noteText: "x" } }, undefined).status, "FAIL");
});

// --- 2l: a SECOND engineer added to the visit on the webapp (PATCH /visits/{id} {engineerIds:[...]})
// must show on the visit -> visitEngineers.length >= atLeast (web->mobile, structural). Write field is
// engineerIds; READ field is visitEngineers (drift note) — probe-confirmed 2026-05-30. New comparator
// (no value to match, like checkInspectionCount). Null-tolerant; non-positive atLeast -> FAIL. ---
test("checkEngineerCount PASSes when the visit has at least the expected number of engineers (2l)", () => {
  const visit = { visitEngineers: [{ engineerId: "A" }, { engineerId: "B" }] };
  const r = checkEngineerCount(visit, 2);
  assert.equal(r.status, "PASS");
  assert.equal(r.id, "2l-engineers");
});
test("checkEngineerCount FAILs when the visit has fewer than the expected engineers (2l)", () => {
  assert.equal(checkEngineerCount({ visitEngineers: [{ engineerId: "A" }] }, 2).status, "FAIL");
});
test("checkEngineerCount FAILs on a null/missing visitEngineers array (no crash, no vacuous pass) (2l)", () => {
  assert.equal(checkEngineerCount(null, 2).status, "FAIL");
  assert.equal(checkEngineerCount({}, 2).status, "FAIL");
  assert.equal(checkEngineerCount({ visitEngineers: [] }, 2).status, "FAIL");
});
test("checkEngineerCount FAILs on a non-positive atLeast (no vacuous pass) (2l/L6)", () => {
  assert.equal(checkEngineerCount({ visitEngineers: [{ engineerId: "A" }] }, 0).status, "FAIL");
});

// --- the 2 NEW checks (2k/2l) are pinned in EXPECTED_IDS (denominator) ---
test("EXPECTED_IDS includes the 2 new web->mobile checks (2k/2l)", () => {
  for (const id of ["2k-sample-note", "2l-engineers"]) {
    assert.ok(EXPECTED_IDS.includes(id), `${id} must be in EXPECTED_IDS`);
  }
});

// --- the 2 NEW checks (2k/2l) start in KNOWN_FLAKY (until CI-green) so they cannot red the gate ---
test("the 2 promoted checks (2k/2l) are NOT in KNOWN_FLAKY so a failure reds the gate", () => {
  for (const id of ["2k-sample-note", "2l-engineers"]) {
    assert.equal(KNOWN_FLAKY.has(id), false, `${id} promoted (CI-verified PASS)`);
  }
  const checks = EXPECTED_IDS.map((id) => ({ id, status: id === "2k-sample-note" ? "FAIL" : "PASS", details: "" }));
  const s = buildSummary({ runId: "R", visitRef: "V" }, checks);
  assert.equal(s.gateFailed, true); // 2k now gates
});
