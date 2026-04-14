#!/bin/bash
set +e

# =============================================================
# Mobile V2 QA-Check: UI Change Detector (standalone)
# Installs the APK, runs the Python-based UI scanner against
# the running emulator, and writes results to qa-artifacts/.
# Does NOT run Maestro tests — ~10-15 min instead of 40-70.
# =============================================================

ARTIFACTS="$GITHUB_WORKSPACE/qa-artifacts/change-detector"
mkdir -p "$ARTIFACTS"

echo "=== Downloading and installing APK ==="
gh release download mobile-apk-v1 -p "app-debug.apk" -D /tmp -R DumitracheBogdan/Hydro-QA --clobber || true
adb install -r /tmp/app-debug.apk && echo "APK installed" || echo "APK install failed"

echo ""
echo "========================================="
echo "  QA-Check Mode — UI Change Detector"
echo "========================================="
echo ""

cd "$GITHUB_WORKSPACE/exploration-2026-04-12/change-detector"

# run_detector.py imports scanner.py and runs the full 24-screen scan + HTML report
python3 run_detector.py --ci --no-alert --output "$ARTIFACTS" 2>&1
EXIT_CODE=$?

if [[ "$EXIT_CODE" -ne 0 ]]; then
  echo "::warning::QA Change Detector exited with code $EXIT_CODE"
fi

# Copy screenshots and any debug dumps into the artifact folder so we can
# inspect them after the run.
if [[ -d "screenshots" ]]; then
  echo "=== Copying screenshots/ into artifacts ==="
  cp -r screenshots "$ARTIFACTS/" || true
fi
if [[ -d "debug_dumps" ]]; then
  echo "=== Copying debug_dumps/ into artifacts ==="
  cp -r debug_dumps "$ARTIFACTS/" || true
fi

echo "=== QA-Check Done ==="

# Feature-flagged CI gate (OFF by default). Only propagate the detector's
# exit code when FAIL_ON_NEW_ELEMENTS=1 is set; otherwise keep the existing
# warning-only behavior so in-progress navigation work isn't blocked.
if [[ "$FAIL_ON_NEW_ELEMENTS" == "1" ]]; then
  exit "$EXIT_CODE"
fi
exit 0
