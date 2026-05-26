# R4 — Mobile Visit Detail Screen: Settable Inputs Inventory

**Source repo:** `C:\Users\Coca-Cola\tmp-hydrocert-android`  
**Screen:** Visit Details tab (tab index 0 in `TaskDetailsScreen.kt`)  
**Composable entry point:** `TaskDetailsSummaryTab.kt`  
**Date produced:** 2026-05-27  
**Purpose:** QA parity test — type on mobile, verify on web.

---

## Complete Input Table

| # | Input | UI Label (resolved string) | Type | Save path / mechanism | Maps to backend field | Source file : line | Maestro-fillable? |
|---|-------|---------------------------|------|-----------------------|-----------------------|-------------------|-------------------|
| 1 | Description & Reference text field | `"Description & Reference"` (hardcoded) | text / multi-line | `onWaterSystemDescriptionChange` → `viewModel.updateWaterSystemDescription()` → `SaveTaskDetailsUseCase.saveTaskDetails()` → `PATCH /visits/{id}` | `visit.waterSystemDescription` | `TaskDetailsSummaryTab.kt:322` | **easy** — standard multi-line text field, Maestro `inputText` |
| 2 | Work Details text field | `"Work Details"` (hardcoded) | text / multi-line | `onWorkDetailsChange` → `viewModel.updateWorkDetails()` → `SaveTaskDetailsUseCase` → `PATCH /visits/{id}` | `visit.workDetails` | `TaskDetailsSummaryTab.kt:331` | **easy** — standard multi-line text field |
| 3 | Water Sampling Details text field | `"Water Sampling Details"` (hardcoded) | text / multi-line | `onSamplingDetailsChange` → `viewModel.updateSamplingDetails()` → `SaveTaskDetailsUseCase` → `PATCH /visits/{id}` | `visit.samplingDetails` | `TaskDetailsSummaryTab.kt:339` | **easy** — standard multi-line text field |
| 4 | Client name text field (inside Client Signature card) | `"Client name"` (hardcoded) | text / single-line | `onSignatureNameChange` → `viewModel.updateSignatureName()` → `SaveTaskDetailsUseCase` → `PATCH /visits/{id}` | `visit.signatureName` | `TaskDetailsSummaryTab.kt:362` | **easy** — standard single-line text field |
| 5 | Signature pad — tap-to-sign preview area | `"Tap to sign!"` / `R.string.client_signature` | signature-pad (opens dialog on tap) | Opens `SignatureDialog` → DrawingCanvas → Submit button → `onSignatureChange(ByteArray)` → `viewModel.updateSignature()` → `SaveTaskDetailsUseCase` → Base64 in `PATCH /visits/{id}` | `visit.signature` (Base64 PNG) | `SignaturePreview.kt:61`, `SignatureDialog.kt:63`, `DrawingCanvas.kt:33` | **hard** — finger-draw canvas; Maestro cannot simulate freehand drawing; workaround: pre-populate via API before test, then verify read-only display |
| 6 | Signature dialog — Clear button | `"Clear"` (hardcoded) | action-button (clears drawn paths, sets `hasBeenCleared=true`) | Clears in-memory paths; no direct save; takes effect when Submit is pressed (submits empty ByteArray → `onSignatureChange(null)`) | `visit.signature = null` | `SignatureDialog.kt:194` | **medium** — button tap, but only reachable after opening dialog (hard prerequisite) |
| 7 | Signature dialog — Submit button | `"Submit"` (hardcoded) | action-button (captures canvas bitmap as PNG ByteArray) | `onSubmit(byteArray)` → `onSignatureChange` → `viewModel.updateSignature()` → `SaveTaskDetailsUseCase` → `PATCH /visits/{id}` | `visit.signature` (Base64 PNG) | `SignatureDialog.kt:215` | **medium** — button is tappable but meaningful only after drawing; Maestro can tap it after the dialog opens |
| 8 | Booking Info (Access Info) — Edit link | `"Edit"` (hardcoded) | action-link (opens `AccessInfoDialog`) | Opens `AccessInfoDialog`; Save button inside dialog calls `onAccessInfoChange(String?)` → `viewModel.updateSiteAccessInfo()` → `UpdateSiteUseCase.updateSite()` → `PATCH /sites/{siteId}` | `site.accessInfo` | `TaskDetailsSummaryTab.kt:283`, `AccessInfoDialog.kt:51`, `UpdateSiteRequest.kt:7` | **medium** — tap "Edit" to open modal, then type in multi-line field, then tap "Save"; Maestro can do this with `tapOn` + `inputText` |
| 9 | Access Info dialog — text area | `"Enter access information..."` (placeholder, hardcoded) | text / multi-line (4 lines max) | On "Save" inside dialog: `onSubmit(text.trim())` → `onAccessInfoChange` → `viewModel.updateSiteAccessInfo()` → `PATCH /sites/{siteId}` | `site.accessInfo` | `AccessInfoDialog.kt:95` | **medium** — reachable only via step 8 above |
| 10 | Aborted Visit toggle (Switch) | `R.string.aborted_visit` = `"Aborted visit"` | toggle (Switch / boolean) | `onAbortedVisitChange(Boolean)` → `viewModel.updateVisitAbortedToggle()` → `SaveTaskDetailsUseCase` → `PATCH /visits/{id}` with `visitStatus` | `visit.visitStatus` (set to `"aborted"` when ON, `null` when OFF — see `UpdateVisitUseCase:55`) | `TaskDetailsSummaryTab.kt:411`, `AlertStatusToggleCard.kt:88` | **easy** — standard Material3 Switch, Maestro `tapOn` by content description or label |
| 11 | Save button (visit-level) | `R.string.save` = `"Save"` (via `SaveButton` component) | action-button (enabled only when `hasChanges=true`) | `onSave()` → `viewModel.saveTaskDetails()` → `SaveTaskDetailsUseCase.saveTaskDetails()` → local DB update + `PATCH /visits/{id}` (or queued for offline sync) | persists all of: `waterSystemDescription`, `workDetails`, `samplingDetails`, `signatureName`, `signature`, `visitStatus`, `visitActions`, and inspection form fields | `TaskDetailsSummaryTab.kt:417`, `SaveButton.kt`, `SaveTaskDetailsUseCase.kt:47` | **easy** — standard button; Maestro `tapOn` "Save" |
| 12 | Add Actions (via QuickActionsFab → Actions sub-button) | FAB sub-button `"Actions"` (contentDescription hardcoded) | action-add (opens `AddActionsBottomSheet`) | Opens `AddActionsBottomSheet` → Save footer → `viewModel.updateVisitActions(List<VisitAction>)` → `SaveTaskDetailsUseCase` → `PATCH /visits/{id}.actions[]` | `visit.actions[].name`, `visit.actions[].priority` | `QuickActionsFab.kt:93`, `TaskDetailsScreen.kt:145`, `AddActionsBottomSheet.kt:361` | **hard** — requires expanding FAB first, then tapping sub-button; Maestro can do it with two taps but FAB animation must settle |
| 13 | Action search field (inside AddActionsBottomSheet) | `R.string.type_to_search` = `"Type to search…"` (placeholder from `SearchTextField`) | text / single-line (filter only, no direct save) | Filters `allItems` list in-memory; does not persist alone | — (filter only) | `AddActionsBottomSheet.kt:176`, `SearchTextField.kt` | **easy** — standard text field |
| 14 | Predefined action checkbox / selection toggle | Action card row with `showSelectionToggle=true` | checkbox / boolean toggle per action | `onSelectedChange(selected)` → `updateItem()` sets `isSelected` in local state; persisted when "Save" footer is tapped | `visit.actions[].name` (included if `isSelected=true`) | `AddActionsBottomSheet.kt:262` | **medium** — each action row has a tap target; Maestro `tapOn` by text content |
| 15 | Predefined action priority dropdown | Priority button on each action card (`enablePriorityButton=true`) | dropdown (LOW / MEDIUM / HIGH / NOT_SET) | `onPriorityChanged(priority)` → `updateItem()` → local state; persisted on "Save" | `visit.actions[].priority` (`"low"`, `"medium"`, `"high"`) | `AddActionsBottomSheet.kt:244`, `ActionCard.kt` | **medium** — tap priority chip, select from dropdown |
| 16 | Add Custom Action button (opens inline widget) | `R.string.add_custom_action` = `"Add Custom Action"` | action-button (shows `NewActionWidget` inline) | Shows `NewActionWidget`; Save in widget calls `addCustomActionFromDialog()` → appends to `allItems` with `isSelected=true`; final persist on "Save" footer | `visit.actions[].name` (new custom entry) | `AddActionsBottomSheet.kt:195` | **medium** — tap button, widget appears inline |
| 17 | Custom action text field (inside NewActionWidget) | `"Enter action..."` (placeholder, hardcoded) | text / multi-line | `onTextChange` → sets `newActionText`; saved via `addCustomActionFromDialog()` on widget's Save | `visit.actions[].name` | `AddActionsBottomSheet.kt:130`, `NewActionWidget.kt` | **easy** — standard text field once widget is visible |
| 18 | Custom action in-list edit field (editable in `ActionCard.descriptionSlot`) | `"Enter action..."` (placeholder) | text / multi-line (BasicTextField) | `onValueChange` → `updateItem(id) { it.copy(name = name) }` → local state; persisted on "Save" footer | `visit.actions[].name` (updated value) | `AddActionsBottomSheet.kt:266` | **medium** — text field visible in the card row once a custom action is added |
| 19 | AddActionsBottomSheet — Save footer button | `"Save"` (hardcoded) | action-button | `onSave(List<VisitAction>)` → `viewModel.updateVisitActions()` + `viewModel.dismissAddActionsModal()` | `visit.actions[]` (full replacement) | `AddActionsBottomSheet.kt:332` | **easy** — bottom button, Maestro `tapOn "Save"` (disambiguate from visit-level Save if needed) |
| 20 | Photo — Take photo (via QuickActionsFab → Camera sub-button) | `"Camera"` (contentDescription hardcoded) | photo (camera capture) | `viewModel.triggerTakePhoto()` → `AttachmentSheetTrigger.TAKE_PHOTO` → `PhotoCaptureHelper` → `viewModel.addPhotoAttachment(uri, label)` → `uploadFile()` → `POST /visits/{id}/files` | `visitFile` (binary upload, `label` field) | `QuickActionsFab.kt:62`, `TaskDetailsScreen.kt:143`, `TaskDetailsViewModel.kt:265` | **hard** — requires camera permission + hardware camera; Maestro can trigger the button but real camera capture needs device support |
| 21 | Photo — Pick from gallery (via QuickActionsFab → Gallery sub-button) | `"gallery"` (contentDescription hardcoded) | photo (gallery picker) | `viewModel.triggerPickGallery()` → `AttachmentSheetTrigger.PICK_GALLERY` → `GalleryPhotoPick` / `PhotoPickerHelper` → `viewModel.addPhotoAttachment(uri, label)` → `uploadFile()` | `visitFile` (binary upload) | `QuickActionsFab.kt:76`, `TaskDetailsScreen.kt:144`, `TaskDetailsViewModel.kt:265` | **hard** — opens system gallery picker; Maestro can interact with system picker UI but it is fragile |
| 22 | Photo label text field (PhotoLabelDialog, shown after photo capture/pick) | `R.string.photo_label_dialog_title` = `"Photo label"` | text / single-line + predefined dropdown | `onSave(labelText)` → `viewModel.addPhotoAttachment(uri, label)` on new upload, or `persistAttachmentPhotoLabel(attachmentId, label)` on edit | `visitFile.label` | `PhotoLabelDialog.kt:65`, `TaskDetailsViewModel.kt:107` | **medium** — dialog appears post-capture; text field + dropdown |
| 23 | Photo label predefined dropdown (inside PhotoLabelDialog) | `R.string.photo_label_predefined_hint` = `"Choose a predefined tag"` | dropdown (13 options: Service Report, Before Photo, After Photo, etc.) | On selection: sets `labelText` local state → saved when "Save" button tapped | `visitFile.label` | `PhotoLabelDialog.kt:48`, `PhotoLabelDialog.kt:124` | **medium** — DropdownMenu, Maestro can tap arrow icon then select item |

