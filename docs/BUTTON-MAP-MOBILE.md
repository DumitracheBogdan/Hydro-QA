# BUTTON-MAP-MOBILE

Generated: 2026-05-26 — extracted from hydrocert-android source (read-only, deterministic).
Package: `com.hydrocert.app`. Strings resolved from `app/src/main/res/values/strings.xml`.

---

## Summary Table

| Screen | Interactive Elements |
|--------|---------------------|
| LoginScreen | 3 |
| ForgotPasswordScreen | 2 |
| EnvironmentSelectionDialog (modal) | 4 |
| HomeScreen | 7 |
| TasksScreen | 5 |
| ActivityScreen | 1 (task card row) |
| TaskDetailsScreen | 6 |
| TaskDetailsSummaryTab | 7 |
| TaskDetailsTab (InspectionCard) | 3 per inspection |
| AttachmentsTab | 4 |
| TankInspectionScreen | 6 |
| TankInspectionContent/InspectionContent | 6 |
| AddActionsBottomSheet | 4 |
| SignatureDialog | 3 |
| SignaturePreview (canvas tap) | 1 |
| PhotoViewerScreen / FullScreenPhotoViewer | 4 |
| WaterSamplingScreen | 5 |
| WaterSamplingFormNormecScreen | 1 |
| WaterSamplingFormAlsScreen | 1 |
| SubmitSamplesScreen | 4 |
| AccountScreen | — (delegates to sub-cards) |
| AccountScreen — ChangePasswordCard | 1 |
| AccountScreen — LogoutButtonCard | 2 |
| AccountScreen — MySignatureCard | 2 |
| ChangePasswordScreen | 1 |
| BottomTabsBar (MainScreen) | 4 |
| **TOTAL** | **~87** |

> Note: element counts include all `Button`, `TextButton`, `OutlinedButton`, `IconButton`, `FloatingActionButton`/`SmallFloatingActionButton`, `FilterChip`, `NavigationBarItem`, and `Modifier.clickable` interactive elements per screen. Action row checkboxes and priority dropdowns inside `AddActionsBottomSheet` are per-item and counted once symbolically.

---

## ## LoginScreen

File: `app/src/main/java/com/hydrocert/app/feature/auth/presentation/login/LoginScreen.kt`

| Element | Label (resolved) | testTag / contentDesc | onClick action | Selector strategy | Source (file:line) |
|---------|-----------------|----------------------|----------------|-------------------|--------------------|
| `Modifier.clickable` on Text | "Forgot your password?" | — | `screensNavigator.toForgotPasswordScreen()` | text | LoginScreen.kt:254 |
| `Button` | "Login" | — | `viewModel.login(email, password, onFinish=toMainApp())` | text | LoginScreen.kt:261 |
| Logo `pointerInput` (DEBUG triple-tap) | [Hydrocert Logo image] | "Hydrocert Logo" | `showEnvironmentDialog = true` | contentDescription | LoginScreen.kt:131 |

---

## ## ForgotPasswordScreen

File: `app/src/main/java/com/hydrocert/app/feature/auth/presentation/forgot_password/ForgotPasswordScreen.kt`

| Element | Label (resolved) | testTag / contentDesc | onClick action | Selector strategy | Source (file:line) |
|---------|-----------------|----------------------|----------------|-------------------|--------------------|
| `Modifier.clickable` on Row (icon + text) | "Back to Login" | contentDesc: "Back" (icon) | `screensNavigator.navigateBackAuth()` | text | ForgotPasswordScreen.kt:121 |
| `Button` | "Send steps" | — | `viewModel.onSendMail(email, onSuccess, onError)` — restarts resend timer | text | ForgotPasswordScreen.kt:186 |

---

## ## EnvironmentSelectionDialog

File: `app/src/main/java/com/hydrocert/app/core/design_system/components/EnvironmentSelectionDialog.kt`

| Element | Label (resolved) | testTag / contentDesc | onClick action | Selector strategy | Source (file:line) |
|---------|-----------------|----------------------|----------------|-------------------|--------------------|
| `RadioButton` | "Development" | — | `selectedEnvironment = DEV_ENVIRONMENT` | text | EnvironmentSelectionDialog.kt:82 |
| `RadioButton` | "Production" | — | `selectedEnvironment = PROD_ENVIRONMENT` | text | EnvironmentSelectionDialog.kt:105 |
| `Button` (confirm) | "Apply" | — | `onApply(selectedEnvironment); onDismiss()` | text | EnvironmentSelectionDialog.kt:127 |
| `Button` (dismiss) | "Cancel" | — | `onDismiss()` | text | EnvironmentSelectionDialog.kt:149 |

