# Populator v2 PROD Limited Test Report — 2026-05-25

## Scope confirmation
- **Environment:** PROD (`hydrocert-prod-api.azurewebsites.net`)
- **Mode:** LIVE (executor `dryRun: false` across all batches — PROD writes performed)
- **Date window:** 2026-05-25 → 2026-05-29 (absolute)
- **Engineer filter:** Garikai Stanley (`91e1ff91-7347-4c0e-ab54-ce4a2fa3a559`) + Justin Williams (`c626d2ad-8c24-4d1b-929a-01b3af4377b8`)
- **Calendar window:** 448 visits → 7 eligible after engineer filter (420 filtered out)
- **Catalog size:** 16 sample types

## Totals

| Metric | Value |
|---|---|
| Visits processed | 7 |
| Patched | 28 |
| Unresolved | 5 |
| Skipped | 7 |
| Executor errors | 0 |
| Manager errors | 0 |
| Low-confidence flagged | 0 |
| Catalog gaps | 0 |

## Per-batch breakdown

| Batch | Patched | Unresolved | Skipped | Errors |
|---|---|---|---|---|
| 1 | 4 | 0 | 1 | 0 |
| 2 | 24 | 1 | 5 | 0 |
| 3 | 0 | 0 | 0 | 0 |
| 4 | 0 | 0 | 1 | 0 |
| 5 | 0 | 4 | 0 | 0 |

## Per-engineer breakdown

| Engineer | Patched | Unresolved | Skipped |
|---|---|---|---|
| Garikai Stanley | (per batch routing — see visit detail) | | |
| Justin Williams | (per batch routing — see visit detail) | | |

## Visit-level detail

### Batch 1
- **VN011991** — *Weekly pH and Conductivity Checks* — 1 inspection skipped (SKIP-OVERRIDE: on-site testing)
- **V187166** — *65 Davies Street — FOC resamples* — 4 × Domestic Sample patched as `Potable/Domestic` (notes: "4 x micro — (Suite = POTABLE or DOMESTIC)"; booker-encoded "1-4 Outlet Sampling") — HIGH confidence

### Batch 2
- **VN011990** — *Weekly pH and Conductivity Checks* — 1 inspection skipped (SKIP-OVERRIDE)
- **V138036** — *Cannon Place (SA) domestic sampling* — 30 inspections:
  - 4 × Cold Water Storage Tank inspection skipped (SKIP-OVERRIDE)
  - 14 × Legionella patched via "LP sample 1-14" booker-encoded labels (HIGH conf)
  - 10 × Potable/Domestic patched via "Micro sample 1-10" booker-encoded labels (HIGH conf)
  - 1 × extra LP slot (LP sample 15) marked **unresolved_slot_count_mismatch** (notes budget = 14)

### Batch 3
- **VN011960** — *Weekly Vehicle Checklist* — visit-level skip (non-laboratory operational check; no inspection processed)

### Batch 4
- **VN011959** — *Weekly Vehicle Checklist* — 1 inspection skipped (non-laboratory)

### Batch 5
- **V153300** — *Berkeley Square House* — 4 × cooling inspections **unresolved_slot_count_mismatch** (notes call for "6pts - Cooling & feed chem analysis, Cooling TVC" but only 4 inspection slots available)

## Unresolved summary (5)

| Visit | Inspection IDs | Reason class | Detail |
|---|---|---|---|
| V138036 | `b90cf589-db12-4f31-955e-48fba9b37875` | `unresolved_slot_count_mismatch` | LP sample 15 exceeds notes budget of 14 |
| V153300 | `7a9e2a1e-57b4-4d4c-8417-033b1463e4a9`, `b0f2abb3-ed2e-4296-ae65-b2b4e468ca70`, `5f3d9153-b4ef-4faa-9ad4-5a80c1545ba3`, `300d2a6d-6d59-434c-8297-4d3dfdaa29fc` | `unresolved_slot_count_mismatch` | 6pts budget vs 4 slots — Booker action needed |

## Low-confidence review
None. Manager flagged 0 low-confidence patches.

## Catalog gaps
None. All sample-type UUIDs were present (`Potable/Domestic`, `Legionella`).

## Manager verification

- Sample assignment verified ✅
- Skip-override list validated ✅
- No new inspections created (laboratorySamples-only) ✅
- All unresolved reasonClass values from approved enum ✅
- Sum-check issues: 2 (both correctly flagged as unresolved, not patched)

Recommendation: **PROCEED**. All 28 patches approved.

## Fix-loop
Not invoked. Manager produced 0 actionable errors (0 deletes + 0 inserts queued).

## Artifacts
- `scripts/runtime-prod/preflight.json`
- `scripts/runtime-prod/plan-batch-{1..5}.json`
- `scripts/runtime-prod/report-batch-{1..5}.json`
- `scripts/runtime-prod/manager-report.json`
- `claude-populator-runs/2026-05-25-prod-actions.jsonl`