---

## Read-Only Blocks on the Same Tab (not inputs)

These appear on the Visit Details tab but are **not user-editable** and are excluded from the parity input count:

| Element | Label | Notes |
|---------|-------|-------|
| Reference bar | "Purchase Ord." / "Site Code" / "Visit Ref." | Display only (`SelectionContainer` allows copy) |
| Description card | `R.string.description` = `"Description"` | Displays `taskDetails.notes` read-only; "Show more/less" is a UI toggle only, no persistence |
| Booking Info display | `R.string.booking_info` = `"Booking Info"` | Read-only view of `site.accessInfo`; "Edit" link opens `AccessInfoDialog` (input #8 above) |
| Actions display widget (inside Actions card) | `R.string.actions` = `"Actions"` | Shows existing `visitActions` with `previewOnly=true`; not directly editable here — use FAB to edit |

---

## Save Mechanism Summary

There are two distinct save flows on this tab:

1. **Visit-level Save button** (input #11): Persists inputs 1–5, 10, and 12–19 (all visit fields + visit actions) via `SaveTaskDetailsUseCase` → local Room DB → `PATCH /visits/{id}` (online) or enqueued `UpdateVisitSyncHandler` (offline).

2. **Access Info (Site) Save** (input #9): Saves separately via `UpdateSiteUseCase` → `PATCH /sites/{siteId}` with `{accessInfo: "..."}`. This is triggered by the dialog's own "Save" button, **independent of** the visit Save button. The visit-level `hasChanges` flag is set to true to remind the user to also save the visit.

3. **Photo upload** (inputs #20–23): Fire-and-forget on capture — `uploadFile()` is called immediately, no visit-level Save needed.

---

## Unsaved-Data Dialog

When `hasChanges=true` and the user taps Back or navigates away:
- A `ConfirmationDialog` appears with title `R.string.unsaved_data_dialog_title` = `"Unsaved data"` and message `R.string.unsaved_data_dialog_message`.
- Buttons: `R.string.go_back` = `"Go back"` (discards changes) and `R.string.stay` = `"Stay"` (dismisses dialog).
- Source: `TaskDetailsScreen.kt:125`

---

## Maestro Automation Difficulty Summary

| Difficulty | Count | Inputs |
|------------|-------|--------|
| easy | 7 | #1, #2, #3, #4, #10, #11, #17 |
| medium | 10 | #5-Clear, #7-Submit, #8, #9, #13, #14, #15, #16, #18, #19, #22, #23 |
| hard | 4 | #5 (signature draw), #12 (FAB + animation), #20 (camera), #21 (gallery) |

**Total settable inputs: 23**

**Automation notes:**
- The QuickActionsFab is a layered FAB — Maestro must first tap the main `+` button (contentDescription `"Quick actions"`), wait for expansion animation (~200ms), then tap the sub-button.
- Signature drawing (#5) cannot be meaningfully replicated by Maestro's `swipe` in a way that produces a recognizable signature bitmap; test strategy: pre-populate via API or use the `Submit` button on an empty canvas (which sends `ByteArray(0)` → clears signature) to verify the clear path.
- All three text fields in the "Visit Details" ExpandableCard (#1, #2, #3) are inside a collapsible `ExpandableCard`. If collapsed, Maestro must first tap the card header to expand it before the text fields are visible.
- `AccessInfoDialog` is a full-screen `Dialog` composable (not a bottom sheet); text field has `maxLines=4`.

---

## Source Files Referenced

| File | Path |
|------|------|
| `TaskDetailsSummaryTab.kt` | `feature/task_details/presentation/composables/tabs/` |
| `TaskDetailsScreen.kt` | `feature/task_details/presentation/` |
| `TaskDetailsViewModel.kt` | `feature/task_details/presentation/` |
| `SignatureDialog.kt` | `feature/task_details/presentation/composables/signature/` |
| `SignaturePreview.kt` | `feature/task_details/presentation/composables/signature/` |
| `DrawingCanvas.kt` | `feature/task_details/presentation/composables/signature/` |
| `AddActionsBottomSheet.kt` | `feature/task_details/presentation/composables/` |
| `QuickActionsFab.kt` | `core/design_system/components/` |
| `AlertStatusToggleCard.kt` | `feature/task_details/presentation/composables/cards/` |
| `AccessInfoDialog.kt` | `feature/task_details/presentation/composables/forms/` |
| `PhotoLabelDialog.kt` | `feature/task_details/presentation/composables/attachments/` |
| `SaveButton.kt` | `core/design_system/components/` |
| `UpdateVisitRequest.kt` | `feature/task_details/data/remote/dto/` |
| `UpdateSiteRequest.kt` | `feature/task_details/data/remote/dto/` |
| `UpdateVisitUseCase.kt` | `feature/task_details/domain/usecase/` |
| `UpdateSiteUseCase.kt` | `feature/task_details/domain/usecase/` |
| `SaveTaskDetailsUseCase.kt` | `feature/task_details/domain/usecase/` |
| `strings.xml` | `app/src/main/res/values/` |