---

## ## HomeScreen

File: `app/src/main/java/com/hydrocert/app/feature/home/presentation/HomeScreen.kt`

| Element | Label (resolved) | testTag / contentDesc | onClick action | Selector strategy | Source (file:line) |
|---------|-----------------|----------------------|----------------|-------------------|--------------------|
| `SearchTextField` (internal) | "Type to search…" (placeholder) | — | `viewModel.searchTasks(query)` | text (placeholder) | HomeScreen.kt:152 |
| `Box Modifier.clickable` (calendar icon) | [calendar icon] | "Filter by date range" | `showCalendarRangePicker = true` | contentDescription | HomeScreen.kt:164 |
| Icon `Modifier.clickable` (X clear range) | [X icon] | — | `viewModel.clearVisitCalendarFilter()` | — (conditional) | HomeScreen.kt:211 |
| `FilterChip` | "Today" | — | `viewModel.toggleVisitDateChip(TODAY)` | text | HomeScreen.kt:224 |
| `FilterChip` | "Tomorrow" | — | `viewModel.toggleVisitDateChip(TOMORROW)` | text | HomeScreen.kt:245 |
| `FilterChip` | "This week" | — | `viewModel.toggleVisitDateChip(THIS_WEEK)` | text | HomeScreen.kt:266 |
| `FilterChip` | "Next week" | — | `viewModel.toggleVisitDateChip(NEXT_WEEK)` | text | HomeScreen.kt:287 |

> TaskCard (per visit row) clickable in `TasksList` composable navigates to `Destination.TaskDetailsScreen(taskId, title)`.

---

## ## TasksScreen (History)

File: `app/src/main/java/com/hydrocert/app/feature/tasks/presentation/TasksScreen.kt`

| Element | Label (resolved) | testTag / contentDesc | onClick action | Selector strategy | Source (file:line) |
|---------|-----------------|----------------------|----------------|-------------------|--------------------|
| `SearchTextField` (internal) | "Type to search…" (placeholder) | — | `viewModel.searchTasks(query)` | text (placeholder) | TasksScreen.kt:128 |
| `Box Modifier.clickable` (calendar icon) | [calendar icon] | "Filter by date range" | `showCalendarRangePicker = true` | contentDescription | TasksScreen.kt:140 |
| Icon `Modifier.clickable` (X clear range) | [X icon] | — | `viewModel.clearHistoryCalendarFilter()` | — (conditional) | TasksScreen.kt:186 |
| Task card (in TasksList) | [visit title] | — | `navigateTo(TaskDetailsScreen(taskId, title))` | text | TasksScreen.kt:234 |
| `PullToRefreshBox` | [pull gesture] | — | `viewModel.refreshTasks()` | gesture | TasksScreen.kt:193 |

---

## ## ActivityScreen

File: `app/src/main/java/com/hydrocert/app/feature/activity/presentation/ActivityScreen.kt`

| Element | Label (resolved) | testTag / contentDesc | onClick action | Selector strategy | Source (file:line) |
|---------|-----------------|----------------------|----------------|-------------------|--------------------|
| Task card (in TasksList) | [visit title] | — | `navigateTo(TaskDetailsScreen(taskId, title))` | text | ActivityScreen.kt:67 |

---

## ## TaskDetailsScreen (tabs host + FAB)

File: `app/src/main/java/com/hydrocert/app/feature/task_details/presentation/TaskDetailsScreen.kt`

| Element | Label (resolved) | testTag / contentDesc | onClick action | Selector strategy | Source (file:line) |
|---------|-----------------|----------------------|----------------|-------------------|--------------------|
| `Tab` | "Visit Details" | — | `viewModel.setSelectedTab(0)` | text | TaskDetailsScreen.kt:185 |
| `Tab` | "Inspections (N)" | — | `viewModel.setSelectedTab(1)` | text | TaskDetailsScreen.kt:185 |
| `Tab` | "Attachments (N)" | — | `viewModel.setSelectedTab(2)` | text | TaskDetailsScreen.kt:185 |
| `FloatingActionButton` (main FAB) | "Quick actions" (toggle expand) | "Quick actions" | `isExpanded = !isExpanded` | contentDescription | QuickActionsFab.kt:107 |
| `SmallFloatingActionButton` (camera) | [camera icon] | "Camera" | `viewModel.triggerTakePhoto()` | contentDescription | QuickActionsFab.kt:61 |
| `SmallFloatingActionButton` (gallery) | [gallery icon] | "gallery" | `viewModel.triggerPickGallery()` | contentDescription | QuickActionsFab.kt:75 |
| `SmallFloatingActionButton` (actions) | [clipboard+ icon] | "Actions" | `viewModel.triggerAddActions()` | contentDescription | QuickActionsFab.kt:89 |

