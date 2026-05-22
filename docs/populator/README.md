# Hydrocert Populator v2 (Autonomous, Reasoning-First)

## What it does
Daily at 03:00 UTC, looks at dev visits in the last 3 days that have empty laboratorySamples on at least one sample-requiring inspection, decides what samples to add by reasoning from Kayle's signed-off token CSV, applies them via PATCH, and verifies its own work in a self-correction loop.

## How to update Kayle's catalog
When Kayle releases a new token version:
1. Replace `hydrocert-tokens.csv` with the new file
2. Commit + push to main
3. Next 03:00 UTC run automatically picks it up

## How to rollback a bad run
1. GitHub → Actions → Claude Populator Rollback workflow
2. Click "Run workflow"
3. Enter `target_date: 2026-05-22` (or whatever day to revert)
4. Wait for completion
5. Rollback opens an Issue with summary

Rollback is safe: if engineer modified a sample after our PATCH, that one is skipped (not destroyed).

## How to dry-run
1. GitHub → Actions → Claude Populator v2
2. Run workflow → check `dry_run: true`
3. Plans are generated but no API writes happen

## Files in this directory
- `few-shot-examples.md` — curated past cases workers use as exemplars
- `past-resolutions.jsonl` — auto-grown memory of human-confirmed fixes (each line one resolution)
