# Hydrocert Inspection Populator — Autonomous Refactor (Design Spec)

**Date:** 2026-05-22
**Owner:** Bogdan
**Status:** Draft (awaiting user review)

## Goal

Replace the current rules-based populator (150-line prompt with mechanical rules per jobType) with a **reasoning-first autonomous system** that thinks based on Kayle's signed-off CSV (111 tokens). Add multi-agent review + self-correction loop + free git-based audit/rollback.

## Why

Current populator has 150 lines of rules in the prompt. Every new edge case adds rules → contradictions emerge → bugs. Examples from past month:
- V186736: dual-default rule on Domestic Resample → 14 wrong Potable/Domestic on Legionella resamples
- V170831 (today): default "Chem Basic + Bsria on every CS inspection" → 3 Bsria when notes called for 2
- V163532 (today): regex on itemLocation re-applied Legionella that didn't belong

Claude IS reasoning, but the prompt forces mechanical rule execution. The architecture needs to flip: **Claude reasons from source-of-truth (Kayle CSV) FIRST; rules are last-resort fallback for ambiguous edge cases only.**

## Architecture

```
GH Actions cron 03:00 UTC daily (replaces current claude-populator.yml)
    ↓
ORCHESTRATOR (1 Claude session via anthropics/claude-code-base-action@beta)
  │
  ├─ Phase 0: Pre-flight
  │     - Auth Hydrocert dev API (abort if 401)
  │     - GET /sample-types (validate non-empty)
  │     - Load hydrocert-tokens.csv (Kayle source of truth)
  │     - Lock file check (abort if concurrent run)
  │     - Visit-count guard (abort if >200 = import storm)
  │
  ├─ Phase 1: Discovery
  │     - List visits last 3 days + carry-forward unresolved from yesterday
  │     - Filter: status != complete, max(inspection.createdAt) >= 2026-04-15T10:29:25Z
  │     - Split into 5 batches (~8 each)
  │
  ├─ Phase 2: Workers (5 parallel sub-Task agents)
  │     Each worker:
  │       a. Read batch JSON + Kayle CSV + sample-types catalog + few-shot examples
  │       b. Per visit: read notes RAW first, then consult CSV/catalog
  │       c. Build a structured PLAN (e.g., "RAC inspection → Chem Basic+Glycol; CHW → Chem Basic; 2 Bsria across RAC+CHW")
  │       d. Validate plan vs notes sum (e.g., notes say 2 Bsria → plan must have exactly 2)
  │       e. Confidence label per decision (HIGH / MED / LOW)
  │       f. Execute plan: PATCH /inspections + write audit log entry
  │       g. Mark unresolved with reasonClass for cases that don't have clear notes signal
  │       h. Write worker-N-report.json
  │
  ├─ Phase 3: Super-Manager (1 sub-Task agent)
  │     - Read all 5 worker reports + Kayle CSV + raw notes
  │     - Verify each patched inspection: sample matches notes intent per CSV?
  │     - Cross-check: total samples PATCHed vs total samples called for in notes (catches over-allocation)
  │     - Build manager-report.json with: errors[], lowConfidenceReview[], approvedPatches[]
  │
  ├─ Phase 4: Fix loop (max 3 iterations total)
  │     If manager.errors.length > 0:
  │       - Re-dispatch worker(s) with specific corrections requested
  │       - Worker executes DELETE-first: DELETE wrong sampleId → PATCH correct sample
  │       - Both ops logged to audit JSONL
  │       - Re-run manager verification
  │     Loop until 0 errors OR 3 iterations exhausted
  │     Remaining errors at max → escalate to GitHub Issue [ATTN]
  │
  ├─ Phase 5: Reporting
  │     - Commit claude-populator-runs/YYYY-MM-DD-actions.jsonl (audit log)
  │     - Commit claude-populator-runs/YYYY-MM-DD-report.md (human summary)
  │     - Open GitHub Issue: patched / unresolved / fixed-in-loop / escalated
  │     - Update past-resolution memory file with any human-confirmed fixes
  │     - Delete lock file
```

## Components

### 1. Kayle CSV (source of truth)
- **Source**: `C:\Users\Coca-Cola\Downloads\hydrocert_token_review_2026-05-06 (2).csv` (111 tokens)
- **Repo location**: `Hydro-QA-work/hydrocert-tokens.csv` (versioned)
- **Format**: Category, Token, Meaning, Hydrocert Job Type, How to handle, Example, Confidence, Confirmed, Comment
- **Update process**: Kayle releases new version → user replaces file in repo → commit (workflow auto-picks up next run)

### 2. Worker Agent (5 parallel, identical role)
- **Inputs**: assigned batch JSON, Kayle CSV, sample-types catalog, few-shot examples
- **Authority**: PATCH /inspections (add samples), DELETE /laboratory-samples (only when manager requests fix)
- **Output**: `worker-N-report.json` with per-inspection decision + reasoning + confidence
- **NEVER**: modify visits, inspections, jobTypes, notes, itemLocation, or anything other than `laboratorySamples`

