#!/bin/bash
set +e

# =============================================================
# Mobile V2 Test Runner
# Runs every *.yaml flow under mobile-flows-v2/ (excluding the
# _discovery subdirectory), captures before/after screenshots
# and per-flow pass/fail, then writes summary.json.
# =============================================================
#
# REQUIRED DEV FIXTURES - do NOT delete these visits from dev; the
# nightly suite anchors on them by History title-search. If dev data
# is ever wiped, recreate them (assigned to the QA engineer, dated in
# the past so they show under History) or the suite fails silently:
#   - "QA test"      - multi-inspection seed visit (VN011710)
#   - "QA forms"     - 5 non-sample form types (49-53)
#   - "QA procdeath" - single Service Report inspection (62a/62b/63)
# Follow-up: make the runner create-if-missing so the suite is self-
# seeding and cannot break on a data cleanup.
# =============================================================

ARTIFACTS="$GITHUB_WORKSPACE/qa-artifacts/mobile-v2/test"
SHOT_DIR="$ARTIFACTS/screenshots"
LOG_DIR="$ARTIFACTS/logs"
RESULTS_DIR="$ARTIFACTS/results"
UI_DUMP_DIR="$ARTIFACTS/ui-dumps"
mkdir -p "$SHOT_DIR" "$LOG_DIR" "$RESULTS_DIR" "$UI_DUMP_DIR"

echo "=== Downloading and installing APK ==="
# app-release.apk = the current release build in the mobile-apk-v1
# release (updated via update-mobile-apk.yml). It defaults to Production;
# the shared login flow switches it to DEV
# on every launch. Uninstall first: a leftover install with a different
# signing key (debug vs release) makes install -r fail with
# INSTALL_FAILED_UPDATE_INCOMPATIBLE.
gh release download mobile-apk-v1 -p "app-release.apk" -D /tmp -R DumitracheBogdan/Hydro-QA --clobber || true
adb uninstall com.hydrocert.app >/dev/null 2>&1 || true
adb install -r -g /tmp/app-release.apk && echo "APK installed" || echo "APK install failed"

# Force all animation scales to 0. The workflow already sets
# disable-animations: true, but the 1.8.46 splash-exit crash is severe
# enough (100% cold-launch crash with animations ON) that we guard it
# here too - defence in depth against a flaky-launch storm.
adb shell settings put global window_animation_scale 0 || true
adb shell settings put global transition_animation_scale 0 || true
adb shell settings put global animator_duration_scale 0 || true

echo "=== Installing Maestro CLI ==="
curl -Ls "https://get.maestro.mobile.dev" | bash
export PATH="$HOME/.maestro/bin:$PATH"
maestro --version && echo "Maestro installed" || { echo "ERROR: Maestro install failed"; exit 1; }

cd "$GITHUB_WORKSPACE"

# Collect flow files (exclude _discovery/)
if [[ -n "${FLOWS_FILTER:-}" ]]; then
  # Run only specific flows by number (e.g. FLOWS_FILTER="26,38")
  echo "=== Filtered mode: running flows ${FLOWS_FILTER} ==="
  FLOWS=()
  IFS=',' read -ra NUMS <<< "$FLOWS_FILTER"
  for num in "${NUMS[@]}"; do
    num=$(echo "$num" | tr -d '[:space:]')
    match=$(find mobile-flows-v2 -maxdepth 1 -name "${num}_*.yaml" -type f 2>/dev/null | head -1)
    if [[ -n "$match" ]]; then
      FLOWS+=("$match")
    else
      echo "::warning::Flow ${num} not found"
    fi
  done
else
  mapfile -t FLOWS < <(find mobile-flows-v2 -maxdepth 1 -name "*.yaml" -type f | sort)
fi

