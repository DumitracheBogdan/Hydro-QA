// Phase 3 — read back via the REST API and score the mobile->web checks (+ optional 2c).
import { writeFileSync, readFileSync } from "node:fs";
import { makeClient } from "./api.mjs";

// Find a saved value in the generic inspection form structure.
export function extractFormValue(inspection, formName, fieldName) {
  const form = (inspection.inspectionForms || []).find((f) => f.formName === formName);
  if (!form) return undefined;
  const ff = (form.formFields || []).find((x) => x.formField?.fieldName === fieldName);
  return ff?.value;
}

export function checkSignature(visit, expected) {
  const ok = !!visit.signature && visit.signatureName === expected.signatureName;
  return { id: "3a-signature", direction: "Mobile->Web", status: ok ? "PASS" : "FAIL",
    details: `name="${visit.signatureName}" hasImage=${!!visit.signature}` };
}

export function checkFields(id, direction, inspection, formName, expectedFields) {
  const fields = {};
  // Strict equality (no `?? ""`): a missing/undefined field must NOT match a non-empty want, and
  // must not vacuously match an empty want either — undefined !== "" (L1).
  for (const [name, want] of Object.entries(expectedFields)) {
    fields[name] = extractFormValue(inspection, formName, name) === want;
  }
  const keys = Object.keys(expectedFields);
  // An empty expected object verifies nothing — that is a FAIL, not a vacuous PASS (L6).
  const ok = keys.length > 0 && keys.every((k) => fields[k]);
  return { id, direction, status: ok ? "PASS" : "FAIL", fields, details: JSON.stringify(fields) };
}

export function checkVisitText(visit, expectedText) {
  const fields = {};
  for (const [k, want] of Object.entries(expectedText)) fields[k] = visit[k] === want;
  const keys = Object.keys(expectedText);
  const ok = keys.length > 0 && keys.every((k) => fields[k]); // empty expected => FAIL (L6)
  return { id: "3d-visit-text", direction: "Mobile->Web", status: ok ? "PASS" : "FAIL", fields, details: JSON.stringify(fields) };
}

export function checkInspectionActions(actions, expected) {
  const list = actions || [];
  // Match on name AND priority (when the expected action carries one). Name-only matching let an
  // action that synced with the wrong/lost priority pass vacuously — the matrix lists priority as
  // a parity datum (M1).
  const present = (expected || []).filter((a) =>
    list.some((x) => x.name === a.name && (a.priority === undefined || x.priority === a.priority)),
  );
  const ok = (expected || []).length > 0 && present.length === expected.length;
  return { id: "2c-inspection-actions", direction: "Web->Mobile (API)", status: ok ? "PASS" : "FAIL",
    details: `${present.length}/${(expected || []).length} inspection actions present via API (name+priority)` };
}

// 2h — every sample type added via the web API (PATCH /inspections {samples}) must land in the
// inspection's laboratorySamples (web->mobile propagation). Per-sample: each expected sampleTypeId
// must be present. (Adding samples is safe; we NEVER trigger Submit-to-Normec/ALS.)
export function checkSamples(laboratorySamples, expectedTypeIds) {
  const present = new Set((laboratorySamples || []).map((s) => s.sampleTypeId));
  const want = expectedTypeIds || [];
  const found = want.filter((id) => present.has(id));
  const ok = want.length > 0 && found.length === want.length;
  return { id: "2h-samples", direction: "Web->Mobile", status: ok ? "PASS" : "FAIL",
    details: `${found.length}/${want.length} sample types present in laboratorySamples` };
}

// 4a/4b/4c/4d — generic scalar web->mobile check: a single field PATCHed via the web API in phase 0
// must read back equal on the GET of the same record (inspection for 4a/4c/4d, site for 4b). Same
// scoring model as 2h/checkSamples (API-set, API-scored; the mobile flow is photo-only). Strict
// equality (no `?? ""`): a missing/undefined field must NOT match, and an empty/undefined want is a
// FAIL (no vacuous pass — L1/L6). Tolerates a null/undefined object (e.g. site not resolved) -> FAIL.
export function checkScalarField(id, direction, obj, field, want) {
  const got = obj == null ? undefined : obj[field];
  const ok = want !== undefined && want !== "" && got === want;
  return { id, direction, status: ok ? "PASS" : "FAIL", details: `${field}=${JSON.stringify(got)} want=${JSON.stringify(want)}` };
}

