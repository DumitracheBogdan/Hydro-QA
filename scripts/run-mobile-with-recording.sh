#!/bin/bash
set +e

ARTIFACTS="$GITHUB_WORKSPACE/qa-artifacts"
mkdir -p "$ARTIFACTS/mobile-screenshots"

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

  # Run flow with explicit env var passing via -e flags
  maestro test \
    -e MAESTRO_APP_EMAIL="${MAESTRO_APP_EMAIL}" \
    -e MAESTRO_APP_PASSWORD="${MAESTRO_APP_PASSWORD}" \
    "$flow" 2>&1 || echo "Flow $FLOW_NAME completed with errors"

  # Screenshot after
  adb exec-out screencap -p > "$ARTIFACTS/mobile-screenshots/${FLOW_NAME}-after.png" 2>/dev/null || true
done

echo "=== Screenshots captured ==="
ls "$ARTIFACTS/mobile-screenshots/" | wc -l
echo "files"

# Run Node.js wrapper for JSON summary
echo "=== Running summary generator ==="
node scripts/qa-maestro-mobile-smoke.mjs || echo "Summary completed with errors"

echo "=== Done ==="
