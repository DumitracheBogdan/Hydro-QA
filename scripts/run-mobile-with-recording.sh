#!/bin/bash
set +e

ARTIFACTS="$GITHUB_WORKSPACE/qa-artifacts"
mkdir -p "$ARTIFACTS/mobile-videos"

echo "=== Downloading and installing APK ==="
gh release download mobile-apk-v1 -p "app-debug.apk" -D /tmp -R DumitracheBogdan/Hydro-QA --clobber || true
adb install /tmp/app-debug.apk && echo "APK installed" || echo "APK install failed"

echo "=== Installing Maestro CLI ==="
export MAESTRO_VERSION=1.38.1
curl -Ls "https://get.maestro.mobile.dev" | bash
export PATH="$HOME/.maestro/bin:$PATH"
maestro --version && echo "Maestro installed successfully" || { echo "ERROR: Maestro installation failed"; exit 1; }

echo "=== Running mobile Maestro tests (with built-in video recording) ==="
cd "$GITHUB_WORKSPACE"

# Run each flow individually — Maestro's startRecording/stopRecording
# in each YAML will produce .mp4 files
for flow in mobile-flows/*.yaml; do
  FLOW_NAME=$(basename "$flow" .yaml)
  echo "--- Running: $FLOW_NAME ---"
  maestro test "$flow" 2>&1 || echo "Flow $FLOW_NAME completed with errors"
done

# Collect all Maestro recordings into artifacts
echo "=== Collecting video recordings ==="
find . -maxdepth 3 -name "*.mp4" -newer /tmp/app-debug.apk -exec cp {} "$ARTIFACTS/mobile-videos/" \; 2>/dev/null || true
find "$HOME" -maxdepth 4 -name "*.mp4" -newer /tmp/app-debug.apk -exec cp {} "$ARTIFACTS/mobile-videos/" \; 2>/dev/null || true
echo "Videos found:"
ls -la "$ARTIFACTS/mobile-videos/" 2>/dev/null || echo "No videos found"

# Run the Node.js wrapper for JSON summary output
echo "=== Running summary generator ==="
node scripts/qa-maestro-mobile-smoke.mjs || echo "Summary generator completed with errors"

echo "=== Done ==="
