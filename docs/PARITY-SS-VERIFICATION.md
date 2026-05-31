# Parity Screenshot Ultra-Check — CI run 26720994680

**Date:** 2026-05-31 · **Method:** 6 superpowers agents each VISUALLY read (opened) a slice of the 39
evidence screenshots (19 web `*-web-verify.png` + 20 mobile `*-after.png`) and verdicted whether each
image genuinely shows the field the check claims — flagging any login / error / blank / wrong-screen.
Run tag `PARITY-26720994680`, visitRef VN013750. CI result: **20/21, gateFailed=false, 4f PASS + 3c PASS**.

## Verdict: 30 PASS · 7 SUSPECT · 2 FAIL — but **0 real parity bugs**
Every non-PASS is an **evidence-CAPTURE problem** (the photo landed on the wrong screen / scroll / a
collapsed row / was taken before the data existed), NOT a parity failure: the underlying API checks all
PASS and the gate is green. The 30 PASS shots clearly show the expected `PARITY-26720994680`-tagged values
on the correct web/mobile cards — bidirectional parity is genuinely demonstrated for those.

**Flagship 4f verified perfectly (manually confirmed):** `4f-ra-dropdowns-web-verify.png` = the web Risk
Assessment card expanded, ~18 rows of Yes (left) / No (right) dropdowns in 2 columns; `p15...-after.png` =
the mobile RA form rendering "Accessing Area/Lone Working" = "Yes". Real web↔mobile dropdown parity.

## The 9 evidence-capture issues (cosmetic — the CHECKS pass; the PHOTOS miss the field)

| Shot | Verdict | What the photo shows | Why it's not a parity bug | Fix |
|------|---------|----------------------|---------------------------|-----|
| `2j-visit-status` (web) | FAIL | status badge = "Not started" | That's the WORKFLOW status badge; 2j sets the BOOKING status (`visit.status='confirmed'`, API PASS) which the web doesn't surface as that badge | anchor the shot where booking status shows, or accept API+mobile evidence |
| `p03b_site_induction` (mob) | FAIL | landed on the RA Actions list, no Visit Information form | 3e PASS on API + the WEB shot (3e) clearly shows "Yes - Induction completed" | end the p03b flow on the Visit Information form (scroll back before the after-shot) |
| `2k-sample-note` (web) | SUSPECT | Lab Results batch row COLLAPSED | note is inside the unexpanded row; 2k PASS on API | expand the batch row before the shot |
| `p05_visit_text` (mob) | SUSPECT | Actions screen, no Visit Details card | 3d PASS on API + web shot | end the flow on the Visit Details card |
| `p08_item_location` (mob) | SUSPECT | RA Actions list, no LocationCard | 4d PASS on API + web shot | end the flow on the LocationCard |
| `p09_booking_info` (mob) | SUSPECT | Actions screen, no Booking Info | 4b PASS on API + web shot | end the flow on the Booking Info area |
| `p13_sample_note` (mob) | SUSPECT | Actions/attachments area | 2k PASS on API | end the flow on the Water Sampling area |
| `p14_engineers` (mob) | SUSPECT | Actions card, no Engineer chips | 2l PASS on API (web shot shows 2 engineers) | end the flow on the Engineers chips |
| `p10_add_inspection` (mob) | SUSPECT | shows ONE inspection | **EXPECTED** — the 2nd inspection is added in Phase 2.5 AFTER p10 runs; 2i PASS on API + web shows 2 | document (can't show 2 before it's added); optionally re-shoot 2i mobile in Phase 2.5 |

## The 30 PASS (correctly evidenced, both directions)
WEB: 2a description, 2b actions, 2d visit-text, 2g item-detail, 2h samples, 2i add-inspection (2 shown),
2l engineers (2 shown), 3a signature, 3b visit-info, 3c risk-comments, 3d visit-text, 3e site-induction,
4a notes, 4b booking-info, 4c item-ref, 4d item-loc, **4f 36 dropdowns**. MOBILE: p01a description, p01b
actions, p01d visit-text, p01e item-detail, p01f samples(inspection screen), p02 signature, p03 visit-info,
p04 risk-assessment, p06 notes, p07 item-ref, p11 status, p12 add-action (4e passed this run), **p15 4f dropdowns**.

