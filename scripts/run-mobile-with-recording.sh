#!/bin/bash
set +e

ARTIFACTS="$GITHUB_WORKSPACE/qa-artifacts"
RESULTS_DIR="$ARTIFACTS/mobile-results"
mkdir -p "$ARTIFACTS/mobile-screenshots"
mkdir -p "$RESULTS_DIR"

# Clear any stale results from previous runs
rm -f "$RESULTS_DIR"/*.result "$RESULTS_DIR"/*.log 2>/dev/null || true

echo "=== Downloading and installing APK ==="
gh release download mobile-apk-v1 -p "app-debug.apk" -D /tmp -R DumitracheBogdan/Hydro-QA --clobber || true
adb install /tmp/app-debug.apk && echo "APK installed" || echo "APK install failed"

echo "=== Installing Maestro CLI ==="
curl -Ls "https://get.maestro.mobile.dev" | bash
export PATH="$HOME/.maestro/bin:$PATH"
maestro --version && echo "Maestro installed" || { echo "ERROR: Maestro install failed"; exit 1; }

echo "=== Running mobile Maestro tests with screenshots ==="
cd "$GITHUB_WORKSPACE"

for flow in mobile-flows/*.yaml; do
  FLOW_NAME=$(basename "$flow" .yaml)
  echo "--- Running: $FLOW_NAME ---"

  # Screenshot before
  adb exec-out screencap -p > "$ARTIFACTS/mobile-screenshots/${FLOW_NAME}-before.png" 2>/dev/null || true

  LOG_FILE="$RESULTS_DIR/${FLOW_NAME}.log"

  # Run flow with explicit env var passing via -e flags, capture real exit code
  maestro test \
    -e MAESTRO_APP_EMAIL="${MAESTRO_APP_EMAIL}" \
    -e MAESTRO_APP_PASSWORD="${MAESTRO_APP_PASSWORD}" \
    "$flow" 2>&1 | tee "$LOG_FILE"
  EXIT_CODE=${PIPESTATUS[0]}

  if [ "$EXIT_CODE" -eq 0 ]; then
    echo "PASS" > "$RESULTS_DIR/${FLOW_NAME}.result"
    echo "Flow $FLOW_NAME PASSED (exit=$EXIT_CODE)"
  else
    echo "FAIL" > "$RESULTS_DIR/${FLOW_NAME}.result"
    # Extract a short error snippet for the summary
    FAIL_MSG=$(grep -m1 -E "FAILED|Assertion is false|Error" "$LOG_FILE" | head -c 300 || echo "exit code $EXIT_CODE")
    echo "$FAIL_MSG" > "$RESULTS_DIR/${FLOW_NAME}.error"
    echo "Flow $FLOW_NAME FAILED (exit=$EXIT_CODE): $FAIL_MSG"
  fi

  # Screenshot after
  adb exec-out screencap -p > "$ARTIFACTS/mobile-screenshots/${FLOW_NAME}-after.png" 2>/dev/null || true
done

echo "=== Screenshots captured ==="
ls "$ARTIFACTS/mobile-screenshots/" | wc -l
echo "files"

echo "=== Per-flow results ==="
for result in "$RESULTS_DIR"/*.result; do
  [ -f "$result" ] || continue
  FLOW_NAME=$(basename "$result" .result)
  STATUS=$(cat "$result")
  echo "$FLOW_NAME: $STATUS"
done

# Run Node.js wrapper for JSON summary
echo "=== Running summary generator ==="
node scripts/qa-maestro-mobile-smoke.mjs || echo "Summary completed with errors"

echo "=== Done ==="