if [[ ${#FLOWS[@]} -eq 0 ]]; then
  echo "::warning::No flows found under mobile-flows-v2/ — skipping"
fi

TOTAL=0
PASS_COUNT=0
FAIL_COUNT=0
declare -a CHECK_LINES

# run_flow <flow-path> <log-file>  sets RUN_EXIT to the maestro exit code
run_flow() {
  local flow="$1" log_file="$2"
  maestro test \
    -e MAESTRO_APP_EMAIL="${MAESTRO_APP_EMAIL}" \
    -e MAESTRO_APP_PASSWORD="${MAESTRO_APP_PASSWORD}" \
    "$flow" 2>&1 | tee "$log_file"
  RUN_EXIT=${PIPESTATUS[0]}
}

for flow in "${FLOWS[@]}"; do
  FLOW_NAME=$(basename "$flow" .yaml)
  TOTAL=$((TOTAL + 1))
  echo "--- Running: $FLOW_NAME ---"

  # Offline-wrapped flows: 63 edits a note fully offline to prove the
  # app accepts local edits without crashing. Connectivity is cut for
  # every attempt and restored right after. The flow relies on the
  # preceding flow 62 having cached the "QA procdeath" visit online, so
  # it stays reachable with no network (login itself needs a network we
  # deliberately do not have here).
  OFFLINE=0
  case "$FLOW_NAME" in
    63_offline_note_edit)
      OFFLINE=1
      adb shell svc wifi disable || true
      adb shell svc data disable || true
      sleep 2
      ;;
  esac

  adb exec-out screencap -p > "$SHOT_DIR/${FLOW_NAME}-before.png" 2>/dev/null || true

  LOG_FILE="$LOG_DIR/${FLOW_NAME}.log"

  # Up to 3 attempts per flow. The release build has an
  # intermittent splash-exit crash on cold launch (androidx
  # SplashScreenViewProvider NPE) that surfaces under the software
  # (swiftshader) renderer, especially as the emulator warms up. That
  # is an app bug, not a flow bug, but it makes a single cold launch
  # flaky - so a flow that dies on launch is retried on a fresh launch.
  # A flow that fails all 3 times is a real failure. The attempt count
  # is recorded in the details so a flaky-but-passing flow stays
  # visible in the report (honest reporting, no silent green).
  ATTEMPTS=0
  EXIT_CODE=1
  while [[ $ATTEMPTS -lt 3 ]]; do
    ATTEMPTS=$((ATTEMPTS + 1))
    [[ $ATTEMPTS -gt 1 ]] && echo "--- $FLOW_NAME attempt $ATTEMPTS ---"
    run_flow "$flow" "$LOG_FILE"
    EXIT_CODE=$RUN_EXIT
    [[ "$EXIT_CODE" -eq 0 ]] && break
  done

  # Restore connectivity after an offline-wrapped flow
  if [[ "$OFFLINE" -eq 1 ]]; then
    adb shell svc wifi enable || true
    adb shell svc data enable || true
    sleep 4
  fi

  # Process-death orchestration: 62a leaves the app dirty (unsubmitted
  # edit), then we force-stop it here - the harshest kill, no lifecycle
  # callbacks, the same cold-start path that surfaced the splash-exit
  # NPE. The very next flow (62b) then proves the app recovers: clean
  # relaunch, session intact, visit reopenable. force-stop only, never
  # "pm clear" (that would wipe the session and mask a crash).
  case "$FLOW_NAME" in
    62a_*)
      echo "--- process death: force-stop after $FLOW_NAME ---"
      adb shell am force-stop com.hydrocert.app || true
      sleep 2
      ;;
  esac

  adb exec-out screencap -p > "$SHOT_DIR/${FLOW_NAME}-after.png" 2>/dev/null || true

  # Capture the uiautomator hierarchy for EVERY flow (pass or fail), not
  # just failures, so the Excel generator can locate the tested element
  # on the screenshot and draw the "what was tested" circle on passing
  # flows too. Best-effort; never fails the run.
  adb shell uiautomator dump /sdcard/wd_${FLOW_NAME}.xml >/dev/null 2>&1 \
    && adb pull /sdcard/wd_${FLOW_NAME}.xml "$UI_DUMP_DIR/${FLOW_NAME}.xml" >/dev/null 2>&1 || true

  if [[ "$EXIT_CODE" -eq 0 ]]; then
    echo "PASS" > "$RESULTS_DIR/${FLOW_NAME}.result"
    PASS_COUNT=$((PASS_COUNT + 1))
    if [[ "$ATTEMPTS" -gt 1 ]]; then
      CHECK_LINES+=("    { \"id\": \"${FLOW_NAME}\", \"status\": \"PASS\", \"details\": \"Maestro flow passed on attempt ${ATTEMPTS}/3 (flaky launch recovered by retry)\" }")
      echo "Flow $FLOW_NAME PASSED on attempt ${ATTEMPTS}"
    else
      CHECK_LINES+=("    { \"id\": \"${FLOW_NAME}\", \"status\": \"PASS\", \"details\": \"Maestro flow passed\" }")
      echo "Flow $FLOW_NAME PASSED"
    fi
  else
    ERR_LINE=$(grep -m1 -E "FAILED|Assertion is false|Error" "$LOG_FILE" | head -c 300 | sed 's/"/\\"/g' || true)
    if [[ -z "$ERR_LINE" ]]; then
      ERR_LINE="exit code $EXIT_CODE"
    fi
    echo "FAIL" > "$RESULTS_DIR/${FLOW_NAME}.result"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    CHECK_LINES+=("    { \"id\": \"${FLOW_NAME}\", \"status\": \"FAIL\", \"details\": \"${ERR_LINE} (failed all 3 attempts)\" }")
    echo "Flow $FLOW_NAME FAILED after 3 attempts: $ERR_LINE"
    # Dump uiautomator XML so we can later resolve element bounds for the failure screenshot.
    adb shell uiautomator dump /sdcard/window_dump.xml >/dev/null 2>&1 \
      && adb pull /sdcard/window_dump.xml "$UI_DUMP_DIR/${FLOW_NAME}.xml" >/dev/null 2>&1 \
      || echo "::warning::ui-dump failed for ${FLOW_NAME}"
  fi
done

# Build summary.json
{
  echo "{"
  echo "  \"mode\": \"test\","
  echo "  \"generatedAt\": \"$(date -Iseconds)\","
  echo "  \"totals\": { \"total\": ${TOTAL}, \"pass\": ${PASS_COUNT}, \"fail\": ${FAIL_COUNT}, \"skip\": 0 },"
  echo "  \"checks\": ["
  IFS=$'\n'
  first=1
  for line in "${CHECK_LINES[@]}"; do
    if [[ $first -eq 1 ]]; then
      first=0
      echo "$line"
    else
      echo ",$line"
    fi
  done
  echo "  ]"
  echo "}"
} > "$ARTIFACTS/summary.json"

echo "=== Summary ==="
cat "$ARTIFACTS/summary.json"

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  echo "::warning::Some V2 flows failed (${FAIL_COUNT}/${TOTAL})"
fi

echo "=== Done ==="