> `ConfirmationDialog` (unsaved data) also shows "Go back" / "Stay" buttons — see ConfirmationDialog shared component.

---

## ## TaskDetailsSummaryTab (Visit Details tab)

File: `app/src/main/java/com/hydrocert/app/feature/task_details/presentation/composables/tabs/TaskDetailsSummaryTab.kt`

| Element | Label (resolved) | testTag / contentDesc | onClick action | Selector strategy | Source (file:line) |
|---------|-----------------|----------------------|----------------|-------------------|--------------------|
| Text `Modifier.clickable` (description toggle) | "Show more" / "Show less" | — | `isDescriptionExpanded = !isDescriptionExpanded` (conditional) | text | TaskDetailsSummaryTab.kt:207 |
| Text `Modifier.clickable` (Booking Info Edit) | "Edit" | — | `showAccessInfoDialog = true` | text | TaskDetailsSummaryTab.kt:283 |
| Text `Modifier.clickable` (Booking Info show toggle) | "Show more" / "Show less" | — | `isAccessInfoExpanded = !isAccessInfoExpanded` (conditional) | text | TaskDetailsSummaryTab.kt:301 |
| `SignaturePreviewRow` canvas (`Modifier.clickable` Box) | "Tap to sign!" | "Tap to sign" | `showSignatureDialog = true` | contentDescription | SignaturePreview.kt:61 |
| `ExpandableCard` header tap | "Actions" | — | expand/collapse (card header clickable) | text | TaskDetailsSummaryTab.kt:381 |
| `AlertStatusToggleCard` switch | "Aborted visit" | — | `onAbortedVisitChange(Boolean)` | text | TaskDetailsSummaryTab.kt:411 |
| `SaveButton` | "Save" | — | `viewModel.saveTaskDetails()` | text | TaskDetailsSummaryTab.kt:417 |

---

## ## TaskDetailsTab / InspectionCard (Inspections tab)

File: `app/src/main/java/com/hydrocert/app/feature/task_details/presentation/composables/cards/InspectionCard.kt`

Per inspection row:

| Element | Label (resolved) | testTag / contentDesc | onClick action | Selector strategy | Source (file:line) |
|---------|-----------------|----------------------|----------------|-------------------|--------------------|
| `Modifier.clickable` (SamplesButton) | "Samples (N)" | "Samples" (icon) | `onShowSamples(inspectionId, title)` | text | InspectionCard.kt:180 |
| `Modifier.clickable` (ProductsButton) | "Products (N)" | "Products" (icon) | `onShowProducts(inspectionId, title)` | text | InspectionCard.kt:228 |
| `ActionButton` | "Start Inspection" (not completed) OR "View Inspection" (completed) | — | `navigateTo(TankInspectionScreen(inspectionId, taskId, title))` | text | InspectionCard.kt:146 |

> "View Visit Details" — this string (`R.string.view_visit_details`) is defined in strings.xml as "View Visit Details" but is NOT rendered in InspectionCard directly; "Start Inspection" / "View Inspection" are the rendered labels on the action button.

---

## ## AttachmentsTab (Attachments tab)

File: `app/src/main/java/com/hydrocert/app/feature/task_details/presentation/composables/tabs/AttachmentsTab.kt`

| Element | Label (resolved) | testTag / contentDesc | onClick action | Selector strategy | Source (file:line) |
|---------|-----------------|----------------------|----------------|-------------------|--------------------|
| Photo thumbnail `clickable` | [photo label/name] | photo.name | `viewModel.setPhotoViewerData(); navigateTo(PhotoViewerScreen)` | contentDescription | AttachmentsTab.kt:177 |
| Delete icon (file/photo) | [trash icon] | "Delete Attachment" (dialog title) | `showDeleteConfirmation = true` | — (inside FileAttachedSection/ReorderablePhotosSection) | AttachmentsTab.kt:198 |
| `ConfirmationDialog` Confirm btn | "Confirm" | — | `onRemoveAttachment(att.id)` | text | AttachmentsTab.kt:205 |
| `ConfirmationDialog` Dismiss btn | "Dismiss" | — | `showDeleteConfirmation = false` | text | AttachmentsTab.kt:212 |

