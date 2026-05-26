## How to read this report — who acts on what

| Category / reasonClass | What it means | Action by |
|---|---|---|
| **Patched** | Sample assigned successfully (notes explicit or booker-labeled slot) | — (done) |
| **Skipped (SKIP-OVERRIDE)** | Visual inspection, temperature reading, on-site test, or action job — no lab sample needed | — (by design) |
| **unresolved_no_notes** | Booker left visit notes blank — populator can't decide what sample to assign | **Booker** |
| **unresolved_unknown_jobtype** | Inspection has no jobType set (booker forgot to pick "Domestic Sample" / "Closed System" etc.) | **Booker** |
| **unresolved_resample_no_notes** | Resample visit but notes don't specify which sample type to retake | **Booker** |
| **unresolved_slot_count_mismatch** | Booker created wrong number of inspection slots vs notes call (e.g. notes ask 6 samples, only 4 slots created) | **Booker** |
| **unresolved_catalog_gap** | Sample type missing in Hydrocert catalog (e.g. "Pool Micro", "Lead") | **Calin / Kayle** (add to catalog) |
| **unresolved_chem_on_ds_jobtype** | Notes ask chem analytics on a Domestic Sample slot — jobType mismatch | **Booker** (correct jobType) |
| **unresolved_ambiguous_intent** | Notes too vague to map confidently | **Booker** (clarify notes) |
| **Manager-rolled-back** | Worker tried wrong sample initially, manager auto-deleted in fix-loop | — (system handled) |

**Bottom line**: most unresolved cases need booker input (notes, jobType selection, resample clarification). Catalog gaps need Calin/Kayle to add the missing sample type. The system itself stays conservative — better unresolved than wrong.
