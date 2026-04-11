#!/bin/bash
set +e

# =============================================================
# Mobile V2 Test Runner
# Runs every *.yaml flow under mobile-flows-v2/ (excluding the
# _discovery subdirectory), captures before/after screenshots
# and per-flow pass/fail, then writes summary.json.
# =============================================================

ARTIFACTS="$GITHUB_WORKSPACE/qa-artifacts/mobile-v2/test"
SHOT_DIR="$ARTIFACTS/screenshots"
LOG_DIR="$ARTIFACTS/logs"
RESULTS_DIR="$ARTIFACTS/results"
mkdir -p "$SHOT_DIR" "$LOG_DIR" "$RESULTS_DIR"

echo "=== Downloading and installing APK ==="
gh release download mobile-apk-v1 -p "app-debug.apk" -D /tmp -R DumitracheBogdan/Hydro-QA --clobber || true
adb install -r /tmp/app-debug.apk && echo "APK installed" || echo "APK install failed"

echo "=== Installing Maestro CLI ==="
curl -Ls "https://get.maestro.mobile.dev" | bash
export PATH="$HOME/.maestro/bin:$PATH"
maestro --version && echo "Maestro installed" || { echo "ERROR: Maestro install failed"; exit 1; }

cd "$GITHUB_WORKSPACE"

# Collect flow files (exclude _discovery/)
mapfile -t FLOWS < <(find mobile-flows-v2 -maxdepth 1 -name "*.yaml" -type f | sort)

if [[ ${#FLOWS[@]} -eq 0 ]]; then
  echo "::warning::No flows found under mobile-flows-v2/ — skipping"
fi

TOTAL=0
PASS_COUNT=0
FAIL_COUNT=0
declare -a CHECK_LINES

for flow in "${FLOWS[@]}"; do
  FLOW_NAME=$(basename "$flow" .yaml)
  TOTAL=$((TOTAL + 1))
  echo "--- Running: $FLOW_NAME ---"

  adb exec-out screencap -p > "$SHOT_DIR/${FLOW_NAME}-before.png" 2>/dev/null || true

  LOG_FILE="$LOG_DIR/${FLOW_NAME}.log"
  maestro test \
    -e MAESTRO_APP_EMAIL="${MAESTRO_APP_EMAIL}" \
    -e MAESTRO_APP_PASSWORD="${MAESTRO_APP_PASSWORD}" \
    "$flow" 2>&1 | tee "$LOG_FILE"
  EXIT_CODE=${PIPESTATUS[0]}

  adb exec-out screencap -p > "$SHOT_DIR/${FLOW_NAME}-after.png" 2>/dev/null || true

  if [[ "$EXIT_CODE" -eq 0 ]]; then
    echo "PASS" > "$RESULTS_DIR/${FLOW_NAME}.result"
    PASS_COUNT=$((PASS_COUNT + 1))
    CHECK_LINES+=("    { \"id\": \"${FLOW_NAME}\", \"status\": \"PASS\", \"details\": \"Maestro flow passed\" }")
    echo "Flow $FLOW_NAME PASSED"
  else
    ERR_LINE=$(grep -m1 -E "FAILED|Assertion is false|Error" "$LOG_FILE" | head -c 300 | sed 's/"/\\"/g' || true)
    if [[ -z "$ERR_LINE" ]]; then
      ERR_LINE="exit code $EXIT_CODE"
    fi
    echo "FAIL" > "$RESULTS_DIR/${FLOW_NAME}.result"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    CHECK_LINES+=("    { \"id\": \"${FLOW_NAME}\", \"status\": \"FAIL\", \"details\": \"${ERR_LINE}\" }")
    echo "Flow $FLOW_NAME FAILED: $ERR_LINE"
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
