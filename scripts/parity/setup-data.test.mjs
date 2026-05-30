import { test } from "node:test";
import assert from "node:assert/strict";
import { buildVisitPayload, buildExpected, makeTitle, RISK_COMMENT_FIELDS, RISK_COMMENT_FIELDS_AUTOMATED, deriveRunId, pickExactVisit, addSecondInspection, addSampleNote, addSecondEngineer } from "./setup-data.mjs";

// Minimal fake REST client for addSecondInspection (no network). Records POSTs.
function fakeClient({ visitInspections = [], jobTypes = [] } = {}) {
  const posted = [];
  return {
    posted,
    async get(path) {
      if (path.startsWith("/visits/")) return { inspections: visitInspections };
      if (path === "/job-types") return jobTypes;
      return null;
    },
    async post(path, body) {
      posted.push({ path, body });
      if (path === "/inspections") return { id: "NEW-INSP", jobTypeId: body.jobTypeId };
      return null;
    },
  };
}

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

// --- 2j: the visit booking status PATCHed web->mobile (PATCH /visits/{id} {status}) ---
// Fixed valid booking value ('confirmed', NOT run-tagged) from the scheduled|pending|confirmed|cancelled
// enum. 'confirmed' is searchable (probe verified) and never touches visitStatus/inspectionStatus.
test("buildExpected exposes the visit booking status seeded web->mobile (2j, fixed 'confirmed')", () => {
  const e = buildExpected("RUN42");
  assert.equal(e.bookingStatus, "confirmed");
});

// --- 2i: addSecondInspection picks a DIFFERENT jobType, POSTs one inspection, records the id ---
test("addSecondInspection POSTs an inspection with a jobType != the primary and records secondInspectionId (2i)", async () => {
  const c = fakeClient({ visitInspections: [], jobTypes: [{ id: "PRIMARY" }, { id: "OTHER", name: "Cooling Tower" }] });
  const expected = {};
  await addSecondInspection(c, "V1", "PRIMARY", expected);
  assert.equal(c.posted.length, 1);
  assert.equal(c.posted[0].path, "/inspections");
  assert.equal(c.posted[0].body.visitId, "V1");
  assert.notEqual(c.posted[0].body.jobTypeId, "PRIMARY"); // must differ from primary (unambiguous nav)
  assert.equal(c.posted[0].body.jobTypeId, "OTHER");
  assert.equal(expected.secondInspectionId, "NEW-INSP");
  assert.equal(expected.secondJobTypeId, "OTHER");
});
test("addSecondInspection REUSES an existing 2nd inspection (different jobType) and POSTs nothing — idempotent (2i)", async () => {
  const c = fakeClient({ visitInspections: [{ id: "I1", jobTypeId: "PRIMARY" }, { id: "I2", jobTypeId: "OTHER" }], jobTypes: [{ id: "PRIMARY" }, { id: "OTHER" }] });
  const expected = {};
  await addSecondInspection(c, "V1", "PRIMARY", expected);
  assert.equal(c.posted.length, 0); // no new inspection stacked
  assert.equal(expected.secondInspectionId, "I2");
  assert.equal(expected.secondJobTypeId, "OTHER");
});
test("addSecondInspection is non-fatal when no second jobType exists (2i, best-effort)", async () => {
  const c = fakeClient({ visitInspections: [], jobTypes: [{ id: "PRIMARY" }] });
  const expected = {};
  await addSecondInspection(c, "V1", "PRIMARY", expected); // must not throw
  assert.equal(c.posted.length, 0);
  assert.equal(expected.secondInspectionId, undefined);
});

