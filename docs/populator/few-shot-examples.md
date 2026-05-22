# Few-Shot Examples for Populator

These are real visits processed correctly today (2026-05-22). Workers use them as in-context examples for similar future cases.

## Example 1: Booker-encoded labels (LP/Micro slots)

**Visit:** V155827 — Chesterford Research Park
**Notes:** "May - H - 3pts - DS - 6 x Micro and 6 x LP"
**Inspections (12):**
- 6× Domestic Resample with itemLocation `H - LP Sample 1..6` → Legionella (booker label = primary signal)
- 6× Domestic Resample with itemLocation `H - Micro Sample 1..6` → Potable/Domestic (booker label = primary signal)

**Reasoning:** Booker pre-encoded sample type in itemLocation. Trust the label; notes match (6 LP + 6 Micro = 12 slots).

## Example 2: One-off Legionella resampling (notes explicit)

**Visit:** V186195 — 150 Cheapside (Cooling Tower)
**Notes:** "Evaporative Cooling Legionella Samples ... 6 X LP - (Suite = LPFILTERED)"
**Inspections (6):** All Domestic Sample with generic `Sample Location` → All 6 Legionella

**Reasoning:** Notes explicitly say "6 X LP". Generic itemLocation gives no per-slot detail. All 6 → Legionella.

## Example 3: Domestic Resample with LP-only intent

**Visit:** V185901 — 100 Marylebone
**Notes:** "Legionella Resamples ... 4 X LP - (Suite = LPFILTERED)"
**Inspections (4):** All Domestic Resample with generic `Sample Location` → All 4 Legionella

**Reasoning:** Resample rule. Notes say LP only (no Micro mention). All → Legionella. DO NOT default to dual.

## Example 4: Water Feature schedule

**Visit:** V157265 — 21 Manresa Road
**Notes:** "Water Feature Schedule / May - Q - 2pts - WF on-site testing, 1 x WF Monthly and 1 x LP"
**Inspections (3):**
- Domestic Sample / `WF Monthly` → Water Feature Micro
- Domestic Sample / `WF - Legionella` → Legionella
- Water feature - On site chem testing form / `WF On-site testing` → SKIP (no lab sample)

**Reasoning:** Booker-encoded WF labels distinguish micro vs legionella. On-site form = skip.

## Example 5: Multi-month visit with index allocation

**Visit:** V155013 — LBC 4 More London
**Notes:** "May - H - 3pts - 6 x Micro and 6 x LP"
**Inspections (12):** All Domestic Sample with generic `Sample Location`
- First 6 by inspectionRef order → Potable/Domestic (Micro listed first in notes)
- Next 6 → Legionella

**Reasoning:** Notes total: 6+6=12 = exact slot count. Allocate by index when notes order is given. Engineer maps to physical outlets on-site.

## Example 6: Cooling tower resample one-off

**Visit:** V186195 (variant) — 150 Cheapside
**Notes:** "6 X LP - (Suite = LPFILTERED)"
**Inspections (6):** All → Legionella

**Reasoning:** One-off resample, single-type intent.

## Example 7: Notes empty → unresolved (no booker label)

**Visit:** VN012086 — 2 South Audley Street
**Notes:** null
**Inspections (1):** Domestic Sample / `POOL 1` (no booker-encoded type token)
**Decision:** unresolved_no_notes

**Reasoning:** Notes null + itemLocation `POOL 1` is location only, no sample-type signal. Cannot decide without booker input.

## Example 8: Domestic Resample without resample intent

**Visit:** V147219 — Tower Bridge House
**Notes:** describes regular quarterly DS schedule, no "resample" mention
**Inspections (3):** Domestic Resample / `Resample Location` (generic)
**Decision:** unresolved_resample_no_notes

**Reasoning:** Resamples are one-off. Notes describe regular schedule, not a resample. No resample intent → unresolved. Annual schedule from sibling visits is IRRELEVANT for resamples.

## Example 9: Slot count mismatch

**Visit:** V154425
**Notes:** "14 DS samples (4 Micro + 7 LP + 3 GREY)" but visit has only 4 DS placeholder inspections
**Decision:** All 4 inspections → unresolved_slot_count_mismatch

**Reasoning:** Booker called for 14 samples but only created 4 slots. Cannot safely allocate partial. Booker must add 10 more inspections.

## Example 10: Closed System with budget enforcement (LESSON FROM V170831 BUG)

**Visit:** V170831 — Hutchison House
**Notes:** "May - H - 3pts - DS – 4 x micro, 4 x LP, CS - 1x CHEM BASIC+GLYCOL from RAC 1, 1x CHEM BASIC from CHW, 2 x BSRIA BACTI"
**Inspections (3 CS + 8 DS):**

Closed System (3 inspections):
- RAC system → Chem Basic+Glycol (or Chem Basic fallback if catalog lacks variant; log catalogGap)
- (empty itemLocation) → Bsria Bacti only (2nd Bsria of the 2 budgeted)
- CHW → Chem Basic + Bsria Bacti (1st Bsria of the 2 budgeted)

Domestic Sample (8 inspections):
- First 4 (by inspectionRef) → Potable/Domestic (4 x micro)
- Last 4 → Legionella (4 x LP)

**Reasoning:** CRITICAL — sample-budget reconciliation. Notes call for exactly 2 BSRIA total, not "1 per CS inspection". Plan must sum to budget. Allocate first, validate sum equals notes budget, then execute. If budget exhausted, mark remaining unresolved.
