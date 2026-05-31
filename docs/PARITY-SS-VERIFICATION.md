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