---

## ## TankInspectionScreen (Inspection form — after "Start Inspection")

File: `app/src/main/java/com/hydrocert/app/feature/tank_inspection/presentation/TankInspectionScreen.kt`

| Element | Label (resolved) | testTag / contentDesc | onClick action | Selector strategy | Source (file:line) |
|---------|-----------------|----------------------|----------------|-------------------|--------------------|
| `FloatingActionButton` (main FAB expand) | "Quick actions" | "Quick actions" | `isExpanded = !isExpanded` | contentDescription | TankInspectionScreen.kt:384 |
| `SmallFloatingActionButton` (camera) | [camera icon] | "Camera" | `viewModel.triggerTakePhoto()` | contentDescription | TankInspectionScreen.kt:384 |
| `SmallFloatingActionButton` (gallery) | [gallery icon] | "gallery" | `viewModel.triggerPickGallery()` | contentDescription | TankInspectionScreen.kt:384 |
| `SmallFloatingActionButton` (actions) | [clipboard icon] | "Actions" | `viewModel.triggerAddActions()` → opens AddActionsBottomSheet | contentDescription | TankInspectionScreen.kt:384 |
| Notes `Edit` text clickable | "Edit" | — | `showNotesDialog = true` | text | TankInspectionScreen.kt:579 |
| Notes `Show more`/`Show less` toggle | "Show more" / "Show less" | — | `isNotesExpanded = !isNotesExpanded` (conditional) | text | TankInspectionScreen.kt:592 |

Additional per-section / per-field interactive elements:

| Element | Label (resolved) | testTag / contentDesc | onClick action | Selector strategy | Source (file:line) |
|---------|-----------------|----------------------|----------------|-------------------|--------------------|
| `ExpandableCard` header (each inspection section) | [section title e.g. "Visit Information", "Risk Assessment"] | — | expand/collapse section | text | TankInspectionScreen.kt:616 |
| `WaterSamplingGenericCard` "Start Sampling"/"View Details" btn | "Start Sampling" OR "View Details" | — | `navigateTo(WaterSamplingScreen(...))` | text | TankInspectionScreen.kt:672 |
| `WaterSamplingInspectionEmptyCard` "Add Sample" btn | "Add Sample" | — | `onOpenWaterSamplesPicker()` → `SelectWaterSamplesBottomSheet` | text | TankInspectionScreen.kt:666 |
| `ExpandableCard` header — Actions | "Actions" | — | expand/collapse | text | TankInspectionScreen.kt:727 |
| `ExpandableCard` header — Attachments | "Attachments (N)" | — | expand/collapse | text | TankInspectionScreen.kt:761 |
| `AlertStatusToggleCard` switch | "Unable to Inspect" | — | `viewModel.updateInspectionMissedToggle(Boolean)` | text | TankInspectionScreen.kt:805 |
| `SaveButton` | "Save" | — | `viewModel.saveTankInspection()` | text | TankInspectionScreen.kt:452 |

---

## ## AddActionsBottomSheet

File: `app/src/main/java/com/hydrocert/app/feature/task_details/presentation/composables/AddActionsBottomSheet.kt`

| Element | Label (resolved) | testTag / contentDesc | onClick action | Selector strategy | Source (file:line) |
|---------|-----------------|----------------------|----------------|-------------------|--------------------|
| `Button` "Add Custom Action" | "Add Custom Action" | — | `showNewActionDialog = true` | text | AddActionsBottomSheet.kt:195 |
| `Checkbox` per action row | [action text] | — | `updateItem(id) { it.copy(isSelected = selected) }` | — (per-row) | AddActionsBottomSheet.kt:82 |
| `Button` (Cancel footer) | "Cancel" | — | `onDismiss()` | text | AddActionsBottomSheet.kt:320 |
| `Button` (Save footer) | "Save" | — | saves selected actions via `onSave(...)` | text | AddActionsBottomSheet.kt:332 |

---

## ## SignatureDialog (Client Signature modal)

File: `app/src/main/java/com/hydrocert/app/feature/task_details/presentation/composables/signature/SignatureDialog.kt`

