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
  for (const [name, want] of Object.entries(expectedFields)) {
    fields[name] = (extractFormValue(inspection, formName, name) ?? "") === want;
  }
  const ok = Object.values(fields).every(Boolean);
  return { id, direction, status: ok ? "PASS" : "FAIL", fields, details: JSON.stringify(fields) };
}

export function checkInspectionActions(actions, expected) {
  const names = new Set((actions || []).map((a) => a.name));
  const present = expected.filter((a) => names.has(a.name));
  const ok = present.length === expected.length;
  return { id: "2c-inspection-actions", direction: "Web->Mobile (API)", status: ok ? "PASS" : "FAIL",
    details: `${present.length}/${expected.length} inspection actions present via API` };
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

  let mobileChecks = [];
  try { mobileChecks = JSON.parse(readFileSync("parity-mobile-results.json")).checks || []; } catch { /* may be absent */ }

  // 2c via API if it wasn't asserted on mobile
  if (!mobileChecks.some((c) => c.id === "2c-inspection-actions")) {
    const actions = await c.get(`/actions?inspectionId=${ctx.inspectionId}`).catch(() => []);
    apiChecks.unshift(checkInspectionActions(Array.isArray(actions) ? actions : actions?.items ?? [], ctx.expected.inspectionActions));
  }

  const all = [...mobileChecks, ...apiChecks];
  const passed = all.filter((c) => c.status === "PASS").length;
  const summary = { runId: ctx.runId, visitRef: ctx.visitRef, total: all.length, passed, failed: all.length - passed, checks: all };
  writeFileSync("summary.json", JSON.stringify(summary, null, 2));
  console.log(`VERIFY ${passed}/${all.length} PASS`);
  for (const c of all) console.log(`  [${c.status}] ${c.id} — ${c.details}`);
}

if (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, "/"))) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