### 3. Super-Manager Agent (1)
- **Inputs**: all 5 worker reports + Kayle CSV + raw notes
- **Authority**: NONE directly. Instructs workers to fix.
- **Output**: `manager-report.json` listing errors (with specific worker + correction needed), lowConfidence patches for human review, approvedPatches
- **Logic**: cross-check vs notes, validate sample-budget (totals), catch over-allocation, verify booker-encoded labels were respected

### 4. Orchestrator (workflow YAML + Node bootstrap)
- **GH Actions workflow**: `Hydro-QA-work/.github/workflows/claude-populator.yml` (rewritten)
- **Bootstrap script**: `scripts/populator-bootstrap.mjs` — pre-flight + discovery + batching
- **Executor**: `scripts/populator-executor.mjs` — deterministic PATCH/DELETE with audit log writing

### 5. Audit Log (append-only JSONL per run)
- **File**: `claude-populator-runs/YYYY-MM-DD-actions.jsonl`
- **Schema per line**:
  ```json
  {"ts": "...", "action": "PATCH|DELETE", "visitRef": "V123", "visitUuid": "...", "inspectionId": "...", "before": {...}, "after": {...}, "reasoning": "...", "confidence": "HIGH"}
  ```
- **Committed** to git after each run (versioned, free, auditable)