// The full set of check ids the suite is expected to produce on a complete run. buildSummary uses
// this to PIN the denominator: any expected id that never materialized becomes a synthetic FAIL, so
// a crashed/absent phase can never shrink the total into a misleading green (H3, M10).
export const EXPECTED_IDS = [
  "2a-description", "2b-visit-actions", "2c-inspection-actions", "2d-visit-text", "2g-item-detail", "2h-samples",
  "3a-signature", "3b-visit-info", "3c-risk", "3d-visit-text", "3e-site-induction",
  // web->mobile API-set scalar fields (mirror 2h scoring; mobile flow photo-only) — additive, never
  // touch the visit title/ref/dates/status so they can't disturb the mobile search or other checks.
  "4a-inspection-notes", "4b-booking-info", "4c-item-reference", "4d-item-location",
];

// Checks reported but NOT hard-gated — the realistic half of the split done-bar (Decision 2).
// A check belongs here ONLY with a documented justification (CI-emulator flake / unverified-new).
// Add ids here, with a comment citing the reason, rather than weakening the gate globally.
// Empty: 2g (itemDetail->LocationCard) was promoted to the gate after CI run 26607132325 confirmed
// itemDetail renders on mobile (10/10). The current 10 checks are all hard-gated.
// Empty: 2h (16 water-sample types) promoted to the gate after CI run 26666131981 confirmed 16/16
// in laboratorySamples (deterministic API check). NOTE: the mobile Water-Sampling UI render of those
// samples needs a requiresWaterSample jobType (the parity jobType has no mobile sampling section) —
// tracked as a refinement; 2h's web->mobile propagation is proven on the connection (API) + web batch.
// 4a/4b/4c/4d (new web->mobile API-set scalar fields) start here until a CI run proves them green —
// while flaky they are reported but never red the gate, so they cannot break the existing 11 checks.
// PATCH+GET round-trip verified locally against dev 2026-05-30 (notes/itemReference/itemLocation on
// /inspections, accessInfo on /sites). Promote to the gate (remove from this set) once CI is green.
export const KNOWN_FLAKY = new Set([
  "4a-inspection-notes", "4b-booking-info", "4c-item-reference", "4d-item-location",
]);

// Assemble the scored summary. `checks` is whatever materialized (mobile results + api checks).
// opts.expectedIds defaults to EXPECTED_IDS; opts.mobileMissing flags that parity-mobile-results.json
// was absent/unparseable so the reason is recorded on the synthetic FAILs. Fails open is impossible:
// a missing expected check is a FAIL, not silence.
export function buildSummary(ctx, checks, opts = {}) {
  const expected = opts.expectedIds || EXPECTED_IDS;
  const flaky = opts.knownFlaky || KNOWN_FLAKY;
  const present = new Set((checks || []).map((c) => c.id));
  const all = [...(checks || [])];
  for (const id of expected) {
    if (!present.has(id)) {
      all.push({ id, direction: "?", status: "FAIL",
        details: opts.mobileMissing ? "expected check missing (mobile results absent/corrupt)" : "expected check missing from results" });
    }
  }
  const passed = all.filter((c) => c.status === "PASS").length;
  // failed = everything not PASS (full picture). gateFailed = hard failures only (excludes the
  // documented-flaky allowlist) — this is what turns CI red, realizing the split done-bar.
  const gateFailed = all.some((c) => !flaky.has(c.id) && c.status !== "PASS");
  return { runId: ctx.runId, visitRef: ctx.visitRef, total: all.length, passed, failed: all.length - passed, gateFailed, checks: all };
}

// Every mobile->web read-back check must AND in its Maestro flow's exit code: PASS only if the flow
// also exited 0. Otherwise, in reuse mode (where expected values are derived from the reused visit's
// own run id), a silently-failed flow would stale-pass off the prior run's matching data — a
// reuse-mode fail-open (M4 for the fixed-value 3e; H-1 generalizes it to the run-tagged 3a/3b/3c,
// which are also exposed when the reused record already holds matching values).
const FLOW_GUARDED = {
  "3a-signature": "p02",
  "3b-visit-info": "p03",
  "3c-risk": "p04",
  "3e-site-induction": "p03b",
};
export function applyFlowGuards(checks, flowStatus) {
  if (!flowStatus) return checks;
  return checks.map((c) => {
    const flow = FLOW_GUARDED[c.id];
    if (flow && flowStatus[flow] !== undefined && flowStatus[flow] !== 0 && c.status === "PASS") {
      return { ...c, status: "FAIL", details: `${c.details} | flow ${flow} failed (code ${flowStatus[flow]})` };
    }
    return c;
  });
}

