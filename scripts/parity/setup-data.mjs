// Phase 0 — create a fresh tagged visit + inspection + actions via the REST API.
// Writes parity-context.json consumed by the Maestro phase and verify-data.mjs.
import { writeFileSync, readFileSync } from "node:fs";
import { makeClient } from "./api.mjs";

export function makeTitle(runId) { return `PARITY-${runId}`; }

// Extract the run id embedded in a PARITY-tagged title, else null. Used by the reuse path so the
// expected values (and the RUN_ID handed to the Maestro flows) match the data already on the
// reused visit, instead of the new github.run_id which the visit's notes/actions never carried (M3).
export function deriveRunId(title) {
  const m = /^PARITY-(.+)$/.exec(title || "");
  return m ? m[1] : null;
}

// Bind ONLY on an exact field match; never fall back to list[0]. The server-side title/ref filters
// are partial, so a typo'd/truncated value would otherwise silently bind some OTHER live dev visit
// and the run would be created against the wrong record (M2).
export function pickExactVisit(list, key, value) {
  return (list || []).find((v) => v[key] === value) || null;
}

// All free-text "- Comments" fields of the Risk Assessment form (jobType 658f27c1), exact backend fieldName.
export const RISK_COMMENT_FIELDS = [
  "Accessing Area/Lone Working- Comments",
  "Asbestos/Exposure - Comments",
  "Accessing High Areas - Comments",
  "Rodent, Bird, Insect - Comments",
  "Working Around Machinery - Comments",
  "Working In Plant Room - Comments",
  "Slipping on Water - Comments",
  "Drowning in Water - Comments",
  "Entering Confined Space - Comments",
  "Cleaning Tanks, Towers etc - Comments",
  "Electrical Equip/Water - Comments",
  "Opening Valves/Hatches - Comments",
  "Releasing Aerosols - Comments",
  "Hot Water Scalding - Comments",
  "Manual Handling - Comments",
  "Dosing Equipment - Comments",
  "Handling Chemicals - Comments",
  "Disinfecting Systems - Comments",
];

// Fields actually automated by p04 on CI. The full 18-field flow types + saves correctly on a
// local emulator (API 35) but on the smaller/slower CI emulator (API 30) the input field for the
// 2nd+ comment lands below the fold after scrollUntilVisible, so "tapOn below label" misses it
// (off-screen -> not found, or with centerElement -> wrong target -> value not persisted). The
// 1-field set is the proven-stable baseline (3x green). gen-p04.mjs and buildExpected both consume
// THIS constant so they never drift. To re-attempt the full 18 on CI, widen the slice in one place.
export const RISK_COMMENT_FIELDS_AUTOMATED = RISK_COMMENT_FIELDS.slice(0, 1);

