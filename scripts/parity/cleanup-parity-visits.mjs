// Delete old PARITY-* test visits from the dev environment.
//
// Every parity run creates a `PARITY-<runId>` visit plus an inspection tree and
// never removes it, so dev accumulates synthetic visits. Once parity runs on a
// nightly cadence that is ~250 visits a year, and a crowded dev slows the app's
// visit list down.
//
// DELETE /visits/{id} on the backend is a HARD CASCADE - no soft-delete column,
// and every child (inspections, samples, actions) is ON DELETE CASCADE. It is
// unrecoverable. So this script is written to refuse rather than guess:
//
//   * positive host allowlist  - the API base must look like the dev host, else
//                                refuse. Never runs against prod by accident.
//   * anchored title re-assert - /^PARITY-/ is re-checked on EVERY record right
//                                before its delete, not just in the server-side
//                                (partial, ILIKE) title query.
//   * keep the newest N        - recent runs stay available for debugging.
//   * minimum age             - nothing younger than MIN_AGE_DAYS is touched,
//                                so an in-flight run is never hit.
//   * exclude the live visit   - the current run's own visit id is skipped.
//   * hard per-run cap         - bounds the blast radius of any logic error.
//   * loud refusals            - every guard prints ::warning:: so a silently
//                                disabled cleanup cannot masquerade as success.
//   * audit log                - one JSON record per delete, into the artifact
//                                bundle the workflow already uploads.
//
// Always exits 0: cleanup is housekeeping and must never fail a parity run.

import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { makeClient } from "./api.mjs";

const KEEP_NEWEST = Number(process.env.PARITY_CLEANUP_KEEP ?? 5);
const MIN_AGE_DAYS = Number(process.env.PARITY_CLEANUP_MIN_AGE_DAYS ?? 3);
const MAX_DELETES = Number(process.env.PARITY_CLEANUP_MAX ?? 10);
const AUDIT_LOG = process.env.PARITY_CLEANUP_LOG || "qa-artifacts/parity/cleanup-log.json";
const PAGE_LIMIT = 100;

// Anchored: a title must START with PARITY-. The server-side title filter is a
// partial ILIKE, so "Site PARITY-x survey" would come back from the query and
// must be rejected here.
const PARITY_TITLE = /^PARITY-/;

function log(msg) { console.log(`[parity-cleanup] ${msg}`); }
function refuse(reason) {
  // Loud on purpose: a guard that trips silently turns this into a permanent
  // no-op that nobody notices.
  console.log(`::warning::parity cleanup refused: ${reason}`);
  log(`refused: ${reason}`);
}

export function isParityVisit(visit) {
  return typeof visit?.title === "string" && PARITY_TITLE.test(visit.title);
}

export function looksLikeDevHost(base) {
  // Positive allowlist. Anything that is not recognisably the dev API is a
  // refusal - never an "assume it is fine".
  return /hydrocert-dev-api/i.test(base || "") || /\bapi\.dev\./i.test(base || "");
}

// Newest first. createdAt is a real column on the visit entity and comes back on
// every item; a row whose date will not parse is treated as age-unknown and is
// never deleted (fail closed).
export function selectDeletable(visits, opts = {}) {
  const keep = opts.keepNewest ?? KEEP_NEWEST;
  const minAgeDays = opts.minAgeDays ?? MIN_AGE_DAYS;
  const now = opts.now ?? Date.now();
  const exclude = opts.excludeIds ?? new Set();
  const cutoff = now - minAgeDays * 86400000;

  const parity = (visits || []).filter(isParityVisit);
  const dated = parity
    .map((v) => ({ v, t: Date.parse(v?.createdAt ?? "") }))
    .filter((x) => Number.isFinite(x.t));          // unparsable date = untouched
  dated.sort((a, b) => b.t - a.t);                 // newest first

  return dated
    .slice(keep)                                   // protect the newest N
    .filter((x) => x.t < cutoff)                   // and anything too young
    .filter((x) => x.v?.id && !exclude.has(x.v.id))
    .sort((a, b) => a.t - b.t)                     // delete oldest first
    .map((x) => x.v);
}

