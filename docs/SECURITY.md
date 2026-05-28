# Security Review — Parity Suite (2026-05-28)

Read-only security audit of the bidirectional parity suite + repo, run during the 2026-05-28 hardening. Repo `DumitracheBogdan/Hydro-QA` is **PUBLIC**. Findings, what was fixed, and the **action you must take**.

---

## 🚨 CRITICAL — exposed credentials (ACTION REQUIRED: rotate)

**Finding.** Plaintext dev-backend credentials were committed to this public repo:
- `tq@hydrocert.com` / `TechQuarter2025!` — **dev admin** (in `docs/superpowers/plans/2026-05-22-populator-autonomous-refactor.md`, 3 occurrences)
- `parity.bot@hydrocert.com` / `ParityBot2026` — dev engineer (in `docs/PARITY-FACTS.md`)

**Done (2026-05-28):** redacted from HEAD (commit `022c1f1`) — the docs now reference the GH secrets / Obsidian `credentials.md` instead of the values.

**⚠️ STILL EXPOSED — you must act.** Redaction only cleans the *latest* version. The passwords **remain in git history** on a public repo (and may be cached/forked/scraped). They are compromised. Required:

1. **Rotate both passwords** (I did NOT do this autonomously — rotating live backend creds is "touching critical Hydrocert", and admin rotation could break the populator/other automation). Then update the GH secrets:
   ```bash
   # after changing the passwords on the dev backend (admin UI / user-mgmt API):
   gh secret set HYDROCERT_DEV_API_PASSWORD -R DumitracheBogdan/Hydro-QA        # tq@hydrocert.com new pw
   gh secret set HYDROCERT_PARITY_MOBILE_PASSWORD -R DumitracheBogdan/Hydro-QA  # parity.bot new pw
   ```
   The parity workflow + populator read these secrets, so they keep working with the new values. `parity.bot` must stay alphanumeric (no special chars — Maestro `inputText` mistypes them).
2. **Decide on history scrub.** Optional but recommended given public exposure. `git filter-repo` / BFG can purge the strings, then force-push — but this rewrites shared history and would disrupt the populator cron checkouts + any other clones, so it needs a coordinated window. Not done autonomously. If you skip it, rotation (step 1) is the essential mitigation.

---

## Fixed in this pass

- **CI log-leak (defense-in-depth).** Maestro echoes `inputText` values into `$LOGS/*.log`, which the workflow uploads as a **public artifact** (GH masks secrets in the live console but NOT inside artifact files). `scripts/run-parity-test.sh` now scrubs the login password **and email** env values from the logs before upload (`371d33a`).
- **H-1 reuse-mode fail-open** (`371d33a`). In reuse mode the suite derives expected values from the reused visit's own run id, so a silently-failed Phase-2 Maestro flow could stale-pass off prior-run data. `FLOW_GUARDED` now ANDs each mobile→web check (3a/3b/3c/3e) with its flow's exit code (reuse mode only, to avoid false-FAILs on fresh runs). The exit codes were already captured in `parity-flow-status.json`.

## Audited clean (no action)

- **No other secrets committed.** Repo-wide scan (JWTs, `ghp_`/`github_pat_`, AWS keys, Slack tokens, connection strings, inline passwords) found only fake negative-test literals in `scripts/qa-auth-*-evidence.mjs`. `fixtures.dev.json` holds only non-secret reference UUIDs. `hydrocert-tokens.csv` is a domain reference table (visit-frequency tokens M/Q/H/A), not auth tokens. All real creds come from `process.env`/GH secrets. `parity-context.json`/`summary.json`/`report.html` are gitignored.
- **CI workflow.** `permissions: contents: read` is minimal and correct. No command injection — `github.event.inputs.visit_ref`/`github.run_id` are passed via `env:` (not inline-expanded into `run:`); the inline `node -e` interpolations are only internal PASS/FAIL strings + exit-code integers. `VISIT_REF` reaches scripts via `process.env` only and must exact-match a real visit or throw. No `set -x`, no secret echo.
- **Artifact leakage.** Upload glob (`qa-artifacts/parity/**`, `summary.json`, `report.html`) contains only `PARITY-<runid>`-tagged synthetic test data + visit refs; `parity-context.json` is not uploaded; report HTML-escapes `<`. Residual (low): failed-login screenshots could render the login *email* (password field is masked) — accepted given the email is low-sensitivity; revisit if desired.
- **Lab-submission guardrail.** No code path transmits to Normec/ALS. The suite only `POST`s `/visits`/`/inspections`/`/actions` and `PATCH`es visit/inspection fields; verify is GET-only. No "Submit Samples" / `collectionStatus=collected` / `/laboratory-samples` write. (The only "Submit" in flows is the in-app signature dialog.) Wave D (when built) must preserve this — add + read-back only, never submit.
- **Gate fails closed.** Missing `summary.json` → gate `exit 1`; missing expected checks → synthetic FAIL; `gateFailed` turns the job red on hard failures (excludes only the documented KNOWN_FLAKY allowlist). Covered by unit tests.

## Standing guardrails for future work on this suite
- Never commit credentials — reference GH secrets / Obsidian `credentials.md`.
- Never transmit real data to Normec/ALS (Wave D hard exclusion).
- Keep product repos (FE/BE/mobile) read-only; all work in Hydro-QA; dev only.