export function buildExpected(runId) {
  const tag = makeTitle(runId);
  const visitActs = [
    { name: `${tag} Hi`, priority: "high" },
    { name: `${tag} Med`, priority: "medium" },
    { name: `${tag} Lo`, priority: "low" },
  ];
  // Distinct names so visit-level vs inspection-level actions are unambiguous across platforms.
  const inspActs = [
    { name: `${tag} Insp Hi`, priority: "high" },
    { name: `${tag} Insp Med`, priority: "medium" },
    { name: `${tag} Insp Lo`, priority: "low" },
  ];
  return {
    tag,
    description: `${tag} description`,
    visitActions: visitActs,
    inspectionActions: inspActs,
    signatureName: `${tag} Client`,
    // field labels are the EXACT backend fieldName values (verified against dev)
    visitInfo: {
      "Assisting 1": `${tag} Inspector 1`,
      "Assisting 2": `${tag} Inspector 2`,
      "Assisting 3": `${tag} Inspector 3`,
      "Works being carried out": `${tag} Works`,
    },
    // each automated Risk Assessment free-text comment field gets the same tagged value
    riskAssessment: Object.fromEntries(RISK_COMMENT_FIELDS_AUTOMATED.map((f) => [f, `${tag} rc`])),
    // visit-level free-text fields set on the mobile Visit Details card -> persisted to the visit
    visitText: {
      waterSystemDescription: `${tag} watersys`,
      workDetails: `${tag} workdetails`,
      samplingDetails: `${tag} sampling`,
    },
    // web->mobile: PATCHed onto the visit via API in phase 0, asserted on the mobile Visit Details
    // card fields in phase 1 (p01d). Phase 1.5 clears them; p05 re-types the visitText values in
    // phase 2 (mobile->web, 3d). Distinct "-web" values so neither direction stale-passes the other.
    webPatch: {
      waterSystemDescription: `${tag} wsd-web`,
      workDetails: `${tag} wd-web`,
      samplingDetails: `${tag} sd-web`,
    },
    // web->mobile (p01e / check 2g): inspection asset field PATCHed via API; the mobile LocationCard
    // renders itemDetail read-only (R3). itemDetail is the field the card displays.
    // 4a/4c/4d (p06/p07/p08): additional inspection scalar fields PATCHed the same way (notes shows in
    // the inspection Notes card; itemReference/itemLocation render on the LocationCard). All additive —
    // they never touch the visit title/ref/dates/status, so they can't disturb the mobile search or
    // the existing checks. Verified to round-trip via PATCH+GET on dev 2026-05-30.
    inspectionPatch: {
      itemDetail: `${tag} item-detail`,
      notes: `${tag} insp-notes`,        // 4a — inspection Notes
      itemReference: `${tag} item-ref`,  // 4c — Asset Reference
      itemLocation: `${tag} item-loc`,   // 4d — Asset Location
    },
    // web->mobile (p09 / check 4b): the SITE's accessInfo (booking/access info) PATCHed via API on
    // PATCH /sites/{siteId}. GUARDRAIL: this edits the SITE record shared by every visit at that site
    // — fine on the dev test site, but note it is not visit-scoped. Scored via GET /sites/{siteId}.
    sitePatch: {
      accessInfo: `${tag} booking`,
    },
    // web->mobile (p11 / check 2j): the visit's BOOKING status PATCHed via PATCH /visits/{id} {status}.
    // Fixed value from the booking enum scheduled|pending|confirmed|cancelled — 'confirmed' (NOT
    // 'cancelled', which can hide the visit from the list). GUARDRAIL: this is the BOOKING status only;
    // it NEVER touches visitStatus/inspectionStatus (the execution states). Probe-verified 2026-05-30:
    // status='confirmed' round-trips on PATCH+GET and the visit stays searchable (filter + calendar).
    // Scored via GET /visits/{id}.status === 'confirmed' (checkScalarField).
    bookingStatus: "confirmed",
    // mobile->web dropdown (p03b): a fixed option (not run-tagged — it is a fixed-choice field).
    // Verified against the Visit Information form's fieldOptions on jobType 658f27c1.
    siteInduction: {
      "Site Induction required & Completed": "Yes - Induction completed",
    },
  };
}

export function buildVisitPayload(runId, fx, now = new Date()) {
  // Schedule for TODAY (near-future), NOT +24h. The mobile Visits Home search/list reliably
  // surfaces TODAY's visits in its default scope; +24h ("Tomorrow") visits intermittently do
  // NOT appear in the list at all, so the search ("Type to search...") finds nothing and every
  // mobile flow fails at "View Visit Details". Verified 2026-05-27: a today-dated visit is found
  // immediately; the same visit dated +24h is absent from the list.
  const from = new Date(now.getTime() + 2 * 3600 * 1000);
  const to = new Date(from.getTime() + 2 * 3600 * 1000);
  return {
    title: makeTitle(runId),
    from: from.toISOString(),
    to: to.toISOString(),
    engineerIds: [fx.engineerId],
    bookingPersonId: fx.bookingPersonId,
    siteId: fx.siteId,
    notes: `${makeTitle(runId)} description`, // shows in mobile read-only "Description" card
  };
}

async function findVisitByTitle(c, title) {
  const res = await c.get(`/visits/filter-detailed?title=${encodeURIComponent(title)}&page=1&limit=25`).catch(() => null);
  const list = res?.items ?? (Array.isArray(res) ? res : []);
  return pickExactVisit(list, "title", title); // exact only — no list[0] fallback (M2)
}

