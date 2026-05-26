# Populator v2 Run — 2026-05-26 (DEV)

## Summary

| Metric                     | Value |
|----------------------------|------:|
| API base                   | `hydrocert-dev-api-exajhpd0brg2bcar.ukwest-01.azurewebsites.net` |
| Window                     | 2026-05-23 → 2026-05-26 (3 days, UTC) |
| Visits processed           | 36 |
| Empty inspections reviewed | ~143 |
| Net PATCHes applied (live) | **1** |
| DELETEs (fix-loop rollbacks) | **4** |
| Unresolved (audit entries) | 47 |
| Skipped (SKIP-OVERRIDE)    | 95 |
| Errors                     | 0 |
| Fix-loop iterations used   | 1 of 3 |
| Manager final verdict      | **clean** |

## Unresolved by reasonClass

| reasonClass                       | count |
|-----------------------------------|------:|
| unresolved_no_notes               | 25 |
| unresolved_unknown_jobtype        | 19 |
| unresolved_catalog_gap            | 2 |
| unresolved_resample_no_notes      | 1 |

## Catalog gaps encountered

- **Pool Micro / Pool/Spa Micro** — Pool/Spa Micro/LP Only Sampling for Swimming Pool / Spa Pool at VN012458. No safe fallback (Potable/Domestic is unrelated). 2 inspections marked `unresolved_catalog_gap`.

## Live patches (1) — for human review

| Visit    | Inspection | jobType         | itemLocation   | Sample           | Confidence |
|----------|------------|-----------------|----------------|------------------|------------|
| VN012458 | IN026587   | Domestic Sample | Shower Sample  | Potable/Domestic | MED        |

> Notes were null for VN012458; decision based on booker-encoded itemLocation "Shower Sample" matching the Domestic Sample jobType. Manager-approved in iteration 1 audit.

## Fix-loop summary (iteration 1)

Initial worker run produced 7 manager-flagged issues. All resolved in iteration 1 with a delete-pass followed by a metadata-pass.

| Visit / Inspection             | Initial action by worker            | Manager correction                | Final state on server         |
|--------------------------------|-------------------------------------|-----------------------------------|-------------------------------|
| VN012677 / IN027526 (pH/Cond)  | PATCH Potable/Domestic (LOW) x2     | DELETE x2 + unresolved_unknown_jobtype | 0 samples, unresolved    |
| VN012458 / IN026586 (Swim Pool)| PATCH Potable/Domestic (MED)        | DELETE + unresolved_catalog_gap   | 0 samples, unresolved         |
| VN012458 / IN026589 (Spa Pool) | PATCH Potable/Domestic (MED)        | DELETE + unresolved_catalog_gap   | 0 samples, unresolved         |
| VN012674 / IN027523 (Vehicle)  | silent drop (no audit entry)        | unresolved_unknown_jobtype        | (no server change needed)     |
| VN013219 / IN030345 (Vehicle)  | silent drop                         | unresolved_unknown_jobtype        | (no server change needed)     |
| VN013347 / IN030993 / IN030994 | plan had stale samples + unresolved | none — already unresolved on server | (no server change needed)   |

## Consistency observations carried over

- **Vehicle Checklist** and **pH and Conductivity Checks** are auto-generated internal checks, not sampling jobTypes. Recommend adding both to SKIP-OVERRIDE list in the orchestrator prompt for the next run to prevent worker inconsistency.
- **Pool/Spa Micro/LP Only Sampling** is a real sampling jobType but the current 16-entry sample catalog lacks a Pool Micro / Pool/Spa Micro entry. Recommend Kayle add this to the catalog.
- Executor bug surfaced: when a plan decision has both `unresolved:true` AND `deleteSampleIds`, the executor short-circuits on unresolved and never runs DELETE. Worked around with a 2-pass (delete-pass + metadata-pass) approach. Consider re-ordering branches in `populator-executor.mjs:91-112` so DELETE runs before the unresolved short-circuit.

## Per-batch tables (initial run)

### Batch 1 — 8 visits (worker 1)

| visitRef  | patched | unresolved | skipped | notes                                                  |
|-----------|--------:|-----------:|--------:|--------------------------------------------------------|
| V187106   | 0 | 0  | 2  | Tank cleaning - CWST disinfection (skip-override)      |
| VN012424  | 0 | 0  | 3  | Temperature monitoring (skip-override)                 |
| VN012440  | 0 | 0  | 3  | Temperature monitoring (skip-override)                 |
| VN012460  | 0 | 0  | 3  | Temperature monitoring (skip-override)                 |
| VN012675  | 0 | 1  | 0  | Vehicle Checklist — unresolved_unknown_jobtype         |
| VN013221  | 0 | 1  | 0  | pH/Conductivity check — unresolved_unknown_jobtype     |
| VN012150  | 0 | 0  | 1  | CWST inspection (skip-override)                        |
| VN013482  | 0 | 24 | 26 | Large test visit, empty notes, mostly skip-override    |