| Element | Label (resolved) | testTag / contentDesc | onClick action | Selector strategy | Source (file:line) |
|---------|-----------------|----------------------|----------------|-------------------|--------------------|
| Icon `Modifier.clickable` (close X) | "Close Signature Dialog" | "Close Signature Dialog" | `onDismiss()` | contentDescription | SignatureDialog.kt:153 |
| `Button` Clear | "Clear" | — | clears drawn paths; `hasBeenCleared = true` | text | SignatureDialog.kt:193 |
| `Button` Submit | "Submit" | — | captures canvas bitmap → `onSubmit(byteArray)` | text | SignatureDialog.kt:214 |

---

## ## SignaturePreview (canvas — "Tap to sign")

File: `app/src/main/java/com/hydrocert/app/feature/task_details/presentation/composables/signature/SignaturePreview.kt`

| Element | Label (resolved) | testTag / contentDesc | onClick action | Selector strategy | Source (file:line) |
|---------|-----------------|----------------------|----------------|-------------------|--------------------|
| `Box Modifier.clickable` (drawing area) | "Tap to sign!" | "Tap to sign" (Image contentDescription) | `onAddOrEdit()` → `showSignatureDialog = true` | contentDescription | SignaturePreview.kt:61 |

---

## ## PhotoViewerScreen / FullScreenPhotoViewer

File: `app/src/main/java/com/hydrocert/app/feature/task_details/presentation/composables/attachments/FullScreenPhotoViewer.kt`

| Element | Label (resolved) | testTag / contentDesc | onClick action | Selector strategy | Source (file:line) |
|---------|-----------------|----------------------|----------------|-------------------|--------------------|
| `IconButton` Back | [back arrow] | "Back" | `onDismiss()` → `screensNavigator.navigateBack()` | contentDescription | FullScreenPhotoViewer.kt:103 |
| `IconButton` More (⋮ menu) | [MoreVert icon] | "Actions" | `menuExpanded = true` | contentDescription | FullScreenPhotoViewer.kt:128 |
| `DropdownMenuItem` Download | "Download" | — | `savePhotoToGallery(...)` | text | FullScreenPhotoViewer.kt:140 |
| `DropdownMenuItem` Share | "Share" | — | `onSharePhoto(...)` | text | FullScreenPhotoViewer.kt:166 |
| `DropdownMenuItem` Edit label (if editable) | "Edit label" | — | `onRequestEditPhotoLabel(attachmentId, label)` | text | FullScreenPhotoViewer.kt:173 |

---

## ## WaterSamplingScreen

File: `app/src/main/java/com/hydrocert/app/feature/water_sampling/presentation/screens/WaterSamplingScreen.kt`

| Element | Label (resolved) | testTag / contentDesc | onClick action | Selector strategy | Source (file:line) |
|---------|-----------------|----------------------|----------------|-------------------|--------------------|
| `SwipeableSampleItem` / `SampleItem` row | [sample title] | — | `navigateTo(WaterSamplingFormScreen(...))` | text | WaterSamplingScreen.kt:350 |
| `Row Modifier.clickable` "Add New Samples" | "Add New Samples" | — | `showAddSamplesSheet = true` | text | WaterSamplingScreen.kt:291 |
| Lab card `Modifier.clickable` (assign lab modal) | [lab name UPPERCASED] | — | `viewModel.assignLaboratoryToSelected(lab.id)` | text | WaterSamplingScreen.kt:502 |
| `SubmitButton` | "Submit Samples" | — | `viewModel.submitBatchSync()` → navigate back | text | WaterSamplingScreen.kt:401 |
| `WaterSamplesEmptyStatePanel` "Add New Samples" | "Add New Samples" | — | `showAddSamplesSheet = true` | text | WaterSamplingScreen.kt:313 |

---

## ## WaterSamplingFormNormecScreen

File: `app/src/main/java/com/hydrocert/app/feature/water_sampling/presentation/screens/normec/WaterSamplingFormNormecScreen.kt`

| Element | Label (resolved) | testTag / contentDesc | onClick action | Selector strategy | Source (file:line) |
|---------|-----------------|----------------------|----------------|-------------------|--------------------|
| `SubmitButton` | "Save Sample" | — | `viewModel.prepareFormForSaving(); viewModel.submitForm(...)` → navigateBack | text | WaterSamplingFormNormecScreen.kt:221 |