async function main() {
  const ctx = JSON.parse(readFileSync("parity-context.json"));
  const c = makeClient(process.env.HYDROCERT_API_BASE);
  await c.login(process.env.API_EMAIL, process.env.API_PASSWORD);

  const visit = await c.get(`/visits/${ctx.visitId}`);
  const inspection = await c.get(`/inspections/${ctx.inspectionId}`);

  const apiChecks = [
    checkSignature(visit, ctx.expected),
    checkFields("3b-visit-info", "Mobile->Web", inspection, "Visit Information", ctx.expected.visitInfo),
    checkFields("3c-risk", "Mobile->Web", inspection, "Risk Assessment", ctx.expected.riskAssessment),
  ];
  // 3d — visit-level free-text fields set on the mobile Visit Details card (p05).
  if (ctx.expected.visitText) apiChecks.push(checkVisitText(visit, ctx.expected.visitText));
  // 3e — Site Induction single-select dropdown set on mobile (p03b).
  if (ctx.expected.siteInduction)
    apiChecks.push(checkFields("3e-site-induction", "Mobile->Web", inspection, "Visit Information", ctx.expected.siteInduction));
  // 2h — water samples added via web API; every sampleTypeId must land in laboratorySamples.
  if (ctx.expected.sampleTypeIds)
    apiChecks.push(checkSamples(inspection.laboratorySamples, ctx.expected.sampleTypeIds));

  // 4a/4c/4d — inspection scalar fields PATCHed web->mobile (read back on the same GET /inspections).
  if (ctx.expected.inspectionPatch) {
    const ip = ctx.expected.inspectionPatch;
    apiChecks.push(checkScalarField("4a-inspection-notes", "Web->Mobile (API)", inspection, "notes", ip.notes));
    apiChecks.push(checkScalarField("4c-item-reference", "Web->Mobile (API)", inspection, "itemReference", ip.itemReference));
    apiChecks.push(checkScalarField("4d-item-location", "Web->Mobile (API)", inspection, "itemLocation", ip.itemLocation));
  }
  // 4b — site accessInfo (booking info) PATCHed web->mobile (GET /sites/{siteId}). siteId is the
  // VISIT's siteId persisted by setup (NOT fx.siteId, which may resolve a different site in reuse
  // mode). A null/missing site GET degrades to a FAIL via checkScalarField (not a crash).
  if (ctx.expected.sitePatch && ctx.siteId) {
    const site = await c.get(`/sites/${ctx.siteId}`).catch(() => null);
    apiChecks.push(checkScalarField("4b-booking-info", "Web->Mobile (API)", site, "accessInfo", ctx.expected.sitePatch.accessInfo));
  }

  // null (not []) distinguishes "file absent/unparseable" from "file present but empty", so the
  // web->mobile half can never be silently dropped into a green run (H3).
  let mobileChecks = null;
  try { mobileChecks = JSON.parse(readFileSync("parity-mobile-results.json")).checks || []; } catch { mobileChecks = null; }
  const mobileMissing = mobileChecks === null;
  const mc = mobileChecks || [];

  // 2c via API if it wasn't asserted on mobile
  if (!mc.some((c) => c.id === "2c-inspection-actions")) {
    const actions = await c.get(`/actions?inspectionId=${ctx.inspectionId}`).catch(() => []);
    apiChecks.unshift(checkInspectionActions(Array.isArray(actions) ? actions : actions?.items ?? [], ctx.expected.inspectionActions));
  }

  // Optional Phase-2 flow exit codes (written by the orchestrator) — guard mobile->web checks in
  // REUSE mode only (M4/H-1). In fresh mode a new visit/inspection starts empty, so a failed flow
  // already self-falsifies via read-back; applying the guard there would risk a false-FAIL from a
  // flaky trailing post-save assertion. The fail-open hole the guard closes is reuse-specific.
  let flowStatus = null;
  try { flowStatus = JSON.parse(readFileSync("parity-flow-status.json")); } catch { flowStatus = null; }
  const guardedApi = ctx.reused ? applyFlowGuards(apiChecks, flowStatus) : apiChecks;

  const summary = buildSummary(ctx, [...mc, ...guardedApi], { mobileMissing });
  writeFileSync("summary.json", JSON.stringify(summary, null, 2));
  console.log(`VERIFY ${summary.passed}/${summary.total} PASS${summary.failed ? ` (${summary.failed} failed, gateFailed=${summary.gateFailed})` : ""}`);
  for (const c of summary.checks) console.log(`  [${c.status}] ${c.id} — ${c.details}`);
  // Exit non-zero on a HARD failure so the run signals failure instead of reporting green (H1).
  // Uses gateFailed (not failed) so documented-flaky checks don't fail the deterministic gate.
  if (summary.gateFailed) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, "/"))) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