### Batch 2 — 7 visits (worker 2)

| visitRef  | patched | unresolved | skipped | notes                                                  |
|-----------|--------:|-----------:|--------:|--------------------------------------------------------|
| VN012431  | 0 | 0 | 11 | All Outlet Temperature monitoring (skip-override)       |
| VN012426  | 0 | 0 |  3 | All Outlet Temperature monitoring (skip-override)       |
| VN012445  | 0 | 0 |  1 | Water feature on-site chem (skip-override)              |
| VN012463  | 0 | 0 |  6 | Calorifier temps + Outlet temps (skip-override)         |
| VN012676  | 0 | 1 |  0 | pH/Conductivity Checks — unresolved_unknown_jobtype     |
| VN012582  | 0 | 1 |  0 | Vehicle Checklist — unresolved_unknown_jobtype          |
| VN012152  | 0 | 0 |  1 | CWST visual inspection (skip-override)                  |

### Batch 3 — 7 visits (worker 3, then fix iter 1)

| visitRef  | initial patched | initial unresolved | skipped | final state (after fix) |
|-----------|----------------:|-------------------:|--------:|-------------------------|
| VN012407  | 0 | 0 | 6 | clean                                                    |
| VN013211  | 0 | 0 | 2 | clean                                                    |
| VN012478  | 0 | 5 | 0 | clean (unresolved_unknown_jobtype)                       |
| VN012486  | 0 | 0 | 2 | clean                                                    |
| VN012677  | 1 (LOW)  | 0 | 0 | **FIXED → 0 samples, unresolved_unknown_jobtype**        |
| VN012794  | 0 | 0 | 5 | clean                                                    |
| VN012153  | 0 | 0 | 1 | clean                                                    |

### Batch 4 — 7 visits (worker 4, then fix iter 1)

| visitRef  | initial patched | initial unresolved | skipped | final state (after fix) |
|-----------|----------------:|-------------------:|--------:|-------------------------|
| VN012419  | 0 | 0 | 3 | clean                                                    |
| VN012436  | 0 | 0 | 8 | clean                                                    |
| VN012458  | 3 (MED)  | 0 | 1 | **FIXED → 1 approved (Shower Sample) + 2 reverted to unresolved_catalog_gap (Pool/Spa)** |
| VN013218  | 0 | 1 | 0 | Vehicle Checklist — unresolved_unknown_jobtype           |
| VN013220  | 0 | 1 | 0 | pH/Conductivity Checks — unresolved_unknown_jobtype      |
| VN013012  | 0 | 0 | 3 | clean                                                    |
| VN013409  | 0 | 0 | 1 | clean                                                    |

### Batch 5 — 7 visits (worker 5, then fix iter 1)

| visitRef  | initial patched | initial unresolved | skipped | final state (after fix) |
|-----------|----------------:|-------------------:|--------:|-------------------------|
| VN012421  | 0 | 0 | 7 | clean                                                    |
| VN012442  | 0 | 0 | 4 | clean                                                    |
| VN012459  | 0 | 0 | 2 | clean                                                    |
| VN012674  | 0 | 0 | 0 | **FIXED → unresolved_unknown_jobtype (Vehicle Checklist)** |
| VN013219  | 0 | 0 | 0 | **FIXED → unresolved_unknown_jobtype (Vehicle Checklist)** |
| VN012791  | 0 | 0 | 2 | clean                                                    |
| VN013347  | 0 | 2 | 4 | clean (both unresolved_no_notes)                         |

## Files

- Audit log: `claude-populator-runs/2026-05-26-dev-actions.jsonl` (56 entries)
- Per-batch plans: `scripts/runtime-dev/plan-batch-{1..5}.json`
- Per-batch reports: `scripts/runtime-dev/report-batch-{1..5}.json`
- Manager report (final): `scripts/runtime-dev/manager-report.json` (verdict: clean)

## Recommended follow-ups for engineers

1. Add `Vehicle Checklist` and `pH and Conductivity Checks` to the SKIP-OVERRIDE list in the orchestrator prompt.
2. Add Pool Micro / Pool/Spa Micro to the sample-types catalog so Pool/Spa Micro/LP Only Sampling inspections at venues like VN012458 can be auto-populated.
3. Re-order branches in `scripts/populator-executor.mjs:91-112` so `deleteSampleIds` runs before the `unresolved` short-circuit (current ordering forces a 2-pass workaround).
4. Investigate worker 3's duplicate-PATCH on VN012677/IN027526 (PATCH was issued twice in the audit log).
