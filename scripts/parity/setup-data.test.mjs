import { test } from "node:test";
import assert from "node:assert/strict";
import { buildVisitPayload, buildExpected, makeTitle, RISK_COMMENT_FIELDS, RISK_COMMENT_FIELDS_AUTOMATED, deriveRunId, pickExactVisit } from "./setup-data.mjs";

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

test("buildExpected.webPatch covers all 3 visit-text fields web->mobile, each distinct from its p05 value (A6)", () => {
  const e = buildExpected("RUN42");
  assert.equal(e.webPatch.workDetails, "PARITY-RUN42 wd-web");
  assert.equal(e.webPatch.samplingDetails, "PARITY-RUN42 sd-web");
  // web->mobile seed value must differ from the mobile->web (p05) value so neither stale-passes the other
  assert.notEqual(e.webPatch.workDetails, e.visitText.workDetails);
  assert.notEqual(e.webPatch.samplingDetails, e.visitText.samplingDetails);
});

test("buildExpected exposes the inspection itemDetail seeded web->mobile (A5/2g)", () => {
  const e = buildExpected("RUN42");
  assert.equal(e.inspectionPatch.itemDetail, "PARITY-RUN42 item-detail");
});

// --- 4a/4c/4d: additional inspection asset/notes fields seeded web->mobile (mirror 2g) ---
test("buildExpected exposes the inspection notes/itemReference/itemLocation seeded web->mobile (4a/4c/4d)", () => {
  const e = buildExpected("RUN42");
  assert.equal(e.inspectionPatch.notes, "PARITY-RUN42 insp-notes");          // 4a
  assert.equal(e.inspectionPatch.itemReference, "PARITY-RUN42 item-ref");    // 4c
  assert.equal(e.inspectionPatch.itemLocation, "PARITY-RUN42 item-loc");     // 4d
});

// --- 4b: the site accessInfo seeded web->mobile (PATCH /sites/{siteId}) ---
test("buildExpected exposes the site accessInfo (booking info) seeded web->mobile (4b)", () => {
  const e = buildExpected("RUN42");
  assert.equal(e.sitePatch.accessInfo, "PARITY-RUN42 booking");
});

test("buildExpected exposes the Site Induction dropdown choice (p03b, fixed option)", () => {
  const e = buildExpected("RUN42");
  assert.equal(e.siteInduction["Site Induction required & Completed"], "Yes - Induction completed");
});

// --- M3: reuse path must derive the run id from the existing visit title ---
test("deriveRunId extracts the run id from a PARITY-tagged title, else null (M3)", () => {
  assert.equal(deriveRunId("PARITY-RUN42"), "RUN42");
  assert.equal(deriveRunId("PARITY-123456789"), "123456789");
  assert.equal(deriveRunId("Some other visit"), null);
  assert.equal(deriveRunId(undefined), null);
});

// --- M2: never bind an arbitrary visit via || list[0] ---
test("pickExactVisit returns null when no exact match (never falls back to list[0]) (M2)", () => {
  const list = [{ visitReference: "VN999PARTIAL" }, { visitReference: "VN888" }];
  assert.equal(pickExactVisit(list, "visitReference", "VN111"), null);
  assert.deepEqual(pickExactVisit(list, "visitReference", "VN888"), { visitReference: "VN888" });
  assert.equal(pickExactVisit([], "visitReference", "VN888"), null);
  assert.equal(pickExactVisit(null, "visitReference", "VN888"), null);
});