function currentRunVisitId() {
  // Never delete the visit this very run is using.
  for (const p of ["parity-context.json", "qa-artifacts/parity/parity-context.json"]) {
    try {
      if (existsSync(p)) {
        const id = JSON.parse(readFileSync(p, "utf8"))?.visitId;
        if (id) return id;
      }
    } catch { /* best effort */ }
  }
  return null;
}

async function listParityVisits(c) {
  // No date filters: on this endpoint startDate/endDate NARROW the result set
  // (visit.from >= start AND visit.to <= end), which would hide exactly the old
  // visits we are here to remove.
  const out = [];
  for (let page = 1; page <= 20; page++) {
    const res = await c.get(
      `/visits/filter-detailed?title=PARITY-&page=${page}&limit=${PAGE_LIMIT}`);
    const items = res?.items || res?.data || [];
    out.push(...items);
    if (items.length < PAGE_LIMIT) break;
  }
  return out;
}

function appendAudit(records) {
  if (!records.length) return;
  try {
    mkdirSync(dirname(AUDIT_LOG), { recursive: true });
    let prev = [];
    if (existsSync(AUDIT_LOG)) {
      try { prev = JSON.parse(readFileSync(AUDIT_LOG, "utf8")) || []; } catch { prev = []; }
    }
    writeFileSync(AUDIT_LOG, JSON.stringify([...prev, ...records], null, 2), "utf8");
    log(`audit log: ${AUDIT_LOG} (+${records.length})`);
  } catch (e) {
    log(`could not write audit log: ${e.message}`);
  }
}

async function main() {
  const base = process.env.HYDROCERT_API_BASE;
  const email = process.env.API_EMAIL;
  const password = process.env.API_PASSWORD;

  if (!base) return refuse("HYDROCERT_API_BASE is not set");
  if (!looksLikeDevHost(base)) return refuse(`API base is not the dev host (${base})`);
  if (!email || !password) return refuse("API_EMAIL / API_PASSWORD not set");
  if (!Number.isFinite(KEEP_NEWEST) || KEEP_NEWEST < 1) return refuse("KEEP must be >= 1");
  if (!Number.isFinite(MAX_DELETES) || MAX_DELETES < 1) return refuse("MAX must be >= 1");

  const c = makeClient(base);
  await c.login(email, password);

  const all = await listParityVisits(c);
  const parity = all.filter(isParityVisit);
  const rejected = all.length - parity.length;
  log(`server returned ${all.length} row(s) for title=PARITY-, ${parity.length} pass the anchored check`);

  // If the server hands back a lot of rows the anchored filter rejects, the
  // title query is not behaving as assumed - stop rather than delete.
  if (rejected > parity.length) {
    return refuse(`title filter looks wrong (${rejected} rejected vs ${parity.length} accepted)`);
  }

  const exclude = new Set();
  const live = currentRunVisitId();
  if (live) { exclude.add(live); log(`excluding current run visit ${live}`); }

  const doomed = selectDeletable(parity, { excludeIds: exclude }).slice(0, MAX_DELETES);
  log(`${parity.length} PARITY visits, keeping newest ${KEEP_NEWEST} and anything under `
    + `${MIN_AGE_DAYS} day(s) old; deleting ${doomed.length} (cap ${MAX_DELETES})`);

  const audit = [];
  for (const v of doomed) {
    // Final per-record assert, immediately before the irreversible call.
    if (!isParityVisit(v) || !v.id || exclude.has(v.id)) {
      log(`skip ${v?.id}: failed the final safety assert`);
      continue;
    }
    try {
      await c.del(`/visits/${v.id}`);
      log(`deleted ${v.visitReference || "(no ref)"} "${v.title}" (${v.id})`);
      audit.push({
        deletedAt: new Date().toISOString(),
        id: v.id,
        title: v.title,
        visitReference: v.visitReference ?? null,
        createdAt: v.createdAt ?? null,
      });
    } catch (e) {
      log(`could not delete ${v.id}: ${e.message}`);
    }
  }
  appendAudit(audit);
  log(`done: ${audit.length} visit(s) removed`);
}

// Only run when executed directly, so the unit tests can import the helpers.
if (process.argv[1] && process.argv[1].endsWith("cleanup-parity-visits.mjs")) {
  main().catch((e) => {
    // Housekeeping must never fail the parity run.
    console.log(`::warning::parity cleanup errored (ignored): ${e.message}`);
  });
}