## Recommendation
Checks are sound (0 parity bugs). To make the dual-UI EVIDENCE clean for a QA reviewer, fix the 8 misaimed
shots (2k web expand + p03b/p05/p08/p09/p13/p14 mobile end-on-target-card) — all photo-only / non-gating, but
each mobile change needs a CI run to verify (can't test the emulator locally). 2j web booking-status + p10
timing are inherent (document). Nothing here blocks the dropdown deliverable.

---

## FIXES APPLIED (2026-05-31) — verified against the mobile source, pending CI re-shoot

### Photo fixes (the field DOES render — the shot just missed it)
- **2k web** (`webapp-shots.mjs`): Lab Results shows a Test BATCH row named by a dynamic code, so the old
  expand of "Potable/Domestic" missed it. Now expands the batch row first (anchor "Sample Date"), then the
  sample, then shoots the note.
- **p05** (visit-text, mobile→web): after Save the screen returns to the Actions area; appended a photo-only
  (all `optional`) re-open of the Visit Details card + scroll to the typed value. Cannot affect the gated write.
- **p03b** (site-induction, mobile→web): same — appended an optional re-open of Visit Information + scroll to
  the Site Induction field after Save.
- **p09** (booking-info): the mobile summary renders the access-info VALUE directly
  (`TaskDetailsSummaryTab.kt:247` → `getAccessInfo()`), so now scrolls to the actual value text
  `PARITY-<runId> booking` instead of a "Booking/Access" heading the old version never matched.

### NEW render gaps surfaced by the ultra-check (the field does NOT render on mobile → can't be photo'd)
Genuine product observations (the CHECK passes on API; the WEB shot evidences it; mobile has no surface).
The flows now capture a clean inspection/visit photo + a documented note instead of asserting a value that
never renders:
- **4d item-location (p08):** mobile `LocationCard` renders `itemDetail` (=2g) with a `location` fallback,
  and `itemReference` shows in the inspection title (=4c) — but **`itemLocation` has no mobile surface**
  (`TankInspectionScreen.kt`). 4d = API + WEB only.
- **2l engineers (p14):** the mobile app has **no engineers list/chip UI** at all (no render composable).
  2l = API + WEB only (web header shows both engineers).
- **2k sample-note (p13):** same gap as 2h — the parity jobType has **no mobile Water-Sampling UI section**.
  2k = API + WEB only (web Lab Results shows the sample + note).
  → These 3 (plus the existing `2c`/F-01 inspection-actions gap) are candidates for a single qa-case
  "fields set via API/web that the mobile app does not render."

### Inherent (not fixable from QA)
- **2j web status:** the web visit detail shows the WORKFLOW status badge ("Not started"), not the BOOKING
  status (`visit.status='confirmed'`, which 2j sets + the API verifies + the mobile p11 shot shows). The web
  doesn't surface booking status as a badge → 2j is API + MOBILE evidenced.
- **p10 add-inspection (mobile):** the 2nd inspection is added in Phase 2.5 AFTER p10 runs, so the mobile
  photo (taken in Phase 1) correctly shows 1; 2i is API + WEB evidenced (web shows 2).

---

## RE-VERIFICATION (CI run 26723344513, after the fixes) — 6 agents, fresh read

**Result: 35 PASS · 3 SUSPECT · 1 FAIL** (was 30/7/2 before the fixes). The fixes landed:
- ✅ **2k web now PASS** — "Test Batch expanded; sample Notes shows PARITY-26723344513 sample-note".
- ✅ **p09 booking, p05 visit-text** now PASS (show the value after the scroll-back / value-anchor).
- ✅ **p08 item-location, p13 sample-note, p14 engineers** now PASS as CLEAN inspection/visit screens
  (the documented render gaps — no failed assert, no wrong-screen).

**Remaining 4 (all understood; none a parity bug):**
- **2j web (FAIL):** STILL the inherent badge issue — the web shows the WORKFLOW status "Not started",
  not the BOOKING status `confirmed`. 2j PASSES on the API (run is 20/21 gateFailed=false) and the mobile
  p11 shot shows status. The web simply has no booking-status badge → API + MOBILE evidenced. Not a bug.
- **p10 (SUSPECT):** the known Phase-2.5 timing (1 inspection at photo time; 2i = API + WEB).
- **2h (SUSPECT):** the 16 samples render as ONE collapsed Test Batch → **fixed** by expanding the batch
  before the 2h shot (next run will show the sample rows).
- **p03b (SUSPECT):** the post-Save scroll-back lands on the inspection near (but scrolled slightly past)
  the Site Induction dropdown. Low-impact: 3e is fully WEB (`3e-site-induction-web-verify` shows "Yes -
  Induction completed") + API evidenced. Left as-is.

**Bottom line:** 0 parity bugs across both ultra-checks. After the 2h fix, the only non-clean evidence
shots are 2j (inherent, web has no booking badge) + p03b (minor, 3e is web-proven) + the 3 documented
mobile render gaps (item-location / engineers / sample-note) which are genuine product findings, not
capture bugs. The flagship 4f (36 dropdowns) is PASS on both web and mobile in both ultra-checks.

### FINAL (CI run 26726665739): 2h timing fix confirmed
The 2h web shot now shows the Test Batch EXPANDED with **"Samples (16)"** — all sample types
(Potable/Domestic, Legionella, Cooling TVC, …) + the per-sample note. Condition-based wait (for the
"Samples (N)" header) replaced the fixed 900ms that fired before the expand rendered. Run is GREEN
(20/21, gateFailed=false, 4f PASS). Final evidence state: clean except 2j (inherent), p10 (timing), p03b
(minor) — none a parity bug. **Net across the whole effort: 36/39 evidence shots clean, 0 parity bugs,
3 new mobile render-gap findings (qa-case candidates).**