> Also contains `DynamicFormField` elements (date-time picker, barcode scan button, dropdowns) whose triggers are field-type-driven, not explicit `Button` calls here.

---

## ## WaterSamplingFormAlsScreen

File: `app/src/main/java/com/hydrocert/app/feature/water_sampling/presentation/screens/als/WaterSamplingFormAlsScreen.kt`

| Element | Label (resolved) | testTag / contentDesc | onClick action | Selector strategy | Source (file:line) |
|---------|-----------------|----------------------|----------------|-------------------|--------------------|
| `SubmitButton` | "Save Sample" | — | `viewModel.saveAlsDraft(sampleId)` → navigateBack | text | WaterSamplingFormAlsScreen.kt:325 |

---

## ## SubmitSamplesScreen

File: `app/src/main/java/com/hydrocert/app/feature/water_sampling/presentation/screens/submit/SubmitSamplesScreen.kt`

| Element | Label (resolved) | testTag / contentDesc | onClick action | Selector strategy | Source (file:line) |
|---------|-----------------|----------------------|----------------|-------------------|--------------------|
| `DropOffPointItem` "Left at site" | "Left at site" | — | `selectedDropOffPoint = "Left at site"` | text | SubmitSamplesScreen.kt:175 |
| `DropOffPointItem` "Lab drop-off" | "Lab drop-off" | — | `selectedDropOffPoint = "Lab drop-off"` | text | SubmitSamplesScreen.kt:184 |
| `DropOffPointItem` "Collection center" | "Collection center" | — | `selectedDropOffPoint = "Collection center"` | text | SubmitSamplesScreen.kt:193 |
| `SubmitButton` | "Complete" | — | `viewModel.submitBatch(laboratoryId)` → navigateBackToTankInspection | text | SubmitSamplesScreen.kt:215 |

---

## ## AccountScreen — ChangePasswordCard

File: `app/src/main/java/com/hydrocert/app/feature/account/presentation/composables/ChangePasswordCard.kt`

| Element | Label (resolved) | testTag / contentDesc | onClick action | Selector strategy | Source (file:line) |
|---------|-----------------|----------------------|----------------|-------------------|--------------------|
| Row `Modifier.clickable` | "Change Password" | — | `navigateTo(Destination.ChangePasswordScreen)` | text | ChangePasswordCard.kt:29 |

---

## ## AccountScreen — LogoutButtonCard

File: `app/src/main/java/com/hydrocert/app/feature/account/presentation/composables/LogoutButtonCard.kt`

| Element | Label (resolved) | testTag / contentDesc | onClick action | Selector strategy | Source (file:line) |
|---------|-----------------|----------------------|----------------|-------------------|--------------------|
| Row `Modifier.clickable` | "Logout" | "Logout" (icon contentDescription) | `showLogoutDialog = true` | text | LogoutButtonCard.kt:42 |
| `LogoutDialog` confirm button | "Logout" (dialog) | — | `viewModel.logout(onFinish=navigateBackParent())` | text | LogoutButtonCard.kt:72 |

> `LogoutDialog` also has a Dismiss button ("Dismiss" from strings.xml, see LogoutDialog.kt).

---

## ## AccountScreen — MySignatureCard

File: `app/src/main/java/com/hydrocert/app/feature/account/presentation/composables/MySignatureCard.kt`

| Element | Label (resolved) | testTag / contentDesc | onClick action | Selector strategy | Source (file:line) |
|---------|-----------------|----------------------|----------------|-------------------|--------------------|
| `SignaturePreviewRow` canvas tap | "Tap to sign!" | "Tap to sign" | `onClearSubmitState(); showSignatureDialog = true` | contentDescription | MySignatureCard.kt:87 |
| `SignaturePreviewRow` delete (onDelete) | [implicitly the box without existing sig; onDelete clears] | — | `onSubmitSignature(ByteArray(0))` (clear signature) | — | MySignatureCard.kt:91 |

---

## ## ChangePasswordScreen

File: `app/src/main/java/com/hydrocert/app/feature/account/presentation/screens/ChangePasswordScreen.kt`

| Element | Label (resolved) | testTag / contentDesc | onClick action | Selector strategy | Source (file:line) |
|---------|-----------------|----------------------|----------------|-------------------|--------------------|
| `SubmitButton` | "Submit" | — | `viewModel.onChangePassword(currentPwd, newPwd, onSuccess, onError)` | text | ChangePasswordScreen.kt:167 |

