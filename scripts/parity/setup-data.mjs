// Phase 0 — create a fresh tagged visit + inspection + actions via the REST API.
// Writes parity-context.json consumed by the Maestro phase and verify-data.mjs.
import { writeFileSync, readFileSync } from "node:fs";
import { makeClient } from "./api.mjs";

export function makeTitle(runId) { return `PARITY-${runId}`; }

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
      "Works being carried out": `${tag} Works`,
    },
    riskAssessment: {
      "Accessing Area/Lone Working- Comments": `${tag} risk comment`,
    },
  };
}

export function buildVisitPayload(runId, fx, now = new Date()) {
  const from = new Date(now.getTime() + 24 * 3600 * 1000);
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
  return list.find((v) => v.title === title) || list[0] || null;
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
    const visit = list.find((v) => v.visitReference === suppliedRef) || list[0];
    if (!visit) throw new Error(`setup: supplied VISIT_REF ${suppliedRef} not found`);
    const fx = await resolveFixtures(c, mobileClient).catch(() => ({ jobTypeId: JSON.parse(readFileSync(new URL("./fixtures.dev.json", import.meta.url))).jobTypeId }));
    const insp = visit.inspections?.[0] || (await c.post("/inspections", { visitId: visit.id, jobTypeId: fx.jobTypeId }));
    writeFileSync("parity-context.json", JSON.stringify({ runId, visitId: visit.id, visitRef: visit.visitReference, inspectionId: insp.id, expected, reused: true }, null, 2));
    console.log(`SETUP REUSE visitRef=${visit.visitReference} visitId=${visit.id} inspectionId=${insp.id}`);
    return;
  }

  const fx = await resolveFixtures(c, mobileClient);
  await c.post("/visits", buildVisitPayload(runId, fx)); // returns empty 201
  const visit = await findVisitByTitle(c, title);
  if (!visit) throw new Error(`setup: created visit titled ${title} not found via filter-detailed`);

  const inspection = await c.post("/inspections", { visitId: visit.id, jobTypeId: fx.jobTypeId });
  if (!inspection?.id) throw new Error("setup: inspection creation returned no id");

  for (const a of expected.visitActions) await c.post("/actions", { siteId: fx.siteId, visitId: visit.id, name: a.name, priority: a.priority });
  for (const a of expected.inspectionActions) await c.post("/actions", { siteId: fx.siteId, inspectionId: inspection.id, name: a.name, priority: a.priority });

  writeFileSync("parity-context.json", JSON.stringify({ runId, visitId: visit.id, visitRef: visit.visitReference, inspectionId: inspection.id, engineerId: fx.engineerId, expected }, null, 2));
  console.log(`SETUP OK visitRef=${visit.visitReference} visitId=${visit.id} inspectionId=${inspection.id}`);
}

if (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, "/"))) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
