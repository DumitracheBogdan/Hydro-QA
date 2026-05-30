// Phase 2.5 — 2i: add a SECOND inspection (different jobType) to the run's visit AFTER the Phase 1/2
// mobile flows have run. Deferred to here ON PURPOSE: the shared mobile _shared/open_inspection.yaml
// taps the FIRST "(Start|View) Inspection" by POSITION, so a 2nd inspection present during Phase 1/2
// could shift which inspection the hard-gated flows (p01e/2g, p03/3b, p04/3c, p03b/3e) open and red
// the gate. By the time this runs, every mobile flow that drills into an inspection is done, so the
// extra inspection cannot disturb them. 2i is scored at verify by checkInspectionCount(GET /visits),
// which is timing-independent. Reads + updates parity-context.json (persists secondInspectionId).
// Best-effort + NON-GATING: any failure here leaves the 2i check to FAIL (2i is KNOWN_FLAKY), never
// breaks the run.
import { writeFileSync, readFileSync } from "node:fs";
import { makeClient } from "./api.mjs";
import { addSecondInspection } from "./setup-data.mjs";

async function main() {
  const ctx = JSON.parse(readFileSync("parity-context.json"));
  const c = makeClient(process.env.HYDROCERT_API_BASE);
  await c.login(process.env.API_EMAIL, process.env.API_PASSWORD);

  // The primary jobType is the FIRST inspection's jobType (the one all the hard-gated flows target).
  const firstInsp = await c.get(`/inspections/${ctx.inspectionId}`).catch(() => null);
  const primaryJobTypeId = firstInsp?.jobTypeId
    || JSON.parse(readFileSync(new URL("./fixtures.dev.json", import.meta.url))).jobTypeId;

  const expected = ctx.expected || {};
  await addSecondInspection(c, ctx.visitId, primaryJobTypeId, expected);

  ctx.expected = expected;
  ctx.secondInspectionId = expected.secondInspectionId;
  writeFileSync("parity-context.json", JSON.stringify(ctx, null, 2));
  console.log(`ADD-2I secondInspectionId=${expected.secondInspectionId || "-"} (primary=${primaryJobTypeId})`);
}

if (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, "/"))) {
  // NON-GATING: never exit non-zero (2i is KNOWN_FLAKY and scored at verify regardless).
  main().catch((e) => { console.error(`WARN add-second-inspection failed (${e.message})`); });
}