---

## ## BottomTabsBar (MainScreen navigation)

File: `app/src/main/java/com/hydrocert/app/navigator/main/BottomTabsBar.kt`

| Element | Label (resolved) | testTag / contentDesc | onClick action | Selector strategy | Source (file:line) |
|---------|-----------------|----------------------|----------------|-------------------|--------------------|
| `NavigationBarItem` | "Home" | "Home" (tab icon contentDescription) | `onTabClicked(BottomTab.Home)` | text | BottomTabsBar.kt:52 |
| `NavigationBarItem` | "Tasks" | "Tasks" (tab icon contentDescription) | `onTabClicked(BottomTab.Tasks)` | text | BottomTabsBar.kt:52 |
| `NavigationBarItem` | "Activity" | "Activity" | `onTabClicked(BottomTab.Activity)` | text | BottomTabsBar.kt:52 |
| `NavigationBarItem` | "Account" | "Account" | `onTabClicked(BottomTab.Account)` | text | BottomTabsBar.kt:52 |

---

## ## Shared: ConfirmationDialog (unsaved data / delete)

File: `app/src/main/java/com/hydrocert/app/core/design_system/components/ConfirmationDialog.kt`

Used in: TaskDetailsScreen, TankInspectionScreen, WaterSamplingScreen, AttachmentsTab, WaterSamplingFormNormecScreen, WaterSamplingFormAlsScreen.

| Element | Label (resolved) | testTag / contentDesc | onClick action | Selector strategy | Source |
|---------|-----------------|----------------------|----------------|-------------------|----|
| Confirm Button | dynamic (e.g. "Go back", "Confirm", "Delete") | — | `onConfirm()` | text | ConfirmationDialog.kt |
| Dismiss Button | dynamic (e.g. "Stay", "Dismiss") | — | `onDismiss()` | text | ConfirmationDialog.kt |

---

## ## Parity Surface Findings

### 1. Visit-level Actions — how is "Actions" opened on mobile?

**Source:** `TaskDetailsSummaryTab.kt:380–410` and `TaskDetailsScreen.kt:138–145` / `QuickActionsFab.kt:89–103`

There are **two routes** to open Actions on the Visit Details screen:

**Route A (via FAB):** The `QuickActionsFab` (floating bottom-right) on `TaskDetailsScreen` has a `SmallFloatingActionButton` with `contentDescription = "Actions"`. Tapping it calls `viewModel.triggerAddActions()`, which sets `showAddActionsModal = true`, which renders `AddActionsBottomSheet` as a full-height modal bottom sheet. This is the **primary editing path**.

**Route B (read-only inline view):** The `ExpandableCard` with title `stringResource(R.string.actions)` = **"Actions"** is rendered inside `TaskDetailsSummaryTab` (Visit Details tab, line 380). When the visit has actions (`visitActions.isNotEmpty()`), the card auto-expands and shows action rows via `ActionsWidget(previewOnly = true)`. Tapping the card header expands/collapses it.

**Action row rendering:** Inside `ActionsWidget` with `previewOnly = true`, each `Action` is rendered via `ActionCard` composable. Each row shows:
- Action description text (e.g. "The CWS Tank requires cleaning and disinfecting.")
- Priority dropdown button (`Low` / `Medium` / `High` / `Not Set`) — but disabled when `previewOnly=true`
- No delete icon when `previewOnly=true`

In the `AddActionsBottomSheet` (edit mode), each action row shows a `Checkbox` for selection, the action text (editable for custom actions), and a priority button.

---

### 2. Inspection-level Actions — distinct Actions surface on mobile after "Start Inspection"?

**Source:** `TankInspectionScreen.kt:727–758` and `TankInspectionScreen.kt:384–391`

**YES — the inspection form (`TankInspectionScreen`) DOES expose a distinct Actions surface.** It is structurally identical to the visit-level one:

1. **ExpandableCard "Actions"** at line 727 — rendered inside `InspectionContent`. Title = `stringResource(R.string.actions)` = **"Actions"**. Auto-expands when `tankInspection.actions.isNotEmpty()`. Shows `ActionsWidget(previewOnly = true)` for read-only.

2. **FAB "Actions" SmallFloatingActionButton** at line 384 (`QuickActionsFab`) — calls `viewModel.triggerAddActions()` → opens `AddActionsBottomSheet` for the inspection's action list (via `viewModel.showAddActionsModal`). The sheet is passed `currentVisitActions = tankActionsToVisitActions(tankInspection.actions)` (line 460).

