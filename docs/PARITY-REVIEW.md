# Parity Suite — Code Review (2026-05-28)

Read-only review of the existing 9-check bidirectional parity suite, run as 4 parallel reviewers (scripts / orchestrator / flows / coverage-wiring); **every finding adversarially re-verified against the cited source** before inclusion. 43 agents, 19 confirmed findings.

**Severity:** 3 High · 10 Medium · 6 Low. No Blockers.

**Dominant theme — fail-open scoring.** The suite can report a green/PASS result when parity is actually broken or whole checks silently vanish. This is the `regression-bundle-exits-0` anti-pattern. The fix is a small coherent set: `verify-data` must exit non-zero on `failed>0`; a CI gate step must fail on `failed>0` OR a short total; missing mobile results must become a synthetic FAIL; the expected check-id set must be pinned.

> **Note on findings that touch product behavior (F-0x in PARITY-FACTS):** these are about the *test harness*, in the QA repo only. No product repo (FE/BE/mobile) is modified.

---

## High (fix before expanding)

### H1 · `no-exit-code-on-logical-fail` — verify-data exits 0 on logical FAILs
`scripts/parity/verify-data.mjs:73-81`. `main()` writes `summary.json` and returns normally even when `failed>0`; the only `process.exit(1)` is in the `.catch` for a *thrown* error. With `run-parity-test.sh` `set +e`, the final `cat summary.json` (exit 0), and the workflow step's `continue-on-error`, **a run with genuine FAILs is reported SUCCESS**. → Add `if (summary.failed > 0) process.exit(1)` at the end of `main()`.

### H2 · `job-green-on-logical-fail` — CI job green even when checks fail
`.github/workflows/bidirectional-parity.yml:41` (`continue-on-error: true`) + `scripts/run-parity-test.sh:116` (`cat summary.json` is the last command). Two independent roots; removing `continue-on-error` alone does NOT fix it. → Add a dedicated **gate step** (no `continue-on-error`) after the emulator step that parses `summary.json` and fails on `failed>0` OR `total < EXPECTED`. Only the `node --test` step can currently turn the job red.

### H3 · `mobile-results-absent-scores-green` — absent/corrupt mobile results silently drops the whole web→mobile half
`scripts/parity/verify-data.mjs:62-73`. The bare `catch` swallows both a missing and a corrupt `parity-mobile-results.json`, so 2a/2b/2d vanish from `all`; if the API checks pass, `failed===0` → green with a shrunk denominator. Fires when the Phase-1 writer crashes / emulator is killed mid-write. → Treat missing/unparseable as a synthetic FAIL; assert an expected mobile-check count.

---

## Medium

### M1 · `checkinspectionactions-priority-blind` — 2c matches name only, ignores priority
`verify-data.mjs:35-41`. Expected actions carry `{name, priority}` (3 distinct levels seeded on purpose), but only `name` is compared → an action that synced with a wrong/lost priority still PASSes. The matrix explicitly lists `actions[].priority` as a parity datum. → Compare priority too; add a test that a priority mismatch FAILs.

### M2 · `wrong-visit-binding-list0-fallback` — `|| list[0]` binds an arbitrary visit
`setup-data.mjs:107, 148`. `/visits/filter?visitReference=` is a *partial* filter (per design doc). On a typo'd/truncated VISIT_REF the exact `find` fails but `|| list[0]` binds **some other live dev visit**; `if (!visit)` never fires → inspection+actions created on the wrong record. → Drop `|| list[0]`; bind only on exact match else throw (esp. the reuse path).

### M3 · `stale-runid-reuse-path-mismatch` — reuse path recomputes expected from the NEW run_id
`setup-data.mjs:143-155`. `buildExpected(runId)` uses the new `github.run_id`, but the reused visit still holds the prior run's notes/actions; reuse only re-PATCHes `waterSystemDescription`. → 2a/2b FAIL deterministically (false-FAIL, breaks the reuse feature). → Derive `runId` from `visit.title` (`replace(/^PARITY-/,'')`) before `buildExpected`, and pass it to the flows.

### M4 · `phase2-discards-maestro-exit-codes` — Phase-2 flows scored only by API read-back; 3e false-PASS in reuse
`run-parity-test.sh:105-109`. Phase 2 (p02/p03/p03b/p04/p05) discards every exit code; checks scored purely by API read-back. Run-tagged values self-falsify, but `siteInduction` (3e) is a **fixed** value → in reuse mode a silently-failed p03b reads the old value and PASSes. → Capture p03b's exit code and AND it into 3e (mirror Phase 1), or run-id-tag the value.

### M5 · `p03-non-idempotent-inputText-no-eraseText` — retry doubles the visit-info values
`mobile-flows-parity/p03_mobile2web_visit_info.yaml:10-35`. Assisting 1/2/3 + Works use `tapOn{below} → inputText` with **no `eraseText`** (p02/p05 do call it). On a post-Save retry, attempt 2 appends to the server-prefilled field → `Inspector 1Inspector 1` → exact-match 3b FAILs. → Add `eraseText` before each `inputText`.

