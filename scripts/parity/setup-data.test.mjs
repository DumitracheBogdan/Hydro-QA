import { test } from "node:test";
import assert from "node:assert/strict";
import { buildVisitPayload, buildExpected, makeTitle } from "./setup-data.mjs";

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
  assert.ok("Works being carried out" in e.visitInfo);
  assert.ok("Accessing Area/Lone Working- Comments" in e.riskAssessment);
});