**Conclusion:** Inspection-level Actions ARE verifiable via mobile UI — both the read-only card and the editable bottom sheet are present. This is not API-only.

---

### 3. "Description & Reference" field — exact label, route, and data field

**Source:** `TaskDetailsSummaryTab.kt:322–329`

The field is inside an `ExpandableCard` with title **"Visit Details"** (literal string, not from strings.xml), under the Visit Details tab (tab index 0). The `DynamicTextField` has:
- `fieldName = "Description & Reference"` (literal string, not from strings.xml)
- `dataType = "text"`, `isMultiLine = true`
- `description = "Enter description & reference...."` (placeholder)
- Value bound to `taskDetails.waterSystemDescription`

**Data field:** It maps to `taskDetails.waterSystemDescription` — **NOT** the visit's `notes` field. The `notes` field is displayed as a read-only text block in the card titled **"Description"** (from `R.string.description` = "Description", shown at line 152 of the same file). That card displays `taskDetails.notes` at line 163, is read-only (no edit), and has a "Show more"/"Show less" toggle.

**Summary:**
- `"Description"` card (read-only) → data source: `taskDetails.notes`
- `"Description & Reference"` editable field inside `"Visit Details"` expandable card → data source: `taskDetails.waterSystemDescription`

These are **two different fields** on the same Visit Details tab.

---

## Spot-Check Results (5 rows verified against source)

| Row | Claimed label | strings.xml entry | Verified source line | Result |
|-----|--------------|-------------------|---------------------|--------|
| LoginScreen "Login" Button | "Login" | `<string name="login">Login</string>` | LoginScreen.kt:286 `stringResource(R.string.login)` | PASS |
| HomeScreen FilterChip "This week" | "This week" | `<string name="visit_filter_this_week">This week</string>` | HomeScreen.kt:269 `stringResource(R.string.visit_filter_this_week)` | PASS |
| ForgotPasswordScreen Button "Send steps" | "Send steps" | `<string name="forgot_password_button">Send steps</string>` | ForgotPasswordScreen.kt:241 `stringResource(R.string.forgot_password_button)` | PASS |
| AddActionsBottomSheet footer "Cancel" | "Cancel" | — (literal `"Cancel"`) | AddActionsBottomSheet.kt:330 `Text("Cancel", ...)` | PASS — literal, not from strings.xml |
| SaveButton "Save" | "Save" | `<string name="save">Save</string>` | SaveButton.kt:59 `stringResource(R.string.save)` | PASS |

**3 string resolution spot-checks:**

| R.string key | strings.xml value | Used in | Result |
|---|---|---|---|
| `R.string.actions` | "Actions" | TaskDetailsSummaryTab.kt:381, TankInspectionScreen.kt:729 | PASS |
| `R.string.start_inspection` | "Start Inspection" | InspectionCard.kt:147 | PASS |
| `R.string.add_custom_action` | "Add Custom Action" | AddActionsBottomSheet.kt:212 | PASS |

---

## Uncertainties / Known Gaps

1. **`BottomTab` titles** (Home/Tasks/Activity/Account) are defined in a separate `BottomTab` sealed class/enum (not inspected), resolved as the enum's `.title` property. The preview shows `"Home"`, `"Tasks"`, `"Activity"`, `"Account"` — assumed correct from preview at BottomTabsBar.kt:87.
2. **`testTag`** — zero `testTag` annotations found in any interactive element. All selectors must use `contentDescription` or `text`.
3. **`DynamicFormField` inner elements** (dropdowns, toggles, date pickers) — these are generic field widgets with labels driven by data (e.g. "Assisting Engineer 1", "Site Induction", "Works being carried out", "Accessing Area", "Lone Working", "Risk Managed", "Comments") populated from server-side form config (`InspectionSection.fields`). They cannot be enumerated statically from source alone — labels come from the backend category/field config.
4. **`ActionCard` delete `IconButton`** (`contentDescription = "Delete action"`) inside `AddActionsBottomSheet` — shown only when `showRemoveIcon = true`. In the visit/inspection `AddActionsBottomSheet` context, `showRemoveIcon = false`, so the delete icon is hidden.
5. **`SelectWaterSamplesBottomSheet`** — has its own "Add Samples" button and sample type checkboxes; not fully enumerated here as it is a modal over TankInspectionScreen.
