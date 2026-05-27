import { test } from "node:test";
import assert from "node:assert/strict";
import { buildVisitPayload, buildExpected, makeTitle, RISK_COMMENT_FIELDS, RISK_COMMENT_FIELDS_AUTOMATED } from "./setup-data.mjs";

test("makeTitle tags with run id", () => {
  assert.equal(makeTitle("RUN42"), "PARITY-RUN42");
});

test("buildVisitPayload tags title, sets notes=description, assigns engineer", () => {
  const fx = { engineerId: "E1", bookingPersonId: "B1", siteId: "S1", jobTypeId: "J1" };
  const p = buildVisitPayload("RUN42", fx, new Date("2026-05-26T10:00:00Z"));
  assert.equal(p.title, "PARITY-RUN42");
  assert.equal(p.notes, "PARITY-RUN42 description");
  assert.deepEqual(p.engineerIds, ["E1"]);
  assert.equal(p.bookingPersonId, "B1");
  assert.equal(p.siteId, "S1");
  assert.ok(new Date(p.to) > new Date(p.from));
  assert.equal("visitReference" in p, false); // server overrides; we never send it
  assert.equal("waterSystemDescription" in p, false); // rejected by DTO whitelist
});

test("buildExpected lists 6 datapoints with the run tag and exact field labels", () => {
  const e = buildExpected("RUN42");
  assert.match(e.description, /PARITY-RUN42/);
  assert.equal(e.visitActions.length, 3);
  assert.equal(e.inspectionActions.length, 3);
  assert.deepEqual(e.visitActions.map((a) => a.priority).sort(), ["high", "low", "medium"]);
  assert.match(e.signatureName, /PARITY-RUN42/);
  assert.ok("Assisting 1" in e.visitInfo);
  assert.ok("Assisting 3" in e.visitInfo); // extended: 3rd assisting inspector
  assert.ok("Works being carried out" in e.visitInfo);
  assert.ok("Accessing Area/Lone Working- Comments" in e.riskAssessment);
});

test("RISK_COMMENT_FIELDS is the full 18-field backend truth; automated set is a subset", () => {
  assert.equal(RISK_COMMENT_FIELDS.length, 18);
  assert.ok(RISK_COMMENT_FIELDS_AUTOMATED.length >= 1 && RISK_COMMENT_FIELDS_AUTOMATED.length <= 18);
  for (const f of RISK_COMMENT_FIELDS_AUTOMATED) assert.ok(RISK_COMMENT_FIELDS.includes(f));
});

test("buildExpected.riskAssessment covers exactly the automated fields with the tagged value", () => {
  const e = buildExpected("RUN42");
  assert.equal(Object.keys(e.riskAssessment).length, RISK_COMMENT_FIELDS_AUTOMATED.length);
  for (const f of RISK_COMMENT_FIELDS_AUTOMATED) assert.equal(e.riskAssessment[f], "PARITY-RUN42 rc");
});

test("buildExpected exposes the 3 visit-level text fields (p05)", () => {
  const e = buildExpected("RUN42");
  assert.equal(e.visitText.waterSystemDescription, "PARITY-RUN42 watersys");
  assert.equal(e.visitText.workDetails, "PARITY-RUN42 workdetails");
  assert.equal(e.visitText.samplingDetails, "PARITY-RUN42 sampling");
});

test("buildExpected exposes the web->mobile PATCH value, distinct from the p05 value", () => {
  const e = buildExpected("RUN42");
  assert.equal(e.webPatch.waterSystemDescription, "PARITY-RUN42 wsd-web");
  assert.notEqual(e.webPatch.waterSystemDescription, e.visitText.waterSystemDescription);
});

test("buildExpected exposes the Site Induction dropdown choice (p03b, fixed option)", () => {
  const e = buildExpected("RUN42");
  assert.equal(e.siteInduction["Site Induction required & Completed"], "Yes - Induction completed");
});
