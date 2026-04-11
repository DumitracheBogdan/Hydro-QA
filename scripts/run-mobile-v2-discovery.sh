#!/bin/bash
set +e

# =============================================================
# Mobile V2 Discovery Script
# Logs into the Hydrocert Android app and dumps the Android
# view hierarchy + a screenshot for every major screen. The
# resulting XML files are the source of truth for the V2 flow
# generator.
# =============================================================

ARTIFACTS="$GITHUB_WORKSPACE/qa-artifacts/mobile-v2/discovery"
HIER_DIR="$ARTIFACTS/hierarchies"
SHOT_DIR="$ARTIFACTS/screenshots"
TMP_DIR="$ARTIFACTS/tmp"
mkdir -p "$HIER_DIR" "$SHOT_DIR" "$TMP_DIR"

echo "=== Downloading and installing APK ==="
gh release download mobile-apk-v1 -p "app-debug.apk" -D /tmp -R DumitracheBogdan/Hydro-QA --clobber || true
adb install -r /tmp/app-debug.apk && echo "APK installed" || echo "APK install failed"

echo "=== Installing Maestro CLI ==="
curl -Ls "https://get.maestro.mobile.dev" | bash
export PATH="$HOME/.maestro/bin:$PATH"
maestro --version && echo "Maestro installed" || { echo "ERROR: Maestro install failed"; exit 1; }

cd "$GITHUB_WORKSPACE"

# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

dump_state() {
  local name="$1"
  # Give the app a moment to settle before snapshotting
  sleep 3
  echo ">>> dumping $name"
  adb shell uiautomator dump /sdcard/window_dump.xml >/dev/null 2>&1
  adb pull /sdcard/window_dump.xml "$HIER_DIR/${name}.xml" >/dev/null 2>&1 || echo "pull failed for $name"
  adb exec-out screencap -p > "$SHOT_DIR/${name}.png" 2>/dev/null || true
  if [[ -f "$HIER_DIR/${name}.xml" ]]; then
    local bytes
    bytes=$(wc -c < "$HIER_DIR/${name}.xml")
    echo "    wrote $name.xml (${bytes} bytes)"
  else
    echo "    !! NO HIERARCHY for $name"
  fi
}

write_stub() {
  # Writes a tiny Maestro flow that does NOT clear state.
  local name="$1"
  shift
  local yaml="$TMP_DIR/${name}.yaml"
  {
    echo "appId: com.hydrocert.app"
    echo "---"
    for cmd in "$@"; do
      echo "$cmd"
    done
  } > "$yaml"
  echo "$yaml"
}

run_stub() {
  local yaml="$1"
  maestro test \
    -e MAESTRO_APP_EMAIL="${MAESTRO_APP_EMAIL}" \
    -e MAESTRO_APP_PASSWORD="${MAESTRO_APP_PASSWORD}" \
    "$yaml" 2>&1 | sed 's/^/    [maestro] /'
  return ${PIPESTATUS[0]}
}

# ------------------------------------------------------------------
# Discovery timeline
# ------------------------------------------------------------------

echo "=== Step 1: dump fresh login screen (before login) ==="
LOGIN_DUMP_YAML=$(write_stub "just-launch" \
  "- launchApp:" \
  "    clearState: true" \
  "- extendedWaitUntil:" \
  "    visible: \"Email\"" \
  "    timeout: 30000")
run_stub "$LOGIN_DUMP_YAML"
dump_state "01-login-screen"

echo "=== Step 2: run full login flow ==="
run_stub "$GITHUB_WORKSPACE/mobile-flows-v2/_discovery/00_login.yaml"
dump_state "02-visits-home"

echo "=== Step 3: tap filter chip Today ==="
TODAY_YAML=$(write_stub "tap-today" "- tapOn: \"Today\"")
run_stub "$TODAY_YAML"
dump_state "03-visits-filter-today"

echo "=== Step 4: tap filter chip Tomorrow ==="
TOMORROW_YAML=$(write_stub "tap-tomorrow" "- tapOn: \"Tomorrow\"")
run_stub "$TOMORROW_YAML"
dump_state "04-visits-filter-tomorrow"

echo "=== Step 5: tap filter chip Next week ==="
NEXTW_YAML=$(write_stub "tap-nextweek" "- tapOn: \"Next week\"")
run_stub "$NEXTW_YAML"
dump_state "05-visits-filter-nextweek"

