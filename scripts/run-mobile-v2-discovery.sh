#!/bin/bash
set +e

# =============================================================
# Mobile V2 Discovery Script (v2 - post-first-run lessons)
#
# Lessons from the previous discovery run:
# 1. The visit cards on Visits Home are NOT clickable — there is
#    no "View Visit Details" button anywhere in the Compose tree.
#    We remove the visit-detail section entirely.
# 2. `adb shell input keyevent 4` (back) popped the task stack
#    past the activity root and killed the app. We must use
#    Maestro `- back` inside a stub flow instead, so Maestro can
#    re-resolve the app foreground on the next step.
# 3. Each stub flow must NOT contain `launchApp: clearState: true`,
#    otherwise it logs us out between steps.
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
  # Writes a Maestro stub that does NOT clear state.
  local name="$1"
  shift
  local yaml="$TMP_DIR/${name}.yaml"
  {
    echo "appId: com.hydrocert.app"
    echo "---"
    for cmd in "$@"; do
      printf '%s\n' "$cmd"
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

echo "=== Step 1: launch fresh (login screen) ==="
LAUNCH_YAML=$(write_stub "launch-fresh" \
  "- launchApp:" \
  "    clearState: true" \
  "- extendedWaitUntil:" \
  "    visible: \"Email\"" \
  "    timeout: 30000")
run_stub "$LAUNCH_YAML"
dump_state "01-login-screen"

echo "=== Step 2: tap Forgot your password (dump dialog/new screen) ==="
FP_YAML=$(write_stub "tap-forgot" \
  "- tapOn:" \
  "    text: \"Forgot.*\"")
run_stub "$FP_YAML"
dump_state "02-forgot-password-screen"

# Return to login via back
BACK1_YAML=$(write_stub "back-1" "- back")
run_stub "$BACK1_YAML"
dump_state "03-back-to-login"

echo "=== Step 3: run full login flow ==="
run_stub "$GITHUB_WORKSPACE/mobile-flows-v2/_discovery/00_login.yaml"
dump_state "04-visits-home-default"

echo "=== Step 4: tap filter chip Today ==="
TODAY_YAML=$(write_stub "tap-today" "- tapOn: \"Today\"")
run_stub "$TODAY_YAML"
dump_state "05-visits-filter-today"

echo "=== Step 5: tap filter chip Tomorrow ==="
TOMORROW_YAML=$(write_stub "tap-tomorrow" "- tapOn: \"Tomorrow\"")
run_stub "$TOMORROW_YAML"
dump_state "06-visits-filter-tomorrow"

echo "=== Step 6: tap filter chip Next week ==="
NEXTW_YAML=$(write_stub "tap-nextweek" "- tapOn: \"Next week\"")
run_stub "$NEXTW_YAML"
dump_state "07-visits-filter-nextweek"

echo "=== Step 7: type in search box ==="
SEARCH_YAML=$(write_stub "search-qa" \
  "- tapOn:" \
  "    text: \"Type to search.*\"" \
  "- inputText: \"QA\"" \
  "- hideKeyboard")
run_stub "$SEARCH_YAML"
dump_state "08-visits-search-qa"

echo "=== Step 8: erase search text ==="
ERASE_YAML=$(write_stub "erase-search" \
  "- tapOn:" \
  "    text: \"Type to search.*\"" \
  "- eraseText" \
  "- hideKeyboard")
run_stub "$ERASE_YAML"
dump_state "09-visits-search-cleared"

echo "=== Step 9: tap History tab ==="
HIST_YAML=$(write_stub "tap-history" \
  "- tapOn:" \
  "    text: \"History\"")
run_stub "$HIST_YAML"
dump_state "10-history-tab"

echo "=== Step 10: tap Activity tab ==="
ACT_YAML=$(write_stub "tap-activity" \
  "- tapOn:" \
  "    text: \"Activity\"")
run_stub "$ACT_YAML"
dump_state "11-activity-tab"

echo "=== Step 11: tap Account tab ==="
ACC_YAML=$(write_stub "tap-account" \
  "- tapOn:" \
  "    text: \"Account\"")
run_stub "$ACC_YAML"
dump_state "12-account-tab"

echo "=== Step 12: tap My signature ==="
SIG_YAML=$(write_stub "tap-mysignature" \
  "- tapOn:" \
  "    text: \"My signature\"")
run_stub "$SIG_YAML"
dump_state "13-my-signature"

echo "=== Step 13: in-app back from My signature ==="
BACK2_YAML=$(write_stub "back-2" "- back")
run_stub "$BACK2_YAML"
dump_state "14-back-at-account-after-sig"

echo "=== Step 14: tap Change Password ==="
CP_YAML=$(write_stub "tap-change-password" \
  "- tapOn:" \
  "    text: \"Change Password\"")
run_stub "$CP_YAML"
dump_state "15-change-password"

echo "=== Step 15: in-app back from Change Password ==="
BACK3_YAML=$(write_stub "back-3" "- back")
run_stub "$BACK3_YAML"
dump_state "16-back-at-account-after-cp"

echo "=== Step 16: tap Logout (dialog 1) ==="
LO_YAML=$(write_stub "tap-logout" \
  "- tapOn:" \
  "    text: \"Logout\"")
run_stub "$LO_YAML"
dump_state "17-logout-dialog-1"

echo "=== Step 17: tap Cancel on dialog ==="
CANCEL_YAML=$(write_stub "tap-cancel" \
  "- tapOn: \"Cancel\"")
run_stub "$CANCEL_YAML"
dump_state "18-after-cancel-logout"

echo "=== Step 18: tap Logout (dialog 2) + Confirm ==="
LO2_YAML=$(write_stub "tap-logout-2" \
  "- tapOn:" \
  "    text: \"Logout\"")
run_stub "$LO2_YAML"
dump_state "19-logout-dialog-2"

CONF_YAML=$(write_stub "tap-confirm" \
  "- tapOn: \"Confirm\"" \
  "- extendedWaitUntil:" \
  "    visible: \"Email\"" \
  "    timeout: 20000")
run_stub "$CONF_YAML"
dump_state "20-post-logout-login-screen"

# ------------------------------------------------------------------
# Done
# ------------------------------------------------------------------
echo "=== Discovery complete ==="
ls -la "$HIER_DIR"
ls -la "$SHOT_DIR"

TOTAL=$(ls -1 "$HIER_DIR" 2>/dev/null | wc -l)
cat > "$ARTIFACTS/summary.json" <<EOF
{
  "mode": "discovery",
  "generatedAt": "$(date -Iseconds)",
  "totals": { "total": ${TOTAL}, "pass": ${TOTAL}, "fail": 0, "skip": 0 }
}
EOF
echo "Wrote summary.json (total=${TOTAL})"