// --- 2k: the per-sample note text seeded web->mobile (POST /laboratory-samples/{id}/notes) ---
// Mirrors the 2g/4b/2j buildExpected assertions: without this, dropping the buildExpected line would
// make addSampleNote POST {noteText: undefined} and 2k silently always-FAIL with no unit signal.
test("buildExpected exposes the per-sample note text seeded web->mobile (2k)", () => {
  assert.equal(buildExpected("RUN42").sampleNoteText, "PARITY-RUN42 sample-note");
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

// --- 2k: addSampleNote — POST a note to the FIRST laboratorySample, record id + text on expected ---
// Fake client for addSampleNote: GET /inspections/{id} returns laboratorySamples; POST
// /laboratory-samples/{id}/notes records the note. Mirrors the real dev shapes probed 2026-05-30:
// the POST body is { noteText }, and the sampleId comes from inspection.laboratorySamples[0].id.
function fakeNoteClient({ laboratorySamples = [] } = {}) {
  const posted = [];
  return {
    posted,
    async get(path) {
      if (path.startsWith("/inspections/")) return { laboratorySamples };
      return null;
    },
    async post(path, body) {
      posted.push({ path, body });
      return { noteId: "NEW-NOTE", entityId: path.split("/")[2], noteText: body.noteText };
    },
  };
}

test("addSampleNote POSTs a note to laboratorySamples[0] and records sampleId + sampleNoteText (2k)", async () => {
  const c = fakeNoteClient({ laboratorySamples: [{ id: "SAMP-1" }, { id: "SAMP-2" }] });
  const expected = {};
  await addSampleNote(c, "INSP-1", "PARITY-RUN42 sample-note", expected);
  assert.equal(c.posted.length, 1);
  assert.equal(c.posted[0].path, "/laboratory-samples/SAMP-1/notes"); // FIRST sample
  assert.equal(c.posted[0].body.noteText, "PARITY-RUN42 sample-note");
  assert.equal(expected.sampleId, "SAMP-1");
  assert.equal(expected.sampleNoteText, "PARITY-RUN42 sample-note");
});
test("addSampleNote is non-fatal + POSTs nothing when the inspection has no samples (2k, best-effort)", async () => {
  const c = fakeNoteClient({ laboratorySamples: [] });
  const expected = {};
  await addSampleNote(c, "INSP-1", "PARITY-RUN42 sample-note", expected); // must not throw
  assert.equal(c.posted.length, 0);
  assert.equal(expected.sampleId, undefined);
  assert.equal(expected.sampleNoteText, undefined);
});

// --- 2l: addSecondEngineer — KEEP every existing engineer, ADD a discovered 2nd, PATCH engineerIds ---
// Fake client: GET /visits/{id} returns visitEngineers; GET /users returns the engineer pool; PATCH
// /visits/{id} records the body. Mirrors the real dev shapes probed 2026-05-30: write field is
// engineerIds, read field is visitEngineers[].engineerId, /users entries carry isEngineer.
function fakeEngineerClient({ visitEngineers = [], users = [] } = {}) {
  const patched = [];
  return {
    patched,
    async get(path) {
      if (path.startsWith("/visits/")) return { visitEngineers };
      if (path === "/users") return users;
      return null;
    },
    async patch(path, body) { patched.push({ path, body }); return null; },
  };
}

test("addSecondEngineer KEEPS the existing engineer and ADDS a discovered 2nd via engineerIds (2l)", async () => {
  const c = fakeEngineerClient({
    visitEngineers: [{ engineerId: "PARITY-BOT" }],
    users: [{ id: "PARITY-BOT", isEngineer: true }, { id: "ENG-2", isEngineer: true }, { id: "NON-ENG", isEngineer: false }],
  });
  const expected = {};
  await addSecondEngineer(c, "V1", expected);
  assert.equal(c.patched.length, 1);
  assert.equal(c.patched[0].path, "/visits/V1");
  const ids = c.patched[0].body.engineerIds;
  assert.ok(ids.includes("PARITY-BOT"), "the existing engineer must be KEPT");
  assert.equal(ids.length, 2);
  assert.notEqual(ids[1], "NON-ENG"); // never picks a non-engineer
  assert.equal(expected.engineerCount, 2);
});

// GUARDRAIL (the headline risk): the PATCH must NEVER produce an engineerIds array that drops the
// already-assigned engineer (parity.bot is the mobile QA login — if it vanishes the visit disappears
// from mobile and ALL checks die). Built structurally from the existing visitEngineers, so it holds
// regardless of fx state. Multiple pre-existing engineers must ALL survive.
test("addSecondEngineer NEVER drops an already-assigned engineer — the kept list always includes it (2l GUARDRAIL)", async () => {
  const c = fakeEngineerClient({
    visitEngineers: [{ engineerId: "PARITY-BOT" }],
    users: [{ id: "PARITY-BOT", isEngineer: true }, { id: "ENG-2", isEngineer: true }],
  });
  await addSecondEngineer(c, "V1", {});
  assert.ok(c.patched[0].body.engineerIds.includes("PARITY-BOT"), "parity.bot must survive the PATCH");
});
test("addSecondEngineer preserves ALL pre-existing engineers when adding the 2nd (2l GUARDRAIL)", async () => {
  const c = fakeEngineerClient({
    visitEngineers: [{ engineerId: "ENG-A" }, { engineerId: "ENG-B" }],
    users: [{ id: "ENG-A", isEngineer: true }, { id: "ENG-B", isEngineer: true }, { id: "ENG-C", isEngineer: true }],
  });
  const expected = {};
  await addSecondEngineer(c, "V1", expected); // already >= 2 -> idempotent: no PATCH, record count
  assert.equal(c.patched.length, 0); // no stacking when already 2+
  assert.equal(expected.engineerCount, 2);
});
test("addSecondEngineer is non-fatal + PATCHes nothing when no 2nd engineer is available (2l, best-effort)", async () => {
  const c = fakeEngineerClient({
    visitEngineers: [{ engineerId: "ONLY-ENG" }],
    users: [{ id: "ONLY-ENG", isEngineer: true }], // no other engineer to add
  });
  const expected = {};
  await addSecondEngineer(c, "V1", expected); // must not throw
  assert.equal(c.patched.length, 0);
  assert.equal(expected.engineerCount, undefined);
});