// 2h — add every base water-sample type to the inspection via the web API (PATCH /inspections
// {samples}; additive-merge). Records sampleTypeIds on `expected` for verify. NEVER submits to
// Normec/ALS (that is POST /laboratory-samples/submit-batch — forbidden). Best-effort, non-fatal.
async function addSamples(c, inspectionId, expected) {
  try {
    const st = await c.get("/sample-types");
    const types = (Array.isArray(st) ? st : st?.items || []).filter((t) => t && t.id);
    if (!types.length) { console.error("WARN: no sample-types returned"); return; }
    await c.patch(`/inspections/${inspectionId}`, { samples: types.map((t) => ({ sampleTypeId: t.id, quantity: 1 })) });
    expected.sampleTypeIds = types.map((t) => t.id);
    expected.sampleTypeNames = Object.fromEntries(types.map((t) => [t.id, t.name || t.sampleType || t.title || ""]));
    console.log(`SAMPLES added ${types.length} types`);
  } catch (e) { console.error(`WARN: addSamples failed (${e.message})`); }
}

// 2i — add a SECOND inspection to the visit via the web API using a DIFFERENT jobType than the
// primary Risk Assessment one. Discovers a 2nd jobType at runtime via GET /job-types. Records
// secondInspectionId on `expected`. GUARDRAIL: only ADDS — never deletes/modifies the first
// inspection (the existing checks depend on it). Best-effort + non-fatal (mirror addSamples): a
// failure leaves the structural 2i check to FAIL, but never breaks the run. Idempotent: if a 2nd
// inspection (different jobType) already exists, reuse it instead of stacking another.
//
// CALLED IN PHASE 2.5 (add-second-inspection.mjs), NOT in Phase-0 setup: the shared mobile
// _shared/open_inspection.yaml taps the FIRST "(Start|View) Inspection" by POSITION, so a 2nd
// inspection present during Phase 1/2 could shift which inspection the hard-gated flows
// (p01e/2g, p03/3b, p04/3c, p03b/3e) open. Adding it AFTER the mobile flows keeps Phase 1/2
// single-inspection + deterministic; 2i is scored at verify (checkInspectionCount), independent of
// when the 2nd inspection was created. Exported for the Phase-2.5 entrypoint + unit tests.
export async function addSecondInspection(c, visitId, primaryJobTypeId, expected) {
  try {
    // Idempotency (reuse path): if the visit already carries an inspection with a jobType DIFFERENT
    // from the primary, that IS the 2nd inspection — reuse it instead of stacking a new one each run.
    const v = await c.get(`/visits/${visitId}`).catch(() => null);
    const existing = (v?.inspections || []).find((i) => i.jobTypeId && i.jobTypeId !== primaryJobTypeId);
    if (existing?.id) {
      expected.secondInspectionId = existing.id;
      expected.secondJobTypeId = existing.jobTypeId;
      console.log(`2I reusing existing second inspection ${existing.id} jobType=${existing.jobTypeId}`);
      return;
    }
    const jts = await c.get("/job-types");
    const types = (Array.isArray(jts) ? jts : jts?.items || []).filter((t) => t && t.id);
    const other = types.find((t) => t.id !== primaryJobTypeId);
    if (!other) { console.error("WARN: no second jobType available for 2i"); return; }
    const insp2 = await c.post("/inspections", { visitId, jobTypeId: other.id });
    if (insp2?.id) {
      expected.secondInspectionId = insp2.id;
      expected.secondJobTypeId = other.id;
      console.log(`2I added second inspection ${insp2.id} jobType=${other.id} (${other.name || ""})`);
    }
  } catch (e) { console.error(`WARN: addSecondInspection failed (${e.message})`); }
}

