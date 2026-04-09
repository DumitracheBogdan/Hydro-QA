#!/bin/bash
set +e

echo "=== Emulator booted — downloading APK ==="
gh release download mobile-apk-v1 -p "app-debug.apk" -D /tmp -R DumitracheBogdan/Hydro-QA --clobber || true
adb install /tmp/app-debug.apk && echo "APK installed" || echo "APK install failed"

echo "=== Running mobile Maestro tests with screenshot capture ==="
npm install -g maestro 2>/dev/null || true
cd "$GITHUB_WORKSPACE"
mkdir -p "$GITHUB_WORKSPACE/qa-artifacts/mobile-screenshots"

# Run each Maestro flow individually and take screenshots before/after
for flow in mobile-flows/*.yaml; do
  FLOW_NAME=$(basename "$flow" .yaml)
  echo "--- Running: $FLOW_NAME ---"

  # Take screenshot before test
  adb exec-out screencap -p > "$GITHUB_WORKSPACE/qa-artifacts/mobile-screenshots/${FLOW_NAME}-before.png" 2>/dev/null || true

  # Run the Maestro flow
  npx maestro test "$flow" --format junit 2>&1 || echo "Flow $FLOW_NAME completed with errors"

  # Take screenshot after test
  adb exec-out screencap -p > "$GITHUB_WORKSPACE/qa-artifacts/mobile-screenshots/${FLOW_NAME}-after.png" 2>/dev/null || true
done

# Also run the Node.js wrapper for JSON summary output
echo "=== Running summary generator ==="
node scripts/qa-maestro-mobile-smoke.mjs || echo "Mobile tests completed with errors"

# Take a final overview screenshot
adb exec-out screencap -p > "$GITHUB_WORKSPACE/qa-artifacts/mobile-screenshots/final-state.png" 2>/dev/null || true

echo "=== Screenshot count ==="
ls -la "$GITHUB_WORKSPACE/qa-artifacts/mobile-screenshots/" 2>/dev/null | wc -l
echo "screenshots captured"

echo "=== Mobile testing complete ==="