echo "=== Step 6: tap first visit card -> Visit Detail ==="
VD_YAML=$(write_stub "tap-visit-details" \
  "- tapOn:" \
  "    text: \"View Visit Details\"" \
  "- extendedWaitUntil:" \
  "    visible: \"Visit Details\"" \
  "    timeout: 20000")
run_stub "$VD_YAML"
dump_state "06-visit-detail-default"

echo "=== Step 7: tap Inspections tab ==="
INS_YAML=$(write_stub "tap-inspections" \
  "- tapOn:" \
  "    text: \"Inspections.*\"")
run_stub "$INS_YAML"
dump_state "07-visit-detail-inspections"

echo "=== Step 8: tap Attachments tab ==="
ATT_YAML=$(write_stub "tap-attachments" \
  "- tapOn:" \
  "    text: \"Attachments.*\"")
run_stub "$ATT_YAML"
dump_state "08-visit-detail-attachments"

echo "=== Step 9: open Quick Actions FAB ==="
FAB_YAML=$(write_stub "tap-quick-actions" \
  "- tapOn:" \
  "    id: \"Quick actions\"")
run_stub "$FAB_YAML"
dump_state "09-quick-actions-sheet"

echo "=== Step 10: dismiss sheet and go back to home ==="
# Press back to close the Quick Actions sheet
adb shell input keyevent 4
sleep 1
# Press back again to leave visit details
adb shell input keyevent 4
sleep 1
dump_state "10-back-at-visits-home"

echo "=== Step 11: tap History tab ==="
HIST_YAML=$(write_stub "tap-history" \
  "- tapOn:" \
  "    text: \"History\"")
run_stub "$HIST_YAML"
dump_state "11-history-tab"

echo "=== Step 12: tap Activity tab ==="
ACT_YAML=$(write_stub "tap-activity" \
  "- tapOn:" \
  "    text: \"Activity\"")
run_stub "$ACT_YAML"
dump_state "12-activity-tab"

echo "=== Step 13: tap Account tab ==="
ACC_YAML=$(write_stub "tap-account" \
  "- tapOn:" \
  "    text: \"Account\"")
run_stub "$ACC_YAML"
dump_state "13-account-tab"

echo "=== Step 14: tap My signature ==="
SIG_YAML=$(write_stub "tap-mysignature" \
  "- tapOn:" \
  "    text: \"My signature\"")
run_stub "$SIG_YAML"
dump_state "14-my-signature"

# Back to Account
adb shell input keyevent 4
sleep 1

echo "=== Step 15: tap Change Password ==="
CP_YAML=$(write_stub "tap-change-password" \
  "- tapOn:" \
  "    text: \"Change Password\"")
run_stub "$CP_YAML"
dump_state "15-change-password"

# Back to Account
adb shell input keyevent 4
sleep 1

echo "=== Step 16: tap Logout -> dialog ==="
LO_YAML=$(write_stub "tap-logout" \
  "- tapOn:" \
  "    text: \"Logout\"")
run_stub "$LO_YAML"
dump_state "16-logout-dialog"

echo "=== Step 17: tap Cancel on dialog (stay logged in) ==="
CANCEL_YAML=$(write_stub "tap-cancel" \
  "- tapOn: \"Cancel\"")
run_stub "$CANCEL_YAML"
dump_state "17-after-cancel-logout"

echo "=== Step 18: tap Logout -> Confirm (full logout) ==="
LO2_YAML=$(write_stub "tap-logout-2" \
  "- tapOn:" \
  "    text: \"Logout\"")
run_stub "$LO2_YAML"
sleep 1
CONF_YAML=$(write_stub "tap-confirm" \
  "- tapOn: \"Confirm\"")
run_stub "$CONF_YAML"
dump_state "18-back-to-login"

# ------------------------------------------------------------------
# Done
# ------------------------------------------------------------------
echo "=== Discovery complete ==="
ls -la "$HIER_DIR"
ls -la "$SHOT_DIR"

# Write a tiny summary.json so the workflow summary step can read it
TOTAL=$(ls -1 "$HIER_DIR" 2>/dev/null | wc -l)
PASS=$TOTAL
FAIL=0
SKIP=0
mkdir -p "$ARTIFACTS/../discovery"
cat > "$ARTIFACTS/summary.json" <<EOF
{
  "mode": "discovery",
  "generatedAt": "$(date -Iseconds)",
  "totals": { "total": ${TOTAL}, "pass": ${PASS}, "fail": ${FAIL}, "skip": ${SKIP} }
}
EOF
echo "Wrote summary.json (total=${TOTAL})"