### M6 · `mobile-results-silently-dropped` — 6/6 looks green instead of 6/9 (dup root of H3)
`verify-data.mjs:62-63, 71-73`. Same silent-drop mechanism. Closed by H3 + the gate-step `total` floor.

### M7 · `verify-crash-no-summary-but-still-green` — verify crash → no summary, job still green
`verify-data.mjs:79-81`. A throw (login/IO) exits before `writeFileSync('summary.json')`; `continue-on-error` keeps the job green; Job-summary prints "No summary produced". → The H2 gate step (fail when `summary.json` absent) closes this.

### M8 · `main-untested-false-pass-paths-uncovered` — the false-pass-prone code is untested
`verify-data.test.mjs:1-62`. Tests only call the pure comparators; the absent-file merge, stale-runId, unshift-2c branch, and exit-on-fail behavior in `main()` are untested. → Extract a pure `buildSummary(ctx, apiChecks, mobileChecksOrNull)` and test null/stale/fail paths.

### M9 · `no-genp04-test-value-drift` — load-bearing value coupling untested
`scripts/parity/gen-p04.mjs:8`. `const VALUE = "PARITY-${RUN_ID} rc"` must equal `buildExpected().riskAssessment[*]`; there's no `gen-p04.test.mjs`. The slice/labels are shared (can't drift), but the literal value string is uncoupled, and an emptied slice passes vacuously. → Add a test asserting emitted `inputText` value + count + labels match `RISK_COMMENT_FIELDS_AUTOMATED` / `buildExpected`.

### M10 · `total-unpinned-dropped-checks-render-green` — "9/9" is inflatable
`verify-data.mjs:62-73`. No `EXPECTED_IDS`/`total===9` assertion anywhere; dropped (missing) checks still report green (genuine FAILs do go red). → Pin `EXPECTED_IDS`; push a synthetic FAIL for any missing id; gate on `total !== EXPECTED`.

---

## Low

### L1 · `checkfields-missing-equals-empty-vacuous`
`verify-data.mjs:19-26, 28-33`. `(value ?? "") === want` conflates missing/undefined with `""`. Latent only (all `want` non-empty today). → Treat `undefined` as FAIL unless absence is expected.

### L2 · `dead-web-base-env`
`bidirectional-parity.yml:57`. `HYDROCERT_WEB_BASE` set but never consumed by any parity script/flow (mobile→web is REST-only). Cosmetic. → Remove or comment.

### L3 · `p02-signature-submit-blind-swipe-coords-no-assert`
`p02_mobile2web_signature.yaml:27-47`. Fixed-percentage swipes + bare `tapOn "Submit"` (vs anchored `^Save$`); web check only requires `!!visit.signature` truthy → a blank/degenerate capture could pass; a fully-missing signature still FAILs. → Anchor `^Submit$`; add a post-Submit assertion that the "Tap to sign" placeholder is replaced by a preview.

### L4 · `no-flow-failure-fed-into-mobile2web-scoring`
`run-parity-test.sh:104-113`. Mobile→web flow crashes are invisible to scoring (diagnostics gap); effect (missing data) still FAILs for run-tagged values. Narrow residual = 3e fixed value. → Same fix as M4.

### L5 · `2c-tests-nothing-cross-platform` — 2c is a backend create→read tautology
`verify-data.mjs:35-41, 66-68`. 2c creates inspection actions via the same API it reads back; no Maestro flow (p01c absent, F-01). It can only fail on a DB outage, yet counts toward the 9/9 headline (and is the lone check that passes in the "1/9" failure mode). → Reframe headline as "8 parity + 1 known-gap smoke", or report 2c separately from the parity pass-count.

### L6 · `empty-expected-vacuous-pass-latent`
`verify-data.mjs:19-26, 28-33` (driven by `setup-data.mjs:36,65`). `Object.values({}).every(Boolean) === true` → an empty expected object PASSes with zero comparisons; the `if (ctx.expected.visitText)` guards treat `{}` as truthy. Latent (slice is `(0,1)`). → Require `Object.keys(expected).length > 0`.

---

## Fix priority

1. **Fix wave (gates expansion):** H1, H2, H3 + the cheap robustness Mediums/Lows that share their root — M6, M7, M10, L1, L6 (all the fail-open cluster) — plus M1 (priority), M2 (list[0]), M5 (eraseText), M8/M9 (tests), L2 (dead env), L5 (2c reframing). Done with TDD; `node --test scripts/parity/` green; one CI run to confirm the gate goes red on an injected FAIL and green on a real pass.
2. **Reuse-path hardening:** M3, M4, L3, L4 — folded into the relevant flows; reuse mode is opt-in so these don't block the default path.
3. **Then expansion waves A–F** per the design spec.