async function resolveFixtures(c, mobileClient) {
  const fx = JSON.parse(readFileSync(new URL("./fixtures.dev.json", import.meta.url)));
  // engineerId: prefer explicit env, else the mobile QA user's own id
  let engineerId = process.env.ENGINEER_ID;
  if (!engineerId && mobileClient) engineerId = mobileClient.userId;
  // site + booking from a sample visit that actually has a site
  const detailed = await c.get("/visits/detailed?page=1&limit=25");
  const withSite = (detailed.items || []).find((v) => v.siteId);
  const siteId = process.env.SITE_ID || withSite?.siteId;
  const bookingPersonId =
    process.env.BOOKING_PERSON_ID || withSite?.bookingPersonId || fx.bookingPersonIdFallback;
  if (!engineerId) throw new Error("setup: could not resolve engineerId (set ENGINEER_ID or provide mobile creds)");
  if (!siteId) throw new Error("setup: could not resolve a siteId (no sample visit has one; set SITE_ID)");
  return { jobTypeId: fx.jobTypeId, engineerId, siteId, bookingPersonId };
}

async function main() {
  const runId = process.env.RUN_ID || String(Date.now());
  const base = process.env.HYDROCERT_API_BASE;
  const c = makeClient(base);
  await c.login(process.env.API_EMAIL, process.env.API_PASSWORD);

  // Optionally resolve the engineer id by logging in as the mobile QA user.
  let mobileClient = null;
  if (!process.env.ENGINEER_ID && process.env.MOBILE_EMAIL) {
    const mc = makeClient(base);
    try { const u = await mc.login(process.env.MOBILE_EMAIL, process.env.MOBILE_PASSWORD); mobileClient = { userId: u.id }; }
    catch (e) { console.error(`WARN: mobile login failed (${e.message}); will need ENGINEER_ID`); }
  }

  const expected = buildExpected(runId);
  const title = expected.tag;

  // Reuse path: VISIT_REF supplied -> find existing visit, skip creation.
  const suppliedRef = (process.env.VISIT_REF || "").trim();
  if (suppliedRef) {
    const res = await c.get(`/visits/filter?visitReference=${encodeURIComponent(suppliedRef)}`).catch(() => null);
    const list = res?.items ?? (Array.isArray(res) ? res : []);
    const visit = pickExactVisit(list, "visitReference", suppliedRef); // exact only — no list[0] (M2)
    if (!visit) throw new Error(`setup: supplied VISIT_REF ${suppliedRef} not found (exact match required)`);
    // The reused visit's notes/actions carry the run id from when it was CREATED. Derive that id so
    // the flow assertions (which read RUN_ID) and buildExpected agree, instead of the new
    // github.run_id which this visit never carried. Fall back to the env runId for a non-parity
    // visit. The orchestrator re-reads runId from parity-context.json and re-exports RUN_ID (M3).
    const reuseRunId = deriveRunId(visit.title) || runId;
    const reuseExpected = buildExpected(reuseRunId);
    const fx = await resolveFixtures(c, mobileClient).catch(() => ({ jobTypeId: JSON.parse(readFileSync(new URL("./fixtures.dev.json", import.meta.url))).jobTypeId }));
    const insp = visit.inspections?.[0] || (await c.post("/inspections", { visitId: visit.id, jobTypeId: fx.jobTypeId }));
    await c.patch(`/visits/${visit.id}`, reuseExpected.webPatch).catch((e) => console.error(`WARN: webPatch failed (${e.message})`));
    await c.patch(`/inspections/${insp.id}`, reuseExpected.inspectionPatch).catch((e) => console.error(`WARN: inspectionPatch failed (${e.message})`));
    // 4b — PATCH the SITE's accessInfo. Use the REUSED visit's own siteId (NOT fx.siteId, which
    // resolveFixtures may pick from a DIFFERENT visit/site), so verify GETs the same record the
    // mobile flow opens. Persist that siteId for verify-data (GET /sites/{siteId}).
    const reuseSiteId = visit.siteId || fx.siteId;
    if (reuseSiteId) await c.patch(`/sites/${reuseSiteId}`, reuseExpected.sitePatch).catch((e) => console.error(`WARN: sitePatch failed (${e.message})`));
    await addSamples(c, insp.id, reuseExpected); // 2h — add every base water-sample type
    // 2j — set the visit BOOKING status (probe-verified 'confirmed' stays searchable; execution states untouched).
    await c.patch(`/visits/${visit.id}`, { status: reuseExpected.bookingStatus }).catch((e) => console.error(`WARN: bookingStatus PATCH failed (${e.message})`));
    // 2i deferred to Phase 2.5 (see create-path note). REUSE CAVEAT: a reused visit that ALREADY
    // carries 2 inspections faces the mobile position-nav ambiguity regardless of when we add — but
    // add-second-inspection.mjs only reuses an existing 2nd inspection (never stacks more), and the
    // hard-gated flows still target the FIRST (Risk Assessment) inspection. Fresh-visit CI is the
    // primary path and is fully protected by the deferral.
    writeFileSync("parity-context.json", JSON.stringify({ runId: reuseRunId, visitId: visit.id, visitRef: visit.visitReference, inspectionId: insp.id, siteId: reuseSiteId, expected: reuseExpected, reused: true }, null, 2));
    console.log(`SETUP REUSE visitRef=${visit.visitReference} visitId=${visit.id} inspectionId=${insp.id} runId=${reuseRunId}`);
    return;
  }

  const fx = await resolveFixtures(c, mobileClient);
  await c.post("/visits", buildVisitPayload(runId, fx)); // returns empty 201
  const visit = await findVisitByTitle(c, title);
  if (!visit) throw new Error(`setup: created visit titled ${title} not found via filter-detailed`);

  const inspection = await c.post("/inspections", { visitId: visit.id, jobTypeId: fx.jobTypeId });
  if (!inspection?.id) throw new Error("setup: inspection creation returned no id");

  // web->mobile: seed the 3 visit-text fields so the mobile Visit Details card shows them (p01d / check 2d)
  await c.patch(`/visits/${visit.id}`, expected.webPatch);
  // web->mobile: seed the inspection asset field so the mobile LocationCard shows it (p01e / check 2g
  // + 4a notes / 4c itemReference / 4d itemLocation, all on the same inspectionPatch object)
  await c.patch(`/inspections/${inspection.id}`, expected.inspectionPatch).catch((e) => console.error(`WARN: inspectionPatch failed (${e.message})`));
  // web->mobile (4b): seed the SITE accessInfo (booking info). The visit was created with fx.siteId,
  // so that IS this visit's site. GUARDRAIL: edits the shared site record (fine on the dev test site).
  await c.patch(`/sites/${fx.siteId}`, expected.sitePatch).catch((e) => console.error(`WARN: sitePatch failed (${e.message})`));

  for (const a of expected.visitActions) await c.post("/actions", { siteId: fx.siteId, visitId: visit.id, name: a.name, priority: a.priority });
  for (const a of expected.inspectionActions) await c.post("/actions", { siteId: fx.siteId, inspectionId: inspection.id, name: a.name, priority: a.priority });

  await addSamples(c, inspection.id, expected); // 2h — add every base water-sample type via the web API

  // 2j — set the visit's BOOKING status web->mobile. Probe-verified 'confirmed' keeps the visit
  // searchable and never touches visitStatus/inspectionStatus. Last so it never blocks the other seeds.
  await c.patch(`/visits/${visit.id}`, { status: expected.bookingStatus }).catch((e) => console.error(`WARN: bookingStatus PATCH failed (${e.message})`));
  // 2i is DEFERRED to Phase 2.5 (add-second-inspection.mjs), NOT done here: adding a 2nd inspection in
  // Phase 0 would give the visit two inspections during Phase 1/2, and the shared mobile
  // _shared/open_inspection.yaml taps the FIRST "(Start|View) Inspection" by POSITION — a 2nd
  // inspection could shift which one the hard-gated flows (p01e/2g, p03/3b, p04/3c, p03b/3e) open and
  // red the gate. 2i is scored at verify by checkInspectionCount(GET /visits), so creation timing is
  // irrelevant to scoring; deferring it keeps Phase 1/2 single-inspection and deterministic.

  writeFileSync("parity-context.json", JSON.stringify({ runId, visitId: visit.id, visitRef: visit.visitReference, inspectionId: inspection.id, siteId: fx.siteId, engineerId: fx.engineerId, expected }, null, 2));
  console.log(`SETUP OK visitRef=${visit.visitReference} visitId=${visit.id} inspectionId=${inspection.id}`);
}

if (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, "/"))) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