### 6. Rollback Workflow (separate)
- **File**: `Hydro-QA-work/.github/workflows/claude-populator-rollback.yml`
- **Trigger**: `workflow_dispatch` with input `target_date: YYYY-MM-DD`
- **Logic**:
  1. Read `claude-populator-runs/{target_date}-actions.jsonl`
  2. For each entry in REVERSE order:
     - PATCH (sample added) → DELETE that sample, but ONLY if current state matches what we wrote (engineer didn't modify)
     - DELETE (sample removed) → PATCH that sample back
  3. Write `claude-populator-runs/{target_date}-rollback-report.md`
  4. Open Issue with rollback summary

### 7. Past-Resolution Memory (auto-learning loop)
- **File**: `Hydro-QA-work/docs/populator/past-resolutions.jsonl`
- **Content**: human-confirmed fixes from prior runs (notes + correct samples + reasoning)
- **Used by**: worker agents — read this as few-shot examples in addition to baseline examples
- **Updated by**: orchestrator when user/Kayle resolves a previously-unresolved case

## Decision Rules (priority order)

For each empty inspection in a visit:
1. **Read notes raw** (booker's intent in their words)
2. **Consult Kayle CSV** to decode tokens ("LP" → Legionella, "Micro" → Potable/Domestic, etc.)
3. **Booker-encoded itemLocation** is PRIMARY signal when present (e.g., `LP Sample 3`, `WF Monthly`, `Well Sample 1`, `H - Micro Sample 2`)
4. **Reason holistically** about visit-wide sample budget — what total does notes call for? How does it map to existing inspections?
5. **Plan-then-validate**: build full visit plan, sum-check against notes, only then execute
6. **Last-resort fallback rules** (5-10 only, NOT 150) for truly ambiguous cases — e.g., "If notes mention CHEM BASIC + GLYCOL but catalog lacks the variant, use Chem Basic and log gap"

If still ambiguous → mark **unresolved** with specific reasonClass. Better unresolved than wrong.

## Reason Classes (taxonomy)

Workers tag every non-success decision with one of:
- `unresolved_no_notes` — notes empty/null
- `unresolved_resample_no_notes` — Domestic Resample without resample intent
- `unresolved_slot_count_mismatch` — notes call for more samples than placeholders exist
- `unresolved_chem_on_ds_jobtype` — chem analytics on Domestic Sample (jobType mismatch)
- `unresolved_catalog_gap` — sample type not in catalog AND no safe fallback
- `unresolved_unknown_jobtype` — jobType not in routing rules nor skip list
- `unresolved_ambiguous_intent` — notes too vague to map confidently
- `unresolved_other` — escape hatch with mandatory free-text reason

Watchdog aggregates these over 7 days; same class hits 3+ days → escalate `[WATCHDOG-DRIFT]` Issue.

## Confidence Levels per Patch

- **HIGH**: notes explicit + booker-encoded label match + CSV token exact match
- **MED**: notes explicit but no booker label, OR CSV token via fuzzy semantic match
- **LOW**: notes imply but require inference; flag for human review

End-of-run Issue separates HIGH/MED/LOW. User reviews only LOW (5-10 typically, not 150+).

## Constraints (hard rules)

- **DEV ONLY** — multiple guards: env var, prompt assertion, hostname check. NEVER touch prod (hydrocert-prod-api.azurewebsites.net).
- **ONLY samples** — `laboratorySamples` is the ONLY field modified. Visits, inspections, notes, itemLocation, jobTypes, anything else: read-only.
- **No inspection → SKIP** — never create inspections; never modify their metadata.
- **Notes empty → unresolved** — never invent samples from itemLocation alone (booker-encoded labels exception applies).
- **Idempotent** — `laboratorySamples.length > 0` → skip (unless manager explicitly requests fix via DELETE+PATCH).
- **Pre-sync cutoff** — skip visits where max(inspection.createdAt) < 2026-04-15T10:29:25Z.
- **No PATCH on complete visits** — `visitStatus === complete` → skip.

## Loop Termination

- **Stop condition**: 0 errors at manager check OR 3 iterations completed
- **At max iterations with errors remaining**: escalate to GitHub Issue with `[ATTN]` prefix listing exact corrections needed (so user/Kayle can resolve manually)

## Trigger

- **Daily cron**: `0 3 * * *` UTC (replaces current populator)
- **Manual**: `workflow_dispatch` with optional `dry_run: true` (no PATCH, just simulation)

## Failure Modes & Recovery

| Failure | Handling |
|---|---|
| Worker subagent crashes | Orchestrator retries once → if fails, mark batch escalated, continue with other batches |
| Manager crashes | Retry once → if fails, abort + `[ATTN]` Issue |
| API 5xx | Exponential backoff (500ms, 1s, 2s) — 3 attempts |
| API 4xx | Log + skip that specific inspection (don't fail run) |
| API 429 | Respect Retry-After header |
| OAuth token 401 | Abort immediately + `[AUTH-EXPIRED]` Issue with runbook URL |
| Wall-clock > 45 min | Dump state + exit + `[ATTN-TIMEOUT]` Issue |
| 3 consecutive 5xx | Abort + `[ATTN-API-DOWN]` Issue |
| Lock file present | Abort (concurrent run already executing) |
| Visit count > 200 | Abort + require manual `workflow_dispatch` (import storm guard) |

## Files Created/Modified

- **NEW** `Hydro-QA-work/hydrocert-tokens.csv` (copy from Downloads, versioned)
- **REWRITE** `Hydro-QA-work/.github/workflows/claude-populator.yml`
- **NEW** `Hydro-QA-work/.github/workflows/claude-populator-rollback.yml`
- **KEEP** `Hydro-QA-work/.github/workflows/claude-populator-watchdog.yml` (still useful for L2)
- **NEW** `Hydro-QA-work/scripts/populator-bootstrap.mjs`
- **NEW** `Hydro-QA-work/scripts/populator-executor.mjs`
- **NEW** `Hydro-QA-work/scripts/populator-rollback.mjs`
- **NEW** `Hydro-QA-work/docs/populator/few-shot-examples.md` (10-15 real cases from past month)
- **NEW** `Hydro-QA-work/docs/populator/past-resolutions.jsonl` (auto-grown)
- **NEW** `Hydro-QA-work/claude-populator-runs/` (audit logs directory)

## Testing & Validation

- **Dry-run mode**: `workflow_dispatch` with `dry_run: true` → no API writes, just simulation + report
- **Regression baseline**: 10 visits with known-correct samples (from today's 162 verified patches); v2 must reproduce same decisions
- **Acceptance criteria**: accuracy ≥ 95% on baseline + 0 over-allocation events on Closed System (V170831 type bug)

## Migration Plan (from current v1)

1. Build v2 alongside v1 (call it `claude-populator-v2.yml` initially)
2. Run v2 in dry-run mode 3 days → manual review of plans
3. Run v2 live 1 week with v1 disabled
4. If accuracy ≥ 95% on spot-checks → archive v1, promote v2 to `claude-populator.yml`
5. Update memory `project_hydrocert_claude_populator_routine.md`

## Out of Scope (explicit)

- Audit/correction of HISTORICAL patches (pre-2026-05-22). Only this-run patches verified per loop. Historical cleanup is a separate exercise.
- Booker-side improvements (filling missing notes). Out of populator's control.
- Catalog additions to Hydrocert (Lead, Dissolved Oxygen variant, etc.). Coordinated with Kayle/Calin separately.
- ServiceTracker sync issues (duplicates, deletes). Calin's domain.
- Prod deployment. Dev only until user explicitly approves prod migration.

## Decisions (approved 2026-05-22)

1. **Few-shot example count**: 10-15 examples in prompt (curated from past month's successful patches). Token budget acceptable.
2. **LOW confidence patches**: still PATCH automatically (with HIGH/MED/LOW flag in audit log + Issue body). End-of-run Issue lists LOW separately so user reviews only those. Reasoning: don't block 95% of correct work on uncertainty about 5%; active learning loop turns LOW-reviewed cases into future HIGH-confidence patterns.
3. **Past-resolution memory format**: JSONL in repo (`docs/populator/past-resolutions.jsonl`). Versioned, free, simple to grep, easy for workers to load.
